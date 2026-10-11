import { describe, it, expect } from "vitest";
import { summarise, type PublicCall } from "@/lib/houseRecord";
import {
  addDays, buildValueSeries, callStatus, chartGeometry, compactUsd, filterCalls, filterCounts, fmtDate, fmtDay,
  gradesOn, nearestIndex, nextGradeDate, niceTicks, pct, actionLabel, STAKE,
} from "./recordModel";
import { statusText } from "./CallLine";

const call = (p: Partial<PublicCall>): PublicCall => ({
  instrument: "X", action: "buy", source: "brief", conviction: 3, targetText: null,
  calledAt: "2026-08-01", horizonDate: "2026-11-01",
  actualPct: null, benchPct: null, hit: null, settled: false, ...p,
});

describe("callStatus", () => {
  it("separates waiting, running and finished calls", () => {
    expect(callStatus(call({}))).toBe("pending");
    expect(callStatus(call({ actualPct: 3 }))).toBe("open");
    expect(callStatus(call({ actualPct: 3, settled: true }))).toBe("final");
  });
});

describe("filters", () => {
  const calls = [
    call({ instrument: "A", actualPct: 5, hit: true, settled: true }),
    call({ instrument: "B", actualPct: -4, hit: false, settled: true }),
    call({ instrument: "C", actualPct: 1, hit: null, settled: false }),   // watch call, still running
    call({ instrument: "D" }),                                              // too new to grade
  ];

  it("only narrows what is read — 'all' is everything, misses included", () => {
    expect(filterCalls(calls, "all").map((c) => c.instrument)).toEqual(["A", "B", "C", "D"]);
    expect(filterCalls(calls, "hits").map((c) => c.instrument)).toEqual(["A"]);
    expect(filterCalls(calls, "misses").map((c) => c.instrument)).toEqual(["B"]);
  });

  it("treats anything not final as open, and anything priced as graded", () => {
    expect(filterCalls(calls, "open").map((c) => c.instrument)).toEqual(["C", "D"]);
    expect(filterCalls(calls, "graded").map((c) => c.instrument)).toEqual(["A", "B", "C"]);
    expect(filterCounts(calls)).toEqual({ all: 4, open: 2, graded: 3, hits: 1, misses: 1 });
  });

  it("does not mutate the list it is given", () => {
    const copy = [...calls];
    filterCalls(calls, "hits");
    expect(calls).toEqual(copy);
  });
});

describe("grading dates", () => {
  it("adds calendar days in UTC, across month and year ends", () => {
    expect(addDays("2026-10-09", 30)).toBe("2026-11-08");
    expect(addDays("2026-12-15", 30)).toBe("2027-01-14");
    expect(gradesOn(call({ calledAt: "2026-02-01" }))).toBe("2026-03-03");
  });

  it("finds the next first-grade date, ignoring ones already past", () => {
    const calls = [call({ calledAt: "2026-08-01" }), call({ calledAt: "2026-10-05" }), call({ calledAt: "2026-10-01" }), call({ calledAt: "2026-09-01", actualPct: 2 })];
    expect(nextGradeDate(calls, "2026-10-11")).toBe("2026-10-31");
    expect(nextGradeDate([], "2026-10-11")).toBeNull();
  });

  it("never prints a first-grade date that has already passed", () => {
    expect(statusText(call({ calledAt: "2026-10-01" }), "2026-10-11")).toBe("Open · grades Oct 31");
    expect(statusText(call({ calledAt: "2026-08-01" }), "2026-10-11")).toBe("Open · grading soon");
    expect(statusText(call({ actualPct: 2, horizonDate: "2027-01-09" }), "2026-10-11")).toBe("Open · settles Jan 9");
    expect(statusText(call({ actualPct: 2, settled: true, horizonDate: "2026-10-01" }), "2026-10-11")).toBe("Settled Oct 1");
  });
});

