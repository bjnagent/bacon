// Client-side behaviour tracking.
//
// Batched on a short timer rather than one request per interaction: moving
// between tabs fires several events in a second, and a request each would be
// more traffic than the feature is worth. The queue also flushes on page-hide
// via sendBeacon, which survives the tab closing — a normal fetch there is
// cancelled and the last events of every session would be lost, which is
// exactly the segment worth seeing.
//
// Never throws and never blocks: tracking that can break a user action is worse
// than no tracking.

interface Ev { kind: "view" | "action"; name: string; detail?: string }

const FLUSH_MS = 4000;
let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let bound = false;

function send(events: Ev[], beacon: boolean): void {
  if (!events.length) return;
  const body = JSON.stringify({ events });
  try {
    if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      // Returns false when the browser's beacon queue is full or the payload is
      // over its limit. Falling through to keepalive fetch gives those events a
      // second chance instead of dropping them silently — it may itself be
      // cancelled if the tab is already closing, which is no worse.
      if (navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }))) return;
    }
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => { /* analytics must never surface an error */ });
  } catch { /* ignore */ }
}

function flush(beacon = false): void {
  if (timer) { clearTimeout(timer); timer = null; }
  const batch = queue;
  queue = [];
  send(batch, beacon);
}

/** Record one event. Safe to call anywhere, including during render effects. */
export function track(kind: "view" | "action", name: string, detail?: string): void {
  if (typeof window === "undefined") return;
  queue.push({ kind, name, ...(detail ? { detail } : {}) });

  if (!bound) {
    bound = true;
    // `pagehide` fires on tab close, navigation and mobile backgrounding, where
    // `beforeunload` is unreliable on iOS.
    window.addEventListener("pagehide", () => flush(true));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(true); });
  }
  // Cap the queue so a runaway loop can't grow it without bound.
  if (queue.length >= 20) { flush(); return; }
  if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
}
