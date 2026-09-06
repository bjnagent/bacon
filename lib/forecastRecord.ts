// The part that makes a forecast worth having: the ledger and the grade.
//
// lib/forecast.ts produces a number. This module is the reason that number is
// allowed to exist in a product that now states positions. Every forecast is
// written down BEFORE the outcome is known, graded later against the realised
// close by arithmetic alone, and scored against the one benchmark that matters:
//
//   NAIVE — "the price will be what it is today".
//
// For daily prices that benchmark is brutally hard to beat, and a forecaster
// that does not beat it is not adding information, it is adding confidence.
// Both errors are measured on the same realised outcome, so the comparison is
// apples-to-apples and a method's skill score is a fact rather than a claim.
//
// This is also what makes the FORECAST_PROVIDER seam meaningful. A hosted model
// plugged in behind it writes rows here under its own `method`, is graded by
// this same pass, and either shows a better skill score than `drift` or does
// not. Without this ledger, swapping in a learned model is an act of faith.

import type { SupabaseClient } from "@supabase/supabase-js";
import { closeOnOrBefore, cleanTicker } from "./market";
import { getCachedSeries } from "./priceCache";
import { createAdminClient } from "./supabase/admin";
import { dueDate, type Forecast } from "./forecast";
import { orNull } from "./log";

// ---------- pure grading math (unit-tested) ----------

export interface Grade {
  /** Signed, so systematic optimism is visible: + means the forecast was LOW. */
  errorPct: number;
  /** |actual - expected| / actual. Standard MAPE denominator. */
  absErrorPct: number;
  /** The same measure for "no change from base" — the benchmark to beat. */
  naiveErrorPct: number;
  /** Did the realised close land inside the 80% band? Target hit rate: 80%. */
  inBand: boolean;
}

/**
 * Grade one forecast against its realised close.
 *
 * Errors are measured against the ACTUAL, not the forecast, because that is the
 * convention (MAPE) and because dividing by the forecast lets a wilder forecast
 * flatter itself. Returns null on a non-positive actual — a zero price is bad
 * data, and grading against it would silently produce a 100% error.
 */
export function gradeForecast(f: Pick<Forecast, "base" | "expected" | "lo" | "hi">, actual: number): Grade | null {
  if (!Number.isFinite(actual) || actual <= 0) return null;
  if (!(f.expected > 0) || !(f.base > 0)) return null;
  return {
    errorPct: ((actual - f.expected) / actual) * 100,
    absErrorPct: (Math.abs(actual - f.expected) / actual) * 100,
    naiveErrorPct: (Math.abs(actual - f.base) / actual) * 100,
    inBand: actual >= f.lo && actual <= f.hi,
  };
}

// ---------- scoring (pure aggregation; unit-tested) ----------

export interface GradedForecast {
  method: string;
  horizon_days: number;
  error_pct: number | null;
  abs_error_pct: number | null;
  naive_error_pct: number | null;
  in_band: boolean | null;
}

export interface MethodScore {
  method: string;
  n: number;
  /** Median, not mean: one earnings gap should not decide a method's reputation. */
  medianAbsErrorPct: number;
  medianNaiveErrorPct: number;
  /** 1 - model/naive, as a percentage. Positive = beats "no change". */
  skillPct: number;
  /** Share of closes inside the 80% band. Well calibrated is ~80, not ~100. */
  bandHitPct: number;
  /** Mean signed error. Persistently positive = the method forecasts too low. */
  biasPct: number;
}

