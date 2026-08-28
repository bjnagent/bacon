import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { askCheap } from "@/lib/ai";
import { scoutPrompt, moversScoutPrompt, trackingUpdatePrompt, newsPrompt } from "@/lib/prompts";
import { parseScout, parseTrackingUpdate, parseNews, type ScoutResult, type NewsResult } from "@/lib/parsers";
import { MARKET_SOURCE, cleanTicker } from "@/lib/market";
import { recordCalls, horizonToDays } from "@/lib/calls";
import { readMarketWide, fetchMarketWide, cacheMarketWide, type MarketWide } from "@/lib/snapshot";
import { generateBrief, briefToRows, briefToDailyRow, splitVoices } from "@/lib/brief";
import { sendBriefEmail, emailEnabled } from "@/lib/email";
import { mapClass } from "@/lib/lenses";
import { orNull } from "@/lib/log";

// Background sweep: surface fresh opportunities (today's real movers + theme
// scout) into each user's "fresh finds" feed, and refresh their tracked names —
// even with the tab closed. Daily on Vercel Cron; protected by CRON_SECRET.
// AI calls are fired concurrently per user to fit the function time budget.
export const maxDuration = 300;

interface MoverPick { name: string; ticker: string; cls: string; why: string; now: string; check: string; change_pct: string | null }
interface ScoutInsert { user_id: string; name: string; symbol: string; asset_class: string; why: string; now_catalyst: string; check_text: string; change_pct: string | null; data_source: string | null; kind: string }

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();

  // Users who opted into auto-sweep and are due (interval honored even on a daily cron).
  const { data: users } = await admin.from("settings").select("*").gt("scout_interval_minutes", 0);
  const now = Date.now();
  const due = (users ?? [])
    .filter((u) => !u.last_sweep_at || now - new Date(u.last_sweep_at).getTime() >= u.scout_interval_minutes * 60000)
    // Oldest-served first, so a mid-run timeout doesn't drop the SAME tail every
    // night — the users waiting longest get processed first each run.
    .sort((a, b) => (String(a.last_sweep_at ?? "") < String(b.last_sweep_at ?? "") ? -1 : 1));
  if (!due.length) return NextResponse.json({ ok: true, swept: 0 });

  // Sweeping is gated on the account having actually USED bacon, not merely
  // existing.
  //
  // This Postgres project is shared with another app, so every signup THERE
  // lands in the same auth.users, and handle_new_user() provisions bacon
  // profiles/settings rows for it. Those accounts are indistinguishable from
  // real ones in the settings table — which is exactly how six of them ended up
  // swept nightly, generating research briefs nobody had asked for and billing
  // real money for it. A settings row means someone signed up to *an* app; only
  // a footprint means they use this one.
  //
  // Footprint counts only what a PERSON creates: any UI interaction, a tracked
  // name, or a chat message. Briefs and filed calls are deliberately excluded —
  // the sweep writes those itself, so counting them would make the first sweep
  // self-justifying and the gate could never close again.
  const hasFootprint = async (userId: string): Promise<boolean> => {
    for (const table of ["user_events", "watchlist", "chat_messages"] as const) {
      const { data } = await admin.from(table).select("user_id").eq("user_id", userId).limit(1);
      if (data?.length) return true;
    }
    return false;
  };
  const footprints = await Promise.all(due.map((u) => hasFootprint(u.user_id)));
  const active = due.filter((_, i) => footprints[i]);
  const skipped = due.length - active.length;
  // Reported rather than silent: "swept 2, skipped 6" is the line that would
  // have made the contamination obvious weeks earlier.
  if (skipped) console.warn(`[sweep] skipped ${skipped} account(s) with no bacon footprint`);
  if (!active.length) return NextResponse.json({ ok: true, swept: 0, skipped });

  // Market-wide signals → build the day's snapshot ONCE (and cache it so
  // Sweep-now reuses it), then reuse across every user in this sweep.
  const empty: MarketWide = { movers: [], losers: [], mostActive: [], sectors: [], macro: [], commodities: [], fx: [], insiders: [] };
  let mw: MarketWide = empty;
  let moverPicks: MoverPick[] = [];
  try {
    mw = (await readMarketWide(admin)) ?? await (async () => { const b = await fetchMarketWide(); await cacheMarketWide(admin, b); return b; })();
    if (mw.movers.length) {
      // Shared across every swept user → metered as a system cost (no userId).
      const text = await askCheap(moversScoutPrompt(mw.movers), [{ role: "user", content: "Explain today's top movers and what to verify." }], true, 1400, 6, { route: "sweep:movers" });
      moverPicks = parseScout(text).picks.map((p) => {
        const m = mw.movers.find((mv) => (mv.ticker || "").toUpperCase() === (p.ticker || "").toUpperCase());
        return { name: p.name, ticker: p.ticker, cls: p.cls, why: p.why, now: p.now, check: p.check, change_pct: m?.changePct ?? null };
      });
    }
  } catch { /* market data unavailable → degrade to theme scout only */ }

  // Bounded concurrency + per-user isolation: one user's throw (or slow run) no
  // longer aborts the whole sweep or serializes the rest to the 300s ceiling.
  let swept = 0, failed = 0;
  const POOL = 3;
  for (let i = 0; i < active.length; i += POOL) {
    const batch = active.slice(i, i + POOL);
    const results = await Promise.all(batch.map((u) =>
      sweepUser(admin, u.user_id, moverPicks, u.news_source, u.news_focus, mw, !!u.brief_email_enabled, splitVoices(u.voices))
        .then(() => true)
        .catch((e) => { console.error("sweepUser failed", u.user_id, e); return false; })
    ));
    for (const ok of results) { if (ok) swept++; else failed++; }
  }
  return NextResponse.json({ ok: true, swept, failed, skipped });
}

