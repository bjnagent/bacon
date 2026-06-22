// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FrameworksView from "./FrameworksView";

afterEach(cleanup);

describe("FrameworksView", () => {
  it("renders the six framework cards", () => {
    render(<FrameworksView />);
    expect(screen.getByText("Fundamental")).toBeTruthy();
    expect(screen.getByText("Factor / Quant")).toBeTruthy();
    expect(screen.getByText("Risk & Position Sizing")).toBeTruthy();
  });

  it("expands a card to reveal its playbook", () => {
    render(<FrameworksView />);
    fireEvent.click(screen.getByText("Technical"));
    expect(screen.getByText(/Trend \(moving averages\)/)).toBeTruthy();
  });
});
