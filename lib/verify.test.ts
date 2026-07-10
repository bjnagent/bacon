import { describe, it, expect } from "vitest";
import { auditFigures, auditBriefingText } from "./verify";

describe("auditFigures", () => {
  it("flags a bare price/target with no source", () => {
    const a = auditFigures("Fair value sits near $450 with upside to $520.");
    expect(a.total).toBe(2);
    expect(a.cited).toBe(0);
    expect(a.flagged.map((f) => f.figure)).toEqual(["$450", "$520"]);
  });

  it("treats a figure as cited when the sentence names a source", () => {
    const a = auditFigures("Revenue grew 42% last quarter, per company guidance.");
    expect(a.total).toBe(1);
    expect(a.cited).toBe(1);
    expect(a.flagged).toHaveLength(0);
  });

  it("flags an unattributed valuation multiple", () => {
    const a = auditFigures("It trades at 30x forward earnings, rich versus peers.");
    // "earnings" is descriptive, not a source — the 30x multiple is unattributed.
    expect(a.flagged.map((f) => f.figure)).toContain("30x");
  });

  it("does not flag MA-period labels, years, or plain integers", () => {
    const a = auditFigures("Price holds above its 20/50/100/200-day averages since 2024, across 3 sessions.");
    expect(a.total).toBe(0);
    expect(a.flagged).toHaveLength(0);
  });

  it("counts a Reuters-attributed percentage as cited", () => {
    const a = auditFigures("Shipments rose 12% year over year, Reuters reported.");
    expect(a.cited).toBe(1);
    expect(a.flagged).toHaveLength(0);
  });

  it("accepts a figure that matches the real grounding snapshot", () => {
    const a = auditFigures("The stock sits 47% above its 50-day.", ["47%"]);
    expect(a.total).toBe(1);
    expect(a.flagged).toHaveLength(0);
    expect(a.cited).toBe(1);
  });
});

describe("auditBriefingText", () => {
  it("aggregates across summary, lens bodies and bottom line", () => {
    const a = auditBriefingText({
      summary: "Momentum strong.",
      lensBodies: ["Margins near 35% look full.", "Guidance implies 20% growth, per the 10-K."],
      bottomline: "Targets of $90 circulate.",
    });
    expect(a.total).toBe(3);          // 35%, 20%, $90
    expect(a.flagged.map((f) => f.figure).sort()).toEqual(["$90", "35%"]); // 20% is cited (10-K)
  });
});
