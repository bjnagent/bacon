import { describe, it, expect } from "vitest";
import { todayLine } from "./prompts";

describe("todayLine", () => {
  // The whole point: a model with no clock answers as of its training cutoff.
  // A "Nike" briefing came back with FY2025 figures because of exactly this.
  it("states the current date", () => {
    expect(todayLine(new Date("2026-09-07T11:00:00Z"))).toContain("2026-09-07");
  });

  it("uses UTC, so a late-evening call does not report tomorrow", () => {
    expect(todayLine(new Date("2026-09-07T23:30:00Z"))).toContain("2026-09-07");
    expect(todayLine(new Date("2026-09-08T00:30:00Z"))).toContain("2026-09-08");
  });

  // It is not enough to state the date. The model has to be told that what it
  // remembers is stale, and what to do instead — otherwise it reconciles the
  // two by assuming its memory is current anyway.
  it("tells the model its memory is stale and what to do about it", () => {
    const t = todayLine(new Date("2026-09-07T00:00:00Z"));
    expect(t).toMatch(/training data ends well before this/i);
    expect(t).toMatch(/do NOT state a remembered figure as current/i);
    expect(t).toMatch(/verify it with search/i);
    expect(t).toMatch(/say so plainly/i);
  });
});
