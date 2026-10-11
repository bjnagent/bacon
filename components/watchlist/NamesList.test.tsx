// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NamesList } from "./NamesList";
import type { NameRow, Quote } from "./logic";

afterEach(cleanup);

const rows: NameRow[] = [
  { id: "a", symbol: "NVDA", asset_class: "Equity / Stock", lean: "constructive", update_text: "Capex commentary stayed firm.", last_scan_at: null, status: "ok" },
  { id: "b", symbol: "EUR/USD", asset_class: "FX / Currency pair", lean: null, update_text: null, last_scan_at: null, status: "pending" },
];
const quotes: Record<string, Quote> = {
  NVDA: { symbol: "NVDA", price: 187.62, changePct: 1.84, at: "2026-10-09", live: false, source: "daily close" },
};

describe("NamesList", () => {
  it("shows a provider quote with its staleness label, and nothing where there is no quote", () => {
    render(<NamesList rows={rows} quotes={quotes} refreshing={{}} onOpen={() => {}} />);
    expect(screen.getByText("187.62")).toBeTruthy();
    expect(screen.getByText("Close")).toBeTruthy();
    expect(screen.getByText("+1.84%")).toBeTruthy();
    // EUR/USD has no quote: no number, no label, no placeholder price.
    const fx = screen.getByText("EUR/USD").closest("button")!;
    expect(fx.textContent).not.toMatch(/\d+\.\d{2}/);
    expect(fx.textContent).not.toMatch(/Close|Live/);
  });

  it("labels an unread name as pending rather than guessing a stance", () => {
    render(<NamesList rows={rows} quotes={{}} refreshing={{}} onOpen={() => {}} />);
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText(/First read lands with tonight/)).toBeTruthy();
  });

  it("opens the tapped row and shows the refresh in progress", () => {
    const onOpen = vi.fn();
    render(<NamesList rows={rows} quotes={{}} refreshing={{ a: true }} onOpen={onOpen} />);
    expect(screen.getByText(/Reading the latest/)).toBeTruthy();
    fireEvent.click(screen.getByText("NVDA"));
    expect(onOpen).toHaveBeenCalledWith("a");
  });
});
