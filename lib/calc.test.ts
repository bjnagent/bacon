import { describe, it, expect } from "vitest";
import { riskPosition, kellyFraction, dcf, sharpe, invNorm, parametricVaR } from "./calc";

describe("riskPosition", () => {
  it("sizes from risk % and entry-to-stop distance", () => {
    const r = riskPosition(10000, 1, 100, 92);
    expect(r.riskDollars).toBe(100);
    expect(r.perUnit).toBe(8);
    expect(r.units).toBeCloseTo(12.5, 4);
    expect(r.posValue).toBeCloseTo(1250, 4);
    expect(r.posPct).toBeCloseTo(12.5, 4);
  });
  it("is safe when entry equals stop", () => {
    expect(riskPosition(10000, 1, 100, 100).units).toBe(0);
  });
});

describe("kellyFraction", () => {
  it("computes the edge fraction", () => {
    expect(kellyFraction(55, 1.8)).toBeCloseTo(0.3, 6); // (1.8*0.55-0.45)/1.8
  });
  it("goes negative when there is no edge", () => {
    expect(kellyFraction(40, 1)).toBeCloseTo(-0.2, 6);
  });
});

describe("dcf", () => {
  it("values a one-year, zero-growth case", () => {
    const out = dcf({ fcf: 100, growthPct: 0, termGrowthPct: 0, waccPct: 10, years: 1, netCash: 0, shares: 1 });
    expect(out.valid).toBe(true);
    expect(out.ev).toBeCloseTo(1000, 4);     // 100/1.1 + 1000/1.1
    expect(out.perShare).toBeCloseTo(1000, 4);
  });
  it("adds net cash to equity value", () => {
    const out = dcf({ fcf: 100, growthPct: 0, termGrowthPct: 0, waccPct: 10, years: 1, netCash: 500, shares: 10 });
    expect(out.equity).toBeCloseTo(1500, 4);
    expect(out.perShare).toBeCloseTo(150, 4);
  });
  it("is invalid when discount rate <= terminal growth", () => {
    const out = dcf({ fcf: 100, growthPct: 5, termGrowthPct: 3, waccPct: 2, years: 5, netCash: 0, shares: 1 });
    expect(out.valid).toBe(false);
    expect(out.pvTv).toBe(0);
  });
});

describe("sharpe", () => {
  it("is excess return per unit of vol", () => {
    expect(sharpe(8, 4, 20)).toBeCloseTo(0.2, 6);
    expect(sharpe(8, 4, 0)).toBe(0);
  });
});

describe("invNorm / parametricVaR", () => {
  it("inverts the standard normal at common confidences", () => {
    expect(invNorm(0.95)).toBeCloseTo(1.6449, 3);
    expect(invNorm(0.99)).toBeCloseTo(2.3263, 3);
  });
  it("computes 1-day parametric VaR", () => {
    const v = parametricVaR(20, 95, 1, 10000);
    expect(v.z).toBeCloseTo(1.645, 2);
    expect(v.varPct).toBeCloseTo(2.07, 1);
    expect(v.varDollars).toBeCloseTo(207, 0);
  });
});