async function sweepUser(admin: ReturnType<typeof createAdminClient>, userId: string, moverPicks: MoverPick[], newsSource: string | null, newsFocus: string | null, mw: MarketWide, emailOptIn: boolean, voices: string[]) {
  // Claim the user up-front (before the slow AI work) so if this invocation
  // times out mid-run, the user isn't left perpetually "due" and dropped again
  // next run — better to skip a day than loop the same tail forever.
  await admin.from("settings").update({ last_sweep_at: new Date().toISOString() }).eq("user_id", userId);

  const [{ data: themes }, { data: items }, { data: cachedNews }] = await Promise.all([
    admin.from("themes").select("label").eq("user_id", userId),
    admin.from("watchlist").select("id,symbol,asset_class").eq("user_id", userId).order("last_scan_at", { ascending: true, nullsFirst: true }).limit(6),
    admin.from("news_items").select("headline,source,why").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);
  const themeLabels = (themes ?? []).map((t) => t.label as string);
  const tracked = (items ?? []) as { id: string; symbol: string; asset_class: string }[];

  // Fire the user's AI calls concurrently.
  const themeScoutP: Promise<ScoutResult | null> = themeLabels.length
    ? askCheap(scoutPrompt(themeLabels), [{ role: "user", content: `Themes: ${themeLabels.join("; ")}` }], true, 1100, 6, { route: "sweep:scout", userId }).then(parseScout).catch(orNull("sweep:scout"))
    : Promise.resolve(null);
  const newsP: Promise<NewsResult | null> = askCheap(
    newsPrompt(newsSource || "All", newsFocus || ""),
    [{ role: "user", content: `Source focus: ${newsSource || "All"}\nTopic focus: ${newsFocus || "(general markets)"}\n\nSurface the latest market-moving business headlines now.` }],
    true,
    1500,
    4,
    { route: "sweep:news", userId },
  ).then(parseNews).catch(orNull("sweep:news"));
  const trackP = tracked.map((it) =>
    askCheap(trackingUpdatePrompt(), [{ role: "user", content: `Asset: ${it.symbol}\nAsset class: ${it.asset_class}\n\nGive the monitoring update from current public information.` }], true, 1100, 3, { route: "sweep:track", userId })
      .then((text) => ({ it, upd: parseTrackingUpdate(text) }))
      .catch(() => ({ it, upd: null }))
  );
  // Synthesis runs CONCURRENTLY with the gatherers, reading yesterday's cached
  // headlines — decoupling it from the fresh news fetch keeps the sweep's
  // wall-clock at the slowest single call, not the sum.
  const briefP = generateBrief({
    movers: mw.movers.length ? mw.movers : moverPicks.map((p) => ({ ticker: p.ticker, price: "", changePct: p.change_pct ?? "" })),
    losers: mw.losers,
    mostActive: mw.mostActive,
    sectors: mw.sectors,
    headlines: (cachedNews ?? []).map((n) => ({ head: n.headline, source: n.source, why: n.why })),
    macro: mw.macro,
    themes: themeLabels,
    tracked: tracked.map((t) => t.symbol),
    insiders: mw.insiders,
    voices,
    commodities: mw.commodities,
    fx: mw.fx,
  }, { route: "sweep:brief", userId }).catch(orNull("sweep:brief"));

  const [themeRes, newsRes, trackResults, brief] = await Promise.all([themeScoutP, newsP, Promise.all(trackP), briefP]);

  let briefRows: Array<Record<string, unknown>> = [];
  try {
    if (!brief) throw new Error("brief failed");
    briefRows = briefToRows(userId, brief);
    // Calibration: file each actionable call, stamped with the community crowding
    // captured at call time — the same accounting the interactive /api/brief POST
    // does. Without this the nightly sweep (the primary path) fed the calibration
    // loop NOTHING, so it never engaged. Additive + idempotent (dedup key).
    try {
      const crowding = mw.pulse?.crowding ?? {};
      await recordCalls(admin, userId, brief.items.filter((o) => o.action).map((o) => ({
        source: "brief" as const,
        instrument: o.ticker && o.ticker !== "—" ? o.ticker : o.name,
        action: o.action, targetText: o.target,
        horizonDays: horizonToDays(o.horizon),
        crowded: crowding[cleanTicker(o.ticker) ?? ""] ?? null,
      })));
    } catch { /* calibration is additive */ }
    // Track record: upsert today's brief (best-effort — table ships in schema.sql).
    try {
      await admin.from("daily_briefs").upsert({ ...briefToDailyRow(userId, brief), brief_date: new Date().toISOString().slice(0, 10) }, { onConflict: "user_id,brief_date" });
    } catch { /* track record is additive */ }
    // Morning email, if the user opted in and delivery is configured.
    if (emailOptIn && emailEnabled() && brief.items.length) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(userId);
        const to = u?.user?.email;
        if (to) await sendBriefEmail(to, brief, new Date().toUTCString().slice(0, 16));
      } catch { /* email is best-effort */ }
    }
  } catch { /* brief is best-effort; feeds below still land */ }

  // Rebuild the signal feeds (opportunities first, then movers + theme picks).
  const picks: ScoutInsert[] = [];
  for (const p of moverPicks) picks.push({ user_id: userId, name: p.name, symbol: p.ticker, asset_class: "Equity / Stock", why: p.why, now_catalyst: p.now, check_text: p.check, change_pct: p.change_pct, data_source: MARKET_SOURCE, kind: "mover" });
  if (themeRes) for (const p of themeRes.picks) picks.push({ user_id: userId, name: p.name, symbol: p.ticker, asset_class: mapClass(p.cls), why: p.why, now_catalyst: p.now, check_text: p.check, change_pct: null, data_source: null, kind: "theme" });
  if (picks.length || briefRows.length) {
    // Atomic replace (delete+insert in one transaction) so a failed insert can't
    // leave the user's fresh-finds feed wiped with nothing to replace it.
    await admin.rpc("replace_scout_picks", { p_user: userId, p_kinds: ["opportunity", "brief-intro", "mover", "theme"], p_rows: [...briefRows, ...picks] });
  }

  // Refresh the news feed (paraphrased + attributed in the prompt) — atomically.
  if (newsRes && newsRes.items.length) {
    await admin.rpc("replace_news", { p_user: userId, p_rows: newsRes.items.map((n) => ({
      headline: n.head, source: n.source, why: n.why,
      symbol: n.ticker, asset_class: n.cls, signal: n.signal, recency: n.when,
    })) });
  }

  // Persist tracking refreshes.
  await Promise.all(trackResults.map(({ it, upd }) =>
    upd
      ? admin.from("watchlist").update({ update_text: upd.update, watch_text: upd.watch, lean: upd.lean, lean_reason: upd.leanReason, status: "ok", last_scan_at: new Date().toISOString() }).eq("id", it.id)
      : admin.from("watchlist").update({ status: "error" }).eq("id", it.id)
  ));
  // last_sweep_at was claimed at the top of sweepUser (timeout-safe).
}
