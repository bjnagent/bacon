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

// Today's top price gainers (US equities). Returns [] if no key is configured so
// the sweep degrades gracefully to the qualitative theme scout.
export async function getTopGainers(limit = 8): Promise<Mover[]> {
  if (!KEY) return [];
  if (PROVIDER === "alphavantage") {
    const res = await fetch(`https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${KEY}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`market data request failed (${res.status})`);
    const data = await res.json();
    const arr: Array<Record<string, string>> = Array.isArray(data?.top_gainers) ? data.top_gainers : [];
    if (!arr.length && data?.Information) throw new Error(`market data: ${String(data.Information).slice(0, 120)}`);
    return arr.slice(0, limit).map((g) => ({
      ticker: g.ticker,
      price: g.price,
      changePct: g.change_percentage,
      volume: g.volume,
    }));
  }
  return [];
}
