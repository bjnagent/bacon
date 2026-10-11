"use client";

import { useSyncExternalStore } from "react";
import { isNative } from "@/lib/native";

const noop = () => () => {};

/**
 * True inside the iOS app. Read through useSyncExternalStore so the server
 * render (always "web") and the first client render agree, then it flips
 * without a hydration mismatch.
 */
export function useIsNative(): boolean {
  return useSyncExternalStore(noop, isNative, () => false);
}
