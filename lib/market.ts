// Real market data (server-only). The ONE place Bacon is allowed real-time
// numbers — per the no-fabricated-data rule, figures must come from a real
// provider, never the model. Default provider: Alpha Vantage's free
// TOP_GAINERS_LOSERS endpoint. Swappable via MARKET_DATA_PROVIDER.

const PROVIDER = process.env.MARKET_DATA_PROVIDER ?? "alphavantage";
const KEY = process.env.MARKET_DATA_API_KEY;

// Hard per-request timeout on every external fetch so a hung/slow-loris provider
// (accepts the socket, never responds) degrades to empty instead of stalling a
// brief or an analyze to the platform function ceiling.
const FETCH_TIMEOUT_MS = 6000;

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
  const res = await fetch(`https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${KEY}`, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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

/**
 * Pull a usable symbol out of a stored instrument field, which may be prose
 * ("YAGEO (Taiwan: 2327.TW / OTC ADR access)") rather than a bare ticker.
 *
 * Exchange suffixes are the norm outside the US — 0700.HK, 600519.SS, 7203.T,
 * D05.SI, RELIANCE.NS, BHP.AX, SHOP.TO — as are crypto pairs (BTC-USD) and
 * Yahoo FX (EURUSD=X). The previous pattern allowed at most five letters and a
 * ONE-letter suffix, so it silently truncated all of them: 0700.HK became "HK",
 * 7203.T became "T", SHOP.TO became "SHOP.T", D05.SI became "D".
 *
 * Those are worse than errors, because they resolve. This function gates every
 * price path in the app — series, moving averages, ROI, the price cache and
 * call grading — so a truncated symbol quietly grades a Tokyo call against
 * whatever US ticker the fragment happens to name.
 */
export function cleanTicker(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase();
  // Root, then an optional exchange / pair suffix. The root may be alphanumeric
  // (D05) or purely numeric (0700, 600519) — but a bare number is not a ticker,
  // so a numeric root only counts when a suffix follows it.
  const re = /([A-Z0-9]{1,10})(\.[A-Z]{1,3}|-[A-Z]{2,5}|=X)?/g;
  for (const m of s.matchAll(re)) {
    const root = m[1];
    const suffix = m[2] ?? "";
    if (!root) continue;
    if (!/[A-Z]/.test(root) && !suffix) continue;   // "123" is not a symbol
    return root + suffix;
  }
  return null;
}

// Per-ticker cache: daily bars change at most once a day, and Alpha Vantage's
// free tier is 25 requests/DAY — so an uncached ROI pass would burn the budget.
const seriesCache = new Map<string, { at: number; data: DailySeries }>();
const SERIES_TTL_MS = 30 * 60 * 1000;

const UA = "Mozilla/5.0 (compatible; BaconResearch/1.0)";
const clean = (bars: DailyBar[]) =>
  bars.filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && Number.isFinite(b.close) && b.close > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest-first

/**
 * Stooq's CSV endpoint is market-namespaced and this app only ever asks for the
 * US one (`&s=<sym>.us`). A symbol carrying a foreign exchange suffix therefore
 * becomes a request that cannot resolve — 7203.T asks for "7203-t.us" — so it
 * burns a guaranteed-failed round trip before falling through to Yahoo, which
 * serves those natively.
 *
 * Suffixes are matched against known EXCHANGES rather than by shape, because
 * shape cannot separate them: BRK.B is a US share class and AZN.L is London,
 * both a dot and one letter. Anything unrecognised still tries Stooq, so this
 * can only skip work that was already certain to fail.
 */
const NON_US_SUFFIX = new Set([
  "L", "T", "HK", "SS", "SZ", "TO", "V", "AX", "NS", "BO", "SI", "TW", "KS", "KQ",
  "DE", "F", "PA", "MI", "SW", "AS", "BR", "LS", "MC", "VI", "ST", "OL", "CO",
  "HE", "IR", "NZ", "JK", "KL", "BK", "TA", "SA", "MX", "BA", "SN", "IS", "AT", "WA",
]);

export function stooqSupports(ticker: string): boolean {
  if (/[-=]/.test(ticker)) return false;            // BTC-USD, EURUSD=X
  const dot = ticker.lastIndexOf(".");
  if (dot < 0) return true;                         // plain US symbol
  return !NON_US_SUFFIX.has(ticker.slice(dot + 1).toUpperCase());
}

// --- Source 1: Stooq (keyless, no daily cap) — one CSV = full daily history. ---
async function fetchStooq(ticker: string): Promise<DailyBar[]> {
  const sym = ticker.toLowerCase().replace(/\./g, "-"); // BRK.B → brk-b
  const res = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}.us&i=d`, { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return [];
  const text = await res.text();
  if (!/^Date,/i.test(text)) return []; // "N/A" / error page
  return clean(text.trim().split("\n").slice(1).map((line) => {
    const c = line.split(",");
    return { date: c[0], close: parseFloat(c[4]) }; // Date,Open,High,Low,Close,Volume
  }));
}

// --- Source 2: Yahoo chart v8 (keyless) — history + current in one JSON. ---
async function fetchYahoo(ticker: string): Promise<DailyBar[]> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=1d`, { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return [];
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  const ts: number[] = r?.timestamp, closes: (number | null)[] = r?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return [];
  // Number(null) → 0 and Number(undefined) → NaN, both dropped by clean().
  return clean(ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: Number(closes[i]) })));
}