// Below this a score is noise, and a noisy score is worse than no score because
// it reads as evidence. Forecasts accumulate faster than calls (a batch per
// sweep, not one per idea), so the bar is higher here than the calls loop's 8.
export const MIN_N = 20;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** One score per method, so `drift` and any hosted model are directly comparable. */
export function scoreForecasts(rows: GradedForecast[]): MethodScore[] {
  const byMethod = new Map<string, GradedForecast[]>();
  for (const r of rows) {
    if (r.abs_error_pct == null || r.naive_error_pct == null) continue;
    const list = byMethod.get(r.method);
    if (list) list.push(r); else byMethod.set(r.method, [r]);
  }
  const out: MethodScore[] = [];
  for (const [method, list] of byMethod) {
    if (list.length < MIN_N) continue;
    const model = median(list.map((r) => r.abs_error_pct as number));
    const naive = median(list.map((r) => r.naive_error_pct as number));
    const banded = list.filter((r) => r.in_band != null);
    const biases = list.map((r) => r.error_pct).filter((e): e is number => e != null);
    out.push({
      method,
      n: list.length,
      medianAbsErrorPct: model,
      medianNaiveErrorPct: naive,
      // A naive error of 0 means the price never moved on any graded name —
      // there is no skill to measure against it, so claim none.
      skillPct: naive > 0 ? (1 - model / naive) * 100 : 0,
      bandHitPct: banded.length ? (banded.filter((r) => r.in_band).length / banded.length) * 100 : 0,
      biasPct: biases.length ? biases.reduce((s, e) => s + e, 0) / biases.length : 0,
    });
  }
  return out.sort((a, b) => b.skillPct - a.skillPct);
}

/**
 * The memo injected into the brief prompt.
 *
 * Deliberately states the UNFLATTERING result as plainly as the flattering one:
 * a method that loses to "no change" is told to be treated as a spread, not a
 * direction. The whole point of measuring is that the answer is allowed to be
 * "this does not work" — and the model has to be told, or it will keep quoting
 * a band the evidence says is worthless.
 */
export function buildForecastMemo(scores: MethodScore[]): string {
  if (!scores.length) return "";
  const lines = scores.map((s) => {
    const beats = s.skillPct > 0
      ? `${s.skillPct.toFixed(0)}% BETTER than assuming no change`
      : `${Math.abs(s.skillPct).toFixed(0)}% WORSE than assuming no change — treat its midpoint as noise and use only the band`;
    const band = `${s.bandHitPct.toFixed(0)}% of closes landed inside the 80% band (${s.bandHitPct >= 88 ? "bands too wide to be useful" : s.bandHitPct <= 68 ? "bands too narrow — it is overconfident" : "well calibrated"})`;
    const bias = Math.abs(s.biasPct) < 1 ? "" : `; it forecasts ${s.biasPct > 0 ? "LOW" : "HIGH"} by ${Math.abs(s.biasPct).toFixed(1)}% on average`;
    return `- ${s.method}: ${s.n} graded, median error ${s.medianAbsErrorPct.toFixed(1)}% — ${beats}. ${band}${bias}.`;
  });
  return `FORECAST TRACK RECORD (measured against realised closes, no model involved):\n${lines.join("\n")}`;
}

// ---------- storage ----------

/** Row shape, pure so the mapping is testable without a database. */
export function forecastToRow(f: Forecast, on = new Date().toISOString().slice(0, 10)): Record<string, unknown> {
  return {
    // Written explicitly rather than left to the column default: this is half
    // the dedup key, and "the day the app made the forecast" and "the day the
    // database took the insert" are not reliably the same day.
    forecast_date: on,
    symbol: f.symbol,
    horizon_days: f.horizonDays,
    method: f.method,
    base: f.base,
    base_date: f.baseDate,
    due_date: dueDate(f.baseDate, f.horizonDays),
    expected: f.expected,
    lo: f.lo,
    hi: f.hi,
    drift_annual_pct: f.driftAnnualPct,
    vol_annual_pct: f.volAnnualPct,
  };
}

/**
 * Write today's forecasts down. No user_id: a forecast is a statement about a
 * SYMBOL, identical for everyone, so it is stored once and graded once however
 * many users saw it — the same reasoning as the shared price cache.
 *
 * Takes the service-role client itself rather than accepting the caller's,
 * exactly as the price cache's write-through does and for the same reason: the
 * table is read-only to signed-in clients, and a user-facing route should not
 * have to hold a privileged client just to append to a shared ledger.
 *
 * Additive and idempotent (the dedup key is symbol+horizon+method+day), and
 * never blocking: a failed ledger write must not cost anyone their brief.
 */
