"use client";

import { useSyncExternalStore } from "react";

/**
 * A media query as state. False on the server and wherever matchMedia is
 * missing (tests), which is the touch-first answer for the queries used here.
 */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const m = window.matchMedia(query);
      m.addEventListener?.("change", onChange);
      return () => m.removeEventListener?.("change", onChange);
    },
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

/** A real keyboard and mouse: Enter sends, shortcuts are worth showing. */
export const FINE_POINTER = "(hover: hover) and (pointer: fine)";
