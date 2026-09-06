import { describe, it, expect } from "vitest";
import { gradeForecast, scoreForecasts, buildForecastMemo, forecastToRow, MIN_N, type GradedForecast } from "./forecastRecord";
import type { Forecast } from "./forecast";

const band = { base: 100, expected: 105, lo: 90, hi: 120 };

describe("gradeForecast", () => {
  it("measures error against the actual, signed so bias is visible", () => {
    // Forecast 105, actual 110 → the forecast was LOW, so the signed error is +.
    const g = gradeForecast(band, 110)!;
    expect(g.errorPct).toBeCloseTo(((110 - 105) / 110) * 100, 6);
    expect(g.errorPct).toBeGreaterThan(0);
    expect(g.absErrorPct).toBeCloseTo(g.errorPct, 6);

    const high = gradeForecast(band, 100)!;
    expect(high.errorPct).toBeLessThan(0);            // forecast too HIGH
    expect(high.absErrorPct).toBeGreaterThan(0);      // magnitude stays positive
  });

  // The whole point of the ledger: the model's error and the "nothing happens"
  // error are computed on the SAME realised close, so the comparison is a fact.
  it("scores the no-change benchmark on the same outcome", () => {
    const g = gradeForecast(band, 110)!;
    expect(g.naiveErrorPct).toBeCloseTo(((110 - 100) / 110) * 100, 6);
    expect(g.absErrorPct).toBeLessThan(g.naiveErrorPct);   // drift beat no-change here
  });

  it("records whether the close landed inside the band, edges included", () => {
    expect(gradeForecast(band, 95)!.inBand).toBe(true);
    expect(gradeForecast(band, 90)!.inBand).toBe(true);
    expect(gradeForecast(band, 120)!.inBand).toBe(true);
    expect(gradeForecast(band, 89.99)!.inBand).toBe(false);
    expect(gradeForecast(band, 120.01)!.inBand).toBe(false);
  });

  // A zero or negative "price" is bad data, and dividing by it would quietly
  // produce a 100% error that then counts as a real grade.
  it("refuses an unusable actual or an unusable forecast", () => {
    expect(gradeForecast(band, 0)).toBeNull();
    expect(gradeForecast(band, -5)).toBeNull();
    expect(gradeForecast(band, NaN)).toBeNull();
    expect(gradeForecast({ ...band, expected: 0 }, 110)).toBeNull();
    expect(gradeForecast({ ...band, base: 0 }, 110)).toBeNull();
  });
});

const rows = (n: number, r: Partial<GradedForecast>): GradedForecast[] =>
  Array.from({ length: n }, () => ({
    method: "drift", horizon_days: 21,
    error_pct: 0, abs_error_pct: 5, naive_error_pct: 10, in_band: true,
    ...r,
  }));

