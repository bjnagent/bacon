"use client";

// The signed-in app's side of the iOS shell. Renders nothing; every effect is a
// no-op in a browser. Lives inside <AppShell> because it needs the shell's
// navigate() and the account (/api/me).
//
// Root-level native duties that must also run when signed out (lifting the
// launch screen, routing universal links) live in components/PwaRegister.tsx.
//
// Native packages are never imported: everything goes through window.Capacitor
// (lib/native.ts), and the push / purchase modules load lazily, only in the app.

import { useEffect } from "react";
import { useApp } from "./AppContext";
import { hideSplash, isNative, plugin, setStatusBar } from "@/lib/native";
import { isAppPath } from "@/lib/client/routes";
import { cachedJson } from "@/lib/clientCache";
import { OPEN_URL_EVENT, type OpenUrlEvent } from "@/components/PwaRegister";

type Handle = { remove?: () => unknown };
type Listenable = { addListener?: (event: string, cb: (data: unknown) => void) => Handle | Promise<Handle> };

/** Subscribe to a native plugin event; returns an unsubscribe that is safe to call at any time. */
function on(pluginName: string, event: string, cb: (data: unknown) => void): () => void {
  const p = plugin(pluginName) as Listenable | null;
  if (!p?.addListener) return () => {};
  let handle: Handle | null = null;
  let removed = false;
  try {
    void Promise.resolve(p.addListener(event, cb)).then((h) => {
      handle = h ?? null;
      if (removed) void handle?.remove?.();
    }).catch(() => {});
  } catch { /* native polish is optional */ }
  return () => { removed = true; void handle?.remove?.(); };
}

export default function NativeBridge() {
  const { navigate, me } = useApp();
  const userId = me?.user?.id ?? null;

  // Launch screen: the shell holds it until the first real frame (PwaRegister
  // does the same for signed-out pages).
  useEffect(() => { hideSplash(); }, []);

  // Status bar text follows the theme actually on screen: a pinned
  // data-theme on <html>, else the system appearance.
  useEffect(() => {
    if (!isNative()) return;
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const pinned = root.dataset.theme;
      setStatusBar(pinned === "dark" || pinned === "light" ? pinned : mq.matches ? "dark" : "light");
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    mq.addEventListener("change", apply);
    return () => { mo.disconnect(); mq.removeEventListener("change", apply); };
  }, []);

  // Keyboard: the web view shrinks to the keyboard (resize "native"); flag it
  // so CSS can hide the tab bar instead of letting it ride up on the keys.
  useEffect(() => {
    if (!isNative()) return;
    const root = document.documentElement;
    const offShow = on("Keyboard", "keyboardWillShow", () => root.classList.add("kb-open"));
    const offHide = on("Keyboard", "keyboardWillHide", () => root.classList.remove("kb-open"));
    return () => { offShow(); offHide(); root.classList.remove("kb-open"); };
  }, []);

  // Universal links into app screens: switch screens in place, no reload.
  useEffect(() => {
    if (!isNative()) return;
    const onOpen = (e: Event) => {
      const path = (e as OpenUrlEvent).detail?.path;
      if (!path) return;
      const clean = path.replace(/#.*$/, "");
      if (!isAppPath(clean.split("?")[0])) return; // PwaRegister loads it as a page
      e.preventDefault();
      navigate(clean);
    };
    window.addEventListener(OPEN_URL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_URL_EVENT, onOpen);
  }, [navigate]);

  // Notification taps (including the one that cold-started the app): open the
  // screen the payload names.
  useEffect(() => {
    if (!isNative()) return;
    let off = () => {};
    let live = true;
    void import("@/lib/client/push").then((m) => {
      if (!live) return;
      off = m.onNotificationOpened((path) => {
        if (isAppPath(path.split(/[?#]/)[0])) navigate(path.replace(/#.*$/, ""));
        else window.location.assign(path);
      });
    }).catch(() => {});
    return () => { live = false; off(); };
  }, [navigate]);

  // Push registration: only when the user already allowed notifications (we
  // never prompt on launch) and hasn't switched them off in Settings.
  useEffect(() => {
    if (!isNative() || !userId) return;
    let live = true;
    void (async () => {
      const s = await cachedJson<{ settings?: { push_enabled?: boolean | null } }>("/api/settings", 60_000).catch(() => null);
      if (!live || s?.settings?.push_enabled === false) return;
      const m = await import("@/lib/client/push");
      if (live) await m.registerIfGranted();
    })().catch(() => {});
    return () => { live = false; };
  }, [userId]);

  // In-app purchases: RevenueCat's app user id = the Supabase user id, so the
  // App Store webhook credits the right account (it ignores anonymous
  // purchases). Idempotent per account; with no user, sign RevenueCat out.
  const meLoaded = !!me;
  useEffect(() => {
    if (!isNative() || !meLoaded) return;
    void import("@/lib/client/purchases")
      .then((m) => (userId ? m.identifyPurchaser(userId) : m.signOutPurchaser()))
      .catch(() => {});
  }, [meLoaded, userId]);

  return null;
}
