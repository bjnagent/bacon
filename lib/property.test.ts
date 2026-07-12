import { describe, it, expect } from "vitest";
import { quarterToDate, computeMarketStats, valueProperty, marketByKey, PROPERTY_MARKETS } from "./property";
import type { DailyBar } from "./market";

// Quarterly bars, newest-first (like the real fetchers emit).
const bars: DailyBar[] = [
  { date: "2026-03-31", close: 208 },
  { date: "2025-12-31", close: 200 },
  { date: "2025-09-30", close: 195 },
  { date: "2025-06-30", close: 190 },
  { date: "2025-03-31", close: 185 },
  { date: "2024-12-31", close: 180 },
];

describe("quarterToDate", () => {
  it("maps quarters to quarter-end dates", () => {
    expect(quarterToDate("2024-Q1")).toBe("2024-03-31");
    expect(quarterToDate("2024 Q4")).toBe("2024-12-31");
  });
  it("rejects junk", () => {
    expect(quarterToDate("Q1")).toBeNull();
    expect(quarterToDate("2024-Q5")).toBeNull();
  });
});

describe("computeMarketStats", () => {
  it("derives QoQ and YoY from the real series", () => {
    const s = computeMarketStats(bars)!;
    expect(s.latest.close).toBe(208);
    expect(s.qoqPct).toBeCloseTo(4, 6);          // 208/200
    expect(s.yoyPct).toBeCloseTo((208 / 185 - 1) * 100, 6); // vs 2025-03-31
    expect(s.spark[s.spark.length - 1]).toBe(208); // oldest→newest
  });
  it("returns nulls when there's no history to compare", () => {
    const s = computeMarketStats([bars[0]])!;
    expect(s.qoqPct).toBeNull();
    expect(s.yoyPct).toBeNull();
  });
});

describe("valueProperty", () => {
  it("scales the purchase price by the index move since purchase", () => {
    const v = valueProperty(bars, 500_000, "2025-01-15")!; // entry rolls back to 2024-12-31 (180)
    expect(v.entryLevel).toBe(180);
    expect(v.value).toBeCloseTo(500_000 * (208 / 180), 6);
    expect(v.deltaPct).toBeCloseTo((208 / 180 - 1) * 100, 6);
  });
  it("uses the oldest observation when purchase pre-dates the series", () => {
    const v = valueProperty(bars, 300_000, "2020-01-01")!;
    expect(v.entryDate).toBe("2024-12-31");
  });
  it("rejects nonsense inputs", () => {
    expect(valueProperty([], 500_000, "2025-01-01")).toBeNull();
    expect(valueProperty(bars, 0, "2025-01-01")).toBeNull();
  });
});

describe("market registry", () => {
  it("covers SG and AU at country + granular level", () => {
    expect(PROPERTY_MARKETS.filter((m) => m.country === "SG")).toHaveLength(3);
    expect(PROPERTY_MARKETS.filter((m) => m.country === "AU")).toHaveLength(4);
    expect(marketByKey("sg-hdb")?.unit).toBe("index");
    expect(marketByKey("au-nsw")?.unit).toBe("price");
    expect(marketByKey("nope")).toBeNull();
  });
});
