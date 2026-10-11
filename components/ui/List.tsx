"use client";

import type { ReactNode, MouseEventHandler } from "react";
import { ChevronRight } from "lucide-react";
import { haptic } from "@/lib/native";

export function List({ title, footer, children }: { title?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div>
      {title && <div className="ui-list-title t-eyebrow">{title}</div>}
      <div className="ui-list">{children}</div>
      {footer && <div className="ui-list-foot">{footer}</div>}
    </div>
  );
}

export interface RowProps {
  icon?: ReactNode;
  iconBg?: string;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  danger?: boolean;
  href?: string;
  onClick?: MouseEventHandler;
  disabled?: boolean;
}

export function Row({ icon, iconBg, title, sub, value, trailing, chevron, danger, href, onClick, disabled }: RowProps) {
  const cls = ["ui-row", icon && "has-icon", danger && "is-danger"].filter(Boolean).join(" ");
  const inner = (
    <>
      {icon && <span className="ui-row-icon" style={iconBg ? { background: iconBg, color: "#fff" } : undefined} aria-hidden="true">{icon}</span>}
      <span className="ui-row-body">
        <span className="ui-row-title" style={{ display: "block" }}>{title}</span>
        {sub && <span className="ui-row-sub" style={{ display: "block" }}>{sub}</span>}
      </span>
      {value != null && <span className="ui-row-value">{value}</span>}
      {trailing}
      {(chevron || href) && <ChevronRight className="ui-row-chev" aria-hidden="true" />}
    </>
  );
  if (href) return <a className={cls} href={href}>{inner}</a>;
  if (onClick) return <button type="button" className={cls} onClick={(e) => { haptic("light"); onClick(e); }} disabled={disabled}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <span className="ui-switch">
      <input
        type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled}
        onChange={(e) => { haptic("selection"); onChange(e.target.checked); }}
      />
      <span className="ui-switch-track" />
      <span className="ui-switch-thumb" />
    </span>
  );
}
