"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Bottom sheet on phones, centred dialog (or side panel) on desktop. Escape and
 * the backdrop close it; focus moves in on open and back out on close; the page
 * behind stops scrolling while it is up.
 */
export function Sheet({ open, onClose, title, children, footer, variant = "dialog", full, labelledBy }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "dialog" | "wide" | "side";
  full?: boolean;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = requestAnimationFrame(() => {
      const el = ref.current?.querySelector<HTMLElement>("[autofocus], input, textarea, button:not([data-sheet-close])") ?? ref.current;
      el?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const f = ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      (lastFocus.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  const cls = ["ui-sheet", variant === "wide" && "is-wide", variant === "side" && "is-side", full && "is-full"].filter(Boolean).join(" ");
  return createPortal(
    <>
      <div className="ui-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={cls} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={!labelledBy && typeof title === "string" ? title : undefined} tabIndex={-1}>
        <div className="ui-sheet-grabber" aria-hidden="true" />
        {title !== undefined && (
          <div className="ui-sheet-head">
            <div className="ui-sheet-title">{title}</div>
            <button type="button" className="ui-iconbtn" aria-label="Close" data-sheet-close onClick={onClose}><X /></button>
          </div>
        )}
        <div className="ui-sheet-body">{children}</div>
        {footer && <div className="ui-sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
