import { describe, it, expect } from "vitest";
import {
  leanBadge, classShort, guessClass, quoteKey, chunk, formatPrice, quoteLabel, quoteDetail, formatDay,
  parseMovePct, pickSymbol, isStale, plural, type Quote,
} from "./logic";
import { cleanTicker } from "@/lib/market";

describe("leanBadge", () => {
  it("maps each stance to its tone", () => {
    expect(leanBadge("constructive")).toEqual({ label: "Constructive", tone: "pos" });
    expect(leanBadge("mixed")).toEqual({ label: "Mixed", tone: "warn" });
    expect(leanBadge("cautious")).toEqual({ label: "Cautious", tone: "neg" });
  });
  it("says pending, never a guessed stance, before the first read", () => {
    expect(leanBadge(null)).toEqual({ label: "Pending", tone: "neutral" });
    expect(leanBadge(undefined).label).toBe("Pending");
  });
});

describe("classShort / guessClass", () => {
  it("shortens stored classes", () => {
    expect(classShort("Equity / Stock")).toBe("Stock");
    expect(classShort("FX / Currency pair")).toBe("FX");
    expect(classShort("Something new")).toBe("Something new");
  });
  it("guesses the obvious cases", () => {
    expect(guessClass("nvda")).toBe("Equity / Stock");
    expect(guessClass("BTC")).toBe("Crypto");
    expect(guessClass("eth/usd")).toBe("Crypto");
    expect(guessClass("EUR/USD")).toBe("FX / Currency pair");
    expect(guessClass("SPY")).toBe("ETF / Fund");
    expect(guessClass("gold")).toBe("Commodity");
    expect(guessClass("US10Y")).toBe("Bond / Rates");
    expect(guessClass("")).toBe("Equity / Stock");
  });
});

describe("quoteKey", () => {
  it("asks for crypto as a BASE-USD pair (the live exchange's form)", () => {
    expect(quoteKey("BTC", "Crypto")).toBe("BTC-USD");
    expect(quoteKey("eth/usdt", "Crypto")).toBe("ETH-USDT");
    expect(quoteKey("SOL-USD", "Crypto")).toBe("SOL-USD");
  });
  it("passes stock and ETF tickers through, exchange suffix included", () => {
    expect(quoteKey("nvda", "Equity / Stock")).toBe("NVDA");
    expect(quoteKey("BRK.B", "Equity / Stock")).toBe("BRK.B");
    expect(quoteKey("D05.SI", "Equity / Stock")).toBe("D05.SI");
    expect(quoteKey("0700.HK", "Equity / Stock")).toBe("0700.HK");
    expect(quoteKey("SPY", "ETF / Fund")).toBe("SPY");
  });
  it("refuses instruments the provider would misread, rather than show a wrong price", () => {
    expect(quoteKey("EUR/USD", "FX / Currency pair")).toBeNull();
    expect(quoteKey("GOLD", "Commodity")).toBeNull();
    expect(quoteKey("US10Y", "Bond / Rates")).toBeNull();
    expect(quoteKey("Taiwan Semiconductor", "Equity / Stock")).toBeNull();
  });
  it("produces exactly the key the server answers under", () => {
    for (const [sym, cls] of [["nvda", "Equity / Stock"], ["BTC", "Crypto"], ["BRK.B", "Equity / Stock"], ["0700.HK", "Equity / Stock"]] as const) {
      const k = quoteKey(sym, cls)!;
      expect(cleanTicker(k)).toBe(k);
    }
  });
});

describe("chunk", () => {
  it("splits into fixed-size batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 25)).toEqual([]);
  });
});

describe("quote formatting", () => {
  const close: Quote = { symbol: "NVDA", price: 1234.5, changePct: 1.2, at: "2026-10-09", live: false, source: "daily close" };
  const live: Quote = { symbol: "BTC-USD", price: 0.012345, changePct: null, at: "2026-10-11T00:00:00Z", live: true, source: "Coinbase" };
  it("formats prices without inventing a currency", () => {
    expect(formatPrice(1234.5)).toBe("1,234.50");
    expect(formatPrice(0.012345)).toBe("0.01235");
    expect(formatPrice(NaN)).toBe("—");
  });
  it("labels staleness on every quote", () => {
    expect(quoteLabel(close)).toBe("Close");
    expect(quoteLabel(live)).toBe("Live");
    expect(quoteDetail(close)).toBe("as of 9 Oct 2026 · delayed, not live");
    expect(quoteDetail(live)).toBe("via Coinbase");
  });
  it("formats days without timezone drift", () => {
    expect(formatDay("2026-01-01")).toBe("1 Jan 2026");
  });
});

describe("parseMovePct / pickSymbol", () => {
  it("reads provider move strings", () => {
    expect(parseMovePct("+8.2%")).toBe(8.2);
    expect(parseMovePct("-3.10%")).toBe(-3.1);
    expect(parseMovePct("−1.5%")).toBe(-1.5);
    expect(parseMovePct("▼ 2.0%")).toBe(-2);
    expect(parseMovePct("n/a")).toBeNull();
    expect(parseMovePct(null)).toBeNull();
  });
  it("tracks a pick by ticker, or by name when it has none", () => {
    expect(pickSymbol("TSM", "Taiwan Semiconductor")).toBe("TSM");
    expect(pickSymbol("—", "Copper")).toBe("Copper");
    expect(pickSymbol("", "Copper")).toBe("Copper");
  });
});

describe("isStale / plural", () => {
  it("treats never-loaded as not stale (the first load is already running)", () => {
    expect(isStale(0, 10_000_000)).toBe(false);
  });
  it("flags data older than five minutes", () => {
    expect(isStale(1_000, 1_000 + 5 * 60_000 + 1)).toBe(true);
    expect(isStale(1_000, 1_000 + 60_000)).toBe(false);
  });
  it("pluralises", () => {
    expect(plural(1, "name")).toBe("1 name");
    expect(plural(5, "name")).toBe("5 names");
    expect(plural(2, "property", "properties")).toBe("2 properties");
  });
});
