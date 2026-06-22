import { LineChart } from "lucide-react";

// Lightweight TradingView deep-link (keeps the required attribution to
// tradingview.com). Phase 2 will add embedded widgets; this stays as a fallback.
export default function TVLink({ sym, label, square }: { sym?: string; label?: boolean; square?: boolean }) {
  const s = String(sym || "").trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, "");
  if (!s) return null;
  const url = "https://www.tradingview.com/symbols/" + encodeURIComponent(s) + "/";
  if (square) return <a className="pr-readout-tv" href={url} target="_blank" rel="noopener noreferrer" title="Open chart on TradingView"><LineChart size={16} /></a>;
  return <a className="pr-tv" href={url} target="_blank" rel="noopener noreferrer" title="Open chart on TradingView"><LineChart size={13} />{label !== false && <span>Chart</span>}</a>;
}
