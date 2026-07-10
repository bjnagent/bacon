import { describe, it, expect } from "vitest";
import { cleanTicker, closeOnOrBefore, computeRoi, movingAveragesFrom, type DailySeries, type DailyBar } from "./market";

describe("cleanTicker", () => {
  it("pulls a plausible symbol out of the stored ticker field", () => {
    expect(cleanTicker("MU")).toBe("MU");
    expect(cleanTicker("googl")).toBe("GOOGL");
    expect(cleanTicker("BRK.B")).toBe("BRK.B");
    expect(cleanTicker("ORKA / SPYR")).toBe("ORKA"); // pair → first leg
  });
  it("rejects empties and placeholders", () => {
    expect(cleanTicker("—")).toBeNull();
    expect(cleanTicker("")).toBeNull();
    expect(cleanTicker(null)).toBeNull();
    expect(cleanTicker("123")).toBeNull();
  });
});

// bars are newest-first, mirroring getDailySeries.
const series: DailySeries = { ticker: "TEST", bars: [
  { date: "2026-07-09", close: 120 },
  { date: "2026-07-08", close: 110 },
  { date: "2026-07-04", close: 100 }, // a Saturday-adjacent flag date lands here
  { date: "2026-07-03", close: 95 },
] };

describe("closeOnOrBefore", () => {
  it("returns the exact trading day when present", () => {
    expect(closeOnOrBefore(series, "2026-07-08")?.close).toBe(110);
  });
  it("falls back to the nearest earlier trading day (weekends/holidays)", () => {
    expect(closeOnOrBefore(series, "2026-07-05")?.close).toBe(100); // rolls back to 07-04
  });
  it("returns null when the date predates all history", () => {
    expect(closeOnOrBefore(series, "2026-01-01")).toBeNull();
  });
});

describe("computeRoi", () => {
  it("values a $10K stake at the flag-day close against the latest close", () => {
    const r = computeRoi(series, "2026-07-04", 10_000);
    expect(r).not.toBeNull();
    expect(r!.entryClose).toBe(100);
    expect(r!.asOfClose).toBe(120);
    expect(r!.value).toBeCloseTo(12_000, 6); // 10k * 120/100
    expect(r!.roiPct).toBeCloseTo(20, 6);
  });
  it("returns null when the flag date has no reachable price", () => {
    expect(computeRoi(series, "2026-01-01", 10_000)).toBeNull();
  });
});

// newest-first synthetic bars (index 0 = latest), matching getDailySeries order.
const maBars = (n: number, priceAt: (i: number) => number): DailyBar[] =>
  Array.from({ length: n }, (_, i) => ({ date: `d${String(n - i).padStart(4, "0")}`, close: priceAt(i) }));

describe("movingAveragesFrom", () => {
  it("returns null without enough bars for even the 20-day", () => {
    expect(movingAveragesFrom(maBars(10, () => 100))).toBeNull();
  });
  it("computes the full SMA set and flags an orderly uptrend", () => {
    const ma = movingAveragesFrom(maBars(200, (i) => 200 - i))!; // newest = highest
    expect(ma.smas.map((s) => s.period)).toEqual([20, 50, 100, 200]);
    expect(ma.price).toBe(200);
    expect(ma.smas[0].value).toBeCloseTo(190.5, 6); // mean of 200..181
    expect(ma.classification).toBe("orderly uptrend");
  });
  it("flags overheated when price is far above the 50-day", () => {
    const ma = movingAveragesFrom(maBars(200, (i) => (i === 0 ? 260 : 200 - i)))!;
    expect(ma.classification).toBe("overheated");
  });
  it("flags a downtrend when the stack is inverted and price sits below it", () => {
    const ma = movingAveragesFrom(maBars(200, (i) => i + 1))!; // newest = lowest
    expect(ma.classification).toBe("downtrend");
  });
  it("uses only the MA windows it has data for", () => {
    const ma = movingAveragesFrom(maBars(60, (i) => 100 - i * 0.1))!;
    expect(ma.smas.map((s) => s.period)).toEqual([20, 50]);
  });
});
