import { describe, it, expect } from "vitest";
import { parseBriefing, parseDebate, parseScout, parseNews, parseTrackingUpdate, parseOpportunities, parseBriefReview, parseKillWatch, toPoints } from "./parsers";

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

  it("captures the VERDICT section as a top-level call, not a lens", () => {
    const out = parseBriefing(`===SUMMARY===
ok
===VERDICT===
Buy · conviction 4/5
12-mo estimates: bear $120, base $160, bull $210 — est.
===BOTTOMLINE===
own it`);
    expect(out.VERDICT).toContain("Buy · conviction 4/5");
    expect(out.VERDICT).toContain("base $160");
    expect(out.lenses.VERDICT).toBeUndefined();
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

// A label wrapped in markdown emphasis is what BOUNDS the previous field, so an
// unrecognised `**class:**` makes `ticker` swallow every field after it. That
// shipped real rows like "** BTC-USD / IBIT\nclass: Crypto / ETF\nhorizon: weeks"
// into the instrument column once the model changed its formatting.
// Advice mode adds entry/stop/size. The labels must be in blockReader's key
// list or `target` runs straight through `stop` and `size` — the same failure
// that put whole prompt fragments into the instrument column.
describe("parseOpportunities in advice mode", () => {
  const ADVICE = [
    "@@OPP@@",
    "name: Nvidia",
    "ticker: NVDA",
    "class: Equity",
    "horizon: months",
    "thesis: Rack-scale demand is captured by the supplier, not the hyperscaler.",
    "signals: Peer +12% today; supply headline via Reuters; curve steepening.",
    "action: BUY — the tape has not repriced the second-order name",
    "entry: 168-174, the 50-day it reclaimed last week",
    "target: 210 est., ~22x the FY27 earnings path",
    "stop: 152, below the prior range low",
    "size: 3-5% of a growth sleeve — high conviction, high volatility",
    "confirm: a second quarter of rack-scale bookings",
    "kill: bookings decelerate or the supply constraint clears",
  ].join("\n");

  it("reads the advice fields", () => {
    const o = parseOpportunities(ADVICE).items[0];
    expect(o.action).toBe("BUY — the tape has not repriced the second-order name");
    expect(o.entry).toBe("168-174, the 50-day it reclaimed last week");
    expect(o.stop).toBe("152, below the prior range low");
    expect(o.size).toBe("3-5% of a growth sleeve — high conviction, high volatility");
  });

  it("does not let target swallow stop and size", () => {
    const o = parseOpportunities(ADVICE).items[0];
    expect(o.target).toBe("210 est., ~22x the FY27 earnings path");
    expect(o.target).not.toContain("stop:");
    expect(o.target).not.toContain("size:");
  });

  // Research mode never emits them, and must still parse cleanly.
  it("leaves the advice fields empty on a research-mode brief", () => {
    const research = ADVICE.split("\n").filter((l) => !/^(entry|stop|size):/.test(l)).join("\n");
    const o = parseOpportunities(research).items[0];
    expect(o.entry).toBe("");
    expect(o.stop).toBe("");
    expect(o.size).toBe("");
    expect(o.target).toBe("210 est., ~22x the FY27 earnings path");
  });
});

describe("blockReader emphasis tolerance", () => {
  const BARE = [
    "@@OPP@@",
    "name: Tencent",
    "ticker: 0700.HK",
    "class: Equity",
    "horizon: weeks",
    "thesis: Gaming recovery.",
    "signals: Licence approvals.",
    "action: accumulate",
    "target: HK$420 est.",
    "confirm: Q3 print",
    "kill: Regulatory reversal",
  ].join("\n");
  const BOLDED = BARE.replace(
    /^(name|ticker|class|horizon|thesis|signals|action|target|confirm|kill):/gm,
    "**$1:**",
  );

  it("parses bolded labels identically to bare ones", () => {
    const bare = parseOpportunities(BARE).items[0];
    const bold = parseOpportunities(BOLDED).items[0];
    expect(bold).toEqual(bare);
  });

  it("does not let one field swallow the next", () => {
    const o = parseOpportunities(BOLDED).items[0];
    expect(o.ticker).toBe("0700.HK");
    expect(o.ticker).not.toContain("class:");
    expect(o.action).toBe("accumulate");
    expect(o.cls).toBe("Equity");
  });
});

describe("parseOpportunities", () => {
  const sample = `===INTRO===
Signals point at a supply-chain reprice.
@@OPP@@
name: Widget Supply Co
ticker: WSC
class: Equity
horizon: weeks
thesis: Unpriced supplier to today's biggest mover.
signals: ACME +14% today; capacity headline via Reuters; curve steepening
confirm: Q3 backlog numbers
kill: contract loss to rival
@@OPP@@
name: NoTicker Play
ticker: —
class: Commodity
horizon: months
thesis: second-order beneficiary
signals: macro only
confirm: inventories
kill: demand rollover
===CAVEAT===
starting points, not advice`;

  it("parses intro, ranked items with all fields, and caveat", () => {
    const out = parseOpportunities(sample);
    expect(out.intro).toBe("Signals point at a supply-chain reprice.");
    expect(out.caveat).toContain("not advice");
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({ name: "Widget Supply Co", ticker: "WSC", horizon: "weeks" });
    expect(out.items[0].signals).toContain("ACME +14%");
    expect(out.items[0].confirm).toBe("Q3 backlog numbers");
    expect(out.items[0].kill).toBe("contract loss to rival");
    expect(out.items[1].name).toBe("NoTicker Play");
  });

  it("parses the action + target call fields", () => {
    const out = parseOpportunities(`@@OPP@@
name: Micron
ticker: MU
class: Equity
horizon: weeks
thesis: HBM cycle underpriced
signals: peer +12% (provider)
action: Buy — catalyst tonight, risk skewed up
target: $160 base est. (12-mo), bull $210
confirm: Q4 guide
kill: HBM pricing rolls over
@@OPP@@`);
    expect(out.items[0].action).toContain("Buy");
    expect(out.items[0].target).toContain("$160");
    expect(out.items[0].kill).toBe("HBM pricing rolls over");
  });

  it("keeps the whole multi-line signals list (no first-line truncation)", () => {
    const out = parseOpportunities(`@@OPP@@
name: MLCC Names
ticker: —
class: Equity
horizon: weeks
thesis: passive components under the radar
signals: (1) **Investor theme: MLCC** — directly flagged.
(2) Book-to-bill at multi-year highs (Reuters).
(3) Lead times stretching to 20–40 weeks.
confirm: allocation letters from Murata
kill: hyperscaler capex pause
@@OPP@@`);
    expect(out.items[0].signals).toContain("(1)");
    expect(out.items[0].signals).toContain("(2)");
    expect(out.items[0].signals).toContain("(3)");
    expect(out.items[0].signals).toContain("Lead times");
    expect(out.items[0].signals).not.toContain("**"); // markdown emphasis stripped
    expect(out.items[0].signals).toContain("Investor theme: MLCC");
    expect(out.items[0].confirm).toBe("allocation letters from Murata"); // later fields still bound correctly
    expect(out.items[0].kill).toBe("hyperscaler capex pause");
  });
});

describe("parseKillWatch", () => {
  it("returns only triggered kills, with the note", () => {
    const out = parseKillWatch(`===ALERTS===
@@KILL@@
ticker: WSC
why: Lost the anchor contract to a rival (Reuters, this week) — the kill condition.
@@KILL@@
ticker: ORKA
why: Phase 2 readout missed its primary endpoint, per the company 8-K.
===NOTE===
Checked all five; two look triggered.`);
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({ ticker: "WSC" });
    expect(out.items[1].why).toContain("8-K");
    expect(out.note).toContain("two look triggered");
  });

  it("is empty when nothing triggered", () => {
    const out = parseKillWatch(`===ALERTS===
===NOTE===
Nothing triggered — all kill conditions intact.`);
    expect(out.items).toHaveLength(0);
    expect(out.note).toContain("intact");
  });
});

describe("parseBriefReview", () => {
  it("parses per-item outcomes with normalized verdicts", () => {
    const out = parseBriefReview(`===REVIEW===
@@ITEM@@
ticker: WSC
outcome: Guidance raise confirmed the backlog thesis (via Reuters).
verdict: Played-Out
@@ITEM@@
ticker: XYZ
outcome: No follow-through; volume faded within days.
verdict: faded
===NOTE===
qualitative outcomes; not advice`);
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({ ticker: "WSC", verdict: "played-out" });
    expect(out.items[0].outcome).toContain("Reuters");
    expect(out.items[1].verdict).toBe("faded");
    expect(out.note).toContain("not advice");
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
