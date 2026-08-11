import { describe, it, expect } from "vitest";
import { summarise, toPublicCall, type PublicCall, type CallRecord } from "./houseRecord";

const call = (p: Partial<PublicCall>): PublicCall => ({
  instrument: "X", action: "Buy", source: "brief", conviction: 3, targetText: null,
  calledAt: "2026-01-01", horizonDate: "2026-07-01",
  actualPct: null, benchPct: null, hit: null, settled: false, ...p,
});

describe("summarise", () => {
  it("counts filed, priced and settled separately", () => {
    const s = summarise([
      call({}),                                                   // too new to price
      call({ actualPct: 5, hit: true }),                          // priced, still running
      call({ actualPct: -2, hit: false, settled: true }),         // finished
    ]);
    expect(s.filed).toBe(3);
    expect(s.priced).toBe(2);
    expect(s.settled).toBe(1);
  });

  it("computes hit rate over calls that stated a direction", () => {
    const s = summarise([
      call({ actualPct: 5, hit: true }),
      call({ actualPct: 3, hit: true }),
      call({ actualPct: -1, hit: false }),
      call({ actualPct: 2, hit: null }),   // "watch" — no direction claimed, so not scoreable
    ]);
    expect(s.directional).toBe(3);
    expect(s.hits).toBe(2);
    expect(s.hitRatePct).toBeCloseTo(66.667, 2);
  });

  it("measures alpha on the benchmarked subset only, both sides", () => {
    // The unbenchmarked winner must not inflate alpha: it has no SPY window to
    // be compared against, so it belongs in neither average.
    const s = summarise([
      call({ actualPct: 10, benchPct: 4 }),
      call({ actualPct: 2, benchPct: 4 }),
      call({ actualPct: 90, benchPct: null }),   // property — no equity benchmark
    ]);
    expect(s.benchmarked).toBe(2);
    expect(s.meanBenchPct).toBeCloseTo(4, 6);
    // Own return over the SAME two calls: (10 + 2) / 2 = 6 → alpha 2.
    expect(s.alphaPct).toBeCloseTo(2, 6);
    // The headline mean return still reflects everything priced.
    expect(s.meanReturnPct).toBeCloseTo(34, 6);
  });

  it("reports nothing rather than zero when there is nothing to report", () => {
    const s = summarise([]);
    expect(s.filed).toBe(0);
    // Null, not 0 — an empty record must not render as a 0% hit rate.
    expect(s.hitRatePct).toBeNull();
    expect(s.meanReturnPct).toBeNull();
    expect(s.alphaPct).toBeNull();
    expect(s.firstCallAt).toBeNull();
  });

  it("has no path that drops a losing call", () => {
    const losers = [
      call({ actualPct: -20, benchPct: 5, hit: false, settled: true }),
      call({ actualPct: -14, benchPct: 5, hit: false, settled: true }),
    ];
    const s = summarise(losers);
    expect(s.priced).toBe(2);
    expect(s.hitRatePct).toBe(0);
    expect(s.meanReturnPct).toBeCloseTo(-17, 6);
    expect(s.alphaPct).toBeCloseTo(-22, 6);   // the record is allowed to look bad
  });

  it("spans the record from first call to last", () => {
    const s = summarise([
      call({ calledAt: "2026-03-04" }), call({ calledAt: "2026-01-09" }), call({ calledAt: "2026-02-20" }),
    ]);
    expect(s.firstCallAt).toBe("2026-01-09");
    expect(s.lastCallAt).toBe("2026-03-04");
  });
});

describe("toPublicCall", () => {
  const row: CallRecord = {
    instrument: "NVDA", action: "Buy — accumulate", source: "brief", conviction: 4,
    target_text: "$180", created_at: "2026-01-15T09:30:00.000Z", horizon_date: "2026-07-15",
    actual_pct: "12.5", bench_pct: "4.25", direction_hit: true, graded_at: null,
  };

  it("coerces PostgREST's numeric strings to numbers", () => {
    const c = toPublicCall(row);
    // Strings here would make the averages concatenate instead of add.
    expect(c.actualPct).toBe(12.5);
    expect(c.benchPct).toBe(4.25);
    expect(summarise([c]).meanReturnPct).toBeCloseTo(12.5, 6);
  });

  it("marks a call settled only once it has been graded out", () => {
    expect(toPublicCall(row).settled).toBe(false);
    expect(toPublicCall({ ...row, graded_at: "2026-07-16T00:00:00.000Z" }).settled).toBe(true);
  });

  it("carries no user identity into the public shape", () => {
    const c = toPublicCall(row) as Record<string, unknown>;
    expect(c.user_id).toBeUndefined();
    expect(Object.keys(c)).not.toContain("user_id");
    expect(c.calledAt).toBe("2026-01-15");   // date only; no request-time precision
  });
});
