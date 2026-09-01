// Current prices (server-only).
//
// Two tiers, because they are genuinely different products:
//
//   Crypto    — REAL-TIME, from a public exchange endpoint. Keyless, no venue
//               agreement needed, because crypto venues publish their own book.
//   Equities  — DELAYED. Real-time equity data is a licensed product with a
//               market-data agreement behind it; Stooq and Yahoo are delayed
//               and their terms do not cover redistribution. So an equity quote
//               here is the last daily close, and it says so.
//
// Every quote carries `live` and `source`. A number a person may act on has to
// declare how stale it is — a delayed close presented as a live price is the
// same class of error as a fabricated one, which the rest of this codebase
// already refuses to make.
//
// Nothing here is inferred: if a provider is unreachable or returns something
// unparseable, the quote is null. It is never estimated, and never carried
// forward from a previous value as though it were current.

import { getDailySeries, cleanTicker } from "./market";
import { swallowed } from "./log";

const UA = "Mozilla/5.0 (compatible; BaconResearch/1.0)";
const FETCH_TIMEOUT_MS = 5000;

export interface Quote {
  symbol: string;
  price: number;
  /** 24h for crypto, close-over-close for equities. Null when unavailable. */
  changePct: number | null;
  /** When the price is FROM, not when we fetched it. */
  at: string;
  /** false = delayed. Callers must surface this rather than imply real-time. */
  live: boolean;
  source: string;
}

/** Crypto pairs are the `BASE-QUOTE` form the ticker parser already preserves. */
export function isCryptoPair(ticker: string): boolean {
  return /^[A-Z]{2,6}-(USD|USDT|USDC|EUR|GBP)$/.test(ticker.toUpperCase());
}

const finite = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Real-time crypto is short-lived by definition; a minute-old "live" price is a
// lie. Equities ride the existing daily-series cache instead.
const CRYPTO_TTL_MS = 20_000;
const cryptoCache = new Map<string, { at: number; q: Quote }>();

/**
 * Coinbase's public product stats: open/high/low/volume/last for the rolling 24h.
 * One call yields both the current price and the change, which is why it is
 * preferred over the simpler spot endpoint.
 *
 * NOT verified against the live API from this environment — outbound requests
 * are blocked here by policy. Every field is therefore validated rather than
 * trusted, and an unexpected shape degrades to null instead of a wrong number.
 */
async function fetchCoinbase(pair: string): Promise<Quote | null> {
  const res = await fetch(`https://api.exchange.coinbase.com/products/${encodeURIComponent(pair)}/stats`, {
    cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const d = await res.json() as Record<string, unknown>;
  const price = finite(d.last);
  const open = finite(d.open);
  if (!price) return null;
  return {
    symbol: pair,
    price,
    changePct: open ? ((price - open) / open) * 100 : null,
    at: new Date().toISOString(),
    live: true,
    source: "Coinbase",
  };
}

/** Price-only fallback if the stats shape is not what we expect. */
async function fetchCoinbaseSpot(pair: string): Promise<Quote | null> {
  const res = await fetch(`https://api.coinbase.com/v2/prices/${encodeURIComponent(pair)}/spot`, {
    cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const d = await res.json() as { data?: { amount?: unknown } };
  const price = finite(d?.data?.amount);
  if (!price) return null;
  return { symbol: pair, price, changePct: null, at: new Date().toISOString(), live: true, source: "Coinbase" };
}

/**
 * Last daily close. Explicitly `live: false` — this is what an equity quote is
 * without a market-data licence, and the UI is expected to say so.
 */
async function delayedClose(ticker: string): Promise<Quote | null> {
  const series = await getDailySeries(ticker);
  const bars = series?.bars ?? [];
  if (!bars.length) return null;
  const [latest, prior] = bars;                     // newest-first
  const price = finite(latest.close);
  if (!price) return null;
  const prev = prior ? finite(prior.close) : null;
  return {
    symbol: ticker,
    price,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    at: latest.date,
    live: false,
    source: "daily close",
  };
}

/** One current price, or null. Never a guess, never a stale value passed off as current. */
export async function getQuote(rawTicker: string): Promise<Quote | null> {
  const ticker = cleanTicker(rawTicker);
  if (!ticker) return null;

  if (isCryptoPair(ticker)) {
    const hit = cryptoCache.get(ticker);
    if (hit && Date.now() - hit.at < CRYPTO_TTL_MS) return hit.q;
    for (const src of [fetchCoinbase, fetchCoinbaseSpot]) {
      try {
        const q = await src(ticker);
        if (q) { cryptoCache.set(ticker, { at: Date.now(), q }); return q; }
      } catch (err) { swallowed(`quote: ${ticker} via ${src.name}`, err); }
    }
    return null;
  }

  try { return await delayedClose(ticker); }
  catch (err) { swallowed(`quote: ${ticker} delayed close`, err); return null; }
}

/** Batch. Independent per symbol, so one dead provider cannot empty the board. */
export async function getQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  const unique = [...new Set(tickers.map((t) => cleanTicker(t)).filter((t): t is string => !!t))];
  const settled = await Promise.all(unique.map(async (t) => [t, await getQuote(t)] as const));
  const out: Record<string, Quote> = {};
  for (const [t, q] of settled) if (q) out[t] = q;
  return out;
}
