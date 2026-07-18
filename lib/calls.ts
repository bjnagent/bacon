// The calibration loop. Bacon now makes explicit calls; this module makes it
// ACCOUNTABLE for them: every call is stored with context at call time
// (including community crowding), graded later against real prices + SPY
// (deterministic math, no model — math can't flatter itself), and aggregated
// into a calibration memo injected back into the prompts. Cohorts below a
// minimum sample size stay OUT of the memo — learning from noise is worse than
// not learning.

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeRoi, cleanTicker } from "./market";
import { getCachedSeries } from "./priceCache";
import { getPropertySeries } from "./property";

export interface NewCall {
  source: "brief" | "analyze" | "property";
  instrument: string;
  action: string;        // free text; first word is the action
  conviction?: number | null;
  targetText?: string;
  horizonDays: number;
  crowded?: string | null; // hot | warm | quiet
}

// ---------- pure helpers (unit-tested) ----------

// First word of the action line, normalized. "Buy — catalyst tonight" → "buy".
export function actionHead(action: string): string {
  return (action || "").trim().split(/[\s·—-]+/)[0].toLowerCase();
}

const BULLISH = new Set(["buy", "accumulate", "proceed"]);
const BEARISH = new Set(["sell", "avoid", "stay"]);

// Direction expectation for grading; null = not a directional call (watch/hold).
export function expectedDirection(action: string): 1 | -1 | null {
  const head = actionHead(action);
  if (BULLISH.has(head)) return 1;
  if (BEARISH.has(head)) return -1;
  return null;
}

// Pull the base-case number out of a free-text target line.
// "base $160" / "$160 base est." → {base:160, kind:'price'}; "base +12%" → pct.
// Prefer the "base …" clause (bounded by the bear/bull clauses, NOT by commas —
// numbers like $1,450 carry commas); fall back to the first number anywhere.
export function parseTargets(text: string | undefined): { base: number; kind: "price" | "pct" } | null {
  if (!text) return null;
  const scan = (s: string): { base: number; kind: "price" | "pct" } | null => {
    const pct = s.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    if (pct) return { base: Number(pct[1]), kind: "pct" };
    const price = s.match(/\$\s?(\d[\d,]*(?:\.\d+)?)/);
    if (price) return { base: Number(price[1].replace(/,/g, "")), kind: "price" };
    return null;
  };
  const clause = text.match(/base[\s\S]*?(?=bear|bull|;|$)/i)?.[0];
  return (clause ? scan(clause) : null) ?? scan(text);
}

// Parse an analysis VERDICT block into a recordable call.
// "Buy · conviction 4/5\n12-mo estimates: bear $120, base $160 …"
export function parseVerdictCall(verdict: string | undefined): { action: string; conviction: number | null; targetText: string } | null {
  if (!verdict) return null;
  const firstLine = verdict.split("\n")[0].trim();
  const head = actionHead(firstLine);
  if (!head) return null;
  const conviction = Number(verdict.match(/conviction\s*(\d)\s*\/\s*5/i)?.[1]) || null;
  const targetText = verdict.split("\n").find((l) => /est|target|bear|base|bull/i.test(l)) ?? "";
  return { action: firstLine, conviction, targetText };
}

export const HORIZON_DAYS: Record<string, number> = { days: 30, weeks: 90, months: 180 };
export function horizonToDays(h: string | undefined, fallback = 180): number {
  const key = (h || "").toLowerCase();
  for (const k of Object.keys(HORIZON_DAYS)) if (key.includes(k)) return HORIZON_DAYS[k];
  return fallback;
}

// ---------- recording ----------

export async function recordCalls(sb: SupabaseClient, userId: string, calls: NewCall[]): Promise<void> {
  const callDate = new Date().toISOString().slice(0, 10); // UTC day — the dedup key
  const rows = calls
    .filter((c) => c.instrument && actionHead(c.action))
    .map((c) => {
      const t = parseTargets(c.targetText);
      return {
        user_id: userId, source: c.source, instrument: c.instrument.slice(0, 60),
        action: actionHead(c.action), conviction: c.conviction ?? null,
        target_text: (c.targetText || "").slice(0, 300), target_base: t?.base ?? null, target_kind: t?.kind ?? null,
        horizon_date: new Date(Date.now() + c.horizonDays * 86_400_000).toISOString().slice(0, 10),
        crowded: c.crowded ?? null,
        call_date: callDate,
      };
    });
  if (!rows.length) return;
  // Upsert on the (user_id, source, instrument, call_date) dedup key so a repeat
  // sweep the same day overwrites instead of piling up duplicate rows (which
  // would inflate the calibration cohorts). Additive: never blocks the caller.
  try { await sb.from("calls").upsert(rows, { onConflict: "user_id,source,instrument,call_date", ignoreDuplicates: true }); }
  catch { /* calibration is additive, never blocking */ }
}

// ---------- grading (deterministic; runs in the daily cron) ----------

interface CallRow {
  id: string; source: string; instrument: string; action: string;
  target_base: number | null; target_kind: string | null;
  horizon_date: string; created_at: string;
}

