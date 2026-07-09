// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import MacroBackdrop from "./MacroBackdrop";

afterEach(() => { cleanup(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* no-op */ } });

const oneIndicator = () => vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ indicators: [{ key: "y10", label: "10Y UST", value: "4.20", unit: "%", asOf: "2026-06-20", change: 0.03 }] }) })));

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

  it("is collapsed by default with a one-line peek, and expands on click", async () => {
    oneIndicator();
    const { container } = render(<MacroBackdrop />);
    const btn = await screen.findByRole("button", { name: /macro backdrop/i });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".pr-macro.is-collapsed")).toBeTruthy();
    expect(screen.getByText(/10Y UST 4\.20%/)).toBeTruthy(); // peek line
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".pr-macro.is-collapsed")).toBeNull();
  });

  it("remembers the expanded preference across mounts", async () => {
    localStorage.setItem("bacon:macro-collapsed", "0");
    oneIndicator();
    render(<MacroBackdrop />);
    const btn = await screen.findByRole("button", { name: /macro backdrop/i });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});
