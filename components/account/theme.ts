"use client";

// The appearance preference: a per-device choice, so it lives in localStorage
// (key "bacon-theme"), not in the account. app/layout.tsx reads the same key
// before first paint, so a pinned theme never flashes the other one in.
//
// Exposed as a tiny external store so the segmented control reads it with
// useSyncExternalStore — correct on the server (always "system"), no
// setState-in-effect dance on hydration, and in sync across tabs.

import { setStatusBar } from "@/lib/native";

export type ThemePref = "system" | "light" | "dark";

const KEY = "bacon-theme";
const EVENT = "bacon-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** What's actually on screen once "system" is resolved. */
export function effectiveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  try { return window.matchMedia(DARK_QUERY).matches ? "dark" : "light"; } catch { return "light"; }
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* private mode: still apply for this session */ }
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  setStatusBar(effectiveTheme(pref));
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeTheme(onChange: () => void): () => void {
  // On "system", the iOS status bar has to follow the OS switching light/dark.
  const mq = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
  const onScheme = () => { if (readTheme() === "system") setStatusBar(effectiveTheme("system")); };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    // Another tab changed it: mirror it here too.
    const pref = readTheme();
    if (pref === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = pref;
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  mq?.addEventListener?.("change", onScheme);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    mq?.removeEventListener?.("change", onScheme);
  };
}

export const serverTheme = (): ThemePref => "system";
