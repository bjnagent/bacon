// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ConvictionRadar from "./ConvictionRadar";
import { LENSES } from "@/lib/lenses";

afterEach(cleanup);

describe("ConvictionRadar", () => {
  it("renders a labelled axis for each lens + the data polygon", () => {
    const { container } = render(<ConvictionRadar stances={{ FUNDAMENTAL: "constructive", RISK: "cautious" }} />);
    expect(container.querySelectorAll("text.pr-radar-label").length).toBe(LENSES.length);
    expect(container.querySelector("path.pr-radar-poly")).toBeTruthy();
    expect(container.querySelectorAll("line.pr-radar-axis").length).toBe(LENSES.length);
  });
});
