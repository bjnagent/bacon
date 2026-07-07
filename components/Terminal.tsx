"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import BaconMark from "./BaconMark";

const BOOT_LINES = [
  "> init lens array ............ 6 OK",
  "> link live web search ....... OK",
  "> arm scout daemon ........... OK",
  "> restore radar watchlist .... OK",
  "> calibrate convergence gauge  OK",
];

const HELP_TEXT = `NAVIGATION
  ⌘K  or  /          open the command palette
  type a ticker  →   six-lens analysis
  Discover           radar dashboard + news
  Analyze            the asset workspace (chart + lenses)
  Discuss            contextual chat (the ● button)

KEYS
  ⌘K  /   palette     ?   this help     ESC   close`;

export function Boot({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= BOOT_LINES.length) { const t = setTimeout(onDone, 650); return () => clearTimeout(t); }
    const t = setTimeout(() => setN((x) => x + 1), n === 0 ? 220 : 150);
    return () => clearTimeout(t);
  }, [n, onDone]);
  useEffect(() => {
    const skip = () => onDone();
    window.addEventListener("keydown", skip); window.addEventListener("click", skip);
    return () => { window.removeEventListener("keydown", skip); window.removeEventListener("click", skip); };
  }, [onDone]);
  return (
    <div className="pr-boot">
      <div className="pr-boot-inner">
        <div className="pr-boot-prism"><BaconMark size={88} /></div>
        <div className="pr-boot-title">BACON RESEARCH RADAR</div>
        <div className="pr-boot-ver">v3.0 · scout · track · analyze</div>
        <div className="pr-boot-log">
          {BOOT_LINES.slice(0, n).map((l, i) => <div key={i} className="pr-boot-line">{l}</div>)}
          {n < BOOT_LINES.length && <span className="pr-boot-cursor">█</span>}
        </div>
        {n >= BOOT_LINES.length && <div className="pr-boot-ready">READY ▸ press any key</div>}
      </div>
    </div>
  );
}

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="pr-help-wrap" onClick={onClose}>
      <div className="pr-help" role="dialog" aria-modal="true" aria-label="Command reference" onClick={(e) => e.stopPropagation()}>
        <div className="pr-help-head"><span>BACON // COMMAND REFERENCE</span><button onClick={onClose} aria-label="Close"><X size={15} /></button></div>
        <pre className="pr-help-body">{HELP_TEXT}</pre>
        <div className="pr-help-foot">ESC to close</div>
      </div>
    </div>
  );
}
