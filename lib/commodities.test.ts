import { describe, it, expect } from "vitest";
import { resolveInstrument, formatLevel, INSTRUMENTS } from "./commodities";

const ins = (key: string) => INSTRUMENTS.find((i) => i.key === key)!;

describe("resolveInstrument", () => {
  it("matches a distinctive ticker alias regardless of class", () => {
    expect(resolveInstrument("WTI")?.key).toBe("wti");
    expect(resolveInstrument("EURUSD")?.key).toBe("eur");
    expect(resolveInstrument("EUR/USD")?.key).toBe("eur");
    expect(resolveInstrument("USO")?.key).toBe("wti");
  });

  it("does NOT hijack short equity tickers without a commodity/FX class", () => {
    expect(resolveInstrument("NG", "NovaGold", "Equity")).toBeNull();   // NG the miner, not nat gas
    expect(resolveInstrument("CL", "Colgate", "Equity")).toBeNull();     // CL the stock, not crude
    expect(resolveInstrument("AAPL", "Apple", "Equity")).toBeNull();
  });

  it("resolves via name keyword when the class says commodity/FX", () => {
    expect(resolveInstrument("", "Brent crude cargo play", "Commodity")?.key).toBe("brent");
    expect(resolveInstrument(null, "Copper miner beta", "Commodity")?.key).toBe("copper");
    expect(resolveInstrument("NG", "Henry Hub nat gas", "Commodity")?.key).toBe("natgas");
    expect(resolveInstrument("", "Long euro vs dollar", "FX")?.key).toBe("eur");
  });

  it("flags USD/JPY as present but signal-only (not investable)", () => {
    const jpy = resolveInstrument("USDJPY", "Dollar-yen", "FX");
    expect(jpy?.key).toBe("jpy");
    expect(jpy?.investable).toBe(false);
  });
});

describe("formatLevel", () => {
  it("renders commodities with their unit and FX bare", () => {
    expect(formatLevel(ins("wti"), 78.2)).toBe("78.20 $/bbl");
    expect(formatLevel(ins("copper"), 9123.4)).toBe("9,123 $/mt");
    expect(formatLevel(ins("eur"), 1.085)).toBe("1.0850");
  });
});
