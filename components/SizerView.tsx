"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { riskPosition, kellyFraction, dcf, sharpe, parametricVaR } from "@/lib/calc";

// Sizing + valuation + risk math — all on the user's OWN inputs (no market data,
// no guarantees). Risk-based sizing, fractional Kelly, two-stage DCF, Sharpe/VaR.
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

type Mode = "risk" | "kelly" | "dcf" | "risk-metrics";

export default function SizerView() {
  const [mode, setMode] = useState<Mode>("risk");
  // risk-based
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(92);
  // kelly
  const [winProb, setWinProb] = useState(55);
  const [payoff, setPayoff] = useState(1.8);
  // dcf
  const [fcf, setFcf] = useState(1000);
  const [growth, setGrowth] = useState(8);
  const [termGrowth, setTermGrowth] = useState(2.5);
  const [wacc, setWacc] = useState(9);
  const [years, setYears] = useState(5);
  const [netCash, setNetCash] = useState(0);
  const [shares, setShares] = useState(100);
  // risk metrics
  const [exp, setExp] = useState(8);
  const [vol, setVol] = useState(20);
  const [rf, setRf] = useState(4);
  const [posVal, setPosVal] = useState(10000);
  const [conf, setConf] = useState(95);
  const [horizon, setHorizon] = useState(1);

  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const money = (v: number) => "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });

  const { riskDollars, perUnit, units, posValue, posPct } = riskPosition(account, riskPct, entry, stop);
  const fullKelly = kellyFraction(winProb, payoff);
  const kPct = Math.max(fullKelly, 0) * 100;
  const { valid: dcfValid, pvExplicit, pvTv, ev, equity, perShare } = dcf({ fcf, growthPct: growth, termGrowthPct: termGrowth, waccPct: wacc, years, netCash, shares });
  const sharpeRatio = sharpe(exp, rf, vol);
  const { dailyVol, varPct, varDollars } = parametricVaR(vol, conf, horizon, posVal);

  return (
    <div className="pr-view">
      <div className="pr-sz-head"><h2 className="pr-section-title">Sizing & risk</h2><p className="pr-wl-sub">Plain math on your own inputs — no market data, no guarantees. Sizing and risk control decide outcomes more than entries.</p></div>
      <div className="pr-sz-modes">
        <button className={`pr-sz-mode ${mode === "risk" ? "is-active" : ""}`} onClick={() => setMode("risk")}>Risk-based <span>position sizing</span></button>
        <button className={`pr-sz-mode ${mode === "kelly" ? "is-active" : ""}`} onClick={() => setMode("kelly")}>Kelly edge <span>growth-optimal ceiling</span></button>
        <button className={`pr-sz-mode ${mode === "dcf" ? "is-active" : ""}`} onClick={() => setMode("dcf")}>DCF <span>intrinsic value</span></button>
        <button className={`pr-sz-mode ${mode === "risk-metrics" ? "is-active" : ""}`} onClick={() => setMode("risk-metrics")}>Risk metrics <span>Sharpe · VaR</span></button>
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

      {mode === "dcf" && (
        <div className="pr-sz-panel">
          <div className="pr-sz-fields">
            <Field label="Free cash flow" suffix="$M" value={fcf} onChange={setFcf} step="10" />
            <Field label="Growth (yrs 1–N)" suffix="%" value={growth} onChange={setGrowth} step="0.5" />
            <Field label="Terminal growth" suffix="%" value={termGrowth} onChange={setTermGrowth} step="0.1" hint="≤ long-run GDP" />
            <Field label="Discount rate (WACC)" suffix="%" value={wacc} onChange={setWacc} step="0.5" />
            <Field label="Projection years" suffix="yr" value={years} onChange={setYears} />
            <Field label="Net cash (− debt)" suffix="$M" value={netCash} onChange={setNetCash} step="10" />
            <Field label="Shares outstanding" suffix="M" value={shares} onChange={setShares} />
          </div>
          {!dcfValid ? (
            <div className="pr-sz-warn"><AlertTriangle size={14} /> Discount rate must exceed terminal growth (and years &gt; 0) for a finite value.</div>
          ) : (
            <div className="pr-sz-out">
              <Out label="PV of explicit FCF" value={money(pvExplicit) + "M"} />
              <Out label="PV of terminal value" value={money(pvTv) + "M"} />
              <Out label="Enterprise value" value={money(ev) + "M"} />
              <Out label="Equity value" value={money(equity) + "M"} accent />
              <Out label="Intrinsic / share" value={"$" + perShare.toFixed(2)} accent />
            </div>
          )}
          <div className="pr-sz-note">A two-stage DCF: explicit free cash flow grown for N years, plus a Gordon-growth terminal value, all discounted at WACC. The output is only as good as the assumptions — stress-test growth and discount rate, and compare intrinsic/share to the live price on the Markets tab. Not advice.</div>
        </div>
      )}

      {mode === "risk-metrics" && (
        <div className="pr-sz-panel">
          <div className="pr-sz-fields">
            <Field label="Expected return (annual)" suffix="%" value={exp} onChange={setExp} step="0.5" />
            <Field label="Volatility (annual σ)" suffix="%" value={vol} onChange={setVol} step="0.5" />
            <Field label="Risk-free rate" suffix="%" value={rf} onChange={setRf} step="0.1" />
            <Field label="Position value" suffix="$" value={posVal} onChange={setPosVal} step="100" />
            <Field label="Confidence" suffix="%" value={conf} onChange={setConf} step="1" hint="95 or 99 typical" />
            <Field label="Horizon" suffix="d" value={horizon} onChange={setHorizon} />
          </div>
          <div className="pr-sz-out">
            <Out label="Sharpe ratio" value={vol > 0 ? sharpeRatio.toFixed(2) : "—"} accent warn={sharpeRatio < 0} />
            <Out label="Daily σ" value={(dailyVol * 100).toFixed(2) + "%"} />
            <Out label={`VaR (${fmt(conf)}%, ${fmt(horizon)}d)`} value={varPct.toFixed(2) + "%"} warn />
            <Out label="VaR $" value={money(varDollars)} warn />
          </div>
          <div className="pr-sz-note">Sharpe = (return − risk-free) ÷ volatility — risk-adjusted return per unit of σ. VaR here is parametric (normal): z·σ_daily·√horizon — the loss you wouldn&apos;t expect to exceed at this confidence under a normal-distribution assumption, which understates real-world tail risk. Inputs are yours; not advice.</div>
        </div>
      )}
    </div>
  );
}
