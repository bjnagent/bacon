// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import ActivationChecklist from "./ActivationChecklist";

const themes: unknown[] = [];
vi.mock("@/lib/clientCache", () => ({
  cachedJson: () => Promise.resolve({ themes }),
  invalidate: () => {},
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const IDEA = { sym: "NVDA", cls: "Equity / Stock" };
const props = () => ({ firstIdea: IDEA, onSweep: vi.fn(), onTrack: vi.fn(), onAnalyze: vi.fn() });

beforeEach(() => {
  themes.length = 0;
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ActivationChecklist", () => {
  it("points every step at the same name, so the three actions tell one story", () => {
    const p = props();
    render(<ActivationChecklist {...p} state={{ swept: true, tracked: false, analyzed: false }} />);

    fireEvent.click(screen.getByText(/Track NVDA/));
    expect(p.onTrack).toHaveBeenCalledWith("NVDA", "Equity / Stock");

    fireEvent.click(screen.getByText(/Run lenses on NVDA/));
    expect(p.onAnalyze).toHaveBeenCalledWith({ asset: "NVDA", cls: "Equity / Stock" });
  });

  it("labels blocked steps as waiting, never as the next thing to do", () => {
    render(<ActivationChecklist {...props()} state={{ swept: false, tracked: false, analyzed: false }} firstIdea={null} />);
    // Step one carries the live button, which is a stronger affordance than the
    // word "next" — so no step should also be captioned that way.
    expect(screen.getByText("Sweep now")).toBeTruthy();
    expect(screen.queryAllByText("next")).toHaveLength(0);
    expect(screen.getAllByText("after the brief")).toHaveLength(2);
  });

  it("captions exactly one step as next when the live step has no button", () => {
    // Swept, but the brief yielded no idea to act on: step two is next and step
    // three must not claim to be as well.
    render(<ActivationChecklist {...props()} state={{ swept: true, tracked: false, analyzed: false }} firstIdea={null} />);
    expect(screen.getAllByText("next")).toHaveLength(1);
    expect(screen.getAllByText("after the brief")).toHaveLength(1);
  });

  it("counts progress and hides itself once all three are done", () => {
    const { container } = render(<ActivationChecklist {...props()} state={{ swept: true, tracked: true, analyzed: false }} />);
    expect(screen.getByText("2 of 3")).toBeTruthy();

    cleanup();
    const done = render(<ActivationChecklist {...props()} state={{ swept: true, tracked: true, analyzed: true }} />);
    expect(done.container.querySelector(".pr-checklist")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("stays dismissed across mounts", () => {
    render(<ActivationChecklist {...props()} state={{ swept: true, tracked: false, analyzed: false }} />);
    fireEvent.click(screen.getByLabelText("Dismiss getting started"));
    expect(screen.queryByLabelText("Getting started")).toBeNull();

    cleanup();
    const again = render(<ActivationChecklist {...props()} state={{ swept: true, tracked: false, analyzed: false }} />);
    expect(again.container.querySelector(".pr-checklist")).toBeNull();
  });

  it("offers theme suggestions only when the account has none", async () => {
    render(<ActivationChecklist {...props()} state={{ swept: true, tracked: false, analyzed: false }} />);
    const chip = await screen.findByText("AI infrastructure");

    fireEvent.click(chip);
    await waitFor(() => {
      const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
        .find((c: unknown[]) => c[0] === "/api/themes");
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as { body: string }).body)).toEqual({ label: "AI infrastructure" });
    });
  });

  it("leaves the theme nudge out for an account that already has themes", async () => {
    themes.push({ id: "1", label: "Semiconductors" });
    render(<ActivationChecklist {...props()} state={{ swept: true, tracked: false, analyzed: false }} />);

    await screen.findByText("Track a name");
    expect(screen.queryByText("AI infrastructure")).toBeNull();
  });
});
