// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppCtx, type AppApi } from "@/components/app/AppContext";
import { onPaywall, type PaywallRequest } from "@/lib/client/paywall";
import BriefPane from "./BriefPane";
import { SAMPLE_ITEMS } from "./sampleBrief";

// Every GET in the pane goes through cachedJson (via useApi); steering it by
// URL is simpler and less brittle than replaying fetch bodies.
const responses: Record<string, unknown> = {};
vi.mock("@/lib/clientCache", () => ({
  cachedJson: (url: string) => Promise.resolve(responses[url] ?? {}),
  invalidate: () => {},
}));
const apiStream = vi.fn((...args: unknown[]) => { void args; return Promise.resolve(""); });
vi.mock("@/lib/client/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/api")>()),
  apiStream: (...a: unknown[]) => apiStream(...a),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

function fakeApp(over: Partial<AppApi> = {}): AppApi {
  return {
    route: { tab: "today", sub: "brief" }, navigate: vi.fn(), openAnalyze: vi.fn(), analyzeRequest: null,
    openChat: vi.fn(), openSearch: vi.fn(), email: "a@b.c", isAdmin: false, me: null, refreshMe: vi.fn(async () => {}),
    can: () => true, remaining: () => 3, watchlist: [], watchlistLoaded: true, refreshWatchlist: vi.fn(async () => {}),
    isTracked: () => false, trackSymbol: vi.fn(async () => true), untrackSymbol: vi.fn(async () => true),
    ...over,
  };
}

function renderPane(app: AppApi = fakeApp()): { app: AppApi } {
  const wrap = ({ children }: { children: ReactNode }) => <AppCtx.Provider value={app}>{children}</AppCtx.Provider>;
  render(<BriefPane active />, { wrapper: wrap });
  return { app };
}

const EMPTY = { brief: { intro: null, caveat: null, generatedAt: null, items: [] }, house: false };
const REAL = {
  house: false,
  brief: {
    intro: "Two setups worth your morning.", caveat: "Research, not advice.", generatedAt: new Date().toISOString(),
    items: [{
      id: "1", name: "Real Co", ticker: "REAL", cls: "Equity / Stock", horizon: "3–6 months",
      thesis: "A thesis.", signals: "one; two", checks: "Confirm: orders hold · Kill: guide-down",
      action: "Buy — orders turning", target: "est. 120", stop: "100",
    }],
  },
};

let paywalls: PaywallRequest[] = [];
let offPaywall = () => {};

