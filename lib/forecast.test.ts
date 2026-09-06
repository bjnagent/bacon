import { describe, it, expect } from "vitest";
import { forecastFromBars, dueDate } from "./forecast";
import type { DailyBar } from "./market";

// Newest-first, matching getDailySeries.
const build = (n: number, start: number, dailyDrift: number, wobble = 0): DailyBar[] => {
  const bars: DailyBar[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    // Deterministic alternating wobble — a fixed series, so the test is stable.
    p = p * (1 + dailyDrift + (i % 2 ? wobble : -wobble));
    bars.push({ date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, close: p });
  }
  return bars.reverse();
};

describe("forecastFromBars", () => {
  // Zero trend but real wobble — a flat line has no volatility at all and is
  // rejected outright, which the refusal test below covers.
  it("projects a trendless series to roughly its own level", () => {
    const f = forecastFromBars(build(300, 100, 0, 0.01), 21)!;
    expect(f).not.toBeNull();
    expect(Math.abs(f.expected / f.base - 1)).toBeLessThan(0.01);
    expect(Math.abs(f.driftAnnualPct)).toBeLessThan(5);
  });

  it("carries an upward drift forward", () => {
    const f = forecastFromBars(build(300, 100, 0.0005, 0.008), 21)!;
    expect(f.expected).toBeGreaterThan(f.base);
    expect(f.driftAnnualPct).toBeGreaterThan(0);
  });

  it("brackets the expectation with an ordered band", () => {
    const f = forecastFromBars(build(300, 100, 0.0003, 0.01), 21)!;
    expect(f.lo).toBeLessThan(f.expected);
    expect(f.expected).toBeLessThan(f.hi);
    expect(f.lo).toBeGreaterThan(0);      // log returns keep the low side positive
  });

  // The band must widen with the horizon. A long forecast that looked as tight
  // as a short one would be the single most misleading thing this could output.
  it("widens the band with the horizon", () => {
    const bars = build(300, 100, 0.0002, 0.012);
    const near = forecastFromBars(bars, 5)!;
    const far = forecastFromBars(bars, 60)!;
    const width = (f: { hi: number; lo: number }) => f.hi / f.lo;
    expect(width(far)).toBeGreaterThan(width(near));
  });

  it("reports volatility as a positive annualised figure", () => {
    const f = forecastFromBars(build(300, 100, 0, 0.01), 21)!;
    expect(f.volAnnualPct).toBeGreaterThan(0);
  });

  // A number from too little history is a number pretending to be one.
  it("refuses without enough history, a horizon, or a usable series", () => {
    expect(forecastFromBars(build(30, 100, 0.001), 21)).toBeNull();
    expect(forecastFromBars(build(300, 100, 0.0002, 0.01), 0)).toBeNull();
    expect(forecastFromBars(build(300, 100, 0.0002, 0.01), -5)).toBeNull();
    expect(forecastFromBars([], 21)).toBeNull();
    // Zero variance: a perfectly flat line has no volatility to band with.
    const flat: DailyBar[] = Array.from({ length: 300 }, () => ({ date: "2026-01-01", close: 100 }));
    expect(forecastFromBars(flat, 21)).toBeNull();
  });
});

describe("dueDate", () => {
  // The horizon is quoted in TRADING days but the grader asks a calendar
  // question, so the conversion has to happen somewhere. Getting it wrong in
  // the cheap direction (treating 21 trading days as 21 calendar days) would
  // grade every forecast about a week early — systematically, and invisibly.
  it("converts trading days to a calendar date", () => {
    expect(dueDate("2026-01-01", 21)).toBe("2026-01-31");
    expect(dueDate("2026-01-01", 252)).toBe("2027-01-01");
  });

  it("moves forward, always", () => {
    expect(dueDate("2026-06-15", 1) > "2026-06-15").toBe(true);
    expect(dueDate("2026-06-15", 60) > dueDate("2026-06-15", 21)).toBe(true);
  });

  // A malformed base date must not silently become 1970 (which would make the
  // forecast instantly "due" and grade it against an unrelated price).
  it("returns the input unchanged when the base date is unparseable", () => {
    expect(dueDate("not-a-date", 21)).toBe("not-a-date");
  });
});
