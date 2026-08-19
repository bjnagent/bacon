"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ArrowRight } from "lucide-react";
import { track } from "@/lib/track";

export interface PaletteAction { id: string; label: string; hint?: string; run: () => void }

// Queries land in the behaviour ledger, and the palette accepts arbitrary
// typing — a pasted wall of text would otherwise be stored verbatim.
const MAX_Q = 120;

// ⌘K / "/" command palette — the primary way to navigate and act. Type a ticker
// to analyze it, or a command (today, record, radar, news, discuss).
//
// This is the product's search box, so what gets typed here is recorded: which
// names people look for, and — the reason the tracking exists — which searches
// ended in nothing. A query typed and then abandoned is demand the product
// didn't serve, and it is invisible everywhere else.
export default function CommandPalette({ open, onClose, actions, onAnalyze }: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  onAnalyze: (sym: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // The live query, and whether anything was actually run this time round.
  // Abandonment is measured against the second: without it, every successful
  // search would also be recorded as a dead end on the way out.
  const qRef = useRef("");
  const actedRef = useRef(false);
  useEffect(() => { qRef.current = q; });

  useEffect(() => {
    if (!open) return;
    actedRef.current = false;
    const id = setTimeout(() => { setQ(""); setSel(0); inputRef.current?.focus(); }, 0);
    return () => clearTimeout(id);
  }, [open]);

  // Only the settled query is recorded — one event per visit to the palette,
  // on the way out. Recording as they type would put every prefix of "NVDA" in
  // the ledger and drown the signal in its own keystrokes.
  const close = () => {
    const typed = qRef.current.trim();
    if (typed && !actedRef.current) track("action", "search-drop", typed.slice(0, MAX_Q));
    onClose();
  };

  const commit = (a: PaletteAction) => {
    const typed = qRef.current.trim();
    // `__analyze` is the synthetic row: they searched for a NAME. Anything else
    // is a command match, which is navigation that happens to start with typing.
    if (typed) track("action", a.id === "__analyze" ? "search-run" : "search-nav", typed.slice(0, MAX_Q));
    actedRef.current = true;
    a.run();
    onClose();
  };

  const ql = q.trim().toLowerCase();
  const filtered = actions.filter((a) => !ql || a.label.toLowerCase().includes(ql) || a.id.includes(ql));
  const results: PaletteAction[] = [
    ...(q.trim() ? [{ id: "__analyze", label: `Analyze “${q.trim().toUpperCase()}”`, hint: "multi-lens deep-dive", run: () => onAnalyze(q.trim()) }] : []),
    ...filtered,
  ];
  const clampSel = Math.min(sel, Math.max(results.length - 1, 0));

  // Keep current results/selection in refs so the key handler doesn't re-bind
  // every render (and doesn't need them in its deps). Synced in an effect —
  // which is also why the two handlers above are reached through refs.
  const resultsRef = useRef(results);
  const selRef = useRef(clampSel);
  const commitRef = useRef(commit);
  const closeRef = useRef(close);
  useEffect(() => {
    resultsRef.current = results;
    selRef.current = clampSel;
    commitRef.current = commit;
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, resultsRef.current.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); const r = resultsRef.current[selRef.current]; if (r) commitRef.current(r); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="pr-palette-wrap" onClick={() => closeRef.current()}>
      <div className="pr-palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="pr-palette-input">
          <Search size={16} />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Search a ticker, or a command — today, radar, news, discuss…" aria-label="Command palette" />
        </div>
        <div className="pr-palette-list">
          {results.length === 0 && <div className="pr-palette-empty">No matches.</div>}
          {results.map((a, i) => (
            <button key={a.id} className={`pr-palette-item ${i === clampSel ? "is-sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => commit(a)}>
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
