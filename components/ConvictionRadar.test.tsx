// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ConvictionRadar from "./ConvictionRadar";

afterEach(cleanup);

describe("ConvictionRadar", () => {
  it("renders a labelled axis for each of the six lenses + the data polygon", () => {
    const { container } = render(<ConvictionRadar stances={{ FUNDAMENTAL: "constructive", RISK: "cautious" }} />);
    expect(container.querySelectorAll("text.pr-radar-label").length).toBe(6);
    expect(container.querySelector("path.pr-radar-poly")).toBeTruthy();
    expect(container.querySelectorAll("line.pr-radar-axis").length).toBe(6);
  });
});
