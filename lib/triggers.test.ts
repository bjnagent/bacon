import { describe, it, expect } from "vitest";
import { parseLevel, evaluateTrigger } from "./triggers";

describe("parseLevel", () => {
  it("reads a single level and a band", () => {
    expect(parseLevel("152, below the prior range low")).toEqual({ lo: 152, hi: 152 });
    expect(parseLevel("168-174, the 50-day it reclaimed last week")).toEqual({ lo: 168, hi: 174 });
    expect(parseLevel("$1,240.50 — prior breakout")).toEqual({ lo: 1240.5, hi: 1240.5 });
    expect(parseLevel("168–174")).toEqual({ lo: 168, hi: 174 });   // en-dash
  });

  it("orders a reversed band", () => {
    expect(parseLevel("174-168")).toEqual({ lo: 168, hi: 174 });
  });

  // The anchors are full of numbers that are NOT levels. Reading only the
  // leading token is what stops "the 50-day" becoming a stop at 50.
  it("never takes a number out of the anchor prose", () => {
    expect(parseLevel("market, actionable now")).toBeNull();
    expect(parseLevel("no current level was available")).toBeNull();
    expect(parseLevel("roughly the 50-day moving average")).toBeNull();
    expect(parseLevel("~22x the FY27 earnings path")).toBeNull();   // a multiple, not a price
    expect(parseLevel("50-day moving average")).toBeNull();          // a period, not a price
    expect(parseLevel("12% above the range")).toBeNull();            // a percentage, not a price
  });

  it("rejects empties and zero", () => {
    expect(parseLevel("")).toBeNull();
    expect(parseLevel(undefined)).toBeNull();
    expect(parseLevel("0, nonsense")).toBeNull();
  });
});

describe("evaluateTrigger", () => {
  const long = { action: "BUY — second-order name", entry: "168-174, the 50-day", stop: "152, prior low", target: "210 est., 22x FY27" };

  it("reports a breached stop above everything else", () => {
    expect(evaluateTrigger(long, 150)?.kind).toBe("stop");
    expect(evaluateTrigger(long, 152)?.kind).toBe("stop");   // at the level counts
  });

  it("reports a reached target", () => {
    expect(evaluateTrigger(long, 215)?.kind).toBe("target");
  });

  it("reports price inside the entry band", () => {
    expect(evaluateTrigger(long, 170)?.kind).toBe("entry");
    expect(evaluateTrigger(long, 174)?.kind).toBe("entry");
  });

  it("says nothing when the price is between levels", () => {
    expect(evaluateTrigger(long, 185)).toBeNull();   // above entry, below target
  });

  // A SELL is invalidated by the price running AWAY above the stop, not below.
  it("inverts direction for reduce-side calls", () => {
    const reduce = { action: "SELL — thesis broken", entry: "100", stop: "120, invalidation", target: "80 est." };
    expect(evaluateTrigger(reduce, 125)?.kind).toBe("stop");
    expect(evaluateTrigger(reduce, 75)?.kind).toBe("target");
    expect(evaluateTrigger(reduce, 100)?.kind).toBe("entry");
  });

  // A wrong trigger is worse than a missing one, so anything unreadable is
  // silent rather than guessed.
  it("makes no claim without a usable price, action or level", () => {
    expect(evaluateTrigger(long, null)).toBeNull();
    expect(evaluateTrigger(long, 0)).toBeNull();
    expect(evaluateTrigger({ ...long, action: "Watch" }, 150)).toBeNull();
    expect(evaluateTrigger({ action: "BUY" }, 150)).toBeNull();          // no levels
    expect(evaluateTrigger({ action: "BUY", stop: "market" }, 150)).toBeNull();
  });
});
