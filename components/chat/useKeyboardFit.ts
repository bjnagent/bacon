"use client";

// Keep a sheet's composer above the on-screen keyboard.
//
// In Safari (and a WKWebView without a native keyboard-resize setting) the
// keyboard does not shrink the layout viewport; it only shrinks the *visual*
// viewport. A fixed, full-height sheet therefore keeps its full height, the
// keyboard covers its bottom, and Safari pans the page to reveal the focused
// field — pushing the sheet's header off the top of the screen. While the
// keyboard is up, this pins the sheet to exactly the visible area instead, the
// way a native chat screen behaves.
//
// It does nothing when there is no keyboard (desktop), when the web view
// already resizes for the keyboard (innerHeight shrinks with it, so nothing is
// covered), or while the user is pinch-zoomed.

import { useEffect, type RefObject } from "react";

export interface ViewportLike { height: number; offsetTop: number; scale: number }
export interface Fit { top: number; height: number }

/** Below this, the "covered" area is browser chrome, not a keyboard. */
const KEYBOARD_MIN = 120;

/** Where the sheet should sit while a keyboard covers part of the layout viewport, or null for "leave it alone". */
export function keyboardFit(vv: ViewportLike, innerHeight: number, safeTop: number, gap = 8): Fit | null {
  if (vv.scale > 1.05) return null;
  if (innerHeight - vv.height < KEYBOARD_MIN) return null;
  const top = Math.max(vv.offsetTop + gap, safeTop);
  return { top, height: Math.max(0, Math.round(vv.offsetTop + vv.height - top)) };
}

const PROPS = ["top", "bottom", "height", "max-height", "padding-bottom", "transform", "animation"] as const;

export function useKeyboardFit(active: boolean, anchor: RefObject<HTMLElement | null>, selector = ".ui-sheet") {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia?.("(pointer: coarse)").matches) return;

    // env(safe-area-inset-top) in px, so the sheet never slides under the status bar.
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)";
    document.body.appendChild(probe);
    const safeTop = probe.offsetHeight;
    probe.remove();

    let raf = 0;
    let applied: HTMLElement | null = null;
    const clear = () => {
      if (applied) PROPS.forEach((p) => applied!.style.removeProperty(p));
      applied = null;
    };
    const apply = () => {
      raf = 0;
      const el = anchor.current?.closest<HTMLElement>(selector) ?? null;
      // A centred desktop dialog (iPad width) is positioned by transform; only
      // the phone sheet and the side panel are edge-anchored and safe to pin.
      const pinnable = !!el && (el.classList.contains("is-side") || window.innerWidth < 900);
      const fit = el && pinnable ? keyboardFit(vv, window.innerHeight, safeTop) : null;
      if (!el || !fit) { clear(); return; }
      applied = el;
      el.style.setProperty("top", `${fit.top}px`);
      el.style.setProperty("bottom", "auto");
      el.style.setProperty("height", `${fit.height}px`);
      el.style.setProperty("max-height", "none");
      // The keyboard covers the home-indicator inset, so don't pad for it.
      el.style.setProperty("padding-bottom", "0px");
      el.style.setProperty("transform", "none");
      el.style.setProperty("animation", "none");
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    schedule();
    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      if (raf) cancelAnimationFrame(raf);
      clear();
    };
  }, [active, anchor, selector]);
}
