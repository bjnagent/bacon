// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CommandPalette, { looksLikeName, pushRecent, type PaletteAction } from "./CommandPalette";
import { AppCtx, type AppApi, type WatchItem } from "@/components/app/AppContext";
import { track } from "@/lib/track";

vi.mock("@/lib/track", () => ({ track: vi.fn() }));

afterEach(() => { cleanup(); vi.mocked(track).mockClear(); window.localStorage.clear(); });

const WATCH: WatchItem[] = [
  { id: "1", symbol: "NVDA", asset_class: "Equity / Stock" },
  { id: "2", symbol: "BTC", asset_class: "crypto" },
  { id: "3", symbol: "NVO", asset_class: "Equity / Stock" },
];

function mount(props: Partial<{ open: boolean; actions: PaletteAction[]; onAnalyze: (q: string) => void; onClose: () => void; watchlist: WatchItem[] }> = {}) {
  const onAnalyze = props.onAnalyze ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  const el = (open: boolean) => (
    <AppCtx.Provider value={{ watchlist: props.watchlist ?? [] } as unknown as AppApi}>
      <CommandPalette open={open} onClose={onClose} actions={props.actions ?? []} onAnalyze={onAnalyze} />
    </AppCtx.Provider>
  );
  const view = render(el(props.open ?? true));
  return { ...view, onAnalyze, onClose, reopen: () => { view.rerender(el(false)); view.rerender(el(true)); } };
}

const input = () => screen.getByRole("combobox");
const type = (v: string) => fireEvent.change(input(), { target: { value: v } });
const key = (k: string) => fireEvent.keyDown(input(), { key: k });