async function actualPct(admin: SupabaseClient, row: CallRow): Promise<{ pct: number; latest: number } | null> {
  const since = String(row.created_at).slice(0, 10);
  if (row.source === "property") {
    const series = await getPropertySeries(admin, row.instrument).catch(() => null);
    const roi = series && computeRoi(series, since, 1);
    return roi ? { pct: roi.roiPct, latest: roi.asOfClose } : null;
  }
  const ticker = cleanTicker(row.instrument);
  if (!ticker) return null;
  const series = await getCachedSeries(admin, ticker, since).catch(() => null);
  const roi = series && computeRoi(series, since, 1);
  return roi ? { pct: roi.roiPct, latest: roi.asOfClose } : null;
}

// Grade every call ≥30 days old: interim direction/actual each run, final
// (target error + graded_at) once the horizon lapses. SPY benches the window.
export async function gradeCalls(admin: SupabaseClient): Promise<{ graded: number; finalized: number }> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await admin.from("calls")
    .select("id,source,instrument,action,target_base,target_kind,horizon_date,created_at")
    .is("graded_at", null).lte("created_at", cutoff).limit(60);
  const rows = (data ?? []) as CallRow[];
  if (!rows.length) return { graded: 0, finalized: 0 };

  const today = new Date().toISOString().slice(0, 10);
  let graded = 0, finalized = 0;
  for (const row of rows) {
    try {
      const actual = await actualPct(admin, row);
      if (!actual) continue;
      const spySince = String(row.created_at).slice(0, 10);
      const spy = await getCachedSeries(admin, "SPY", spySince).then((s) => s && computeRoi(s, spySince, 1)).catch(() => null);
      const dir = expectedDirection(row.action);
      const patch: Record<string, unknown> = {
        actual_pct: actual.pct,
        bench_pct: spy?.roiPct ?? null,
        direction_hit: dir == null ? null : (dir === 1 ? actual.pct > 0 : actual.pct < 0),
      };
      if (today >= row.horizon_date) {
        if (row.target_base != null) {
          patch.target_err_pct = row.target_kind === "pct"
            ? actual.pct - row.target_base
            : ((actual.latest - row.target_base) / row.target_base) * 100;
        }
        patch.graded_at = new Date().toISOString();
        finalized++;
      }
      await admin.from("calls").update(patch).eq("id", row.id);
      graded++;
    } catch { /* per-call best-effort */ }
  }
  return { graded, finalized };
}

// ---------- the calibration memo (pure aggregation; unit-tested) ----------

export interface GradedCall {
  action: string; source: string; crowded: string | null; conviction: number | null;
  actual_pct: number | null; bench_pct: number | null; direction_hit: boolean | null; target_err_pct: number | null;
}

const MIN_N = 8; // below this, a cohort is noise — keep it out of the memo

export function buildCalibrationMemo(calls: GradedCall[]): string {
  const rated = calls.filter((c) => c.direction_hit != null);
  if (rated.length < MIN_N) return "";
  const hit = (xs: GradedCall[]) => xs.filter((c) => c.direction_hit).length / xs.length;
  const lines: string[] = [`${rated.length} graded calls; direction hit ${(hit(rated) * 100).toFixed(0)}%.`];

  const bulls = rated.filter((c) => expectedDirection(c.action) === 1);
  const bears = rated.filter((c) => expectedDirection(c.action) === -1);
  if (bulls.length >= MIN_N) lines.push(`Bullish calls: ${(hit(bulls) * 100).toFixed(0)}% hit (${bulls.length}).`);
  if (bears.length >= MIN_N) lines.push(`Bearish calls: ${(hit(bears) * 100).toFixed(0)}% hit (${bears.length}).`);

  const errs = calls.map((c) => c.target_err_pct).filter((e): e is number => e != null);
  if (errs.length >= MIN_N) {
    const bias = errs.reduce((s, e) => s + e, 0) / errs.length;
    lines.push(`Target bias: actuals land ${bias >= 0 ? "+" : ""}${bias.toFixed(1)}% vs your base cases — you skew ${bias < 0 ? "optimistic (aim lower)" : "conservative (aim higher)"}.`);
  }

  const hot = rated.filter((c) => c.crowded === "hot");
  const quiet = rated.filter((c) => c.crowded === "quiet");
  if (hot.length >= MIN_N && quiet.length >= MIN_N) {
    lines.push(`Crowding: your calls on HOT (hyped) names hit ${(hit(hot) * 100).toFixed(0)}% vs ${(hit(quiet) * 100).toFixed(0)}% on quiet names — weigh that before joining a loud trade.`);
  }

  const hi = rated.filter((c) => (c.conviction ?? 0) >= 4);
  const lo = rated.filter((c) => c.conviction != null && c.conviction <= 3);
  if (hi.length >= MIN_N && lo.length >= MIN_N && hit(hi) < hit(lo)) {
    lines.push(`Confidence check: high-conviction calls hit ${(hit(hi) * 100).toFixed(0)}% vs ${(hit(lo) * 100).toFixed(0)}% for lower conviction — your strongest feelings are not your best calls.`);
  }
  return lines.join(" ");
}

// Fetch + build, for prompt injection. Empty string until enough history exists.
export async function getCalibrationMemo(sb: SupabaseClient): Promise<string> {
  try {
    const { data } = await sb.from("calls")
      .select("action,source,crowded,conviction,actual_pct,bench_pct,direction_hit,target_err_pct")
      .not("actual_pct", "is", null)
      .order("created_at", { ascending: false }).limit(200);
    return buildCalibrationMemo((data ?? []) as GradedCall[]);
  } catch { return ""; }
}
