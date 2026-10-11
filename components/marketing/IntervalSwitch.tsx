"use client";

import { useState, type ReactNode } from "react";
import { Segmented } from "@/components/ui";
import s from "./Pricing.module.css";

type Interval = "month" | "year";

// The pricing page's only JavaScript. Both prices are already in the server
// HTML (marked .onlyMonth / .onlyYear); this flips one data attribute and CSS
// does the rest — so the cards never re-render, and without JS the yearly
// prices (the default) still read correctly.
export function IntervalSwitch({ savingPct, children }: { savingPct: number; children: ReactNode }) {
  const [interval, setInterval] = useState<Interval>("year");
  return (
    <div className={s.intervals} data-interval={interval}>
      <div className={s.toggle}>
        <Segmented<Interval>
          label="Billing period"
          value={interval}
          onChange={setInterval}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: <>Yearly{savingPct > 0 && <span className={s.save}>−{savingPct}%</span>}</> },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
