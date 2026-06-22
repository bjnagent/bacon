// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import MacroBackdrop from "./MacroBackdrop";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("MacroBackdrop", () => {
  it("renders indicators returned by /api/macro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ indicators: [{ key: "y10", label: "10Y UST", value: "4.20", unit: "%", asOf: "2026-06-20", change: 0.03 }] }) })));
    render(<MacroBackdrop />);
    await waitFor(() => expect(screen.getByText("10Y UST")).toBeTruthy());
    expect(screen.getByText("4.20%")).toBeTruthy();
  });

  it("renders nothing when there are no indicators (e.g. no FRED key)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ indicators: [] }) })));
    const { container } = render(<MacroBackdrop />);
    await waitFor(() => expect(container.querySelector(".pr-macro")).toBeNull());
  });
});