beforeEach(() => {
  for (const k of Object.keys(responses)) delete responses[k];
  responses["/api/activation"] = { swept: true, tracked: false, analyzed: false };
  apiStream.mockReset();
  apiStream.mockImplementation(() => Promise.resolve(""));
  paywalls = [];
  offPaywall = onPaywall((r) => { paywalls.push(r); });
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).startsWith("/api/quotes")) {
      return new Response(JSON.stringify({ quotes: { REAL: { price: 90, changePct: -1.5, live: false, source: "Stooq", at: "2026-10-09" } } }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
});
afterEach(() => { cleanup(); offPaywall(); vi.unstubAllGlobals(); });

describe("BriefPane first run", () => {
  it("shows the example brief, labelled as an example in the banner and on every card", async () => {
    responses["/api/brief"] = EMPTY;
    renderPane();

    const region = await screen.findByLabelText("Example brief");
    expect(within(region).getByText("Example — not your data")).toBeTruthy();
    for (const item of SAMPLE_ITEMS) {
      const card = within(region).getByRole("article", { name: new RegExp(item.name) });
      // Each card carries its own marking, so a card read in isolation still
      // can't be mistaken for the user's own brief.
      expect(within(card).getByText("Example")).toBeTruthy();
    }
  });

  it("never presents the example as actionable", async () => {
    responses["/api/brief"] = EMPTY;
    renderPane();
    await screen.findByLabelText("Example brief");

    expect(screen.queryByRole("button", { name: /^Analyze/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Track/ })).toBeNull();
    // Sample ideas state no call and no price target.
    for (const item of SAMPLE_ITEMS) {
      expect(item).not.toHaveProperty("action");
      expect(item).not.toHaveProperty("target");
    }
    // Exactly one call to action.
    expect(screen.getAllByRole("button", { name: "Build my first brief" })).toHaveLength(1);
  });

  it("builds a real brief from the example's single CTA", async () => {
    responses["/api/brief"] = EMPTY;
    renderPane();
    fireEvent.click(await screen.findByRole("button", { name: "Build my first brief" }));
    await waitFor(() => expect(apiStream).toHaveBeenCalledTimes(1));
    expect(apiStream.mock.calls[0][0]).toBe("/api/brief");
  });

  it("opens the paywall instead of streaming when the plan has no personal brief", async () => {
    responses["/api/brief"] = EMPTY;
    renderPane(fakeApp({ can: () => false }));
    fireEvent.click(await screen.findByRole("button", { name: "Build my first brief" }));
    expect(apiStream).not.toHaveBeenCalled();
    expect(paywalls[0]).toMatchObject({ reason: "feature", feature: "personal_brief" });
  });
});

describe("BriefPane with a brief", () => {
  it("shows the real brief, not the example, with its call, levels and confirm/kill lines", async () => {
    responses["/api/brief"] = REAL;
    renderPane();

    expect(await screen.findByText("Real Co")).toBeTruthy();
    expect(screen.queryByLabelText("Example brief")).toBeNull();
    expect(screen.getByText("Buy")).toBeTruthy();
    expect(screen.getByText("orders turning")).toBeTruthy();
    expect(screen.getByText("est. 120")).toBeTruthy();
    expect(screen.getByText("orders hold")).toBeTruthy();
    expect(screen.getByText("guide-down")).toBeTruthy();
    expect(screen.getByText("Research, not advice.", { exact: false })).toBeTruthy();
  });

  it("labels a delayed price as a close and flags a breached stop", async () => {
    responses["/api/brief"] = REAL;
    renderPane();
    // Price 90 against a long call's stop at 100.
    expect(await screen.findByText("Stop breached")).toBeTruthy();
    expect(screen.getByText("close")).toBeTruthy();
    expect(screen.getByText("90.00")).toBeTruthy();
  });

  it("wires Analyze, Track and Ask to the shell", async () => {
    responses["/api/brief"] = REAL;
    const { app } = renderPane();
    await screen.findByText("Real Co");

    fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
    expect(app.openAnalyze).toHaveBeenCalledWith({ asset: "REAL", cls: "Equity / Stock", run: true });

    fireEvent.click(screen.getByRole("button", { name: "Track REAL" }));
    await waitFor(() => expect(app.trackSymbol).toHaveBeenCalledWith("REAL", "Equity / Stock"));

    fireEvent.click(screen.getByRole("button", { name: "Ask Bacon about this idea" }));
    expect(app.openChat).toHaveBeenCalledWith(expect.objectContaining({ kind: "asset", asset: "REAL", sub: "today's brief" }));
  });

  it("shows the remaining allowance next to Refresh brief", async () => {
    responses["/api/brief"] = REAL;
    renderPane(fakeApp({ remaining: () => 2 }));
    expect(await screen.findByRole("button", { name: "Refresh brief" })).toBeTruthy();
    expect(screen.getByText("2 left this month")).toBeTruthy();
  });

  it("streams ideas in as preview cards, then swaps in the saved brief", async () => {
    responses["/api/brief"] = REAL;
    let finish: (v: string) => void = () => {};
    apiStream.mockImplementation((...a: unknown[]) => {
      const onChunk = a[2] as (acc: string) => void;
      onChunk("===INTRO===\nFresh read.\n@@OPP@@\nname: Cameco\nticker: CCJ\nclass: Equity / Stock\nthesis: Cycle.");
      return new Promise<string>((r) => { finish = r; });
    });
    renderPane();
    fireEvent.click(await screen.findByRole("button", { name: "Refresh brief" }));

    expect(await screen.findByText("Cameco")).toBeTruthy();
    expect(screen.getByText("Fresh read.")).toBeTruthy();
    expect(screen.getByText("Building your brief")).toBeTruthy();
    // A half-written idea has no actions yet.
    expect(screen.queryByRole("button", { name: "Analyze" })).toBeNull();

    finish("done");
    await waitFor(() => expect(screen.queryByText("Building your brief")).toBeNull());
    expect(screen.getByText("Real Co")).toBeTruthy();
  });
});

describe("BriefPane house brief", () => {
  it("says it's the house brief, offers an upgrade, and still lets ideas be tracked", async () => {
    responses["/api/brief"] = { ...REAL, house: true };
    const { app } = renderPane(fakeApp({ can: () => false, remaining: () => null }));

    expect(await screen.findByText(/the same for every free member/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get one built around your watchlist" }));
    expect(paywalls[0]).toMatchObject({ reason: "feature", feature: "personal_brief", suggested: "pro" });

    // Locked: Upgrade instead of Refresh, and no first-run checklist (its first
    // step is a paid action).
    expect(screen.getByRole("button", { name: "Upgrade" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refresh brief" })).toBeNull();
    expect(screen.queryByLabelText("Getting started")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Track REAL" }));
    await waitFor(() => expect(app.trackSymbol).toHaveBeenCalled());
  });
});
