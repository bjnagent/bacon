import { describe, it, expect } from "vitest";
import { actionHead, expectedDirection, parseTargets, parseVerdictCall, horizonToDays, buildCalibrationMemo, buildInstrumentMemo, type GradedCall, type PastCall } from "./calls";

describe("actionHead / expectedDirection", () => {
  it("normalizes the action word out of free text", () => {
    expect(actionHead("Buy — catalyst tonight")).toBe("buy");
    expect(actionHead("Stay away")).toBe("stay");
    expect(actionHead("  Accumulate · dips")).toBe("accumulate");
  });
  it("maps actions to graded direction (watch/hold = not directional)", () => {
    expect(expectedDirection("Buy — now")).toBe(1);
    expect(expectedDirection("Avoid · overheated")).toBe(-1);
    expect(expectedDirection("Watch until breakout")).toBeNull();
    expect(expectedDirection("Hold")).toBeNull();
  });
  it("disambiguates 'stay': away/out is bearish, long/invested is bullish", () => {
    expect(expectedDirection("Stay away — value trap")).toBe(-1);
    expect(expectedDirection("Stay out until the print")).toBe(-1);
    expect(expectedDirection("Stay long — hold through earnings")).toBe(1);
    expect(expectedDirection("Stay invested")).toBe(1);
    expect(expectedDirection("Stay")).toBeNull(); // ambiguous alone → not graded
  });
});

describe("parseTargets", () => {
  it("pulls the base-case price from a free-text target line", () => {
    expect(parseTargets("$160 base est. (12-mo), bull $210")).toEqual({ base: 160, kind: "price" });
    expect(parseTargets("bear $120, base $1,450 est., bull $210")).toEqual({ base: 1450, kind: "price" });
  });
  it("supports percent targets", () => {
    expect(parseTargets("base +12% on rate cuts, bull +25%")).toEqual({ base: 12, kind: "pct" });
  });
  it("prefers an explicit $ price over an incidental % in the same clause", () => {
    // "$160 (+12% upside)" is a $160 price target, not a 12% target.
    expect(parseTargets("base $160 — about +12% upside")).toEqual({ base: 160, kind: "price" });
  });
  it("scales a magnitude suffix so $1.5M isn't read as 1.5", () => {
    expect(parseTargets("base $1.5M")).toEqual({ base: 1_500_000, kind: "price" });
    expect(parseTargets("base $450B target")).toEqual({ base: 450_000_000_000, kind: "price" });
  });
  it("returns null when no number exists", () => {
    expect(parseTargets("no view")).toBeNull();
    expect(parseTargets(undefined)).toBeNull();
  });
});

describe("parseVerdictCall", () => {
  it("parses action, conviction and the estimates line from a VERDICT block", () => {
    const v = parseVerdictCall("Buy · conviction 4/5\n12-mo estimates: bear $120, base $160, bull $210 — est.\nEntry thinking: now\nWrong if: loses $95");
    expect(v?.action).toContain("Buy");
    expect(v?.conviction).toBe(4);
    expect(v?.targetText).toContain("base $160");
  });
  it("returns null on empty", () => {
    expect(parseVerdictCall(undefined)).toBeNull();
  });
});

describe("horizonToDays", () => {
  it("maps brief horizons to grading windows", () => {
    expect(horizonToDays("days")).toBe(30);
    expect(horizonToDays("weeks | months")).toBe(90); // first match wins
    expect(horizonToDays("months")).toBe(180);
    expect(horizonToDays(undefined, 365)).toBe(365);
  });
});

describe("buildCalibrationMemo", () => {
  const call = (over: Partial<GradedCall>): GradedCall => ({
    action: "buy", source: "brief", crowded: null, conviction: null,
    actual_pct: 5, bench_pct: 2, direction_hit: true, target_err_pct: null, ...over,
  });

  it("stays silent below the minimum sample size (no learning from noise)", () => {
    expect(buildCalibrationMemo([call({}), call({ direction_hit: false })])).toBe("");
  });

  it("reports hit rate and crowding split once cohorts are big enough", () => {
    const hotCalls = Array.from({ length: 8 }, (_, i) => call({ crowded: "hot", direction_hit: i < 3 }));   // 37%
    const quietCalls = Array.from({ length: 8 }, (_, i) => call({ crowded: "quiet", direction_hit: i < 6 })); // 75%
    const memo = buildCalibrationMemo([...hotCalls, ...quietCalls]);
    expect(memo).toContain("16 graded calls");
    expect(memo).toContain("HOT");
    expect(memo).toContain("38%"); // hot hit rate
    expect(memo).toContain("75%"); // quiet hit rate
  });

  it("reports signed target bias from finalized calls", () => {
    const calls = Array.from({ length: 10 }, () => call({ target_err_pct: -8 }));
    const memo = buildCalibrationMemo(calls);
    expect(memo).toContain("-8.0%");
    expect(memo).toContain("optimistic");
  });
});

describe("buildInstrumentMemo (per-name reflection)", () => {
  const graded: PastCall = {
    action: "buy", conviction: 4, actual_pct: 12.3, bench_pct: 4.1,
    direction_hit: true, target_err_pct: -8, target_text: "base $160",
    created_at: "2026-01-15T00:00:00Z",
  };
  const open: PastCall = {
    action: "watch", conviction: null, actual_pct: null, bench_pct: null,
    direction_hit: null, target_err_pct: null, target_text: null,
    created_at: "2026-07-01T00:00:00Z",
  };

  it("returns empty when there is no history on the name", () => {
    expect(buildInstrumentMemo("NVDA", [])).toBe("");
  });

  it("recalls a graded call with its realized move, benchmark and verdict", () => {
    const memo = buildInstrumentMemo("nvda", [graded]);
    expect(memo).toContain("NVDA");            // header uppercases the name
    expect(memo).toContain("2026-01-15");
    expect(memo).toContain("+12.3%");
    expect(memo).toContain("SPY +4.1%");
    expect(memo).toContain("direction RIGHT");
    expect(memo).toContain("base $160");
  });

  it("marks an ungraded call as still open rather than inventing an outcome", () => {
    const memo = buildInstrumentMemo("NVDA", [open]);
    expect(memo).toContain("too early to grade");
    expect(memo).not.toContain("direction");
  });

  it("instructs the model to justify a flip — the anti-flip-flop guard", () => {
    expect(buildInstrumentMemo("NVDA", [graded])).toContain("what changed");
  });

  it("adds a hit-rate lesson once two or more calls are graded", () => {
    const miss: PastCall = { ...graded, created_at: "2026-03-02T00:00:00Z", direction_hit: false, actual_pct: -5 };
    const memo = buildInstrumentMemo("NVDA", [graded, miss]);
    expect(memo).toContain("1/2 on direction");
  });

  it("caps how many prior calls it recalls", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...graded, created_at: `2026-0${(i % 9) + 1}-01T00:00:00Z` }));
    const lines = buildInstrumentMemo("NVDA", many).split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(5);
  });
});
