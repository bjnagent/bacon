// Quantitative price forecasts, server-only.
//
// The point of this module is not the forecast. It is the BASELINE and the
// grading seam around it.
//
// A forecast is only worth anything relative to the null hypothesis, and for
// daily prices the null is a random walk with drift. A model that cannot beat
// drift is not adding information, it is adding confidence — which is the more
// expensive mistake in a product that now states positions. So the baseline
// ships first, every forecast is stored with the method that produced it, and
// the grading pass scores them against realised prices the same way calls are
// scored. Swapping in a learned model later then answers the only question that
// matters about it: is it better than drift?
//
// FORECAST_PROVIDER selects the source. "baseline" (default) computes here, in
// process, for free. "remote" POSTs to FORECAST_URL and expects the same shape
// back — that is the seam a hosted model (Kronos or anything else) plugs into,
// without this file or its callers changing.

import { getDailySeries, cleanTicker, type DailyBar, type DailySeries } from "./market";
import { swallowed } from "./log";

export type ForecastMethod = "drift" | "remote";

export interface Forecast {
  symbol: string;
  /** Trading days ahead. */
  horizonDays: number;
  /** The close the forecast is made FROM, and its date. */
  base: number;
  baseDate: string;
  /** Central expectation, and an 80% band. */
  expected: number;
  lo: number;
  hi: number;
  /** Annualised drift and volatility behind it — the reasoning, in numbers. */
  driftAnnualPct: number;
  volAnnualPct: number;
  method: ForecastMethod;
}

/**
 * How the bars are obtained. Injected rather than imported so the caller
 * chooses the cache: the sweep passes the DB-backed price cache (one fetch per
 * ticker per UTC day, shared across users and serverless instances), while a
 * one-off call can take the in-process default.
 */
export type SeriesLoader = (ticker: string) => Promise<DailySeries | null>;

// Trading days -> calendar days. 252 trading days a year, 365 calendar ones;
// a 21-day horizon is therefore due about 30 calendar days out. Needed because
// the horizon is quoted in trading days but the grader has to know WHEN.
export const CALENDAR_PER_TRADING = 365 / 252;

/** The calendar date a forecast made from `baseDate` becomes gradeable. */
export function dueDate(baseDate: string, horizonDays: number): string {
  const t = Date.parse(`${baseDate}T00:00:00Z`);
  if (!Number.isFinite(t)) return baseDate;
  return new Date(t + Math.round(horizonDays * CALENDAR_PER_TRADING) * 86_400_000).toISOString().slice(0, 10);
}

// Below this there is not enough history to estimate drift or volatility with a
// straight face, and a forecast from 20 bars is a number pretending to be one.
const MIN_BARS = 60;
// Bars used for the estimate. A year of trading days: long enough to be stable,
// short enough to reflect the current regime rather than a decade-old one.
const WINDOW = 252;
const TRADING_DAYS = 252;
// 1.2816 ≈ the 90th percentile of the standard normal, so ±z spans 80%.
const Z80 = 1.2816;

/**
 * Random walk with drift, on log returns.
 *
 * Log returns because prices are bounded below by zero and compound
 * multiplicatively — an arithmetic band would put the low side through zero on
 * a volatile name over a long horizon. The band widens with sqrt(horizon),
 * which is the standard scaling and, more usefully, is the thing that stops a
 * long-horizon forecast looking more precise than it is.
 *
 * Exported for tests: this is pure, and it is the benchmark every other method
 * has to clear.
 */
