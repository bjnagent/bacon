"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import BaconMark from "./BaconMark";

export interface LogEntry { id: number; text: string; kind: string }

const BOOT_LINES = [
  "> init lens array ............ 6 OK",
  "> link live web search ....... OK",
  "> arm scout daemon ........... OK",
  "> restore radar watchlist .... OK",
  "> calibrate convergence gauge  OK",
];

const HELP_TEXT = `COMMAND              ACTION
  <ticker>            deep-dive six lenses     NVDA   USD/JPY   BTC
  ANL <ticker>        deep-dive six lenses
  RADAR               scout + tracking home
  NEWS                market headlines
  MARKETS             live charts
  FRMK                lens reference
  SIZE                sizing & risk calc
  ACCOUNT             account settings
  ASK                 open the discuss panel
  CLS                 clear console
  HELP  ?             this reference

KEYS
  /  focus cmd     1-7  modules     ?  help     ESC  close`;

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
      <div className="pr-help" onClick={(e) => e.stopPropagation()}>
        <div className="pr-help-head"><span>BACON // COMMAND REFERENCE</span><button onClick={onClose} aria-label="Close"><X size={15} /></button></div>
        <pre className="pr-help-body">{HELP_TEXT}</pre>
        <div className="pr-help-foot">ESC to close</div>
      </div>
    </div>
  );
}

export function Console({ value, setValue, onRun, inputRef, log, onHistory }: {
  value: string;
  setValue: (v: string) => void;
  onRun: (v: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  log: LogEntry[];
  onHistory: (dir: number) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [log]);
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); onRun(value); setValue(""); }
    else if (e.key === "ArrowUp") { e.preventDefault(); onHistory(-1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onHistory(1); }
    else if (e.key === "Escape") { inputRef.current?.blur(); }
  };
  return (
    <div className="pr-console">
      <div className="pr-cmd" onClick={() => inputRef.current?.focus()}>
        <span className="pr-cmd-prompt">BACON</span><span className="pr-cmd-arrow">:~$</span>
        <span className="pr-cmd-text">{value}</span><span className="pr-cmd-cursor">█</span>
        {!value && <span className="pr-cmd-hint">type a ticker · RADAR · NEWS · MARKETS · HELP</span>}
        <input ref={inputRef} className="pr-cmd-input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={handleKey} spellCheck={false} autoComplete="off" aria-label="Command line" />
      </div>
      {log.length > 0 && (
        <div className="pr-log">
          {log.map((l) => <div key={l.id} className={`pr-log-line is-${l.kind}`}>{l.text}</div>)}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
