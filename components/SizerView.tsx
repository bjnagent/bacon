"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

// Position sizing — plain math on the user's own inputs (no market data, no
// guarantees). Risk-based + fractional Kelly. Static port from the artifact.
function Field({ label, suffix, value, onChange, step = "1", hint }: { label: string; suffix: string; value: number; onChange: (v: number) => void; step?: string; hint?: string }) {
  return (
    <label className="pr-field">
      <span className="pr-field-label">{label}{hint && <em>{hint}</em>}</span>
      <span className="pr-field-input">
        <input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
        <span className="pr-field-suffix">{suffix}</span>
      </span>
    </label>
  );
}

function Out({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return <div className={`pr-out ${accent ? "is-accent" : ""} ${warn ? "is-warn" : ""}`}><div className="pr-out-label">{label}</div><div className="pr-out-value">{value}</div></div>;
}

export default function SizerView() {
  const [mode, setMode] = useState<"risk" | "kelly">("risk");
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(92);
  const [winProb, setWinProb] = useState(55);
  const [payoff, setPayoff] = useState(1.8);

  const num = (v: number) => (isFinite(v) ? v : 0);
  const riskDollars = num(account * (riskPct / 100));
  const perUnit = Math.abs(num(entry) - num(stop));
  const units = perUnit > 0 ? riskDollars / perUnit : 0;
  const posValue = units * num(entry);
  const posPct = account > 0 ? (posValue / account) * 100 : 0;
  const p = winProb / 100, q = 1 - p, b = num(payoff);
  const fullKelly = b > 0 ? (b * p - q) / b : 0;
  const kPct = Math.max(fullKelly, 0) * 100;
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const money = (v: number) => "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="pr-view">
      <div className="pr-sz-head"><h2 className="pr-section-title">Position calc</h2><p className="pr-wl-sub">Sizing decides outcomes more than entries. This is plain math on your own inputs — no market data, no guarantees.</p></div>
      <div className="pr-sz-modes">
        <button className={`pr-sz-mode ${mode === "risk" ? "is-active" : ""}`} onClick={() => setMode("risk")}>Risk-based <span>what most desks use</span></button>
        <button className={`pr-sz-mode ${mode === "kelly" ? "is-active" : ""}`} onClick={() => setMode("kelly")}>Kelly edge <span>growth-optimal ceiling</span></button>
      </div>
      {mode === "risk" && (
        <div className="pr-sz-panel">
          <div className="pr-sz-fields">
            <Field label="Account size" suffix="$" value={account} onChange={setAccount} />
            <Field label="Risk per trade" suffix="%" value={riskPct} onChange={setRiskPct} step="0.1" hint="0.5–2% is typical" />
            <Field label="Entry price" suffix="$" value={entry} onChange={setEntry} />
            <Field label="Stop price" suffix="$" value={stop} onChange={setStop} />
          </div>
          <div className="pr-sz-out">
            <Out label="Capital at risk" value={money(riskDollars)} accent />
            <Out label="Risk per unit" value={money(perUnit)} />
            <Out label="Position size" value={`${fmt(units)} u`} />
            <Out label="Position value" value={money(posValue)} />
            <Out label="% of account" value={`${fmt(posPct)}%`} warn={posPct > 100} />
          </div>
          {posPct > 100 && <div className="pr-sz-warn"><AlertTriangle size={14} /> This position exceeds your account — it implies leverage. Widen your stop or cut risk %.</div>}
          <div className="pr-sz-note">You risk a fixed slice of capital, and the entry-to-stop distance sets how many units that buys. Tighter stops allow larger size; wider stops, smaller. Loss is capped at your risk % only if the stop actually fills — gaps and slippage can exceed it.</div>
        </div>
      )}
      {mode === "kelly" && (
        <div className="pr-sz-panel">
          <div className="pr-sz-fields">
            <Field label="Account size" suffix="$" value={account} onChange={setAccount} />
            <Field label="Win probability" suffix="%" value={winProb} onChange={setWinProb} hint="be honest — and conservative" />
            <Field label="Payoff ratio (avg win ÷ avg loss)" suffix="×" value={payoff} onChange={setPayoff} step="0.1" />
          </div>
          {fullKelly <= 0 ? (
            <div className="pr-sz-out"><Out label="Kelly says" value="No edge — don't bet" warn /></div>
          ) : (
            <div className="pr-sz-out">
              <Out label="Full Kelly" value={`${fmt(kPct)}%`} warn />
              <Out label="Half Kelly" value={`${fmt(kPct / 2)}%`} accent />
              <Out label="Quarter Kelly" value={`${fmt(kPct / 4)}%`} />
              <Out label="Half-Kelly $" value={money(account * (kPct / 2) / 100)} />
            </div>
          )}
          <div className="pr-sz-note">Full Kelly is the growth-optimal ceiling — and it over-bets viciously: a few losing trades at full size can erase most of an account. Practitioners use half- or quarter-Kelly. Kelly also ignores correlation, so don&apos;t size several related positions each at Kelly — apply an overall risk budget across the book.</div>
        </div>
      )}
    </div>
  );
}
