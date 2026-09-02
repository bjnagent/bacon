import { describe, it, expect } from "vitest";
import { isCryptoPair } from "./quotes";

// The tier split decides whether a number is presented as live or as a delayed
// close, so it has to be exact — an equity misrouted to the crypto path would
// be labelled real-time.
describe("isCryptoPair", () => {
  it("recognises the pair form the ticker parser preserves", () => {
    expect(isCryptoPair("BTC-USD")).toBe(true);
    expect(isCryptoPair("ETH-USD")).toBe(true);
    expect(isCryptoPair("SOL-USDT")).toBe(true);
    expect(isCryptoPair("btc-usd")).toBe(true);
  });

  it("does not claim equities, ETFs or foreign listings", () => {
    for (const t of ["AAPL", "SPY", "BRK.B", "0700.HK", "7203.T", "D05.SI"]) {
      expect(isCryptoPair(t)).toBe(false);
    }
  });

  // Yahoo FX carries a suffix, not a pair, and has no real-time source here.
  it("does not treat FX as a crypto pair", () => {
    expect(isCryptoPair("EURUSD=X")).toBe(false);
  });
});
