// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AppCtx, type AppApi } from "@/components/app/AppContext";
import type { Feature } from "@/lib/plans";
import AlertSettings from "./AlertSettings";

const settings = {
  scout_interval_minutes: 1440, last_sweep_at: null, news_source: "All", news_focus: "",
  brief_email_enabled: false, watch_enabled: true, voices: "@a, @b, @c", push_enabled: true,
  timezone: null, onboarded_at: null, updated_at: null,
};

vi.mock("@/lib/clientCache", () => ({
  cachedJson: () => Promise.resolve({ settings }),
  invalidate: vi.fn(),
}));
const openPaywall = vi.fn();
vi.mock("@/lib/client/paywall", () => ({ openPaywall: (r: unknown) => openPaywall(r) }));
const toastError = vi.fn();
vi.mock("@/components/ui/Toast", () => {
  const toast = Object.assign(vi.fn(), { error: (...a: unknown[]) => toastError(...a), info: vi.fn() });
  return { toast, Toaster: () => null, dismiss: vi.fn() };
});

function renderWith(features: Feature[] | null) {
  const app = {
    can: (f: Feature) => features == null || features.includes(f),
    me: features ? { plan: { plan: "free" } } : null,
  } as unknown as AppApi;
  const setVoicesOpen = vi.fn();
  render(
    <AppCtx.Provider value={app}>
      <AlertSettings title="Brief & alerts" voicesOpen={false} setVoicesOpen={setVoicesOpen} />
    </AppCtx.Provider>,
  );
  return { setVoicesOpen };
}

const sw = (name: string) => screen.findByRole("switch", { name }) as Promise<HTMLInputElement>;

beforeEach(() => {
  openPaywall.mockReset();
  toastError.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AlertSettings", () => {
  it("shows saved values as switches when the plan includes them", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWith(null);
    expect((await sw("Daily personal brief")).checked).toBe(true);
    expect((await sw("Kill-condition watch")).checked).toBe(true);
    expect((await sw("Morning email")).checked).toBe(false);
    expect(screen.getByText("@a, @b +1")).toBeTruthy();
  });

  it("saves a toggle with a PATCH and keeps the new value", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    renderWith(null);
    fireEvent.click(await sw("Morning email"));
    expect((await sw("Morning email")).checked).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/settings");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ brief_email_enabled: true });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("rolls back and says so when the save fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "nope" }), { status: 500 }))));
    renderWith(null);
    fireEvent.click(await sw("Kill-condition watch"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect((await sw("Kill-condition watch")).checked).toBe(true);
    expect(String(toastError.mock.calls[0][0])).toMatch(/Couldn't save kill-condition watch/);
  });

  it("rolls back silently on a 402 — the paywall is the message", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "Paid", code: "upgrade_required", reason: "feature", feature: "email_brief" }), { status: 402 }))));
    renderWith(null);
    fireEvent.click(await sw("Morning email"));
    await waitFor(() => expect((screen.getByRole("switch", { name: "Morning email" }) as HTMLInputElement).checked).toBe(false));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("turns paid rows into paywall doors on a plan without them", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWith(["house_brief"]);
    const row = (await screen.findByText("Kill-condition watch")).closest("button")!;
    expect(screen.queryByRole("switch", { name: "Kill-condition watch" })).toBeNull();
    fireEvent.click(row);
    expect(openPaywall).toHaveBeenCalledWith(expect.objectContaining({ reason: "feature", feature: "kill_watch", suggested: "pro" }));
  });

  it("explains notifications on the web instead of showing a switch", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWith(null);
    await sw("Daily personal brief");
    expect(screen.queryByRole("switch", { name: "Push notifications" })).toBeNull();
    expect(screen.getByText(/iOS app/)).toBeTruthy();
  });
});
