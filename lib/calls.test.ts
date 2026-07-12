import { describe, it, expect } from "vitest";
import { actionHead, expectedDirection, parseTargets, parseVerdictCall, horizonToDays, buildCalibrationMemo, type GradedCall } from "./calls";

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
});

describe("parseTargets", () => {
  it("pulls the base-case price from a free-text target line", () => {
    expect(parseTargets("$160 base est. (12-mo), bull $210")).toEqual({ base: 160, kind: "price" });
    expect(parseTargets("bear $120, base $1,450 est., bull $210")).toEqual({ base: 1450, kind: "price" });
  });
  it("supports percent targets", () => {
    expect(parseTargets("base +12% on rate cuts, bull +25%")).toEqual({ base: 12, kind: "pct" });
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
