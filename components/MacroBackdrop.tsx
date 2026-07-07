"use client";

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/clientCache";

interface MacroIndicator { key: string; label: string; value: string; unit: string; asOf: string; change: number | null }

// A compact strip of real macro indicators (FRED) shown on the Radar home, so
// every session opens with the current backdrop. Direction arrows are neutral
// (no green/red): up isn't inherently good for rates/inflation/vol — this is
// context to verify, not a signal.
export default function MacroBackdrop() {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await cachedJson<{ indicators?: MacroIndicator[] }>("/api/macro", 600_000);
        if (!cancelled && Array.isArray(data.indicators)) setIndicators(data.indicators);
      } catch { /* silently omit the strip if unavailable */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="pr-macro" aria-hidden="true">
        <div className="pr-macro-head">Macro backdrop</div>
        <div className="pr-macro-skel">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="pr-skel" />)}</div>
      </div>
    );
  }
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