describe("scoreForecasts", () => {
  // Below the threshold a "score" reads as evidence while being noise, which is
  // worse than saying nothing — the same rule the calls calibration memo uses.
  it("stays silent below the minimum sample", () => {
    expect(scoreForecasts(rows(MIN_N - 1, {}))).toEqual([]);
    expect(scoreForecasts(rows(MIN_N, {}))).toHaveLength(1);
  });

  it("reports positive skill only when the method beats no-change", () => {
    const better = scoreForecasts(rows(MIN_N, { abs_error_pct: 5, naive_error_pct: 10 }))[0];
    expect(better.skillPct).toBeCloseTo(50, 6);

    const worse = scoreForecasts(rows(MIN_N, { abs_error_pct: 15, naive_error_pct: 10 }))[0];
    expect(worse.skillPct).toBeLessThan(0);
  });

  // If nothing moved there is no skill to measure, and 1 - x/0 is not a score.
  it("claims no skill when the benchmark error is zero", () => {
    expect(scoreForecasts(rows(MIN_N, { abs_error_pct: 0, naive_error_pct: 0 }))[0].skillPct).toBe(0);
  });

  it("computes band calibration and directional bias", () => {
    const mixed = [...rows(MIN_N, { in_band: true, error_pct: 4 }), ...rows(MIN_N, { in_band: false, error_pct: 4 })];
    const s = scoreForecasts(mixed)[0];
    expect(s.n).toBe(MIN_N * 2);
    expect(s.bandHitPct).toBeCloseTo(50, 6);
    expect(s.biasPct).toBeCloseTo(4, 6);
  });

  // The seam's entire purpose: drift and a hosted model scored side by side,
  // best first, on the same yardstick.
  it("scores each method separately and ranks by skill", () => {
    const out = scoreForecasts([
      ...rows(MIN_N, { method: "drift", abs_error_pct: 8, naive_error_pct: 10 }),
      ...rows(MIN_N, { method: "remote", abs_error_pct: 4, naive_error_pct: 10 }),
    ]);
    expect(out.map((s) => s.method)).toEqual(["remote", "drift"]);
    expect(out[0].skillPct).toBeGreaterThan(out[1].skillPct);
  });

  // Medians, so one earnings gap doesn't decide a method's reputation.
  it("uses the median, not the mean, for error", () => {
    const withOutlier = [...rows(MIN_N, { abs_error_pct: 5 }), ...rows(1, { abs_error_pct: 900 })];
    expect(scoreForecasts(withOutlier)[0].medianAbsErrorPct).toBe(5);
  });

  it("ignores rows that were never graded", () => {
    expect(scoreForecasts(rows(MIN_N, { abs_error_pct: null }))).toEqual([]);
  });
});

describe("buildForecastMemo", () => {
  it("says nothing without a score", () => {
    expect(buildForecastMemo([])).toBe("");
  });

  // The unflattering result has to be stated as plainly as the flattering one,
  // or the model keeps quoting a band the evidence says is worthless.
  it("tells the model when the method loses to no-change", () => {
    const memo = buildForecastMemo(scoreForecasts(rows(MIN_N, { abs_error_pct: 20, naive_error_pct: 10 })));
    expect(memo).toMatch(/WORSE than assuming no change/);
    expect(memo).toMatch(/use only the band/);
  });

  it("names over- and under-confident bands", () => {
    const wide = buildForecastMemo(scoreForecasts(rows(MIN_N, { in_band: true })));
    expect(wide).toMatch(/bands too wide/);
    const narrow = buildForecastMemo(scoreForecasts(rows(MIN_N, { in_band: false })));
    expect(narrow).toMatch(/overconfident/);
    const ok = buildForecastMemo(scoreForecasts([
      ...rows(16, { in_band: true }), ...rows(4, { in_band: false }),
    ]));
    expect(ok).toMatch(/well calibrated/);
  });

  it("reports the direction of a persistent bias", () => {
    expect(buildForecastMemo(scoreForecasts(rows(MIN_N, { error_pct: 6 })))).toMatch(/forecasts LOW by 6\.0%/);
    expect(buildForecastMemo(scoreForecasts(rows(MIN_N, { error_pct: -6 })))).toMatch(/forecasts HIGH by 6\.0%/);
    // Noise-level bias is not a finding.
    expect(buildForecastMemo(scoreForecasts(rows(MIN_N, { error_pct: 0.2 })))).not.toMatch(/forecasts (LOW|HIGH)/);
  });
});

describe("forecastToRow", () => {
  const f: Forecast = {
    symbol: "NVDA", horizonDays: 21, base: 100, baseDate: "2026-01-01",
    expected: 105, lo: 90, hi: 120, driftAnnualPct: 12, volAnnualPct: 40, method: "drift",
  };

  // due_date is what makes the row gradeable later, and forecast_date is half
  // the dedup key — both have to be on the row, not inferred at read time.
  it("derives the due date and stamps the day it was made", () => {
    const row = forecastToRow(f, "2026-01-02");
    expect(row.due_date).toBe("2026-01-31");
    expect(row.forecast_date).toBe("2026-01-02");
    expect(row.method).toBe("drift");
    expect(row.base_date).toBe("2026-01-01");
  });
});
