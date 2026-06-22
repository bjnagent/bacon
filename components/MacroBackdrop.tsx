"use client";

import { useEffect, useState } from "react";

interface MacroIndicator { key: string; label: string; value: string; unit: string; asOf: string; change: number | null }

// A compact strip of real macro indicators (FRED) shown on the Radar home, so
// every session opens with the current backdrop. Direction arrows are neutral
// (no green/red): up isn't inherently good for rates/inflation/vol — this is
// context to verify, not a signal.
export default function MacroBackdrop() {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/macro");
        const data = await res.json();
        if (!cancelled && Array.isArray(data.indicators)) setIndicators(data.indicators);
      } catch { /* silently omit the strip if unavailable */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!indicators.length) return null;

  return (
    <div className="pr-macro">
      <div className="pr-macro-head">Macro backdrop</div>
      <div className="pr-macro-strip">
        {indicators.map((i) => (
          <div key={i.key} className="pr-macro-item">
            <span className="pr-macro-lbl">{i.label}</span>
            <span className="pr-macro-val">{i.value}{i.unit}</span>
            {i.change != null && <span className="pr-macro-chg">{i.change >= 0 ? "▲" : "▼"} {Math.abs(i.change).toFixed(2)}</span>}
          </div>
        ))}
      </div>
      <div className="pr-macro-foot">via FRED · latest public data · verify yourself · not advice</div>
    </div>
  );
}
