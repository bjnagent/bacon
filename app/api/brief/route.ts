import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, isResponse, fail } from "@/lib/api";
import { gate, getPlanState } from "@/lib/entitlements";
import { planHas } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { readMarketWide, fetchMarketWide } from "@/lib/snapshot";
import { buildSignalBundle, briefToRows, briefToDailyRow, splitVoices, type StoredBriefItem } from "@/lib/brief";
import { recordCalls, horizonToDays, getCalibrationMemo } from "@/lib/calls";
import { cleanTicker } from "@/lib/market";
import { parseOpportunities } from "@/lib/parsers";
import { opportunityBriefPrompt } from "@/lib/prompts";
import { adviceEnabled } from "@/lib/advice";
import { getForecasts } from "@/lib/forecast";
import { getForecastMemo, recordForecasts } from "@/lib/forecastRecord";
import { getCachedSeries } from "@/lib/priceCache";
import { orEmpty, swallowed } from "@/lib/log";
import { askStream, BULK_MODEL } from "@/lib/anthropic";
import { textStreamResponse } from "@/lib/streamRoute";
import { SCOUT_PICK_COLUMNS, type ScoutPickRow } from "@/lib/types";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";

export const maxDuration = 300;

const KINDS = ["opportunity", "brief-intro"];

type Levels = Pick<StoredBriefItem, "entry" | "stop" | "size">;

const levelKey = (ticker: string | null | undefined, name: string | null | undefined) =>
  `${(ticker ?? "").trim().toUpperCase()}|${(name ?? "").trim().toLowerCase()}`;

function assemble(rows: ScoutPickRow[], levels: Map<string, Levels>) {
  const introRow = rows.find((r) => r.kind === "brief-intro");
  const items = rows.filter((r) => r.kind === "opportunity");
  return {
    intro: introRow?.why || null,
    caveat: introRow?.check_text || null,
    generatedAt: items[0]?.created_at ?? introRow?.created_at ?? null,
    items: items.map((r) => {
      const lv = levels.get(levelKey(r.symbol, r.name));
      return {
        id: r.id, name: r.name, ticker: r.symbol, cls: r.asset_class,
        horizon: r.data_source || "", thesis: r.why, signals: r.now_catalyst, checks: r.check_text,
        action: r.action || "", target: r.target || "",
        ...(lv?.entry ? { entry: lv.entry } : {}),
        ...(lv?.stop ? { stop: lv.stop } : {}),
        ...(lv?.size ? { size: lv.size } : {}),
      };
    }),
  };
}

/**
 * Advice-mode levels (entry / stop / size) ride only on the daily_briefs
 * history row — scout_picks has no columns for them. Without this join a
 * persisted advice brief would lose exactly the levels its trigger state is
 * computed from. Same-day re-sweeps overwrite both stores together, and items
 * are matched on ticker + name, so a level can't attach to the wrong idea.
 * Best-effort: an error just means no levels, as in research mode.
 */
async function latestLevels(sb: SupabaseClient, userId: string): Promise<Map<string, Levels>> {
  const out = new Map<string, Levels>();
  try {
    const { data } = await sb.from("daily_briefs").select("items").eq("user_id", userId)
      .order("brief_date", { ascending: false }).limit(1).maybeSingle();
    const items = ((data as { items?: StoredBriefItem[] } | null)?.items ?? []);
    for (const it of Array.isArray(items) ? items : []) {
      if (it && (it.entry || it.stop || it.size)) out.set(levelKey(it.ticker, it.name), { entry: it.entry, stop: it.stop, size: it.size });
    }
  } catch (err) { swallowed("brief: levels", err); }
  return out;
}

async function readBrief(sb: SupabaseClient, userId: string) {
  const [picks, levels] = await Promise.all([
    sb.from("scout_picks").select(SCOUT_PICK_COLUMNS).eq("user_id", userId).in("kind", KINDS).order("created_at", { ascending: false }),
    latestLevels(sb, userId),
  ]);
  if (picks.error) throw new Error(picks.error.message);
  return assemble((picks.data ?? []) as ScoutPickRow[], levels);
}

