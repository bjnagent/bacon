import { describe, it, expect } from "vitest";
import { parseBriefing, parseDebate, parseScout, parseNews, parseTrackingUpdate, toPoints } from "./parsers";

describe("parseBriefing", () => {
  const sample = `===SUMMARY===
Two sentence neutral synthesis.
===FUNDAMENTAL===
[Constructive] Strong moat and cash flow.
Verify: latest 10-K MD&A
===TECHNICAL===
[Cautious] Below the 200-day.
Verify: price vs 50/200-day
===FACTOR===
[Mixed] Quality up, value down.
Verify: factor exposures
===MACRO===
[Limited-data] Rate-sensitive.
Verify: Fed path
===SIGNALS===
[Constructive] Insider buying.
Verify: Form 4 on EDGAR
===RISK===
[Cautious] Multiple compression risk.
Verify: forward P/E vs history
===BOTTOMLINE===
Synthesis of public info, not advice.`;

  const out = parseBriefing(sample);

  it("extracts summary and bottom line", () => {
    expect(out.SUMMARY).toBe("Two sentence neutral synthesis.");
    expect(out.BOTTOMLINE).toContain("not advice");
  });

  it("parses each lens with normalized stance, body and verify", () => {
    expect(Object.keys(out.lenses)).toEqual(["FUNDAMENTAL", "TECHNICAL", "FACTOR", "MACRO", "SIGNALS", "RISK"]);
    expect(out.lenses.FUNDAMENTAL.stance).toBe("constructive");
    expect(out.lenses.FUNDAMENTAL.body).toBe("Strong moat and cash flow.");
    expect(out.lenses.FUNDAMENTAL.verify).toBe("latest 10-K MD&A");
    expect(out.lenses.MACRO.stance).toBe("limited-data");
    expect(out.lenses.TECHNICAL.stance).toBe("cautious");
    expect(out.lenses.FACTOR.stance).toBe("mixed");
  });

  it("defaults a missing stance tag to mixed", () => {
    const out2 = parseBriefing("===FUNDAMENTAL===\nNo stance tag here.\nVerify: somewhere");
    expect(out2.lenses.FUNDAMENTAL.stance).toBe("mixed");
    expect(out2.lenses.FUNDAMENTAL.body).toBe("No stance tag here.");
  });
});

describe("parseDebate", () => {
  it("splits bull / bear / synthesis sections", () => {
    const out = parseDebate(`===BULL===
- one
- two
===BEAR===
- three
===SYNTHESIS===
hinges here`);
    expect(out.BULL).toContain("one");
    expect(out.BEAR).toBe("- three");
    expect(out.SYNTHESIS).toBe("hinges here");
  });
});

describe("parseScout", () => {
  const sample = `===INTRO===
scanned for movers
@@PICK@@
name: Acme Corp
ticker: ACME
class: Equity
why: leader in widgets
now: earnings beat
check: verify guidance
@@PICK@@
name: NoTicker Co
ticker: —
class: Equity
why: thin
now: nothing
check: skip
===CAVEAT===
not advice`;

  it("parses intro, picks and caveat", () => {
    const out = parseScout(sample);
    expect(out.intro).toBe("scanned for movers");
    expect(out.caveat).toBe("not advice");
    expect(out.picks).toHaveLength(2);
    expect(out.picks[0]).toMatchObject({ name: "Acme Corp", ticker: "ACME", cls: "Equity", now: "earnings beat" });
  });

  it("keeps picks with a name even when ticker is a dash", () => {
    const out = parseScout(sample);
    expect(out.picks[1].name).toBe("NoTicker Co");
  });
});

describe("parseNews", () => {
  it("parses items and the note", () => {
    const out = parseNews(`===INTRO===
fresh
@@ITEM@@
head: Chipmaker guides higher
source: Reuters
why: demand strong
ticker: NVDA
class: Equity
signal: Guidance
when: 2h
===NOTE===
paraphrased; verify at source`);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ head: "Chipmaker guides higher", source: "Reuters", ticker: "NVDA", signal: "Guidance", when: "2h" });
    expect(out.note).toContain("verify at source");
  });
});

describe("parseTrackingUpdate", () => {
  it("parses update, watch and normalized lean", () => {
    const out = parseTrackingUpdate(`===UPDATE===
New product launched.
===WATCH===
next earnings
===LEAN===
Constructive — momentum building`);
    expect(out.update).toBe("New product launched.");
    expect(out.watch).toBe("next earnings");
    expect(out.lean).toBe("constructive");
    expect(out.leanReason).toBe("momentum building");
  });
});

describe("toPoints", () => {
  it("splits lines and strips bullet markers", () => {
    expect(toPoints("- a\n* b\n• c\n\n  d")).toEqual(["a", "b", "c", "d"]);
    expect(toPoints("")).toEqual([]);
  });
});
