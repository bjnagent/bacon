"use client";

import type { ReactNode } from "react";
import { haptic } from "@/lib/native";

export interface SegOption<T extends string> { value: T; label: ReactNode; icon?: ReactNode }

export function Segmented<T extends string>({ value, onChange, options, block, label }: {
  value: T; onChange: (v: T) => void; options: SegOption<T>[]; block?: boolean; label: string;
}) {
  return (
    <div className={`ui-seg${block ? " ui-seg--block" : ""}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="tab" aria-selected={o.value === value} className="ui-seg-btn"
          onClick={() => { if (o.value !== value) { haptic("selection"); onChange(o.value); } }}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