// GET: the latest opportunity brief for the signed-in user.
//
// Free plan = the house brief. A plan without `personal_brief` reads the house
// account's latest brief (HOUSE_USER_ID — the same account whose graded calls
// are published at /record) through the service role, since RLS rightly hides
// another user's rows. The member still gets a real brief every morning; what
// they pay for is one built around their own watchlist and themes. If the house
// account isn't configured or can't be read, they get their own (possibly
// empty) brief — never someone else's by accident.
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const houseId = process.env.HOUSE_USER_ID;
  if (houseId && houseId !== user.id) {
    const state = await getPlanState(sb, user);
    const personal = state.source === "operator" || state.source === "fallback" || planHas(state.plan, "personal_brief");
    if (!personal) {
      try {
        const brief = await readBrief(createAdminClient(), houseId);
        if (brief.items.length) {
          return NextResponse.json({ brief, house: true }, { headers: { "Cache-Control": "private, no-store" } });
        }
      } catch (err) { swallowed("brief: house read", err); }
    }
  }

  try {
    const brief = await readBrief(sb, user.id);
    return NextResponse.json({ brief, house: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    swallowed("brief: read", err);
    return fail(500, "Couldn't load your brief — please try again.", { code: "read_failed" });
  }
}

// POST: generate the brief on demand — same synthesis the nightly sweep runs,
// scoped to the current user's session (RLS enforces row ownership). STREAMS
// the raw synthesis text so opportunity cards appear as they're written; the
// parsed result is persisted after the last chunk.
export async function POST() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  // Daily anti-abuse cap first (cheap, plan-agnostic), then the plan: feature
  // check + one unit of the monthly "sweep" allowance, consumed before any paid
  // work and refunded below if the work doesn't produce a brief.
  if (!(await withinQuota(sb))) return fail(429, QUOTA_MESSAGE, { code: "daily_cap" });
  const g = await gate(sb, user, "brief");
  if (!g.ok) return g.response;

  let bundle: string;
  let crowding: Record<string, string> = {};
  try {
    // Market-wide signals: reuse today's cached snapshot (warmed by the nightly
    // cron) so a refresh doesn't refetch every external provider on a cold
    // instance. On a miss, fetch live with a short insider deadline so the
    // stream's first byte isn't held up. The user-specific parts stay live and cheap.
    const [marketWide, calibration, forecastRecord, themesRes, trackedRes, newsRes, settingsRes] = await Promise.all([
      readMarketWide(sb).then((cached) => cached ?? fetchMarketWide(2500)),
      getCalibrationMemo(sb),
      getForecastMemo(sb),
      sb.from("themes").select("label"),
      sb.from("watchlist").select("symbol"),
      sb.from("news_items").select("headline,source,why").order("created_at", { ascending: false }).limit(10),
      sb.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    // Bands for the tracked names. Depends on the watchlist above, so it costs
    // one extra hop before the stream opens — bounded, since it reads the shared
    // price cache. Filed to the ledger here too, not only in the nightly sweep:
    // a forecast the user was shown but that was never written down cannot be
    // graded, and an ungradeable forecast is the thing this layer exists to prevent.
    const forecasts = await getForecasts((trackedRes.data ?? []).map((t) => t.symbol), 21, (t) => getCachedSeries(sb, t))
      .catch(orEmpty("brief:forecasts"));
    await recordForecasts(forecasts);

    crowding = marketWide.pulse?.crowding ?? {};
    bundle = buildSignalBundle({
      movers: marketWide.movers,
      losers: marketWide.losers,
      mostActive: marketWide.mostActive,
      sectors: marketWide.sectors,
      headlines: (newsRes.data ?? []).map((n) => ({ head: n.headline, source: n.source, why: n.why })),
      macro: marketWide.macro,
      themes: (themesRes.data ?? []).map((t) => t.label),
      tracked: (trackedRes.data ?? []).map((t) => t.symbol),
      insiders: marketWide.insiders,
      odds: marketWide.odds,
      forecasts,
      forecastRecord,
      voices: splitVoices((settingsRes.data as { voices?: string } | null)?.voices),
      commodities: marketWide.commodities,
      fx: marketWide.fx,
      pulse: marketWide.pulse?.text,
      calibration,
    });
  } catch (err) {
    swallowed("brief: signals", err);
    await g.refund();
    return fail(502, "Couldn't gather today's signals — please try again.", { code: "signals_failed" });
  }

  return textStreamResponse(
    // BULK_MODEL, not the frontier model: the nightly brief already runs on it,
    // the output is a delimited format rather than prose, and the plan pricing
    // (UNIT_COST_USD.sweep ≈ $0.06) assumes the bulk-model cost for on-demand
    // briefs too. On the frontier model each refresh would cost several times
    // what the allowance was priced at.
    askStream(opportunityBriefPrompt(adviceEnabled(user.email)), [{ role: "user", content: bundle }], true, 1800, 6, { route: "brief", userId: user.id }, BULK_MODEL),
    async (full, ok) => {
      // Stream errored mid-flight — don't persist a truncated brief, and don't
      // charge for one.
      if (!ok) { await g.refund(); return; }
      const brief = parseOpportunities(full);
      if (!brief.items.length) { await g.refund(); return; }
      await sb.from("daily_briefs").upsert({ ...briefToDailyRow(user.id, brief), brief_date: new Date().toISOString().slice(0, 10) }, { onConflict: "user_id,brief_date" });
      const rows = briefToRows(user.id, brief);
      // Atomic replace so a failed insert can't leave the feed wiped (RLS scopes
      // the RPC to the caller's own rows).
      await sb.rpc("replace_scout_picks", { p_user: user.id, p_kinds: KINDS, p_rows: rows });
      // Calibration: file every actionable call, stamped with community
      // crowding at call time so the loop can grade hot vs quiet entries.
      await recordCalls(sb, user.id, brief.items.filter((o) => o.action).map((o) => ({
        source: "brief" as const,
        instrument: (o.ticker && o.ticker !== "—" ? o.ticker : o.name),
        action: o.action, targetText: o.target,
        horizonDays: horizonToDays(o.horizon),
        crowded: crowding[cleanTicker(o.ticker) ?? ""] ?? null,
      })));
    }
  );
}