// --- Source 3: Alpha Vantage (needs a key, 25/day) — last-resort fallback. ---
async function fetchAlphaVantage(ticker: string, full: boolean): Promise<DailyBar[]> {
  if (!KEY || PROVIDER !== "alphavantage") return [];
  const size = full ? "full" : "compact"; // compact = last 100 trading days
  const res = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=${size}&apikey=${KEY}`, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`market data request failed (${res.status})`);
  const data = await res.json();
  if (data?.Information) throw new Error(`market data: ${String(data.Information).slice(0, 120)}`);
  const tsd = data?.["Time Series (Daily)"];
  if (!tsd || typeof tsd !== "object") return [];
  return clean(Object.entries(tsd as Record<string, Record<string, string>>).map(([date, bar]) => ({ date, close: parseFloat(bar?.["4. close"]) })));
}

// Daily close series for one ticker, tried across sources KEYLESS-FIRST so we
// don't lean on any metered tier: Stooq → Yahoo → Alpha Vantage. First source
// whose history reaches `since` (the flag date) wins; otherwise the longest
// partial. Every source is validated (finite, positive, real dates) — a bad or
// blocked source silently yields to the next, never a fabricated number.
export async function getDailySeries(rawTicker: string, since?: string): Promise<DailySeries | null> {
  const ticker = cleanTicker(rawTicker);
  if (!ticker) return null;
  const reaches = (bars: DailyBar[]) => bars.length > 0 && (!since || bars[bars.length - 1].date <= since);
  const cached = seriesCache.get(ticker);
  // Serve a fresh cache even when it doesn't reach `since`: the sources return
  // full available history, so within the TTL the cached series IS the best
  // available (a recently-IPO'd ticker simply has less history than `since`).
  // Without this, such tickers re-fanned out to every source on EVERY call.
  if (cached && Date.now() - cached.at < SERIES_TTL_MS) return cached.data;

  const sources: Array<() => Promise<DailyBar[]>> = [
    // Stooq only where it can actually answer; for a foreign listing it leads
    // with a request that cannot resolve, and Yahoo is the source that serves
    // those anyway.
    ...(stooqSupports(ticker) ? [() => fetchStooq(ticker)] : []),
    () => fetchYahoo(ticker),
    async () => { let b = await fetchAlphaVantage(ticker, false); if (b.length && !reaches(b)) b = await fetchAlphaVantage(ticker, true); return b; },
  ];
  let best: DailyBar[] = [];
  let lastErr: unknown = null;
  for (const src of sources) {
    try {
      const bars = await src();
      if (reaches(bars)) { best = bars; break; }
      if (bars.length > best.length) best = bars;
    } catch (err) { lastErr = err; }
  }
  if (!best.length) { if (lastErr) throw lastErr; return null; }
  const out: DailySeries = { ticker, bars: best };
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

// --- Moving-average structure (grounds the GF-DMA "trend health" lens) ---
// Real 20/50/100/200-day simple moving averages from Alpha Vantage daily closes,
// plus a mechanical trend classification. Numbers only — the model reads them.

export const MA_PERIODS = [20, 50, 100, 200] as const;

export interface MovingAverages {
  ticker: string;
  asOf: string;
  price: number;
  smas: { period: number; value: number; abovePct: number }[]; // price vs each SMA, %
  classification: "orderly uptrend" | "overheated" | "weakening" | "downtrend" | "mixed / consolidating";
}

// Pure: derive the MA structure from a newest-first close series. Exposed for tests.
export function movingAveragesFrom(bars: DailyBar[]): MovingAverages | null {
  if (!bars.length) return null;
  const price = bars[0].close;
  if (!(price > 0)) return null;
  const smas = MA_PERIODS
    .filter((p) => bars.length >= p)
    .map((period) => {
      const value = bars.slice(0, period).reduce((s, b) => s + b.close, 0) / period;
      return { period, value, abovePct: (price / value - 1) * 100 };
    });
  if (!smas.length) return null;
  const by = (p: number) => smas.find((s) => s.period === p)?.value;
  const s20 = by(20), s50 = by(50), s100 = by(100), s200 = by(200);
  const ext50 = s50 ? (price / s50 - 1) * 100 : 0; // extension above the 50-DMA
  const stackedUp = [s20, s50, s100, s200].filter((v): v is number => v != null);
  const isUp = stackedUp.every((v, i, a) => i === 0 || a[i - 1] >= v);   // 20≥50≥100≥200
  const isDown = stackedUp.every((v, i, a) => i === 0 || a[i - 1] <= v);
  let classification: MovingAverages["classification"] = "mixed / consolidating";
  if (isUp && s20 && price >= s20) classification = ext50 > 20 ? "overheated" : "orderly uptrend";
  else if (isDown && s20 && price < s20) classification = "downtrend";
  else if ((s50 && price < s50) || (s20 && s100 && s20 < s100)) classification = "weakening";
  return { ticker: "", asOf: "", price, smas, classification };
}

export async function getMovingAverages(rawTicker: string): Promise<MovingAverages | null> {
  const ticker = cleanTicker(rawTicker);
  if (!ticker) return null;
  // Reach back ~300 calendar days so the 200-day window is fully covered (compact
  // is only 100 bars). `since` forces getDailySeries to fall back to full history.
  const since = new Date(Date.now() - 300 * 86_400_000).toISOString().slice(0, 10);
  const series = await getDailySeries(ticker, since);
  if (!series) return null;
  const base = movingAveragesFrom(series.bars);
  if (!base) return null;
  return { ...base, ticker: series.ticker, asOf: series.bars[0].date };
}

// Real-time sector performance (one call) — feeds rotation context to the brief.
export async function getSectorPerformance(): Promise<{ sector: string; changePct: string }[]> {
  if (!KEY || PROVIDER !== "alphavantage") return [];
  if (sectorCache && Date.now() - sectorCache.at < TTL_MS) return sectorCache.data;
  const res = await fetch(`https://www.alphavantage.co/query?function=SECTOR&apikey=${KEY}`, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return [];
  const data = await res.json();
  const rt = data?.["Rank A: Real-Time Performance"];
  if (!rt || typeof rt !== "object") return [];
  const out = Object.entries(rt as Record<string, string>).map(([sector, changePct]) => ({ sector, changePct }));
  if (out.length) sectorCache = { at: Date.now(), data: out };
  return out;
}
