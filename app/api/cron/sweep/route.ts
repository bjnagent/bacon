import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { orEmpty, orNull, swallowed } from "@/lib/log";
import { adviceEmails, adviceEnabled, isHouseAccount } from "@/lib/advice";
import { getForecasts } from "@/lib/forecast";
import { getForecastMemo, recordForecasts } from "@/lib/forecastRecord";
import { getCachedSeries } from "@/lib/priceCache";
import { notifyUser } from "@/lib/push";
import {
  briefPushBody, emailFor, entitled, hasFeature, houseUserId, isDue, loadCronAccounts, mapPool, type CronAccount,
} from "../_lib/accounts";

// Background sweep: surface fresh opportunities (today's real movers + theme
// scout) into each user's "fresh finds" feed, build their brief, and refresh
// their tracked names — even with the tab closed. Daily on Vercel Cron;
// protected by CRON_SECRET.
//
// Who it runs for — every condition must hold:
//   1. Due: auto-sweep on (scout_interval_minutes > 0) and their cadence lapsed.
//   2. Entitled: their plan includes `personal_brief` (Pro, Desk, the reverse
//      trial, the operator). Free accounts read the shared house brief instead.
//   3. A bacon footprint (see `hasFootprint`).
// The house account (HOUSE_USER_ID) skips 2 and 3 and runs daily even with its
// toggle off: it IS the free tier's house brief and the public /record.
//
// Grading of calls is NOT here — it runs for every account in /api/cron/watch.
export const maxDuration = 300;

/** Users swept at once. Each fires ~10 AI calls concurrently. */
const POOL = 3;
/** Stop STARTING new users past this point so the run returns its counts instead of being killed. */
const START_BUDGET_MS = 230_000;

interface MoverPick { name: string; ticker: string; cls: string; why: string; now: string; check: string; change_pct: string | null }
interface ScoutInsert { user_id: string; name: string; symbol: string; asset_class: string; why: string; now_catalyst: string; check_text: string; change_pct: string | null; data_source: string | null; kind: string }
interface SettingsRow {
  user_id: string;
  scout_interval_minutes: number | null;
  last_sweep_at: string | null;
  news_source: string | null;
  news_focus: string | null;
  brief_email_enabled: boolean | null;
  push_enabled?: boolean | null;
  voices: unknown;
}
interface Shared { moverPicks: MoverPick[]; mw: MarketWide; forecastRecord: string }
type SweepResult = { status: "swept" | "raced"; briefSaved: boolean; emailed: boolean; pushed: boolean };