describe("buildValueSeries", () => {
  it("accumulates $10K per call in filing order, one point per date", () => {
    const s = buildValueSeries([
      call({ calledAt: "2026-08-03", actualPct: 10, benchPct: 2 }),
      call({ calledAt: "2026-08-01", actualPct: -5, benchPct: 1 }),
      call({ calledAt: "2026-08-03", actualPct: 0, benchPct: 0 }),
    ]);
    expect(s.map((p) => p.date)).toEqual(["2026-08-01", "2026-08-03"]);
    expect(s[0]).toMatchObject({ calls: 1, invested: STAKE, value: 9500, spyValue: 10100 });
    expect(s[1]).toMatchObject({ calls: 3, invested: 3 * STAKE, value: 30500, spyValue: 30300 });
  });

  it("leaves out unpriced and unbenchmarked calls from BOTH lines", () => {
    const s = buildValueSeries([
      call({ calledAt: "2026-08-01", actualPct: 4, benchPct: 1 }),
      call({ calledAt: "2026-08-02", actualPct: 80, benchPct: null }),   // property: no SPY window
      call({ calledAt: "2026-08-03" }),                                   // not graded yet
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].invested).toBe(STAKE);
  });

  it("ends on exactly the alpha the stats report, in dollars", () => {
    const calls = [
      call({ calledAt: "2026-07-01", actualPct: 12, benchPct: 3 }),
      call({ calledAt: "2026-07-09", actualPct: -6, benchPct: 2 }),
      call({ calledAt: "2026-07-20", actualPct: 4, benchPct: -1 }),
      call({ calledAt: "2026-07-25", actualPct: 40, benchPct: null }),
    ];
    const last = buildValueSeries(calls).at(-1)!;
    const alpha = summarise(calls).alphaPct!;
    expect(((last.value - last.spyValue) / last.invested) * 100).toBeCloseTo(alpha, 6);
  });
});

describe("niceTicks", () => {
  it("spans the range on round steps and includes zero", () => {
    expect(niceTicks(0, 5120, 4)).toEqual([0, 2000, 4000, 6000]);
    const t = niceTicks(-1800, 5200, 4);
    expect(t[0]).toBeLessThanOrEqual(-1800);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(5200);
    expect(t).toContain(0);
  });

  it("copes with a flat series", () => {
    const t = niceTicks(0, 0);
    expect(t.length).toBeGreaterThan(1);
    expect(t).toContain(0);
  });
});

describe("chartGeometry", () => {
  const points = buildValueSeries([
    call({ calledAt: "2026-08-01", actualPct: 5, benchPct: 1 }),
    call({ calledAt: "2026-08-02", actualPct: -3, benchPct: 1 }),
    call({ calledAt: "2026-08-31", actualPct: 8, benchPct: 2 }),
  ]);
  const g = chartGeometry(points, 600, 240);

  it("places points by real time, so a quiet month reads as a gap", () => {
    expect(g.xs[0]).toBe(g.plot.left);
    expect(g.xs[2]).toBe(g.plot.right);
    expect(g.xs[1] - g.xs[0]).toBeLessThan((g.xs[2] - g.xs[1]) / 10);
  });

  it("keeps $0 inside the plot and draws both lines from the left edge", () => {
    expect(g.zeroY).toBeGreaterThanOrEqual(g.plot.top);
    expect(g.zeroY).toBeLessThanOrEqual(g.plot.bottom);
    expect(g.callsPath.startsWith(`M${g.plot.left} `)).toBe(true);
    expect(g.spyPath.split("L")).toHaveLength(3);
    expect(g.callsArea.endsWith("Z")).toBe(true);
  });

  it("snaps a pointer to the nearest filing date", () => {
    expect(nearestIndex(g.xs, g.plot.left + 3)).toBe(0);
    expect(nearestIndex(g.xs, g.plot.right - 40)).toBe(2);
  });
});

describe("formatting", () => {
  it("formats calendar days the same everywhere (UTC, en-US)", () => {
    expect(fmtDay("2026-10-09")).toBe("Oct 9");
    expect(fmtDate("2026-10-09T23:30:00Z")).toBe("Oct 9, 2026");
  });

  it("signs percentages and compacts axis money", () => {
    expect(pct(5.26)).toBe("+5.3%");
    expect(pct(-2)).toBe("−2.0%");
    expect(pct(null)).toBe("—");
    expect(compactUsd(0)).toBe("$0");
    expect(compactUsd(2500)).toBe("+$2.5K");
    expect(compactUsd(-4000)).toBe("−$4K");
  });

  it("sentence-cases the action head", () => {
    expect(actionLabel("accumulate")).toBe("Accumulate");
    expect(actionLabel("Buy — catalyst tonight")).toBe("Buy");
    expect(actionLabel("")).toBe("Call");
  });
});
