// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import ActivationCard from "./ActivationCard";

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

describe("ActivationCard", () => {
  it("points every step at the same name, so the three actions tell one story", () => {
    const p = props();
    render(<ActivationCard {...p} state={{ swept: true, tracked: false, analyzed: false }} />);

    fireEvent.click(screen.getByText("Track NVDA"));
    expect(p.onTrack).toHaveBeenCalledWith("NVDA", "Equity / Stock");

    fireEvent.click(screen.getByText("Analyze NVDA"));
    expect(p.onAnalyze).toHaveBeenCalledWith({ asset: "NVDA", cls: "Equity / Stock" });
  });

  it("labels blocked steps as waiting, never as the next thing to do", () => {
    const p = props();
    render(<ActivationCard {...p} state={{ swept: false, tracked: false, analyzed: false }} firstIdea={null} />);
    // Step one carries the live button, which is a stronger affordance than the
    // word "Next" — so no step should also be captioned that way.
    fireEvent.click(screen.getByText("Build brief"));
    expect(p.onSweep).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByText("Next")).toHaveLength(0);
    expect(screen.getAllByText("After the brief")).toHaveLength(2);
  });

  it("captions exactly one step as next when the live step has no button", () => {
    // Swept, but the brief yielded no idea to act on: step two is next and step
    // three must not claim to be as well.
    render(<ActivationCard {...props()} state={{ swept: true, tracked: false, analyzed: false }} firstIdea={null} />);
    expect(screen.getAllByText("Next")).toHaveLength(1);
    expect(screen.getAllByText("After the brief")).toHaveLength(1);
  });

  it("counts progress and hides itself once all three are done", () => {
    render(<ActivationCard {...props()} state={{ swept: true, tracked: true, analyzed: false }} />);
    expect(screen.getByText("2 of 3")).toBeTruthy();

    cleanup();
    render(<ActivationCard {...props()} state={{ swept: true, tracked: true, analyzed: true }} />);
    expect(screen.queryByLabelText("Getting started")).toBeNull();
  });

  it("stays dismissed across mounts", () => {
    render(<ActivationCard {...props()} state={{ swept: true, tracked: false, analyzed: false }} />);
    fireEvent.click(screen.getByLabelText("Dismiss getting started"));
    expect(screen.queryByLabelText("Getting started")).toBeNull();

    cleanup();
    render(<ActivationCard {...props()} state={{ swept: true, tracked: false, analyzed: false }} />);
    expect(screen.queryByLabelText("Getting started")).toBeNull();
  });

  it("offers theme suggestions only when the account has none", async () => {
    render(<ActivationCard {...props()} state={{ swept: true, tracked: false, analyzed: false }} />);
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
    render(<ActivationCard {...props()} state={{ swept: true, tracked: false, analyzed: false }} />);

    await screen.findByText("Track a name");
    expect(screen.queryByText("AI infrastructure")).toBeNull();
  });
});
