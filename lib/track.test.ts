// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// `lib/track` keeps its queue in module scope, so each test re-imports a fresh
// copy — otherwise events leak between cases and the batching assertions pass
// for the wrong reason.
async function fresh() {
  vi.resetModules();
  return (await import("./track")).track;
}

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body) as {
  events: { kind: string; name: string; detail?: string }[];
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", fetchMock);
  // Absent by default so the timer path is exercised; the beacon test adds it.
  vi.stubGlobal("navigator", { sendBeacon: undefined });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("track", () => {
  it("batches events inside the flush window into one request", async () => {
    const track = await fresh();
    track("view", "today");
    track("view", "radar");
    track("action", "analyze", "NVDA");

    expect(fetchMock).not.toHaveBeenCalled();   // nothing sent yet — still batching
    await vi.advanceTimersByTimeAsync(4000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { events } = bodyOf(fetchMock.mock.calls[0]);
    expect(events).toEqual([
      { kind: "view", name: "today" },
      { kind: "view", name: "radar" },
      { kind: "action", name: "analyze", detail: "NVDA" },
    ]);
  });

  it("posts to the ingest route with keepalive so a navigating tab still delivers", async () => {
    const track = await fresh();
    track("view", "news");
    await vi.advanceTimersByTimeAsync(4000);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/track");
    const init = fetchMock.mock.calls[0][1] as { method: string; keepalive: boolean };
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
  });

  it("flushes early once the queue hits the cap, so a runaway loop can't grow it", async () => {
    const track = await fresh();
    for (let i = 0; i < 20; i++) track("view", `v${i}`);

    // Sent on the 20th without waiting for the timer.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0]).events).toHaveLength(20);
  });

  it("starts a new batch after a flush rather than resending the old one", async () => {
    const track = await fresh();
    track("view", "today");
    await vi.advanceTimersByTimeAsync(4000);
    track("view", "radar");
    await vi.advanceTimersByTimeAsync(4000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[1]).events).toEqual([{ kind: "view", name: "radar" }]);
  });

  it("does not fire an empty request when the timer lands on a drained queue", async () => {
    const track = await fresh();
    track("view", "today");
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses sendBeacon on pagehide — a normal fetch is cancelled as the tab closes", async () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    const track = await fresh();
    track("action", "discuss", "TSLA");

    window.dispatchEvent(new Event("pagehide"));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beacon.mock.calls[0][0]).toBe("/api/track");
    // The queue went out with the beacon, so the pending timer must not resend.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to fetch when the beacon queue rejects the payload", async () => {
    // sendBeacon returns false when its queue is full or the body is oversized.
    // Treating that as sent would drop the batch without a trace.
    const beacon = vi.fn(() => false);
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    const track = await fresh();
    track("view", "today");

    window.dispatchEvent(new Event("pagehide"));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0]).events).toEqual([{ kind: "view", name: "today" }]);
  });

  it("never throws when the transport fails — analytics must not break a user action", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    const track = await fresh();
    expect(() => track("view", "today")).not.toThrow();
    // The rejected fetch must be swallowed, not left to surface as an
    // unhandled rejection when the flush timer fires.
    await expect(vi.advanceTimersByTimeAsync(4000)).resolves.not.toThrow();
  });
});
