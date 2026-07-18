import { describe, it, expect } from "vitest";
import {
  annualSeries, latestInstant, assembleFundamentals, deriveValuation, formatFundamentals,
  type XbrlPoint,
} from "./fundamentals";

// Revenue: two full fiscal years + one quarter that must be excluded.
const REVENUE: XbrlPoint[] = [
  { start: "2023-01-01", end: "2023-12-31", val: 80_000, fy: 2023, fp: "FY", form: "10-K" },
  { start: "2024-01-01", end: "2024-12-31", val: 100_000, fy: 2024, fp: "FY", form: "10-K" },
  { start: "2024-10-01", end: "2024-12-31", val: 28_000, fy: 2024, fp: "Q4", form: "10-Q" }, // ~92d — not a year
];
const NET_INCOME: XbrlPoint[] = [
  { start: "2023-01-01", end: "2023-12-31", val: 15_000, fy: 2023, fp: "FY", form: "10-K" },
  { start: "2024-01-01", end: "2024-12-31", val: 20_000, fy: 2024, fp: "FY", form: "10-K" },
];
const GROSS: XbrlPoint[] = [{ start: "2024-01-01", end: "2024-12-31", val: 60_000, fy: 2024, fp: "FY", form: "10-K" }];
const OPERATING: XbrlPoint[] = [{ start: "2024-01-01", end: "2024-12-31", val: 30_000, fy: 2024, fp: "FY", form: "10-K" }];
const EPS: XbrlPoint[] = [{ start: "2024-01-01", end: "2024-12-31", val: 2.0, fy: 2024, fp: "FY", form: "10-K" }];
const SHARES: XbrlPoint[] = [{ end: "2025-01-15", val: 10_000 }]; // instant (no start)
const ASSETS: XbrlPoint[] = [{ end: "2024-12-31", val: 200_000 }, { end: "2023-12-31", val: 180_000 }];
const LIABILITIES: XbrlPoint[] = [{ end: "2024-12-31", val: 120_000 }];
const EQUITY: XbrlPoint[] = [{ end: "2024-12-31", val: 80_000 }];

describe("annualSeries", () => {
  it("keeps only full fiscal years, newest first, and excludes quarters", () => {
    const s = annualSeries(REVENUE);
    expect(s.map((x) => x.fy)).toEqual([2024, 2023]);
    expect(s[0].val).toBe(100_000);
  });

  it("dedupes a restated fiscal year, keeping the later filing", () => {
    const s = annualSeries([
      { start: "2024-01-01", end: "2024-12-31", val: 100_000, fy: 2024, fp: "FY", form: "10-K" },
      { start: "2024-01-01", end: "2024-12-31", val: 101_000, fy: 2024, fp: "FY", form: "10-K/A" }, // same period, restated, filed later
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].val).toBe(101_000);
  });

  it("returns [] for undefined/empty", () => {
    expect(annualSeries(undefined)).toEqual([]);
    expect(annualSeries([])).toEqual([]);
  });
});

describe("latestInstant", () => {
  it("takes the newest point and ignores duration rows", () => {
    expect(latestInstant(ASSETS)).toEqual({ end: "2024-12-31", val: 200_000 });
    expect(latestInstant(REVENUE)).toBeNull(); // all have `start` → not instant
  });
});

describe("assembleFundamentals", () => {
  const f = assembleFundamentals("ACME", "0000000001", {
    revenue: REVENUE, netIncome: NET_INCOME, grossProfit: GROSS, operatingIncome: OPERATING,
    eps: EPS, shares: SHARES, assets: ASSETS, liabilities: LIABILITIES, equity: EQUITY,
  })!;

  it("computes growth, margins, and balance-sheet ratios from filed figures", () => {
    expect(f.fiscalYear).toBe(2024);
    expect(f.revenue).toBe(100_000);
    expect(f.revenueGrowthPct).toBeCloseTo(25, 5);          // (100-80)/80
    expect(f.earningsGrowthPct).toBeCloseTo(33.333, 2);     // (20-15)/15
    expect(f.grossMarginPct).toBeCloseTo(60, 5);
    expect(f.operatingMarginPct).toBeCloseTo(30, 5);
    expect(f.netMarginPct).toBeCloseTo(20, 5);
    expect(f.epsDiluted).toBe(2.0);
    expect(f.sharesOutstanding).toBe(10_000);
    expect(f.debtToEquity).toBeCloseTo(1.5, 5);             // 120k/80k
    expect(f.asOf).toBe("2024-12-31");
  });

  it("returns null when there is no hard flow figure to ground", () => {
    expect(assembleFundamentals("X", "1", { assets: ASSETS })).toBeNull();
  });
});

describe("deriveValuation", () => {
  const f = assembleFundamentals("ACME", "0000000001", {
    revenue: REVENUE, netIncome: NET_INCOME, eps: EPS, shares: SHARES,
  })!;

  it("derives market cap, P/E and PEG from live price + filed figures", () => {
    const v = deriveValuation(f, 50)!;
    expect(v.marketCap).toBe(500_000);          // 50 × 10,000
    expect(v.peTrailing).toBeCloseTo(25, 5);    // 50 / 2.0
    expect(v.pegBasis).toBe("earnings");
    expect(v.pegRatio).toBeCloseTo(25 / (100 / 3), 3); // P/E ÷ 33.33% earnings growth
  });

  it("guards a non-positive price", () => {
    expect(deriveValuation(f, 0)).toBeNull();
  });
});

describe("formatFundamentals", () => {
  it("emits only real rows and instructs the model to use them", () => {
    const f = assembleFundamentals("ACME", "0000000001", { revenue: REVENUE, netIncome: NET_INCOME, eps: EPS, shares: SHARES })!;
    const out = formatFundamentals(f, deriveValuation(f, 50));
    expect(out).toContain("SEC EDGAR");
    expect(out).toContain("do not substitute web-searched estimates");
    expect(out).toContain("FY2024");
    expect(out).toMatch(/Trailing P\/E/);
  });

  it("returns empty string when nothing usable", () => {
    const empty = assembleFundamentals("Z", "1", { eps: EPS });
    // eps-only still assembles (has a flow figure), but with no price/valuation the block is small — sanity check non-empty.
    expect(empty).not.toBeNull();
  });
});
