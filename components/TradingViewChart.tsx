"use client";

import { useEffect, useRef, useState } from "react";

// Embedded TradingView Advanced Chart — real live prices from a real provider
// (never the model). Keeps the required "Track all markets on TradingView"
// attribution per the free-tier terms. Theme-aware and shorter on phones so it
// doesn't swallow the viewport before the lenses.
function toTVSymbol(s: string): string {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, "");
}

const prefersDark = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export default function TradingViewChart({ symbol, height = 420 }: { symbol: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const tv = toTVSymbol(symbol);
  const [dark, setDark] = useState(prefersDark);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // Cap chart height on narrow screens; it was eating most of a phone viewport.
  const effHeight = typeof window !== "undefined" && window.innerWidth <= 700 ? Math.min(height, 300) : height;

  useEffect(() => {
    const host = ref.current;
    if (!host || !tv) return;
    host.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = `${effHeight - 32}px`;
    widget.style.width = "100%";

    const copyright = document.createElement("div");
    copyright.className = "tradingview-widget-copyright";
    copyright.innerHTML = `<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">Track all markets on TradingView</a>`;

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
      hide_side_toolbar: false,
      support_host: "https://www.tradingview.com",
    });

    host.appendChild(widget);
    host.appendChild(copyright);
    host.appendChild(script);
    return () => { host.innerHTML = ""; };
  }, [tv, effHeight, dark]);

  if (!tv) return null;
  return <div className="pr-tvchart tradingview-widget-container" style={{ height: effHeight }} ref={ref} />;
}
