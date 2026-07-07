"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

// Generic right slide-over for utility surfaces (e.g. Account) so they're
// tools you pull up over your work — not full-page destinations.
export default function ToolPanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="pr-tool-wrap" onClick={onClose}>
      <div className="pr-tool" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="pr-tool-head"><span>{title}</span><button onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="pr-tool-body">{children}</div>
      </div>
    </div>
  );
}
