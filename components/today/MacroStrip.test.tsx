// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import MacroStrip from "./MacroStrip";

let macro: unknown = {};
vi.mock("@/lib/clientCache", () => ({
  cachedJson: () => Promise.resolve(macro),
  invalidate: () => {},
}));

afterEach(() => { cleanup(); macro = {}; });

const Y10 = { key: "y10", label: "10Y UST", value: "4.20", unit: "%", asOf: "2026-10-09", change: 0.03 };

describe("MacroStrip", () => {
  it("renders each indicator as a tile with its value, unit, direction and date", async () => {
    macro = { indicators: [Y10, { key: "vix", label: "VIX", value: "15.2", unit: "", asOf: "2026-10-09", change: -0.4 }], source: "FRED" };
    render(<MacroStrip />);
    expect(await screen.findByText("10Y UST")).toBeTruthy();
    expect(screen.getByLabelText("Macro backdrop")).toBeTruthy();
    expect(screen.getByText("via FRED")).toBeTruthy();
    // Value and unit are rendered together; direction is spelled out for screen readers.
    expect(screen.getByText("4.20").textContent).toBe("4.20%");
    expect(screen.getByText("up")).toBeTruthy();
    expect(screen.getByText("down")).toBeTruthy();
    // Each tile states how fresh its observation is.
    expect(screen.getAllByText(/Oct 9/)).toHaveLength(2);
  });

  it("renders nothing when there are no indicators (e.g. no FRED key)", async () => {
    macro = { indicators: [], source: "FRED" };
    const { container } = render(<MacroStrip />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("renders nothing when the request fails", async () => {
    macro = { error: "Not signed in", code: "unauthenticated" };
    const { container } = render(<MacroStrip />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });
});
