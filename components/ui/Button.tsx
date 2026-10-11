"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { haptic } from "@/lib/native";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  /** Light tap feedback in the iOS app. Off for purely navigational buttons. */
  feedback?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", block, loading, icon, feedback = true, className, children, disabled, onClick, ...rest },
  ref,
) {
  const cls = [
    "ui-btn",
    variant !== "secondary" && `ui-btn--${variant}`,
    size !== "md" && `ui-btn--${size}`,
    block && "ui-btn--block",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button
      ref={ref}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => { if (feedback) haptic("light"); onClick?.(e); }}
      {...rest}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button aria-label={label} title={label} className={["ui-iconbtn", active && "is-on", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </button>
  );
}
