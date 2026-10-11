"use client";

import { useSyncExternalStore } from "react";

// A shared minute clock for relative labels ("Updated 5h ago") and the local
// date. Two reasons it isn't just `Date.now()` in render: the server renders
// in UTC and the reader may not be, so a date computed there would mismatch on
// hydration (the server snapshot is 0 and callers render nothing until the
// client takes over); and one interval for every label beats one per card.

let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const subs = new Set<() => void>();

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    timer = setInterval(() => { now = Date.now(); subs.forEach((f) => f()); }, 30_000);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) { clearInterval(timer); timer = undefined; }
  };
}

function snapshot() {
  // Refresh lazily too, so a pane that becomes visible after a long time
  // hidden doesn't render with a clock frozen at its last tick.
  const t = Date.now();
  if (!now || t - now >= 30_000) now = t;
  return now;
}

const serverSnapshot = () => 0;

/** Milliseconds since epoch on the client (ticks every 30s); 0 during SSR. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