const cadenceMs = (s: SettingsRow) => ((s.scout_interval_minutes ?? 0) > 0 ? s.scout_interval_minutes! : 1440) * 60_000;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const admin = createAdminClient();
  const house = houseUserId();

  // select("*"): this has to keep working on a schema that predates columns it
  // reads optionally (push_enabled).
  const { data: rows, error: settingsErr } = await admin.from("settings").select("*").gt("scout_interval_minutes", 0);
  if (settingsErr) {
    console.error(`[sweep] couldn't read settings: ${settingsErr.message}`);
    return NextResponse.json({ ok: false, error: "settings unavailable" }, { status: 500 });
  }
  const settings = (rows ?? []) as SettingsRow[];
  if (house && !settings.some((s) => s.user_id === house)) {
    const { data: h } = await admin.from("settings").select("*").eq("user_id", house).maybeSingle();
    if (h) settings.push(h as SettingsRow);
    else console.warn("[sweep] HOUSE_USER_ID has no settings row — the house brief can't run");
  }

  const now = Date.now();
  const due = settings
    .filter((u) => isDue(u.last_sweep_at, cadenceMs(u), now))
    // Oldest-served first, so a mid-run timeout doesn't drop the SAME tail every
    // night — the users waiting longest get processed first each run.
    .sort((a, b) => (String(a.last_sweep_at ?? "") < String(b.last_sweep_at ?? "") ? -1 : 1));
  if (!due.length) return NextResponse.json({ ok: true, swept: 0 });

  // Entitlement first: one round trip for every due account, and it removes
  // the free accounts before the per-account footprint queries below.
  const { accounts, via } = await loadCronAccounts(admin, due.map((u) => u.user_id));
  const paid = due.filter((u) => entitled(accounts.get(u.user_id), "personal_brief", house));
  const unentitled = due.length - paid.length;

  // Sweeping is gated on the account having actually USED bacon, not merely
  // existing.
  //
  // This Postgres project is shared with another app, so every signup THERE
  // lands in the same auth.users, and handle_new_user() provisions bacon
  // profiles/settings rows for it. Those accounts are indistinguishable from
  // real ones in the settings table — which is exactly how six of them ended up
  // swept nightly, generating research briefs nobody had asked for and billing
  // real money for it. A settings row means someone signed up to *an* app; only
  // a footprint means they use this one. (The entitlement check above doesn't
  // replace this: every new account starts on the Pro reverse trial.)
  //
  // Footprint counts only what a PERSON creates: any UI interaction, a tracked
  // name, or a chat message. Briefs and filed calls are deliberately excluded —
  // the sweep writes those itself, so counting them would make the first sweep
  // self-justifying and the gate could never close again.
  const hasFootprint = async (userId: string): Promise<boolean> => {
    for (const table of ["user_events", "watchlist", "chat_messages"] as const) {
      const { data, error } = await admin.from(table).select("user_id").eq("user_id", userId).limit(1);
      if (error) swallowed(`sweep: footprint ${table} ${userId}`, error);
      if (data?.length) return true;
    }
    return false;
  };
  const footprints = await mapPool(paid, 10, (u) => (u.user_id === house ? Promise.resolve(true) : hasFootprint(u.user_id)));
  const active = paid.filter((_, i) => footprints[i]);
  const skipped = paid.length - active.length;
  // Reported rather than silent: "swept 2, skipped 6" is the line that would
  // have made the contamination obvious weeks earlier.
  if (skipped) console.warn(`[sweep] skipped ${skipped} account(s) with no bacon footprint`);
  if (!active.length) return NextResponse.json({ ok: true, swept: 0, skipped, unentitled, via });

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
  } catch (e) { swallowed("sweep: market-wide snapshot", e); /* degrade to theme scout only */ }

  // How the mechanical price bands have actually scored against realised closes.
  // Global, not per-user — a forecast is a statement about a symbol — so it is
  // resolved once per sweep rather than once per swept account.
  const forecastRecord = await getForecastMemo(admin).catch(() => "");
  const shared: Shared = { moverPicks, mw, forecastRecord };

  // Bounded concurrency + per-user isolation: one user's throw (or slow run)
  // never aborts the sweep or serializes the rest to the 300s ceiling. Users not
  // started before the budget runs out stay unclaimed — still due, and first in
  // line next run.
  let swept = 0, failed = 0, raced = 0, deferred = 0, briefs = 0, emailed = 0, pushed = 0;
  await mapPool(active, POOL, async (u) => {
    if (Date.now() - started > START_BUDGET_MS) { deferred++; return; }
    try {
      const r = await sweepUser(admin, u, accounts.get(u.user_id)!, shared);
      if (r.status === "raced") { raced++; return; }
      swept++;
      if (r.briefSaved) briefs++;
      if (r.emailed) emailed++;
      if (r.pushed) pushed++;
    } catch (e) {
      failed++;
      console.error("sweepUser failed", u.user_id, e);
    }
  });
  if (deferred) console.warn(`[sweep] time budget reached — ${deferred} account(s) deferred to the next run`);
  return NextResponse.json({ ok: true, swept, failed, skipped, unentitled, raced, deferred, briefs, emailed, pushed, via });
}

/**
 * Claim the user before any slow work: advance last_sweep_at only if it still
 * holds the value this run read (compare-and-set). A timed-out run then leaves
 * the user swept-for-today rather than perpetually due, and two overlapping
 * runs can't both spend a night's AI budget on the same account.
 */
async function claim(admin: SupabaseClient, s: SettingsRow): Promise<boolean> {
  let q = admin.from("settings").update({ last_sweep_at: new Date().toISOString() }).eq("user_id", s.user_id);
  q = s.last_sweep_at ? q.eq("last_sweep_at", s.last_sweep_at) : q.is("last_sweep_at", null);
  const { data, error } = await q.select("user_id");
  if (error) throw new Error(`claim failed: ${error.message}`);
  return !!data?.length;
}