describe("CommandPalette", () => {
  it("filters actions by query and runs the clicked one", () => {
    const discussRun = vi.fn();
    const actions = [
      { id: "discuss", label: "Ask Bacon", hint: "Chat", run: discussRun },
      { id: "news", label: "Headlines", hint: "Today", run: vi.fn() },
    ];
    const { onClose } = mount({ actions });
    type("ask");
    expect(screen.queryByText("Headlines")).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Ask Bacon/ }));
    expect(discussRun).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("offers an Analyze action for a typed ticker", () => {
    const { onAnalyze } = mount();
    type("nvda");
    const first = screen.getAllByRole("option")[0];
    expect(first.textContent).toContain("Analyze");
    expect(first.textContent).toContain("NVDA");
    fireEvent.click(first);
    expect(onAnalyze).toHaveBeenCalledWith("nvda");
  });

  it("renders nothing when closed", () => {
    mount({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves with the arrow keys and opens with Enter", () => {
    const runs = { today: vi.fn(), record: vi.fn() };
    mount({ actions: [{ id: "today", label: "Today's brief", run: runs.today }, { id: "record", label: "Track record", run: runs.record }] });
    expect(input().getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0].id);
    key("ArrowDown");
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    key("ArrowDown"); // wraps
    key("ArrowUp"); // and back
    key("Enter");
    expect(runs.record).toHaveBeenCalledTimes(1);
    expect(runs.today).not.toHaveBeenCalled();
  });

  it("puts destinations first when the query reads as one, so Enter goes there", () => {
    const run = vi.fn();
    const { onAnalyze } = mount({ actions: [{ id: "watchlist", label: "Watchlist", run }] });
    type("watch");
    expect(screen.getAllByRole("option")[0].textContent).toContain("Watchlist");
    key("Enter");
    expect(run).toHaveBeenCalled();
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it("matches the watchlist and passes the asset class along", () => {
    const { onAnalyze } = mount({ watchlist: WATCH });
    type("bt");
    fireEvent.click(screen.getByRole("option", { name: /BTC/ }));
    expect(onAnalyze).toHaveBeenCalledWith("BTC crypto");
    expect(track).toHaveBeenCalledWith("action", "search-run", "bt");
  });

  it("doesn't list an exact watchlist match twice", () => {
    mount({ watchlist: WATCH });
    type("nvda");
    const opts = screen.getAllByRole("option");
    expect(opts).toHaveLength(1);
    expect(opts[0].textContent).toContain("On your watchlist");
  });

  it("says so when nothing matches", () => {
    mount();
    type("??? !!!");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No matches for/)).toBeTruthy();
  });

  it("shows the watchlist and destinations before anything is typed", () => {
    mount({ watchlist: WATCH, actions: [{ id: "today", label: "Today's brief", run: vi.fn() }] });
    expect(screen.getByText("Your watchlist")).toBeTruthy();
    expect(screen.getByText("Go to")).toBeTruthy();
  });

  it("remembers recent name searches, newest first, and can clear them", () => {
    const view = mount();
    type("nvda");
    key("Enter");
    view.reopen();
    type("tsm");
    key("Enter");
    view.reopen();
    expect(screen.getByText("Recent")).toBeTruthy();
    const recent = screen.getAllByRole("option").map((o) => o.textContent);
    expect(recent[0]).toContain("TSM");
    expect(recent[1]).toContain("NVDA");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("Recent")).toBeNull();
    expect(window.localStorage.getItem("bacon.search.recent")).toBe("[]");
  });

  it("keeps at most six recents, without duplicates", () => {
    let list: string[] = [];
    for (const q of ["a", "b", "c", "d", "e", "f", "g", "B"]) list = pushRecent(list, q);
    expect(list).toEqual(["B", "g", "f", "e", "d", "c"]);
  });

  it("still works when storage is unavailable", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    try {
      const { onAnalyze } = mount();
      type("nvda");
      key("Enter");
      expect(onAnalyze).toHaveBeenCalledWith("nvda");
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it("recognises tickers, pairs and short names — not sentences or symbols", () => {
    for (const q of ["NVDA", "brk.b", "EUR/USD", "BTC-USD", "^GSPC", "Taiwan Semiconductor"]) expect(looksLikeName(q)).toBe(true);
    for (const q of ["", "???", "what is the best stock to buy right now", "x".repeat(41)]) expect(looksLikeName(q)).toBe(false);
  });

  // The palette is the product's search box, so these assert the ledger gets
  // what the admin console reads back out of it.
  it("records a name search as run, with the query", () => {
    mount();
    type("  nvda ");
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(track).toHaveBeenCalledWith("action", "search-run", "nvda");
  });

  it("separates a command match from a name search", () => {
    mount({ actions: [{ id: "radar", label: "Radar", run: vi.fn() }] });
    type("radar");
    fireEvent.click(screen.getByRole("option", { name: /^Radar/ }));
    expect(track).toHaveBeenCalledWith("action", "search-nav", "radar");
  });

  // The point of the whole feature: a query nobody acted on is demand the
  // product didn't serve, and nothing else in the schema records it.
  it("records a typed-then-abandoned query on the way out", () => {
    mount();
    type("quantum computing etf");
    key("Escape");
    expect(track).toHaveBeenCalledWith("action", "search-drop", "quantum computing etf");
  });

  it("records an abandoned query when the backdrop is tapped too", () => {
    const { onClose } = mount();
    type("lithium");
    fireEvent.click(document.querySelector(".ui-backdrop")!);
    expect(track).toHaveBeenCalledWith("action", "search-drop", "lithium");
    expect(onClose).toHaveBeenCalled();
  });

  it("clamps what it records", () => {
    mount();
    type("x".repeat(300));
    key("Escape");
    expect(vi.mocked(track).mock.calls[0][2]).toHaveLength(120);
  });

  it("does not also count a successful search as abandoned", () => {
    mount();
    type("nvda");
    fireEvent.click(screen.getAllByRole("option")[0]);
    key("Escape");
    expect(vi.mocked(track).mock.calls.filter((c) => c[1] === "search-drop")).toHaveLength(0);
  });

  it("stays silent when the palette is opened and closed untouched", () => {
    mount();
    key("Escape");
    expect(track).not.toHaveBeenCalled();
  });
});
