// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ConvictionRadar from "./ConvictionRadar";
import { LENSES } from "@/lib/lenses";

afterEach(cleanup);

describe("ConvictionRadar", () => {
  it("draws an axis and a label for every lens, plus the stance shape", () => {
    const { container } = render(<ConvictionRadar stances={{ FUNDAMENTAL: "constructive", RISK: "cautious" }} />);
    expect(container.querySelectorAll('[data-part="label"]').length).toBe(LENSES.length);
    expect(container.querySelectorAll('[data-part="axis"]').length).toBe(LENSES.length);
    expect(container.querySelector('[data-part="shape"]')).toBeTruthy();
  });

  it("marks only the lenses that have a stance (streaming lenses sit at the centre)", () => {
    const { container } = render(<ConvictionRadar stances={{ FUNDAMENTAL: "constructive", RISK: "cautious" }} />);
    expect(container.querySelectorAll('[data-part="point"]').length).toBe(2);
  });

  it("colours points with theme tokens, never hard-coded hex", () => {
    const { container } = render(<ConvictionRadar stances={{ MACRO: "mixed" }} />);
    const pt = container.querySelector('[data-part="point"]') as SVGElement;
    expect(pt.getAttribute("style")).toContain("var(--lens-macro)");
  });

  it("describes the stances for assistive tech", () => {
    const { getByRole } = render(<ConvictionRadar stances={{ TECHNICAL: "constructive" }} />);
    expect(getByRole("img").getAttribute("aria-label")).toMatch(/Technical: Constructive.*Risk: pending/);
  });
});
