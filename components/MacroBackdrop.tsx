"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cachedJson } from "@/lib/clientCache";

interface MacroIndicator { key: string; label: string; value: string; unit: string; asOf: string; change: number | null }

const COLLAPSE_KEY = "bacon:macro-collapsed";

// A compact strip of real macro indicators (FRED) shown on the Radar home, so
// every session opens with the current backdrop. Direction arrows are neutral
// (no green/red): up isn't inherently good for rates/inflation/vol — this is
// context to verify, not a signal. Collapsible (collapsed by default) so it
// stays out of the way; the preference is remembered per browser.
export default function MacroBackdrop() {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  // Collapsed by default; restore the saved preference at first render. Safe
  // for SSR (the first paint is the loading skeleton, which ignores this).
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) !== "0"; } catch { return true; }
  });

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

  const toggle = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* not persisted */ }
    return next;
  });

  if (loading) {
    return (
      <div className="pr-macro" aria-hidden="true">
        <div className="pr-macro-head">Macro backdrop</div>
        <div className="pr-macro-skel">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="pr-skel" />)}</div>
      </div>
    );
  }
  if (!indicators.length) return null;

  // One-line peek when collapsed — a glance still gives the backdrop. Rendered
  // as a single text node so it never collides with the strip's own values.
  const peek = indicators.slice(0, 5).map((i) => `${i.label} ${i.value}${i.unit}`).join("   ·   ");

  return (
    <div className={`pr-macro ${collapsed ? "is-collapsed" : ""}`}>
      <button className="pr-macro-bar" onClick={toggle} aria-expanded={!collapsed}>
        <span className="pr-macro-head">Macro backdrop</span>
        {collapsed && <span className="pr-macro-peek">{peek}</span>}
        <ChevronDown size={15} className={`pr-fw-chev ${!collapsed ? "is-open" : ""}`} />
      </button>
      <div className="pr-macro-drawer">
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
    </div>
  );
}
