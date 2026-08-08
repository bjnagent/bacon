// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import TodayView from "./TodayView";
import { SAMPLE_ITEMS } from "@/lib/sampleBrief";

// The view's three startup reads all go through cachedJson; steering it is
// simpler and less brittle than stubbing fetch and replaying response bodies.
const responses: Record<string, unknown> = {};
vi.mock("@/lib/clientCache", () => ({
  cachedJson: (url: string) => Promise.resolve(responses[url] ?? {}),
  invalidate: () => {},
}));
const readTextStream = vi.fn(() => Promise.resolve(""));
vi.mock("@/lib/readStream", () => ({ readTextStream: (...a: unknown[]) => readTextStream(...(a as [])) }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("./MacroBackdrop", () => ({ default: () => null }));

const noop = () => {};
const renderView = () => render(<TodayView onAnalyze={noop} onDiscuss={noop} />);

beforeEach(() => {
  for (const k of Object.keys(responses)) delete responses[k];
  responses["/api/watchlist"] = { items: [] };
  responses["/api/settings"] = { settings: {} };
  readTextStream.mockClear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TodayView first run", () => {
  it("shows the example brief when the account has never swept", async () => {
    responses["/api/brief"] = { brief: { intro: null, caveat: null, generatedAt: null, items: [] } };
    renderView();

    expect(await screen.findByLabelText("Example brief")).toBeTruthy();
    // Every sample idea is rendered...
    for (const item of SAMPLE_ITEMS) expect(screen.getByText(item.name)).toBeTruthy();
    // ...and each one carries its own "example" marking, so a card read in
    // isolation still can't be mistaken for the user's own brief.
    expect(screen.getAllByText("example")).toHaveLength(SAMPLE_ITEMS.length);
    expect(screen.getByText(/Example — not your data/)).toBeTruthy();
  });

  it("never presents the example as actionable", async () => {
    responses["/api/brief"] = { brief: { intro: null, caveat: null, generatedAt: null, items: [] } };
    renderView();
    await screen.findByLabelText("Example brief");

    // No Track / Run lenses on sample cards: acting on an illustration is never
    // the intended next step, and a filed call from fake data would be worse.
    expect(screen.queryByText(/Run lenses/)).toBeNull();
    expect(screen.queryByText(/Track$/)).toBeNull();
    // Sample ideas state no call and no price target.
    for (const item of SAMPLE_ITEMS) {
      expect(item).not.toHaveProperty("action");
      expect(item).not.toHaveProperty("target");
    }
  });

  it("starts a real sweep from the example's CTA", async () => {
    responses["/api/brief"] = { brief: { intro: null, caveat: null, generatedAt: null, items: [] } };
    renderView();
    await screen.findByLabelText("Example brief");

    fireEvent.click(screen.getByText(/SWEEP MY REAL SIGNALS/));
    await waitFor(() => expect(readTextStream).toHaveBeenCalledTimes(1));
    expect(readTextStream.mock.calls[0][0]).toBe("/api/brief");
  });

  it("offers the daily sweep, since nothing arrives on its own until it's on", async () => {
    responses["/api/brief"] = { brief: { intro: null, caveat: null, generatedAt: null, items: [] } };
    renderView();
    await screen.findByLabelText("Example brief");

    // The default state must not claim briefs are already coming.
    expect(screen.getByText(/Briefs don't arrive on their own yet/)).toBeTruthy();

    fireEvent.click(screen.getByText("Sweep for me daily"));
    await waitFor(() => expect(screen.getByText(/Daily sweep on/)).toBeTruthy());

    const patch = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .find((c: unknown[]) => c[0] === "/api/settings");
    expect(patch).toBeTruthy();
    expect(JSON.parse((patch![1] as { body: string }).body)).toEqual({ scout_interval_minutes: 1440 });
  });

  it("shows the real brief, not the example, once the account has one", async () => {
    responses["/api/brief"] = {
      brief: {
        intro: "Two setups worth your morning.", caveat: null, generatedAt: new Date().toISOString(),
        items: [{ id: "1", name: "Real Co", ticker: "REAL", cls: "Equity / Stock", horizon: "3–6 months", thesis: "t", signals: "s", checks: "c" }],
      },
    };
    renderView();

    expect(await screen.findByText("Real Co")).toBeTruthy();
    expect(screen.queryByLabelText("Example brief")).toBeNull();
    expect(screen.queryByText(/Example — not your data/)).toBeNull();
  });
});
