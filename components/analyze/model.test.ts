import { describe, it, expect } from "vitest";
import { chatNotes, listPoints, lensVar, redteamTone, splitLead, verdictParts, TOOLS } from "./model";
import { parseBriefing } from "@/lib/parsers";
import { ROUTE_GATES } from "@/lib/plans";

describe("verdictParts", () => {
  it("splits the call, conviction and labelled lines", () => {
    const v = verdictParts("**Buy** · conviction 4/5\n12-mo estimates: bear est. -10%, base est. +8%\nEntry thinking: wait for a pullback\nWrong if: guidance is cut\nA stray note.");
    expect(v.call).toBe("Buy");
    expect(v.conviction).toBe(4);
    expect(v.details.map((d) => d.label)).toEqual(["12-mo estimates", "Entry thinking", "Wrong if"]);
    expect(v.notes).toEqual(["A stray note."]);
  });

  it("keeps a non-standard headline and ignores impossible convictions", () => {
    const v = verdictParts("Accumulate slowly · conviction 9/5");
    expect(v.call).toBeNull();
    expect(v.headline).toBe("Accumulate slowly · conviction 9/5");
    expect(v.conviction).toBeNull();
    expect(verdictParts(undefined)).toMatchObject({ call: null, headline: "", details: [] });
  });
});

describe("red team + lists", () => {
  it("maps the red-team verdict to a tone", () => {
    expect(redteamTone("Proceed — the attack doesn't land")).toBe("pos");
    expect(redteamTone("Proceed smaller — size it down")).toBe("warn");
    expect(redteamTone("Wait — for the print")).toBe("warn");
    expect(redteamTone("Stay away — balance sheet")).toBe("neg");
    expect(redteamTone("")).toBe("neutral");
  });

  it("strips list markers and splits a leading name", () => {
    expect(listPoints("1. First\n2) Second\n- Third")).toEqual(["First", "Second", "Third"]);
    expect(splitLead("**Acme (ACME)** — 2nd degree — supplies the chokepoint")).toEqual({ lead: "Acme (ACME)", rest: "2nd degree — supplies the chokepoint" });
    expect(splitLead("No dash here")).toEqual({ lead: "", rest: "No dash here" });
  });
});

describe("chat + tokens", () => {
  it("hands chat the lens read on screen", () => {
    const notes = chatNotes(parseBriefing("===SUMMARY===\nSynth.\n===MACRO===\n[Cautious] Rates.\n===VERDICT===\nHold · conviction 3/5\nWrong if: x"));
    expect(notes).toContain("Summary: Synth.");
    expect(notes).toContain("Macro / Reg: cautious");
    expect(notes).toContain("Verdict: Hold · conviction 3/5");
    expect(chatNotes(null)).toBeUndefined();
  });

  it("uses lens tokens and gates every deep tool on its plan feature", () => {
    expect(lensVar("SIGNALS")).toBe("var(--lens-signals)");
    for (const t of TOOLS) expect(ROUTE_GATES[t.key]?.feature).toBe(t.feature);
  });
});
