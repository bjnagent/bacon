// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { parseBriefing } from "@/lib/parsers";
import type { AnalysisMeta } from "@/lib/analysisStore";
import { DataCallouts, LensGrid, VerdictCard, stancesSoFar } from "./Report";

afterEach(cleanup);

// Illustrative fixture in the model's delimited format — not market data.
const lens = (k: string, stance: string, body: string, verify = "the latest filing") => `===${k}===\n[${stance}] ${body}\nVerify: ${verify}`;
const FULL = [
  "===SUMMARY===\nDemand is running ahead of supply; the debate is how long that lasts.",
  lens("FUNDAMENTAL", "Constructive", "Cash generation is strong relative to the multiple."),
  lens("VALUATION", "Mixed", "Growth runway is priced generously."),
  lens("TECHNICAL", "Constructive", "Trend intact above rising averages."),
  lens("HEALTH", "Constructive", "Orderly stack; not over-extended."),
  lens("FACTOR", "Mixed", "Momentum strong, value weak."),
  lens("MACRO", "Cautious", "Export rules are a live risk."),
  lens("SIGNALS", "Mixed", "Insider selling under plans; institutions adding."),
  lens("RISK", "Cautious", "Customer concentration; size modestly."),
  "===VERDICT===\nBuy · conviction 4/5\n12-mo estimates: bear est. -15%, base est. +10%, bull est. +30%\nWrong if: a guide-down on the next print",
  "===BOTTOMLINE===\nConstructive with a short leash.",
].join("\n");

const meta = (gaps: AnalysisMeta["gaps"] = []): AnalysisMeta => ({
  id: "11111111-1111-4111-8111-111111111111", symbol: "NKE", query: "Nike", assetClass: "Equity / Stock",
  generatedAt: new Date().toISOString(), cache: "miss", shared: false, verified: false, resolved: null, gaps,
});

describe("VerdictCard", () => {
  it("leads with the call, the lens lean and the convergence gauge", () => {
    const { getByText, getByRole, container } = render(<VerdictCard briefing={parseBriefing(FULL)} done />);
    expect(getByText("Buy")).toBeTruthy();
    expect(getByRole("img", { name: "Conviction 4 of 5" })).toBeTruthy();
    expect(getByText("Constructive lean")).toBeTruthy();
    expect(getByText("Wrong if")).toBeTruthy();
    expect(getByText("Constructive with a short leash.")).toBeTruthy();
    expect(container.querySelectorAll('[data-part="point"]').length).toBe(8);
  });

  it("shows a pending call while the stream is still writing", () => {
    const partial = parseBriefing(FULL.split("===FACTOR===")[0]);
    const { getByText, container } = render(<VerdictCard briefing={partial} done={false} />);
    expect(getByText("Weighing the lenses…")).toBeTruthy();
    expect(getByText("4 still reading")).toBeTruthy();
    expect(container.querySelectorAll('[data-part="point"]').length).toBe(4);
  });
});

describe("stancesSoFar", () => {
  it("leaves unlanded lenses out mid-stream and calls them limited data once done", () => {
    const b = parseBriefing(lens("RISK", "Cautious", "x"));
    expect(Object.keys(stancesSoFar(b, false))).toEqual(["RISK"]);
    expect(stancesSoFar(b, true).MACRO).toBe("limited-data");
  });
});

describe("DataCallouts", () => {
  it("states data gaps in plain words", () => {
    const { getByText } = render(<DataCallouts meta={meta(["unmatched", "no_price"])} briefing={parseBriefing(FULL)} done />);
    expect(getByText(/Some live data was unavailable/)).toBeTruthy();
    expect(getByText(/“Nike” couldn't be matched to a listed symbol/)).toBeTruthy();
    expect(getByText(/No current price or moving-average data/)).toBeTruthy();
  });

  it("flags unsourced hard figures, and only once the briefing is complete", () => {
    const withFigure = FULL.replace("Cash generation is strong relative to the multiple.", "Revenue grew 94% last year.");
    const done = render(<DataCallouts meta={meta()} briefing={parseBriefing(withFigure)} done />);
    expect(done.getByText(/Data check: 1 figure to verify/)).toBeTruthy();
    expect(done.getByText("94%")).toBeTruthy();
    cleanup();
    const live = render(<DataCallouts meta={meta()} briefing={parseBriefing(withFigure)} done={false} />);
    expect(live.container.textContent).toBe("");
  });

  it("passes a briefing whose figures are all sourced or labelled estimates", () => {
    const sourced = FULL
      .replace("Cash generation is strong relative to the multiple.", "Revenue grew 94% per the latest 10-K.")
      .replace("Growth runway is priced generously.", "Our base case target implies 25x forward earnings.");
    const { getByText } = render(<DataCallouts meta={meta()} briefing={parseBriefing(sourced)} done />);
    expect(getByText(/Data check passed/)).toBeTruthy();
    expect(getByText(/1 sourced, 1 labelled estimate\./)).toBeTruthy();
  });

  it("renders nothing when there are no gaps and no hard figures", () => {
    const { container } = render(<DataCallouts meta={meta()} briefing={parseBriefing(FULL)} done />);
    expect(container.textContent).toBe("");
  });
});

describe("LensGrid", () => {
  it("renders all eight lenses with stance badges and verify pointers", () => {
    const { getAllByText, container } = render(<LensGrid briefing={parseBriefing(FULL)} streaming={false} />);
    expect(container.querySelectorAll("[data-lens]").length).toBe(8);
    expect(getAllByText("Constructive").length).toBe(3);
    expect(getAllByText("Cautious").length).toBe(2);
    // jsdom has no matchMedia → the phone layout: collapsed until tapped.
    expect(container.textContent).not.toContain("Verify:");
    fireEvent.click(container.querySelector('[data-lens="RISK"] button')!);
    expect(container.querySelector('[data-lens="RISK"]')!.textContent).toContain("Verify:");
  });

  it("shows lenses still being written as pending", () => {
    const partial = parseBriefing(FULL.split("===FACTOR===")[0]);
    const { getAllByText } = render(<LensGrid briefing={partial} streaming />);
    expect(getAllByText("Reading…").length).toBe(4);
  });
});
