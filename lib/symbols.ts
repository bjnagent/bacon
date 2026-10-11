// Turning what a person typed into a symbol that actually exists.
//
// `cleanTicker` (lib/market.ts) is a syntactic EXTRACTOR: it pulls a
// ticker-shaped token out of prose. It is deliberately not changed here,
// because every price path in the app is built on it and it is the function
// that once truncated 7203.T to "T".
//
// But extraction alone cannot tell a symbol from a word. Typing "Nike" produced
// "NIKE" — symbol-shaped, and listed nowhere. Both the price fetch and the SEC
// fetch returned null, both context blocks silently dropped out of the prompt,
// and the model answered the FUNDAMENTAL, VALUATION, TECHNICAL and HEALTH
// lenses from memory: FY2025 results and a 2025 share price, stated as current.
//
// So this module adds the step extraction cannot do — it checks candidates
// against the real universe of listed symbols, and falls back to a company-name
// lookup. The guarantee it makes is that it is never WORSE than the old
// behaviour: if the SEC index is unreachable, or the asset is not US-listed
// (0700.HK, BTC-USD, EURUSD=X), the answer is exactly what `cleanTicker`
// returns today — flagged unverified, so the caller can say so rather than let
// the model quietly invent the missing numbers.

import { cleanTicker } from "./market";
import { isKnownTicker, tickerForName } from "./fundamentals";

export interface Resolution {
  symbol: string | null;
  /**
   * symbol — the input named a symbol the SEC lists.
   * name   — matched a company name ("Nike" -> NKE).
   * guess  — `cleanTicker`'s extraction, NOT confirmed against any listing.
   * unresolved — nothing usable at all.
   */
  how: "symbol" | "name" | "guess" | "unresolved";
  verified: boolean;
}

// A bare symbol, whole-string. Same suffix vocabulary as cleanTicker.
const BARE = /^[A-Z0-9]{1,10}(\.[A-Z]{1,3}|-[A-Z]{2,5}|=X)?$/;

// Ticker-SHAPED words that sit next to real tickers and are not tickers. This
// is why the parenthesis rule cannot be folded into cleanTicker: bacon already
// stores "TYOYY (ADR) / 6976.T (Tokyo)", and a naive "prefer the parenthesis"
// rule resolves that to ADR.
const NOT_SYMBOLS = new Set(["ADR", "ADS", "ORD", "OTC", "NYSE", "NASDAQ", "AMEX", "LSE", "TSX", "ASX", "SEHK", "CLASS", "A", "B", "C", "US", "USD", "INC", "CORP", "LTD", "PLC", "CO"]);

/** Symbol candidates, best first. Deliberately ordered so today's behaviour is tried first. */
export function candidates(raw: string): string[] {
  const s = String(raw).toUpperCase();
  const out: string[] = [];
  const push = (v?: string | null) => {
    const t = (v ?? "").trim();
    if (t && BARE.test(t) && !NOT_SYMBOLS.has(t)) out.push(t);
  };
  push(cleanTicker(raw));
  // "(NKE)" and "(NASDAQ: NKE)" — the ticker a person helpfully supplies is
  // ignored by extraction, which takes the company name in front of it instead.
  for (const m of s.matchAll(/\(([^)]*)\)/g)) push(m[1].replace(/^[A-Z .]+:\s*/, ""));
  push(s);
  return [...new Set(out)];
}

/** What resolution degrades to: the old behaviour, honestly labelled. */
export function unverified(raw: string): Resolution {
  const guess = cleanTicker(raw);
  return guess ? { symbol: guess, how: "guess", verified: false } : { symbol: null, how: "unresolved", verified: false };
}

/**
 * Resolve a typed asset to a listed symbol.
 *
 * Never throws and never blocks on the network for longer than the caller's
 * signal allows — an unreachable SEC index degrades to `unverified`, which is
 * precisely the behaviour that shipped before this module existed.
 */
export async function resolveSymbol(raw: string, signal?: AbortSignal): Promise<Resolution> {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { symbol: null, how: "unresolved", verified: false };
  try {
    for (const c of candidates(trimmed)) {
      if (await isKnownTicker(c, signal)) return { symbol: c, how: "symbol", verified: true };
    }
    const byName = await tickerForName(trimmed, signal);
    if (byName) return { symbol: byName, how: "name", verified: true };
  } catch { /* index unreachable — fall through to the syntactic guess */ }
  return unverified(trimmed);
}
