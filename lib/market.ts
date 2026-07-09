// Real market data (server-only). The ONE place Bacon is allowed real-time
// numbers — per the no-fabricated-data rule, figures must come from a real
// provider, never the model. Default provider: Alpha Vantage's free
// TOP_GAINERS_LOSERS endpoint. Swappable via MARKET_DATA_PROVIDER.

const PROVIDER = process.env.MARKET_DATA_PROVIDER ?? "alphavantage";
const KEY = process.env.MARKET_DATA_API_KEY;

export const MARKET_SOURCE = PROVIDER === "alphavantage" ? "Alpha Vantage" : PROVIDER;

export interface Mover {
  ticker: string;
  price: string;
  changePct: string; // e.g. "12.34%" — verbatim from the provider
  volume?: string;
}

export function marketDataEnabled(): boolean {
  return !!KEY;
}

export interface MarketSignals {
  gainers: Mover[];
  losers: Mover[];
  mostActive: Mover[]; // attention flow
}

function toMovers(arr: Array<Record<string, string>> | undefined, limit: number): Mover[] {
  return (Array.isArray(arr) ? arr : []).slice(0, limit).map((g) => ({
    ticker: g.ticker, price: g.price, changePct: g.change_percentage, volume: g.volume,
  }));
}

// In-process caches: movers/sectors change slowly intraday, and Alpha Vantage's
// free tier is 25 requests/DAY — uncached, a few Sweep-now clicks exhaust it.
const TTL_MS = 15 * 60 * 1000;
let signalsCache: { at: number; limit: number; data: MarketSignals } | null = null;
let sectorCache: { at: number; data: { sector: string; changePct: string }[] } | null = null;

// Today's gainers + losers + most-active in ONE provider call (US equities).
// Returns empty sets if no key is configured so callers degrade gracefully.
export async function getMarketSignals(limit = 8): Promise<MarketSignals> {
  const empty: MarketSignals = { gainers: [], losers: [], mostActive: [] };
  if (!KEY || PROVIDER !== "alphavantage") return empty;
  if (signalsCache && signalsCache.limit === limit && Date.now() - signalsCache.at < TTL_MS) return signalsCache.data;
  const res = await fetch(`https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${KEY}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`market data request failed (${res.status})`);
  const data = await res.json();
  if (!data?.top_gainers?.length && data?.Information) throw new Error(`market data: ${String(data.Information).slice(0, 120)}`);
  const out: MarketSignals = {
    gainers: toMovers(data?.top_gainers, limit),
    losers: toMovers(data?.top_losers, Math.min(limit, 5)),
    mostActive: toMovers(data?.most_actively_traded, Math.min(limit, 5)),
  };
  if (out.gainers.length) signalsCache = { at: Date.now(), limit, data: out };
  return out;
}

export async function getTopGainers(limit = 8): Promise<Mover[]> {
  return (await getMarketSignals(limit)).gainers;
}

// --- Historical daily closes (for the track record's "$10K since flagged" math) ---
// Real prices only, per the no-fabricated-numbers rule. One TIME_SERIES_DAILY
// call per ticker yields BOTH the flag-day close and today's close, so ROI is
// derived, never guessed.

export interface DailyBar { date: string; close: number } // date: YYYY-MM-DD
export interface DailySeries { ticker: string; bars: DailyBar[] }  // bars sorted newest-first

// Extract a plausible US-equity symbol from a stored ticker field (which may be
// "—", empty, a pair like "ORKA / SPYR", or "BRK.B"). Returns null if none.
export function cleanTicker(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).toUpperCase().match(/[A-Z]{1,5}(?:\.[A-Z])?/);
  const t = m ? m[0] : "";
  return t && t !== "—" ? t : null;
}

// Per-ticker cache: daily bars change at most once a day, and Alpha Vantage's
// free tier is 25 requests/DAY — so an uncached ROI pass would burn the budget.
const seriesCache = new Map<string, { at: number; data: DailySeries }>();
const SERIES_TTL_MS = 30 * 60 * 1000;

async function fetchDailyBars(ticker: string, full: boolean): Promise<DailyBar[]> {
  const size = full ? "full" : "compact"; // compact = last 100 trading days
  const res = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=${size}&apikey=${KEY}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`market data request failed (${res.status})`);
  const data = await res.json();
  if (data?.Information) throw new Error(`market data: ${String(data.Information).slice(0, 120)}`);
  const ts = data?.["Time Series (Daily)"];
  if (!ts || typeof ts !== "object") return [];
  return Object.entries(ts as Record<string, Record<string, string>>)
    .map(([date, bar]) => ({ date, close: parseFloat(bar?.["4. close"]) }))
    .filter((b) => Number.isFinite(b.close))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest-first
}

// Daily close series for one ticker. `since` (YYYY-MM-DD) is the flag date we
// must reach back to: the compact window covers ~100 trading days; if `since`
// predates that, we fetch the full history once so the entry price still exists.
export async function getDailySeries(rawTicker: string, since?: string): Promise<DailySeries | null> {
  if (!KEY || PROVIDER !== "alphavantage") return null;
  const ticker = cleanTicker(rawTicker);
  if (!ticker) return null;
  const reaches = (bars: DailyBar[]) => bars.length > 0 && (!since || bars[bars.length - 1].date <= since);
  const cached = seriesCache.get(ticker);
  if (cached && Date.now() - cached.at < SERIES_TTL_MS && reaches(cached.data.bars)) return cached.data;
  let bars = await fetchDailyBars(ticker, false);
  if (bars.length && !reaches(bars)) bars = await fetchDailyBars(ticker, true);
  if (!bars.length) return null;
  const out: DailySeries = { ticker, bars };
  seriesCache.set(ticker, { at: Date.now(), data: out });
  return out;
}

// Close on `date`, or the nearest earlier trading day (weekends/holidays/flag
// dates that fell after the close). bars are newest-first.
export function closeOnOrBefore(series: DailySeries, date: string): DailyBar | null {
  for (const b of series.bars) if (b.date <= date) return b;
  return null;
}

export interface RoiPoint {
  ticker: string;
  entryDate: string; entryClose: number;
  asOfDate: string; asOfClose: number;
  invested: number; value: number; roiPct: number;
}

// What a hypothetical `invested` at the flag-day close is worth at the latest
// close. No fees/dividends/slippage — an honest back-of-envelope, not a return.
export function computeRoi(series: DailySeries, since: string, invested: number): RoiPoint | null {
  const entry = closeOnOrBefore(series, since);
  const latest = series.bars[0];
  if (!entry || !latest || !(entry.close > 0)) return null;
  const ratio = latest.close / entry.close;
  return {
    ticker: series.ticker,
    entryDate: entry.date, entryClose: entry.close,
    asOfDate: latest.date, asOfClose: latest.close,
    invested, value: invested * ratio, roiPct: (ratio - 1) * 100,
  };
}

// Real-time sector performance (one call) — feeds rotation context to the brief.
export async function getSectorPerformance(): Promise<{ sector: string; changePct: string }[]> {
  if (!KEY || PROVIDER !== "alphavantage") return [];
  if (sectorCache && Date.now() - sectorCache.at < TTL_MS) return sectorCache.data;
  const res = await fetch(`https://www.alphavantage.co/query?function=SECTOR&apikey=${KEY}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const rt = data?.["Rank A: Real-Time Performance"];
  if (!rt || typeof rt !== "object") return [];
  const out = Object.entries(rt as Record<string, string>).map(([sector, changePct]) => ({ sector, changePct }));
  if (out.length) sectorCache = { at: Date.now(), data: out };
  return out;
}
