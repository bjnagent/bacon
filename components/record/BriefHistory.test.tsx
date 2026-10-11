// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { KillAlerts, BriefSheet } from "./BriefHistory";
import { CallList } from "./CallList";
import { activeKills, seedRoi, type BriefRow } from "./briefModel";
import type { BriefHistoryApi } from "./useBriefHistory";
import type { RecordCall } from "./recordModel";

vi.mock("@/lib/native", () => ({ haptic: () => {} }));

afterEach(cleanup);

const brief = (p: Partial<BriefRow>): BriefRow => ({
  id: "b1", brief_date: "2026-10-09", intro: "The desk's read.", caveat: null, reviewed_at: null,
  items: [
    { name: "Taiwan Semiconductor", ticker: "TSM", cls: "Equity / Stock", horizon: "3–6 months", thesis: "Capacity sold out.", signals: "", checks: "Kill: guide-down", action: "Accumulate", target: "est. +14%" },
    { name: "Copper", ticker: "HG", cls: "Commodity", horizon: "3–6 months", thesis: "Inventories drawing.", signals: "", checks: "" },
  ],
  ...p,
});

const api = (over: Partial<BriefHistoryApi> = {}): BriefHistoryApi => ({
  roiFor: () => undefined, priceError: {}, pricing: null, reviewing: null, openId: "b1",
  open: vi.fn(), close: vi.fn(), price: vi.fn(), review: vi.fn(),
  score: { pricedDays: 0, invested: 0, value: 0, roiPct: 0, spyValue: null, alphaPct: null, wins: 0, losses: 0, graded: 0, hitRatePct: null },
  ...over,
});

describe("kill alerts", () => {
  const killed = brief({ kill_alert: { at: "2026-10-10T06:00:00Z", items: [{ ticker: "TSM", name: "Taiwan Semiconductor", why: "Guided advanced-node utilisation down" }] } });

  it("surfaces each tripped kill condition with its reason and a way into the brief", () => {
    const onOpen = vi.fn();
    render(<KillAlerts briefs={[killed, brief({ id: "b2" })]} onOpen={onOpen} />);
    expect(screen.getByText("Kill condition hit on TSM")).toBeTruthy();
    expect(screen.getByText(/Guided advanced-node utilisation down/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the brief" }));
    expect(onOpen).toHaveBeenCalledWith("b1");
  });

  it("keeps old alerts out of the banner (they stay on their brief)", () => {
    const { container } = render(<KillAlerts briefs={[killed]} onOpen={() => {}} since="2026-10-20" />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing when no kill condition has tripped", () => {
    const { container } = render(<KillAlerts briefs={[brief({})]} onOpen={() => {}} />);
    expect(container.textContent).toBe("");
    expect(activeKills([brief({})])).toEqual([]);
  });
});

describe("brief sheet", () => {
  it("shows each idea's $10K result where priced, and why not where it couldn't be", () => {
    const roi = {
      results: [
        { name: "Taiwan Semiconductor", ticker: "TSM", entryDate: "2026-10-09", entryClose: 100, asOfDate: "2026-10-10", asOfClose: 108.5, invested: 10_000, value: 10_850, roiPct: 8.5 },
        { name: "Copper", ticker: "HG", skipped: "no price history" },
      ],
      totals: { count: 1, invested: 10_000, value: 10_850, roiPct: 8.5, asOf: "2026-10-10", spyPct: 1.5, alphaPct: 7 },
    };
    render(<BriefSheet briefs={[brief({})]} api={api({ roiFor: () => roi })} />);
    expect(screen.getByText("$10,000.00 → $10,850.00")).toBeTruthy();
    expect(screen.getByText("no price history")).toBeTruthy();
    expect(screen.getByText(/SPY \+1\.50% over the same days/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "How did it age?" })).toBeTruthy();
  });

  it("seeds stored snapshots so opening a priced day doesn't re-price it", () => {
    const seeded = seedRoi([brief({ roi: { invested: 20_000, value: 21_000, roiPct: 5, count: 2, asOf: "2026-10-10" } }), brief({ id: "b2" })]);
    expect(Object.keys(seeded)).toEqual(["b1"]);
    expect(seeded.b1.totals).toMatchObject({ count: 2, invested: 20_000, value: 21_000 });
  });
});

describe("call list", () => {
  const c = (p: Partial<RecordCall>): RecordCall => ({
    id: Math.random().toString(36).slice(2), instrument: "X", action: "buy", source: "brief", conviction: 3, targetText: null,
    calledAt: "2026-08-01", horizonDate: "2026-11-01", actualPct: null, benchPct: null, hit: null, settled: false,
    crowded: null, targetErrPct: null, ...p,
  });
  const calls = [
    c({ instrument: "NVDA", actualPct: 21, benchPct: 6, hit: true, settled: true }),
    c({ instrument: "XOM", actualPct: -3, benchPct: 2, hit: false, settled: true }),
    c({ instrument: "TSM", calledAt: "2026-10-06" }),
  ];

  it("filters for reading and opens a call's details", () => {
    render(<CallList calls={calls} today="2026-10-11" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: "Misses" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("XOM")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: /TSM/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/first grade Nov 5, 2026/)).toBeTruthy();
  });
});
