"use client";

import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import TradingViewChart from "./TradingViewChart";

// Dedicated live-price view: real-time TradingView charts. Bacon's analysis stays
// qualitative — these are the real numbers to check a read against.
export default function MarketsView({ onAnalyze }: { onAnalyze: (t: { asset: string; cls: string }) => void }) {
  const [input, setInput] = useState("NVDA");
  const [symbol, setSymbol] = useState("NVDA");

  const go = () => { const s = input.trim(); if (s) setSymbol(s); };

  return (
    <div className="pr-view">
      <div className="pr-hero">
        <div className="pr-hero-eyebrow">Markets · Live charts</div>
        <h1 className="pr-hero-title">Live prices, from the source.</h1>
        <p className="pr-hero-sub">Real-time charts via TradingView. Bacon&apos;s six-lens read stays qualitative — this is the live data to verify it against. Not financial advice.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); go(); }} className="pr-command">
        <div className="pr-command-row">
          <span className="pr-command-prompt">›</span>
          <input className="pr-input" placeholder="SYMBOL — e.g. NVDA, AAPL, BTCUSD, EURUSD, SPY" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Symbol" />
          <button className="pr-btn" type="submit"><Search size={15} /> Load</button>
          <button type="button" className="pr-btn-sm" onClick={() => onAnalyze({ asset: symbol, cls: "Equity / Stock" })}>Run six lenses <ArrowRight size={13} /></button>
        </div>
      </form>

      <div className="pr-result-chart">
        <TradingViewChart symbol={symbol} height={520} />
      </div>
    </div>
  );
}
