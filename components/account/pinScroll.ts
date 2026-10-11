"use client";

/**
 * Scroll `el` to the top of the viewport and keep it there while `container`
 * changes size — the plan card and the settings list above a deep-linked
 * section load after the link is followed, and each would otherwise push the
 * section back down the screen. Stops at the first sign the user is scrolling
 * themselves, or after `ms`. Returns the stop function.
 */
export function pinScroll(el: HTMLElement, container: HTMLElement, ms = 3000): () => void {
  const go = () => el.scrollIntoView({ block: "start" });
  go();
  if (typeof ResizeObserver === "undefined") return () => {};
  const ro = new ResizeObserver(go);
  ro.observe(container);
  const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  const t = setTimeout(stop, ms);
  events.forEach((e) => window.addEventListener(e, stop, { passive: true }));
  function stop() {
    ro.disconnect();
    clearTimeout(t);
    events.forEach((e) => window.removeEventListener(e, stop));
  }
  return stop;
}
