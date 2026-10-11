"use client";

import type { MouseEvent } from "react";
import { LineChart } from "lucide-react";
import { isNative, openExternal } from "@/lib/native";
import s from "./TVLink.module.css";

/** The symbol as TradingView spells it: upper-case, no spaces, no pair slash. */
export function toTVSymbol(sym: string | null | undefined): string {
  return String(sym ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, "");
}

// A deep link to the symbol's chart on tradingview.com — the attribution stays
// in the link's name and destination. In the iOS app it opens in the in-app
// browser so the member doesn't lose their place.
export default function TVLink({ sym, label, square }: { sym?: string; label?: boolean; square?: boolean }) {
  const t = toTVSymbol(sym);
  if (!t) return null;
  const url = `https://www.tradingview.com/symbols/${encodeURIComponent(t)}/`;
  const name = `Open the ${t} chart on TradingView`;
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (isNative()) { e.preventDefault(); openExternal(url); }
  };
  if (square) {
    return (
      <a className={`ui-iconbtn ${s.square}`} href={url} target="_blank" rel="noopener noreferrer" aria-label={name} title={name} onClick={onClick}>
        <LineChart aria-hidden="true" />
      </a>
    );
  }
  return (
    <a className={s.link} href={url} target="_blank" rel="noopener noreferrer" title={name} aria-label={label === false ? name : undefined} onClick={onClick}>
      <LineChart aria-hidden="true" />
      {label !== false && <span>Chart</span>}
    </a>
  );
}
