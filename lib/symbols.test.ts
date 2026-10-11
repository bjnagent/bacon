import { describe, it, expect, vi, beforeEach } from "vitest";
import { candidates, unverified } from "./symbols";

vi.mock("./fundamentals", () => ({
  isKnownTicker: vi.fn(),
  tickerForName: vi.fn(),
}));
import { isKnownTicker, tickerForName } from "./fundamentals";
import { resolveSymbol } from "./symbols";

const known = (...list: string[]) => {
  vi.mocked(isKnownTicker).mockImplementation(async (t: string) => list.includes(t.toUpperCase()));
};

beforeEach(() => {
  vi.mocked(isKnownTicker).mockReset();
  vi.mocked(tickerForName).mockReset();
  known();
  vi.mocked(tickerForName).mockResolvedValue(null);
});

describe("candidates", () => {
  it("offers the extracted symbol first, then anything parenthesised", () => {
    expect(candidates("Nike (NKE)")).toEqual(["NIKE", "NKE"]);
    expect(candidates("Nike (NASDAQ: NKE)")).toEqual(["NIKE", "NKE"]);
  });

  // The reason this lives here and not in cleanTicker: bacon already stores
  // strings like this, and "ADR" is symbol-shaped.
  it("never offers an exchange or share-class word as a symbol", () => {
    expect(candidates("TYOYY (ADR) / 6976.T (Tokyo)")).not.toContain("ADR");
    expect(candidates("Foo (NYSE)")).not.toContain("NYSE");
    expect(candidates("Bar (Class A)")).not.toContain("A");
  });

  it("does not offer prose as a symbol", () => {
    expect(candidates("YAGEO (Taiwan: 2327.TW / OTC ADR access)")).toEqual(["YAGEO"]);
  });
});

describe("resolveSymbol", () => {
  // The exact bug: typed name -> symbol-shaped non-symbol -> nothing priced.
  it("resolves a company name to its real ticker", async () => {
    vi.mocked(tickerForName).mockResolvedValue("NKE");
    const r = await resolveSymbol("Nike");
    expect(r).toEqual({ symbol: "NKE", how: "name", verified: true });
  });

  it("prefers a ticker the user actually supplied over the name in front of it", async () => {
    known("NKE");
    const r = await resolveSymbol("Nike (NKE)");
    expect(r.symbol).toBe("NKE");
    expect(r.how).toBe("symbol");
  });

  it("passes a real ticker straight through", async () => {
    known("AAPL");
    expect(await resolveSymbol("AAPL")).toEqual({ symbol: "AAPL", how: "symbol", verified: true });
  });

  // TYOYY is the intended symbol; it must win before "ADR" is ever considered,
  // and "ADR" must not be considered at all.
  it("keeps the leading symbol in a stored multi-listing string", async () => {
    known("TYOYY", "ADR");
    expect((await resolveSymbol("TYOYY (ADR) / 6976.T (Tokyo)")).symbol).toBe("TYOYY");
  });

  // Everything not on a US exchange has to keep working exactly as before.
  it("degrades to the old extraction for anything the SEC does not list", async () => {
    for (const [input, out] of [["0700.HK", "0700.HK"], ["BTC-USD", "BTC-USD"], ["EURUSD=X", "EURUSD=X"]] as const) {
      const r = await resolveSymbol(input);
      expect(r).toEqual({ symbol: out, how: "guess", verified: false });
    }
  });

  // Fail-safe: an SEC outage must not make resolution worse than not having it.
  it("falls back to the old behaviour when the index throws", async () => {
    vi.mocked(isKnownTicker).mockRejectedValue(new Error("SEC unreachable"));
    const r = await resolveSymbol("Nike");
    expect(r).toEqual({ symbol: "NIKE", how: "guess", verified: false });
    expect(r.verified).toBe(false);   // and the prompt is told so
  });

  it("has nothing to say about an empty input", async () => {
    expect(await resolveSymbol("")).toEqual({ symbol: null, how: "unresolved", verified: false });
    expect(await resolveSymbol("—")).toEqual({ symbol: null, how: "unresolved", verified: false });
  });
});

describe("unverified", () => {
  it("is exactly the pre-existing extraction, labelled", () => {
    expect(unverified("Nike")).toEqual({ symbol: "NIKE", how: "guess", verified: false });
    expect(unverified("")).toEqual({ symbol: null, how: "unresolved", verified: false });
  });
});
