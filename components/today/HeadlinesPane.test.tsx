// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppCtx, type AppApi } from "@/components/app/AppContext";
import HeadlinesPane from "./HeadlinesPane";

const responses: Record<string, unknown> = {};
vi.mock("@/lib/clientCache", () => ({
  cachedJson: (url: string) => Promise.resolve(responses[url] ?? {}),
  invalidate: () => {},
}));

function fakeApp(over: Partial<AppApi> = {}): AppApi {
  return {
    route: { tab: "today", sub: "news" }, navigate: vi.fn(), openAnalyze: vi.fn(), analyzeRequest: null,
    openChat: vi.fn(), openSearch: vi.fn(), email: "a@b.c", isAdmin: false, me: null, refreshMe: vi.fn(async () => {}),
    can: () => true, remaining: () => 5, watchlist: [], watchlistLoaded: true, refreshWatchlist: vi.fn(async () => {}),
    isTracked: () => false, trackSymbol: vi.fn(async () => true), untrackSymbol: vi.fn(async () => true),
    ...over,
  };
}

function renderPane(app: AppApi = fakeApp()) {
  const wrap = ({ children }: { children: ReactNode }) => <AppCtx.Provider value={app}>{children}</AppCtx.Provider>;
  render(<HeadlinesPane active />, { wrapper: wrap });
  return app;
}

const row = (headline: string, signal: string, symbol = "TSM") => ({
  id: headline, headline, source: "Reuters", why: "Why text.", symbol, asset_class: "Equity / Stock", signal, recency: "2h", created_at: new Date().toISOString(),
});

beforeEach(() => {
  for (const k of Object.keys(responses)) delete responses[k];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    result: { intro: "Scanned the wires.", note: "Paraphrased; verify at the source.", items: [{ head: "Fresh one", source: "FT", why: "w", ticker: "CCJ", cls: "Equity", signal: "Upgrade", when: "1h" }] },
  }), { status: 200 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("HeadlinesPane", () => {
  it("lists attributed headlines and filters them by lean", async () => {
    responses["/api/news"] = { items: [row("Chipmaker lifts outlook", "constructive"), row("Software guide disappoints", "cautious", "PLTR"), row("Yields slip", "Macro", "—")] };
    renderPane();

    expect(await screen.findByText("Chipmaker lifts outlook")).toBeTruthy();
    expect(screen.getAllByText("Reuters")).toHaveLength(3);
    expect(screen.getByText("Macro · no single ticker")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Cautious/ }));
    expect(screen.queryByText("Chipmaker lifts outlook")).toBeNull();
    expect(screen.getByText("Software guide disappoints")).toBeTruthy();
  });

  it("turns a ticker into a one-tap analysis, and offers Track and Ask", async () => {
    responses["/api/news"] = { items: [row("Chipmaker lifts outlook", "constructive")] };
    const app = renderPane();
    await screen.findByText("Chipmaker lifts outlook");

    fireEvent.click(screen.getByRole("button", { name: "Analyze TSM" }));
    expect(app.openAnalyze).toHaveBeenCalledWith({ asset: "TSM", cls: "Equity / Stock", run: true });

    fireEvent.click(screen.getByRole("button", { name: "Track TSM" }));
    await waitFor(() => expect(app.trackSymbol).toHaveBeenCalledWith("TSM", "Equity / Stock"));

    fireEvent.click(screen.getByRole("button", { name: "Ask Bacon about this headline" }));
    expect(app.openChat).toHaveBeenCalledWith(expect.objectContaining({ kind: "news", headline: "Chipmaker lifts outlook", ticker: "TSM" }));
  });

  it("has an empty state whose action pulls a fresh batch", async () => {
    responses["/api/news"] = { items: [] };
    renderPane();
    fireEvent.click(await screen.findByRole("button", { name: "Refresh headlines" }));

    expect(await screen.findByText("Fresh one")).toBeTruthy();
    expect(screen.getByText("Scanned the wires.")).toBeTruthy();
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c: unknown[]) => c[0] === "/api/news");
    expect(JSON.parse((call![1] as { body: string }).body)).toEqual({ source: "All", focus: "" });
  });

  it("shows a refresh error inline with a retry", async () => {
    responses["/api/news"] = { items: [row("Chipmaker lifts outlook", "constructive")] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Couldn't reach the news sources — please try again.", code: "upstream_failed" }), { status: 502 })));
    renderPane();
    await screen.findByText("Chipmaker lifts outlook");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/Couldn't refresh headlines/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    // The cached batch stays on screen.
    expect(screen.getByText("Chipmaker lifts outlook")).toBeTruthy();
  });
});
