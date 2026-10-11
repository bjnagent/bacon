"use client";

import { useCallback, useSyncExternalStore } from "react";

export const DESKTOP = "(min-width: 900px)";

const hasMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * A media query as state. The server (and the hydration pass) assume
 * `serverValue`, then React re-renders with the real answer — no mismatch
 * warning, unlike reading window.innerWidth during render.
 */
export function useMedia(query: string, serverValue = false): boolean {
  const subscribe = useCallback((cb: () => void) => {
    if (!hasMatchMedia()) return () => {};
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, [query]);
  return useSyncExternalStore(
    subscribe,
    () => (hasMatchMedia() ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

// The account can pin a theme (<html data-theme>), which beats the system
// setting — embedded widgets must follow the same rule as the CSS tokens.
function subscribeTheme(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = hasMatchMedia() ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  mq?.addEventListener("change", cb);
  const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(cb) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => { mq?.removeEventListener("change", cb); mo?.disconnect(); };
}

function isDark(): boolean {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === "dark") return true;
  if (pinned === "light") return false;
  return hasMatchMedia() && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribeTheme, isDark, () => false);
}
