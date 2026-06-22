"use client";

import { useState } from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { FRAMEWORKS, PHILOSOPHY } from "@/lib/lenses";
import Spectrum from "./Spectrum";

// The six analytical lenses as a reference: playbook, terms, caveat. Static port.
export default function FrameworksView() {
  const [open, setOpen] = useState<string | null>("FUNDAMENTAL");
  return (
    <div className="pr-view">
      <div className="pr-fw-intro">
        <h2 className="pr-section-title">The latticework</h2>
        <Spectrum height={5} className="pr-fw-spectrum" />
        <p className="pr-fw-philosophy">{PHILOSOPHY}</p>
      </div>
      <div className="pr-fw-list">
        {FRAMEWORKS.map((f) => {
          const isOpen = open === f.key;
          return (
            <div key={f.key} className={`pr-fw-card ${isOpen ? "is-open" : ""}`} style={{ "--h": f.hue } as React.CSSProperties}>
              <button className="pr-fw-card-head" onClick={() => setOpen(isOpen ? null : f.key)} aria-expanded={isOpen}>
                <span className="pr-fw-dot" style={{ background: f.hue }} />
                <span className="pr-fw-name">{f.name}</span>
                <span className="pr-fw-summary">{f.summary}</span>
                <ChevronDown size={18} className={`pr-fw-chev ${isOpen ? "is-open" : ""}`} />
              </button>
              {isOpen && (
                <div className="pr-fw-body">
                  <div className="pr-fw-plays">{f.playbook.map((pl, i) => <div key={i} className="pr-fw-play"><div className="pr-fw-play-h">{pl.h}</div><div className="pr-fw-play-p">{pl.p}</div></div>)}</div>
                  <div className="pr-fw-terms">{f.terms.map((t) => <span key={t} className="pr-fw-term">{t}</span>)}</div>
                  <div className="pr-fw-caveat" style={{ "--h": f.hue } as React.CSSProperties}><AlertTriangle size={14} /> {f.caveat}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
