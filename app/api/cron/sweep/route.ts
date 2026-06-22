import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ask } from "@/lib/anthropic";
import { scoutPrompt, moversScoutPrompt, trackingUpdatePrompt, newsPrompt } from "@/lib/prompts";
import { parseScout, parseTrackingUpdate, parseNews, type ScoutResult, type NewsResult } from "@/lib/parsers";
import { getTopGainers, MARKET_SOURCE } from "@/lib/market";
import { mapClass } from "@/lib/lenses";

// Background sweep: surface fresh opportunities (today's real movers + theme
// scout) into each user's "fresh finds" feed, and refresh their tracked names —
// even with the tab closed. Daily on Vercel Cron; protected by CRON_SECRET.
// AI calls are fired concurrently per user to fit the function time budget.
export const maxDuration = 60;

interface MoverPick { name: string; ticker: string; cls: string; why: string; now: string; check: string; change_pct: string | null }
interface ScoutInsert { user_id: string; name: string; symbol: string; asset_class: string; why: string; now_catalyst: string; check_text: string; change_pct: string | null; data_source: string | null; kind: string }

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();

  // Users who opted into auto-sweep and are due (interval honored even on a daily cron).
  const { data: users } = await admin.from("settings").select("user_id,scout_interval_minutes,last_sweep_at,news_source,news_focus").gt("scout_interval_minutes", 0);
  const now = Date.now();
  const due = (users ?? []).filter((u) => !u.last_sweep_at || now - new Date(u.last_sweep_at).getTime() >= u.scout_interval_minutes * 60000);
  if (!due.length) return NextResponse.json({ ok: true, swept: 0 });

  // Top movers are market-wide → enrich once and reuse across users.
  let moverPicks: MoverPick[] = [];
  try {
    const movers = await getTopGainers(8);
    if (movers.length) {
      const text = await ask(moversScoutPrompt(movers), [{ role: "user", content: "Explain today's top movers and what to verify." }], true, 1400);
      moverPicks = parseScout(text).picks.map((p) => {
        const m = movers.find((mv) => (mv.ticker || "").toUpperCase() === (p.ticker || "").toUpperCase());
        return { name: p.name, ticker: p.ticker, cls: p.cls, why: p.why, now: p.now, check: p.check, change_pct: m?.changePct ?? null };
      });
    }
  } catch { /* market data unavailable → degrade to theme scout only */ }

  let swept = 0;
  for (const u of due) {
    await sweepUser(admin, u.user_id, moverPicks, u.news_source, u.news_focus);
    swept++;
  }
  return NextResponse.json({ ok: true, swept });
}

async function sweepUser(admin: ReturnType<typeof createAdminClient>, userId: string, moverPicks: MoverPick[], newsSource: string | null, newsFocus: string | null) {
  const [{ data: themes }, { data: items }] = await Promise.all([
    admin.from("themes").select("label").eq("user_id", userId),
    admin.from("watchlist").select("id,symbol,asset_class").eq("user_id", userId).order("last_scan_at", { ascending: true, nullsFirst: true }).limit(6),
  ]);
  const themeLabels = (themes ?? []).map((t) => t.label as string);
  const tracked = (items ?? []) as { id: string; symbol: string; asset_class: string }[];

  // Fire the user's AI calls concurrently.
  const themeScoutP: Promise<ScoutResult | null> = themeLabels.length
    ? ask(scoutPrompt(themeLabels), [{ role: "user", content: `Themes: ${themeLabels.join("; ")}` }], true, 1100).then(parseScout).catch(() => null)
    : Promise.resolve(null);
  const newsP: Promise<NewsResult | null> = ask(
    newsPrompt(newsSource || "All", newsFocus || ""),
    [{ role: "user", content: `Source focus: ${newsSource || "All"}\nTopic focus: ${newsFocus || "(general markets)"}\n\nSurface the latest market-moving business headlines now.` }],
    true,
    1500,
  ).then(parseNews).catch(() => null);
  const trackP = tracked.map((it) =>
    ask(trackingUpdatePrompt(), [{ role: "user", content: `Asset: ${it.symbol}\nAsset class: ${it.asset_class}\n\nGive the monitoring update from current public information.` }], true, 1100)
      .then((text) => ({ it, upd: parseTrackingUpdate(text) }))
      .catch(() => ({ it, upd: null }))
  );
  const [themeRes, newsRes, trackResults] = await Promise.all([themeScoutP, newsP, Promise.all(trackP)]);

  // Rebuild the fresh-finds feed (movers first, then theme picks).
  const picks: ScoutInsert[] = [];
  for (const p of moverPicks) picks.push({ user_id: userId, name: p.name, symbol: p.ticker, asset_class: "Equity / Stock", why: p.why, now_catalyst: p.now, check_text: p.check, change_pct: p.change_pct, data_source: MARKET_SOURCE, kind: "mover" });
  if (themeRes) for (const p of themeRes.picks) picks.push({ user_id: userId, name: p.name, symbol: p.ticker, asset_class: mapClass(p.cls), why: p.why, now_catalyst: p.now, check_text: p.check, change_pct: null, data_source: null, kind: "theme" });
  if (picks.length) {
    await admin.from("scout_picks").delete().eq("user_id", userId);
    await admin.from("scout_picks").insert(picks);
  }

  // Refresh the news feed (paraphrased + attributed in the prompt).
  if (newsRes && newsRes.items.length) {
    await admin.from("news_items").delete().eq("user_id", userId);
    await admin.from("news_items").insert(newsRes.items.map((n) => ({
      user_id: userId, headline: n.head, source: n.source, why: n.why,
      symbol: n.ticker, asset_class: n.cls, signal: n.signal, recency: n.when,
    })));
  }

  // Persist tracking refreshes.
  await Promise.all(trackResults.map(({ it, upd }) =>
    upd
      ? admin.from("watchlist").update({ update_text: upd.update, watch_text: upd.watch, lean: upd.lean, lean_reason: upd.leanReason, status: "ok", last_scan_at: new Date().toISOString() }).eq("id", it.id)
      : admin.from("watchlist").update({ status: "error" }).eq("id", it.id)
  ));

  await admin.from("settings").update({ last_sweep_at: new Date().toISOString() }).eq("user_id", userId);
}
