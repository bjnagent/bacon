import { describe, it, expect } from "vitest";
import { normStance, overallLean, mapClass, splitSymCls, type LensKey, type StanceKey } from "./lenses";

describe("normStance", () => {
  it("maps synonyms to the four canonical stances", () => {
    expect(normStance("Constructive")).toBe("constructive");
    expect(normStance("bullish")).toBe("constructive");
    expect(normStance("Cautious")).toBe("cautious");
    expect(normStance("bearish")).toBe("cautious");
    expect(normStance("Limited-data")).toBe("limited-data");
    expect(normStance("insufficient")).toBe("limited-data");
    expect(normStance("whatever")).toBe("mixed");
    expect(normStance(null)).toBe("mixed");
  });
});

describe("overallLean", () => {
  const lean = (s: Partial<Record<LensKey, StanceKey>>) => overallLean(s).label;
  it("calls a constructive lean when 3+ lenses are constructive and lead", () => {
    expect(lean({ FUNDAMENTAL: "constructive", TECHNICAL: "constructive", FACTOR: "constructive", MACRO: "mixed" })).toBe("Constructive lean");
  });
  it("calls a cautious lean when 3+ lenses are cautious and lead", () => {
    expect(lean({ FUNDAMENTAL: "cautious", TECHNICAL: "cautious", FACTOR: "cautious", MACRO: "mixed" })).toBe("Cautious lean");
  });
  it("reports no clear lean when balanced", () => {
    expect(lean({ FUNDAMENTAL: "constructive", TECHNICAL: "cautious" })).toBe("Mixed · no clear lean");
  });
  it("tilts when one side narrowly leads", () => {
    expect(lean({ FUNDAMENTAL: "constructive", TECHNICAL: "mixed" })).toBe("Tilts constructive");
  });
});

describe("mapClass", () => {
  it("normalizes free-text asset classes", () => {
    expect(mapClass("etf")).toBe("ETF / Fund");
    expect(mapClass("FX pair")).toBe("FX / Currency pair");
    expect(mapClass("crypto")).toBe("Crypto");
    expect(mapClass("bond")).toBe("Bond / Rates");
    expect(mapClass("something else")).toBe("Equity / Stock");
    expect(mapClass(null)).toBe("Equity / Stock");
  });
});

describe("splitSymCls", () => {
  it("infers FX from a slash", () => {
    expect(splitSymCls("USD/JPY")).toEqual({ sym: "USD/JPY", cls: "FX / Currency pair" });
  });
  it("reads a trailing class hint and uppercases the symbol", () => {
    expect(splitSymCls("voo etf")).toEqual({ sym: "VOO", cls: "ETF / Fund" });
  });
  it("defaults to equity", () => {
    expect(splitSymCls("nvda")).toEqual({ sym: "NVDA", cls: "Equity / Stock" });
  });
});
