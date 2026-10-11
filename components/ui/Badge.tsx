import type { ReactNode } from "react";

export type Tone = "neutral" | "accent" | "pos" | "neg" | "warn" | "info" | "outline";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`ui-badge${tone === "neutral" ? "" : ` ui-badge--${tone}`}`} title={title}>{children}</span>;
}

export function Ticker({ children }: { children: ReactNode }) {
  return <span className="ui-ticker">{children}</span>;
}

/** A signed percentage, coloured by direction. */
export function Delta({ pct, digits = 2 }: { pct: number | null | undefined; digits?: number }) {
  if (pct == null || !Number.isFinite(pct)) return <span className="ui-delta is-flat">—</span>;
  const cls = pct > 0 ? "is-up" : pct < 0 ? "is-down" : "is-flat";
  return <span className={`ui-delta ${cls}`}>{pct > 0 ? "+" : ""}{pct.toFixed(digits)}%</span>;
}

export function Chip({ pressed, onClick, children, icon }: { pressed?: boolean; onClick?: () => void; children: ReactNode; icon?: ReactNode }) {
  return <button type="button" className="ui-chip" aria-pressed={pressed} onClick={onClick}>{icon}{children}</button>;
}

/** "x of y used" bar. */
export function UsageMeter({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const cls = pct >= 100 ? " is-out" : pct >= 80 ? " is-low" : "";
  return <div className={`ui-meter${cls}`} role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}><span style={{ width: `${pct}%` }} /></div>;
}
