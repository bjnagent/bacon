import { describe, it, expect } from "vitest";
import { cleanTicker, closeOnOrBefore, computeRoi, type DailySeries } from "./market";

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