async function sweepUser(admin: SupabaseClient, s: SettingsRow, acct: CronAccount, shared: Shared): Promise<SweepResult> {
  const userId = s.user_id;
  if (!(await claim(admin, s))) return { status: "raced", briefSaved: false, emailed: false, pushed: false };
  const { moverPicks, mw, forecastRecord } = shared;

  // Advice mode is an account entitlement keyed by email. The plan lookup
  // already returned it; the per-account fallback only fetches one when an
  // allowlist exists to match it against.
  // Never for the house account: its brief is broadcast to every free member.
  const advice = !isHouseAccount(userId) && (adviceEmails().length ? adviceEnabled(await emailFor(admin, acct)) : false);
  const voices = splitVoices(s.voices);

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
    newsPrompt(s.news_source || "All", s.news_focus || ""),
    [{ role: "user", content: `Source focus: ${s.news_source || "All"}\nTopic focus: ${s.news_focus || "(general markets)"}\n\nSurface the latest market-moving business headlines now.` }],
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
  // Mechanical price bands for the names this user actually holds, off the
  // DB-backed price cache (one fetch per ticker per UTC day, shared across every
  // user and instance) rather than the in-process one, which is cold on most
  // serverless invocations. Free — no model runs — and filed to the ledger the
  // moment it is computed, BEFORE the outcome is known, which is the only order
  // in which a forecast can honestly be graded later.
  const forecasts = await getForecasts(tracked.map((t) => t.symbol), 21, (t) => getCachedSeries(admin, t))
    .catch(orEmpty("sweep:forecasts"));
  await recordForecasts(forecasts).catch((e) => swallowed(`sweep: record forecasts ${userId}`, e));

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
    audience: userId === houseUserId() ? "house" : "personal",
    insiders: mw.insiders,
    odds: mw.odds,
    forecasts,
    forecastRecord,
    voices,
    commodities: mw.commodities,
    fx: mw.fx,
  }, { route: "sweep:brief", userId }, advice).catch(orNull("sweep:brief"));

  const [themeRes, newsRes, trackResults, brief] = await Promise.all([themeScoutP, newsP, Promise.all(trackP), briefP]);

  let briefRows: Array<Record<string, unknown>> = [];
  if (brief) {
    briefRows = briefToRows(userId, brief);
    // Calibration: file each actionable call, stamped with the community crowding
    // captured at call time — the same accounting the interactive /api/brief POST
    // does. Additive + idempotent (dedup key).
    try {
      const crowding = mw.pulse?.crowding ?? {};
      await recordCalls(admin, userId, brief.items.filter((o) => o.action).map((o) => ({
        source: "brief" as const,
        instrument: o.ticker && o.ticker !== "—" ? o.ticker : o.name,
        action: o.action, targetText: o.target,
        horizonDays: horizonToDays(o.horizon),
        crowded: crowding[cleanTicker(o.ticker) ?? ""] ?? null,
      })));
    } catch (e) { swallowed(`sweep: record calls ${userId}`, e); }
    // Track record: today's brief. Additive — a failure here must not cost the user their feed.
    const { error: dailyErr } = await admin.from("daily_briefs")
      .upsert({ ...briefToDailyRow(userId, brief), brief_date: new Date().toISOString().slice(0, 10) }, { onConflict: "user_id,brief_date" });
    if (dailyErr) swallowed(`sweep: daily_briefs ${userId}`, dailyErr);
  }

  // Rebuild the signal feeds (opportunities first, then movers + theme picks).
  const picks: ScoutInsert[] = [];
  for (const p of moverPicks) picks.push({ user_id: userId, name: p.name, symbol: p.ticker, asset_class: "Equity / Stock", why: p.why, now_catalyst: p.now, check_text: p.check, change_pct: p.change_pct, data_source: MARKET_SOURCE, kind: "mover" });
  if (themeRes) for (const p of themeRes.picks) picks.push({ user_id: userId, name: p.name, symbol: p.ticker, asset_class: mapClass(p.cls), why: p.why, now_catalyst: p.now, check_text: p.check, change_pct: null, data_source: null, kind: "theme" });
  let briefSaved = false;
  if (picks.length || briefRows.length) {
    // Atomic replace (delete+insert in one transaction) so a failed insert can't
    // leave the user's fresh-finds feed wiped with nothing to replace it.
    const { error } = await admin.rpc("replace_scout_picks", { p_user: userId, p_kinds: ["opportunity", "brief-intro", "mover", "theme"], p_rows: [...briefRows, ...picks] });
    if (error) swallowed(`sweep: replace_scout_picks ${userId}`, error);
    else briefSaved = briefRows.length > 0;
  }

  // Refresh the news feed (paraphrased + attributed in the prompt) — atomically.
  if (newsRes && newsRes.items.length) {
    const { error } = await admin.rpc("replace_news", { p_user: userId, p_rows: newsRes.items.map((n) => ({
      headline: n.head, source: n.source, why: n.why,
      symbol: n.ticker, asset_class: n.cls, signal: n.signal, lean: n.lean, recency: n.when,
    })) });
    if (error) swallowed(`sweep: replace_news ${userId}`, error);
  }

  // Persist tracking refreshes.
  const trackWrites = await Promise.all(trackResults.map(({ it, upd }) =>
    upd
      ? admin.from("watchlist").update({ update_text: upd.update, watch_text: upd.watch, lean: upd.lean, lean_reason: upd.leanReason, status: "ok", last_scan_at: new Date().toISOString() }).eq("id", it.id)
      : admin.from("watchlist").update({ status: "error" }).eq("id", it.id)
  ));
  const trackErr = trackWrites.find((w) => w.error)?.error;
  if (trackErr) swallowed(`sweep: watchlist updates ${userId}`, trackErr);

  // Delivery — only once the brief is actually in the feed the app reads, so a
  // notification never opens onto yesterday's brief.
  let emailed = false, pushed = false;
  if (brief && briefSaved && brief.items.length) {
    if (s.brief_email_enabled && hasFeature(acct.plan, "email_brief") && emailEnabled()) {
      try {
        const to = await emailFor(admin, acct);
        if (to) emailed = await sendBriefEmail(to, brief, new Date().toUTCString().slice(0, 16));
      } catch (e) { swallowed(`sweep: brief email ${userId}`, e); }
    }
    if (s.push_enabled !== false && hasFeature(acct.plan, "push_alerts")) {
      try {
        pushed = (await notifyUser(userId, { title: "Your brief is ready", body: briefPushBody(brief), path: "/", kind: "brief" })) > 0;
      } catch (e) { swallowed(`sweep: brief push ${userId}`, e); }
    }
  }
  return { status: "swept", briefSaved, emailed, pushed };
}
