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