export function forecastFromBars(bars: DailyBar[], horizonDays: number): Omit<Forecast, "symbol" | "method"> | null {
  if (!Array.isArray(bars) || bars.length < MIN_BARS) return null;
  if (!Number.isFinite(horizonDays) || horizonDays <= 0) return null;

  const use = bars.slice(0, WINDOW);            // newest-first
  const base = use[0]?.close;
  const baseDate = use[0]?.date;
  if (!(base > 0) || !baseDate) return null;

  // Newest-first, so the return INTO bar i is ln(close_i / close_{i+1}).
  const rets: number[] = [];
  for (let i = 0; i < use.length - 1; i++) {
    const a = use[i].close, b = use[i + 1].close;
    if (a > 0 && b > 0) rets.push(Math.log(a / b));
  }
  if (rets.length < MIN_BARS - 1) return null;

  const mu = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mu) ** 2, 0) / (rets.length - 1);
  const sigma = Math.sqrt(variance);
  if (!Number.isFinite(mu) || !Number.isFinite(sigma) || sigma <= 0) return null;

  const h = horizonDays;
  const expected = base * Math.exp(mu * h);
  const spread = Z80 * sigma * Math.sqrt(h);
  const lo = base * Math.exp(mu * h - spread);
  const hi = base * Math.exp(mu * h + spread);
  if (![expected, lo, hi].every((v) => Number.isFinite(v) && v > 0)) return null;

  return {
    horizonDays: h,
    base, baseDate,
    expected, lo, hi,
    driftAnnualPct: (Math.exp(mu * TRADING_DAYS) - 1) * 100,
    volAnnualPct: sigma * Math.sqrt(TRADING_DAYS) * 100,
  };
}

const provider = (): ForecastMethod => (process.env.FORECAST_PROVIDER === "remote" ? "remote" : "drift");

/**
 * The seam. A hosted model answers with the same shape the baseline produces,
 * so nothing downstream knows or cares which one ran — and both are graded by
 * the same pass, which is the entire point.
 *
 * Validated rather than trusted, like every other external source here: a
 * response that is not a complete, positive, ordered band is discarded rather
 * than half-used.
 */
async function fetchRemote(symbol: string, horizonDays: number): Promise<Forecast | null> {
  const url = process.env.FORECAST_URL;
  if (!url) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, horizonDays }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const d = await res.json() as Partial<Forecast>;
  const nums = [d.base, d.expected, d.lo, d.hi];
  if (!nums.every((v) => typeof v === "number" && Number.isFinite(v) && v > 0)) return null;
  if (!(d.lo! <= d.expected! && d.expected! <= d.hi!)) return null;
  if (typeof d.baseDate !== "string") return null;
  return {
    symbol, horizonDays,
    base: d.base!, baseDate: d.baseDate,
    expected: d.expected!, lo: d.lo!, hi: d.hi!,
    driftAnnualPct: Number.isFinite(d.driftAnnualPct) ? d.driftAnnualPct! : 0,
    volAnnualPct: Number.isFinite(d.volAnnualPct) ? d.volAnnualPct! : 0,
    method: "remote",
  };
}

/** One forecast, or null. Never a guess — a name without enough history gets none. */
export async function getForecast(rawSymbol: string, horizonDays = 21, load: SeriesLoader = getDailySeries): Promise<Forecast | null> {
  const symbol = cleanTicker(rawSymbol);
  if (!symbol) return null;
  try {
    if (provider() === "remote") {
      const r = await fetchRemote(symbol, horizonDays);
      // Deliberately falls back to the baseline rather than returning nothing:
      // a hosted model being down should degrade the forecast's quality, not
      // remove the number the brief was built to include.
      if (r) return r;
    }
    const series = await load(symbol);
    const f = series && forecastFromBars(series.bars, horizonDays);
    return f ? { ...f, symbol, method: "drift" } : null;
  } catch (err) {
    swallowed(`forecast: ${symbol}`, err);
    return null;
  }
}

/** Batch, independent per symbol so one bad name cannot empty the set. */
export async function getForecasts(symbols: string[], horizonDays = 21, load: SeriesLoader = getDailySeries): Promise<Forecast[]> {
  const unique = [...new Set(symbols.map((s) => cleanTicker(s)).filter((s): s is string => !!s))].slice(0, 12);
  const out = await Promise.all(unique.map((s) => getForecast(s, horizonDays, load)));
  return out.filter((f): f is Forecast => !!f);
}
