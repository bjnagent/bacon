"use client";

import { useEffect, useRef } from "react";
import { DESKTOP, useDarkTheme, useMedia } from "./useMedia";
import { toTVSymbol } from "./TVLink";
import s from "./TradingViewChart.module.css";

// Embedded TradingView Advanced Chart — real prices from a real provider
// (never the model). The "Track all markets on TradingView" attribution is
// required by the free-tier terms and is always rendered with the widget.
// Follows the app's theme (including a pinned one) and is shorter on phones so
// it doesn't swallow the viewport.

export default function TradingViewChart({ symbol, height }: { symbol: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const tv = toTVSymbol(symbol);
  const dark = useDarkTheme();
  const desktop = useMedia(DESKTOP);
  const h = height ?? (desktop ? 440 : 320);

  useEffect(() => {
    const host = ref.current;
    if (!host || !tv) return;
    host.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: tv,
      interval: "D",
      timezone: "Etc/UTC",
      theme: dark ? "dark" : "light",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      hide_side_toolbar: !desktop,
      support_host: "https://www.tradingview.com",
    });

    host.appendChild(widget);
    host.appendChild(script);
    return () => { host.innerHTML = ""; };
  }, [tv, dark, desktop]);

  if (!tv) return null;
  return (
    <div className={s.frame}>
      <div ref={ref} className={`tradingview-widget-container ${s.host}`} style={{ height: h }} />
      <div className={s.attrib}>
        <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">Track all markets on TradingView</a>
      </div>
    </div>
  );
}
