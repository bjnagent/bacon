"use client";

import { useEffect } from "react";
import { hideSplash, isNative, openExternal, plugin } from "@/lib/native";

/**
 * Fired on window for every universal link the iOS app is opened with, before
 * the default full-page navigation. Cancelable: the signed-in shell
 * (components/app/NativeBridge.tsx) calls preventDefault() and routes app
 * paths client-side instead.
 */
export const OPEN_URL_EVENT = "bacon:open-url";
export type OpenUrlEvent = CustomEvent<{ path: string }>;

/** The in-app path of a universal link, or null if it isn't one of ours. */
export function pathFromOpenUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return (u.pathname || "/") + u.search + u.hash;
  } catch {
    return null;
  }
}

// Platform glue mounted by the root layout on EVERY page (signed in or not).
//
// In a browser: registers the service worker (production only — dev caching
// causes confusion).
//
// In the iOS app: never registers it. WKWebView in a third-party app only runs
// service workers on App-Bound Domains, which the shell deliberately doesn't
// use (capacitor.config.ts); and even where one could run, a worker caching
// navigations would fight the two things the shell relies on: web deploys
// reaching the app instantly, and the bundled native offline screen
// (server.errorPath). Instead, on every page:
//   - lift the launch screen (the shell keeps it up until the web says so —
//     this covers /login and /welcome, which have no app shell);
//   - route universal links (App plugin `appUrlOpen`);
//   - open off-site links, and any target="_blank" link, in the in-app Safari
//     sheet instead of bouncing the user out to the Safari app;
//   - on /login (where sign-out and expired sessions land) sign RevenueCat
//     out, so a purchase can never be credited to the previous account.
export default function PwaRegister() {
  useEffect(() => {
    if (isNative()) {
      hideSplash();
      if (window.location.pathname.startsWith("/login")) {
        void import("@/lib/client/purchases").then((m) => m.signOutPurchaser()).catch(() => {});
      }
      // Belt and braces: drop any worker a pre-release build may have left.
      try {
        void navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => void r.unregister())).catch(() => {});
      } catch { /* not available in the shell */ }

      const app = plugin("App") as { addListener?: (e: string, cb: (d: { url?: string }) => void) => unknown } | null;
      let handle: { remove?: () => unknown } | null = null;
      let gone = false;
      const onOpen = (d: { url?: string }) => {
        const path = d?.url ? pathFromOpenUrl(d.url) : null;
        if (!path) return;
        const ev: OpenUrlEvent = new CustomEvent(OPEN_URL_EVENT, { detail: { path }, cancelable: true });
        // Nobody routed it client-side (signed out, or not an app screen): load it.
        if (window.dispatchEvent(ev) && path !== window.location.pathname + window.location.search + window.location.hash) {
          window.location.assign(path);
        }
      };
      try {
        if (app?.addListener) void Promise.resolve(app.addListener("appUrlOpen", onOpen)).then((h) => {
          handle = (h as { remove?: () => unknown }) ?? null;
          if (gone) void handle?.remove?.();
        }).catch(() => {});
      } catch { /* native polish is optional */ }
      const onClick = (e: MouseEvent) => {
        // Bubble phase: React's own handlers (and their preventDefault) run first.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!a || a.hasAttribute("download")) return;
        let url: URL;
        try { url = new URL(a.href, window.location.href); } catch { return; }
        if (url.protocol !== "https:" && url.protocol !== "http:") return; // mailto:, tel: → the system
        if (url.origin === window.location.origin && a.target !== "_blank") return; // ordinary in-app link
        e.preventDefault();
        openExternal(url.href);
      };
      document.addEventListener("click", onClick);
      return () => { gone = true; void handle?.remove?.(); document.removeEventListener("click", onClick); };
    }

    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* PWA is progressive — registration failure is fine */ });
  }, []);
  return null;
}
