// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CommandPalette from "./CommandPalette";

afterEach(cleanup);

describe("CommandPalette", () => {
  it("filters actions by query and runs the clicked one", () => {
    const sizerRun = vi.fn();
    const actions = [
      { id: "sizer", label: "Open Sizer", run: sizerRun },
      { id: "news", label: "News — market headlines", run: vi.fn() },
    ];
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions} onAnalyze={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "sizer" } });
    expect(screen.queryByText("News — market headlines")).toBeNull();
    fireEvent.click(screen.getByText("Open Sizer"));
    expect(sizerRun).toHaveBeenCalledTimes(1);
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
});
