"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A callback with a stable identity that always runs the latest closure.
 *
 * Needed for every `onClose` handed to <Sheet>: the sheet's focus/scroll-lock
 * effect depends on `onClose`, so a new function per render re-runs it — which
 * moves focus back to the opener and then into the first field on every
 * keystroke (and flickers the iOS keyboard).
 */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback((...args: A) => ref.current(...args), []);
}
