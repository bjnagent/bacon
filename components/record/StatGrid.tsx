import type { ReactNode } from "react";
import s from "./StatGrid.module.css";

// The headline tiles. Server-safe (no hooks) so the public /record page and the
// signed-in Record tab render the same component. Each tile carries a one-line
// explanation of what the number is, because a hit rate without its
// denominator is a claim, not a fact.

export interface Stat {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  /** Colour by sign only where the sign is the point (returns vs SPY). */
  tone?: "pos" | "neg";
}

export function StatGrid({ stats, label }: { stats: Stat[]; label: string }) {
  return (
    <dl className={s.grid} aria-label={label}>
      {stats.map((st) => (
        <div key={st.label} className={s.tile}>
          <dt className={s.label}>{st.label}</dt>
          <dd className={`${s.value} t-num${st.tone ? ` ${st.tone === "pos" ? "t-pos" : "t-neg"}` : ""}`}>{st.value}</dd>
          <dd className={s.sub}>{st.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatGridSkeleton() {
  return (
    <div className={s.grid} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={s.tile}>
          <div className="ui-skel" style={{ height: 12, width: "50%" }} />
          <div className="ui-skel" style={{ height: 28, width: "60%", marginTop: 10 }} />
          <div className="ui-skel" style={{ height: 10, width: "90%", marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}