export async function recordForecasts(forecasts: Forecast[]): Promise<void> {
  if (!forecasts.length) return;
  const on = new Date().toISOString().slice(0, 10);
  try {
    await createAdminClient().from("forecasts")
      .upsert(forecasts.map((f) => forecastToRow(f, on)), { onConflict: "symbol,horizon_days,method,forecast_date" });
  } catch { /* the ledger is additive, never blocking */ }
}

// ---------- the grading pass (deterministic; runs in the daily cron) ----------

interface DueRow {
  id: string; symbol: string; horizon_days: number;
  base: number; expected: number; lo: number; hi: number;
  due_date: string;
}

/**
 * Grade every forecast whose horizon has lapsed.
 *
 * Two guards keep this honest. A row is only graded once the series actually
 * carries a bar at or after the due date — otherwise a stale provider would let
 * a forecast be scored against a price from BEFORE its horizon ended, which
 * flatters short-horizon forecasts systematically. And the realised value is
 * the close on or before the due date, so a due date landing on a weekend or
 * holiday grades against the last real session rather than skipping to a later,
 * more informed one.
 */
export async function gradeForecasts(admin: SupabaseClient): Promise<{ graded: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from("forecasts")
    .select("id,symbol,horizon_days,base,expected,lo,hi,due_date")
    .is("graded_at", null).lte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(200);
  const rows = (data ?? []) as DueRow[];
  if (!rows.length) return { graded: 0 };

  // One series per SYMBOL, not per row: a symbol usually has several forecasts
  // coming due together, and they all price off the same history.
  const bySymbol = new Map<string, DueRow[]>();
  for (const r of rows) {
    const key = cleanTicker(r.symbol);
    if (!key) continue;
    const list = bySymbol.get(key);
    if (list) list.push(r); else bySymbol.set(key, [r]);
  }

  let graded = 0;
  const gradeSymbol = async (symbol: string, list: DueRow[]) => {
    const earliest = list.reduce((m, r) => (r.due_date < m ? r.due_date : m), list[0].due_date);
    const series = await getCachedSeries(admin, symbol, earliest).catch(orNull(`forecast grading: ${symbol}`));
    if (!series?.bars.length) return;
    const latest = series.bars[0].date;   // newest-first
    for (const r of list) {
      // The series must have caught up to the horizon, or there is nothing to
      // grade yet — a missing bar is not a result.
      if (latest < r.due_date) continue;
      const bar = closeOnOrBefore(series, r.due_date);
      if (!bar) continue;
      const g = gradeForecast(r, bar.close);
      if (!g) continue;
      try {
        await admin.from("forecasts").update({
          actual: bar.close, actual_date: bar.date,
          error_pct: g.errorPct, abs_error_pct: g.absErrorPct,
          naive_error_pct: g.naiveErrorPct, in_band: g.inBand,
          graded_at: new Date().toISOString(),
        }).eq("id", r.id);
        graded++;
      } catch { /* per-row best-effort */ }
    }
  };

  const symbols = [...bySymbol.entries()];
  const POOL = 6;
  for (let i = 0; i < symbols.length; i += POOL) {
    await Promise.all(symbols.slice(i, i + POOL).map(([s, l]) => gradeSymbol(s, l).catch(() => {})));
  }
  return { graded };
}

/** Fetch + score, for prompt injection. Empty string until MIN_N grades exist. */
export async function getForecastMemo(sb: SupabaseClient): Promise<string> {
  try {
    const { data } = await sb.from("forecasts")
      .select("method,horizon_days,error_pct,abs_error_pct,naive_error_pct,in_band")
      .not("graded_at", "is", null)
      .order("graded_at", { ascending: false }).limit(400);
    return buildForecastMemo(scoreForecasts((data ?? []) as GradedForecast[]));
  } catch { return ""; }
}
