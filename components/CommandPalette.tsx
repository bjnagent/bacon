"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ArrowRight } from "lucide-react";

export interface PaletteAction { id: string; label: string; hint?: string; run: () => void }

// ⌘K / "/" command palette — the primary way to navigate and act. Type a ticker
// to analyze it, or a command (scout, news, size, frameworks, discuss).
export default function CommandPalette({ open, onClose, actions, onAnalyze }: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  onAnalyze: (sym: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => { setQ(""); setSel(0); inputRef.current?.focus(); }, 0);
    return () => clearTimeout(id);
  }, [open]);

  const ql = q.trim().toLowerCase();
  const filtered = actions.filter((a) => !ql || a.label.toLowerCase().includes(ql) || a.id.includes(ql));
  const results: PaletteAction[] = [
    ...(q.trim() ? [{ id: "__analyze", label: `Analyze “${q.trim().toUpperCase()}”`, hint: "six-lens deep-dive", run: () => onAnalyze(q.trim()) }] : []),
    ...filtered,
  ];
  const clampSel = Math.min(sel, Math.max(results.length - 1, 0));

  // Keep current results/selection in refs so the key handler doesn't re-bind
  // every render (and doesn't need them in its deps). Synced in an effect.
  const resultsRef = useRef(results);
  const selRef = useRef(clampSel);
  useEffect(() => { resultsRef.current = results; selRef.current = clampSel; });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, resultsRef.current.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); const r = resultsRef.current[selRef.current]; if (r) { r.run(); onClose(); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="pr-palette-wrap" onClick={onClose}>
      <div className="pr-palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="pr-palette-input">
          <Search size={16} />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Search a ticker, or a command — scout, news, size, frameworks…" aria-label="Command palette" />
        </div>
        <div className="pr-palette-list">
          {results.length === 0 && <div className="pr-palette-empty">No matches.</div>}
          {results.map((a, i) => (
            <button key={a.id} className={`pr-palette-item ${i === clampSel ? "is-sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => { a.run(); onClose(); }}>
              <span className="pr-palette-label">{a.label}</span>
              {a.hint && <span className="pr-palette-hint">{a.hint}</span>}
              <ArrowRight size={13} className="pr-palette-arrow" />
            </button>
          ))}
        </div>
        <div className="pr-palette-foot">↑↓ navigate · Enter to run · Esc to close</div>
      </div>
    </div>
  );
}
