// Prediction-market odds from Polymarket's public Gamma API, server-only.
//
// Like FRED macro and the price sources, this is a real-provider numeric feed —
// the only kind bacon is allowed. A market-implied probability is genuinely
// INDEPENDENT of price, news and filings, which is exactly what the convergence
// thesis wants: "the curve steepened" and "a cut is priced at 82%" are two
// different kinds of evidence, not the same one twice.
//
// Curated by TOPIC rather than "top markets by volume". The unfiltered feed is
// mostly sports, celebrity and meme markets, and dumping that into every brief
// would be noise the model then writes about — which now costs real money,
// since output dominates the bill. This mirrors lib/macro.ts, which pulls a
// fixed list of FRED series rather than everything FRED publishes.
//
// Per-ticker markets ("Will NVDA beat Q3?") are deliberately NOT matched here.
// Tying a market question to a brief item is fuzzy text matching and is where
// the noise would come from; the macro tier has to earn its place first.

export const ODDS_SOURCE = "Polymarket";

// Reading public odds is not trading, but this surfaces prediction-market data
// in a financial product, so it gets an explicit off switch that needs no
// deploy. Default on — anything else would be a decision made by omission.
export function oddsEnabled(): boolean {
  return process.env.POLYMARKET_ENABLED !== "false";
}

export interface MarketOdds {
  key: string;        // topic key
  topic: string;      // topic label
  question: string;
  probability: number; // 0-100, the market's YES price
  volume: number;      // USD notional — the reason to believe the price
  endsAt: string | null;
}

interface TopicCfg { key: string; label: string; match: RegExp }

// Deliberately macro: these bear on everything bacon already reasons about,
// which is what makes them worth a slot in every brief rather than only in the
// briefs that happen to mention the subject.
const TOPICS: TopicCfg[] = [
  { key: "rates",     label: "Fed / rates",   match: /\b(fed|fomc|rate cut|rate hike|interest rate|basis point)\b/i },
  { key: "inflation", label: "Inflation",     match: /\b(cpi|inflation|pce)\b/i },
  { key: "recession", label: "Recession",     match: /\b(recession|gdp contract|hard landing)\b/i },
  { key: "politics",  label: "US politics",   match: /\b(election|president|senate|house majority|shutdown|tariff)\b/i },
  { key: "geopol",    label: "Geopolitics",   match: /\b(ukraine|russia|taiwan|china invade|israel|iran|opec)\b/i },
];

// A market nobody has staked anything on is an opinion, not a price.
const MIN_VOLUME_USD = 50_000;

/** Gamma returns `outcomes` / `outcomePrices` as JSON-encoded STRINGS, not arrays. */
function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : [];
    } catch { return []; }
  }
  return [];
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * The YES probability, as a percentage.
 *
 * Returns null unless the market is a clean binary with a price in [0,1]. A
 * multi-outcome market has no single "probability", and a price outside the
 * range means the shape is not what we think it is — either way, no number is
 * better than a wrong one.
 */
function yesProbability(raw: Record<string, unknown>): number | null {
  const outcomes = asArray(raw.outcomes);
  const prices = asArray(raw.outcomePrices);
  if (outcomes.length !== 2 || prices.length !== 2) return null;
  const yesIdx = outcomes.findIndex((o) => /^yes$/i.test(o.trim()));
  if (yesIdx < 0) return null;
  const p = num(prices[yesIdx]);
  if (p == null || p < 0 || p > 1) return null;
  return Math.round(p * 1000) / 10;   // one decimal
}

let cache: { at: number; data: MarketOdds[] } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h — the daily snapshot is the real cadence

/**
 * One call, bucketed into topics, highest-volume market per topic.
 *
 * Degrades to empty on any failure, exactly like FRED: a Polymarket outage
 * means the section is absent from the brief, never wrong.
 */
export async function getMarketOdds(): Promise<MarketOdds[]> {
  if (!oddsEnabled()) return [];
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const u = new URL("https://gamma-api.polymarket.com/markets");
    u.searchParams.set("closed", "false");
    u.searchParams.set("order", "volume");
    u.searchParams.set("ascending", "false");
    u.searchParams.set("limit", "120");
    const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];

    const best = new Map<string, MarketOdds>();
    for (const raw of rows as Record<string, unknown>[]) {
      const question = typeof raw.question === "string" ? raw.question.trim() : "";
      if (!question) continue;
      const volume = num(raw.volume) ?? 0;
      if (volume < MIN_VOLUME_USD) continue;
      const probability = yesProbability(raw);
      if (probability == null) continue;
      const topic = TOPICS.find((t) => t.match.test(question));
      if (!topic) continue;
      const prior = best.get(topic.key);
      if (prior && prior.volume >= volume) continue;
      best.set(topic.key, {
        key: topic.key,
        topic: topic.label,
        question,
        probability,
        volume,
        endsAt: typeof raw.endDate === "string" ? raw.endDate.slice(0, 10) : null,
      });
    }
    const data = TOPICS.map((t) => best.get(t.key)).filter((m): m is MarketOdds => !!m);
    if (data.length) cache = { at: Date.now(), data };
    return data;
  } catch {
    return [];   // never fail a brief over a secondary signal
  }
}
