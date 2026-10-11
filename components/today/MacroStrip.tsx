"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useApi } from "@/lib/client/api";
import s from "./MacroStrip.module.css";

interface MacroIndicator { key: string; label: string; value: string; unit: string; asOf: string; change: number | null }

// Macro is daily (some series monthly) and the route caches it for half an
// hour, so ten minutes on the client is plenty and switching tabs never refetches.
const TTL_MS = 600_000;

function shortDate(d: string): string {
  // FRED dates are calendar days (YYYY-MM-DD). Parse as UTC midnight and print
  // in UTC so a reader west of Greenwich doesn't see yesterday's date.
  const t = Date.parse(`${d}T00:00:00Z`);
  if (!Number.isFinite(t)) return d;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * The backdrop as a row of compact tiles (real FRED data, attributed).
 *
 * Direction is deliberately NEUTRAL in colour: higher rates, inflation or vol
 * aren't "good" or "bad" in themselves — this is context to read the ideas
 * against, not a signal. Each tile states the date of its observation, because
 * a monthly CPI print and yesterday's 10-year yield are not equally fresh.
 *
 * Renders nothing at all when there's no data (no FRED key, provider down):
 * an empty strip would only advertise a gap.
 */
export default function MacroStrip() {
  const { data, loading } = useApi<{ indicators?: MacroIndicator[]; source?: string }>("/api/macro", TTL_MS);
  const indicators = Array.isArray(data?.indicators) ? data!.indicators : [];

  if (loading && !indicators.length) {
    return (
      <div className={s.wrap} aria-hidden="true">
        <div className={s.head}><span className="t-eyebrow">Macro backdrop</span></div>
        <div className="hscroll">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className={`ui-skel ${s.skel}`} />)}
        </div>
      </div>
    );
  }
  if (!indicators.length) return null;

  return (
    <section className={s.wrap} aria-label="Macro backdrop">
      <div className={s.head}>
        <span className="t-eyebrow">Macro backdrop</span>
        <span className="t-caption">via {data?.source || "FRED"}</span>
      </div>
      <ul className={`hscroll ${s.strip}`}>
        {indicators.map((i) => {
          const dir = i.change == null || i.change === 0 ? 0 : i.change > 0 ? 1 : -1;
          const Arrow = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
          return (
            <li key={i.key} className={s.tile} title={`${i.label}: ${i.value}${i.unit} as of ${i.asOf} (FRED)`}>
              <span className={s.label}>{i.label}</span>
              <span className={s.value}>{i.value}<span className={s.unit}>{i.unit}</span></span>
              <span className={s.meta}>
                {i.change != null && (
                  <span className={s.change}>
                    <Arrow aria-hidden="true" />
                    <span className="sr-only">{dir > 0 ? "up" : dir < 0 ? "down" : "unchanged"}</span>
                    {Math.abs(i.change).toFixed(2)}
                  </span>
                )}
                <span>{shortDate(i.asOf)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
