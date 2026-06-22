// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SizerView from "./SizerView";

afterEach(cleanup);

describe("SizerView", () => {
  it("renders default risk-based sizing wired to lib/calc", () => {
    render(<SizerView />);
    // defaults: account 10000, risk 1%, entry 100, stop 92
    expect(screen.getByText("Capital at risk")).toBeTruthy();
    expect(screen.getByText("12.5 u")).toBeTruthy();   // units
    expect(screen.getByText("$1,250")).toBeTruthy();    // position value
  });

  it("switches to the DCF panel", () => {
    render(<SizerView />);
    fireEvent.click(screen.getByRole("button", { name: /DCF/i }));
    expect(screen.getByText("Intrinsic / share")).toBeTruthy();
  });

  it("switches to risk metrics", () => {
    render(<SizerView />);
    fireEvent.click(screen.getByRole("button", { name: /Risk metrics/i }));
    expect(screen.getByText("Sharpe ratio")).toBeTruthy();
  });
});
