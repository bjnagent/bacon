// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CommandPalette from "./CommandPalette";
import { track } from "@/lib/track";

vi.mock("@/lib/track", () => ({ track: vi.fn() }));

afterEach(() => { cleanup(); vi.mocked(track).mockClear(); });

describe("CommandPalette", () => {
  it("filters actions by query and runs the clicked one", () => {
    const discussRun = vi.fn();
    const actions = [
      { id: "discuss", label: "Discuss", run: discussRun },
      { id: "news", label: "News — market headlines", run: vi.fn() },
    ];
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions} onAnalyze={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "discuss" } });
    expect(screen.queryByText("News — market headlines")).toBeNull();
    fireEvent.click(screen.getByText("Discuss"));
    expect(discussRun).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("offers an Analyze action for a typed ticker", () => {
    const onAnalyze = vi.fn();
    render(<CommandPalette open onClose={vi.fn()} actions={[]} onAnalyze={onAnalyze} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "nvda" } });
    fireEvent.click(screen.getByText(/Analyze/i));
    expect(onAnalyze).toHaveBeenCalledWith("nvda");
  });

  it("renders nothing when closed", () => {
    const { container } = render(<CommandPalette open={false} onClose={vi.fn()} actions={[]} onAnalyze={vi.fn()} />);
    expect(container.querySelector(".pr-palette")).toBeNull();
  });

  // The palette is the product's search box, so these assert the ledger gets
  // what the admin console reads back out of it.
  it("records a name search as run, with the query", () => {
    render(<CommandPalette open onClose={vi.fn()} actions={[]} onAnalyze={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  nvda " } });
    fireEvent.click(screen.getByText(/Analyze/i));
    expect(track).toHaveBeenCalledWith("action", "search-run", "nvda");
  });

  it("separates a command match from a name search", () => {
    render(<CommandPalette open onClose={vi.fn()} actions={[{ id: "radar", label: "Radar", run: vi.fn() }]} onAnalyze={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "radar" } });
    fireEvent.click(screen.getByText("Radar"));
    expect(track).toHaveBeenCalledWith("action", "search-nav", "radar");
  });

  // The point of the whole feature: a query nobody acted on is demand the
  // product didn't serve, and nothing else in the schema records it.
  it("records a typed-then-abandoned query on the way out", () => {
    render(<CommandPalette open onClose={vi.fn()} actions={[]} onAnalyze={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "quantum computing etf" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(track).toHaveBeenCalledWith("action", "search-drop", "quantum computing etf");
  });

  it("does not also count a successful search as abandoned", () => {
    render(<CommandPalette open onClose={vi.fn()} actions={[]} onAnalyze={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "nvda" } });
    fireEvent.click(screen.getByText(/Analyze/i));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(vi.mocked(track).mock.calls.filter((c) => c[1] === "search-drop")).toHaveLength(0);
  });

  it("stays silent when the palette is opened and closed untouched", () => {
    render(<CommandPalette open onClose={vi.fn()} actions={[]} onAnalyze={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(track).not.toHaveBeenCalled();
  });
});
