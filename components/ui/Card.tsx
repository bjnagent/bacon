import type { HTMLAttributes, ReactNode } from "react";

export function Card({ pad = "md", flat, className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { pad?: "none" | "md" | "lg"; flat?: boolean }) {
  const cls = ["ui-card", pad === "md" && "ui-card--pad", pad === "lg" && "ui-card--padlg", flat && "ui-card--flat", className].filter(Boolean).join(" ");
  return <div className={cls} {...rest}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <div className="t-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Section({ title, sub, action, children, id }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" id={id} aria-label={typeof title === "string" ? title : undefined}>
      {(title || action) && (
        <div className="section-head">
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {sub && <div className="section-sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Callout({ tone = "neutral", icon, children }: { tone?: "neutral" | "accent" | "warn" | "neg" | "info"; icon?: ReactNode; children: ReactNode }) {
  return <div className={`ui-callout${tone === "neutral" ? "" : ` ui-callout--${tone}`}`} role={tone === "neg" ? "alert" : undefined}>{icon}<div>{children}</div></div>;
}

export function EmptyState({ icon, title, body, actions }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ui-empty">
      {icon && <div className="ui-empty-icon" aria-hidden="true">{icon}</div>}
      <div className="ui-empty-title">{title}</div>
      {body && <p className="ui-empty-body">{body}</p>}
      {actions && <div className="ui-empty-actions">{actions}</div>}
    </div>
  );
}

export function Skeleton({ lines = 3, height, width, style }: { lines?: number; height?: number; width?: number | string; style?: React.CSSProperties }) {
  if (height) return <div className="ui-skel" style={{ height, width: width ?? "100%", borderRadius: 12, ...style }} aria-hidden="true" />;
  return (
    <div aria-hidden="true" style={style}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="ui-skel ui-skel-line" style={{ width: i === lines - 1 ? "62%" : "100%" }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ui-card ui-card--pad" aria-hidden="true">
      <div className="ui-skel" style={{ height: 18, width: "40%", marginBottom: 12 }} />
      <Skeleton lines={lines} />
    </div>
  );
}
