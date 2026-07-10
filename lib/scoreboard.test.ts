import { describe, it, expect } from "vitest";
import { computeScoreboard, type ScoreBrief } from "./scoreboard";

const briefs: ScoreBrief[] = [
  { id: "a", roi: { invested: 30000, value: 34000, roiPct: 13.33 }, items: [{ verdict: "played-out" }, { verdict: "faded" }, { verdict: "developing" }] },
  { id: "b", roi: { invested: 20000, value: 18000, roiPct: -10 }, items: [{ verdict: "played-out" }, { verdict: "invalidated" }] },
  { id: "c", roi: null, items: [{ verdict: "played-out" }] }, // not yet priced
];

describe("computeScoreboard", () => {
  it("sums invested/value over priced days and derives cumulative return", () => {
    const s = computeScoreboard(briefs);
    expect(s.pricedDays).toBe(2);
    expect(s.invested).toBe(50000);
    expect(s.value).toBe(52000);
    expect(s.roiPct).toBeCloseTo(4, 6); // 52k/50k - 1
  });

  it("computes hit rate from verdicts (played-out = win; faded/invalidated = loss; developing ignored)", () => {
    const s = computeScoreboard(briefs);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(2);
    expect(s.graded).toBe(5);
    expect(s.hitRatePct).toBeCloseTo(60, 6);
  });

  it("lets a live re-price override the stored snapshot", () => {
    const s = computeScoreboard(briefs, { a: { invested: 30000, value: 45000, roiPct: 50 } });
    expect(s.value).toBe(63000); // 45k (live a) + 18k (b)
  });

  it("returns a null hit rate and zero return with nothing priced or graded", () => {
    const s = computeScoreboard([{ id: "x", roi: null, items: [{ verdict: "developing" }] }]);
    expect(s.pricedDays).toBe(0);
    expect(s.roiPct).toBe(0);
    expect(s.hitRatePct).toBeNull();
  });
});
