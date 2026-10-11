"use client";

import { LineChart, ArrowUpRight } from "lucide-react";
import { isNative, openExternal } from "@/lib/native";
import s from "./Watchlist.module.css";

export function tradingViewUrl(sym: string): string | null {
  const t = String(sym || "").trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, "");
  return t ? `https://www.tradingview.com/symbols/${encodeURIComponent(t)}/` : null;
}

/**
 * Deep link to the symbol's TradingView page. The visible "TradingView" label is
 * the attribution their terms ask for — keep it wherever the link appears. In
 * the iOS app it opens in the in-app browser so the member keeps their place.
 */
export default function ChartLink({ sym, compact }: { sym: string; compact?: boolean }) {
  const url = tradingViewUrl(sym);
  if (!url) return null;
  const onClick = (e: React.MouseEvent) => {
    if (isNative()) { e.preventDefault(); openExternal(url); }
  };
  if (compact) {
    return (
      <a className="ui-btn ui-btn--sm ui-btn--ghost" href={url} target="_blank" rel="noopener noreferrer" onClick={onClick} aria-label={`${sym} chart on TradingView`}>
        <LineChart aria-hidden="true" />TradingView
      </a>
    );
  }
  return (
    <a className={s.extLink} href={url} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      <LineChart aria-hidden="true" />
      <span>Chart on TradingView</span>
      <ArrowUpRight className={s.extArrow} aria-hidden="true" />
    </a>
  );
}
