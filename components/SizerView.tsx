"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

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

// Standard-normal quantile (Acklam's rational approximation) for parametric VaR.
function invNorm(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425, ph = 1 - pl;
  let q: number, x: number;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= ph) { q = p - 0.5; const rr = q * q; x = (((((a[0] * rr + a[1]) * rr + a[2]) * rr + a[3]) * rr + a[4]) * rr + a[5]) * q / (((((b[0] * rr + b[1]) * rr + b[2]) * rr + b[3]) * rr + b[4]) * rr + 1); }
  else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  return x;
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

  const num = (v: number) => (isFinite(v) ? v : 0);
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const money = (v: number) => "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });

  // risk-based
  const riskDollars = num(account * (riskPct / 100));
  const perUnit = Math.abs(num(entry) - num(stop));
  const units = perUnit > 0 ? riskDollars / perUnit : 0;
  const posValue = units * num(entry);
  const posPct = account > 0 ? (posValue / account) * 100 : 0;
  // kelly
  const p = winProb / 100, q = 1 - p, b = num(payoff);
  const fullKelly = b > 0 ? (b * p - q) / b : 0;
  const kPct = Math.max(fullKelly, 0) * 100;
  // dcf (two-stage)
  const r = wacc / 100, g = growth / 100, tg = termGrowth / 100;
  const dcfValid = r > tg && years > 0;
  let pvExplicit = 0, lastF = num(fcf);
  for (let i = 1; i <= years; i++) { const f = num(fcf) * Math.pow(1 + g, i); pvExplicit += f / Math.pow(1 + r, i); if (i === years) lastF = f; }
  const tv = dcfValid ? (lastF * (1 + tg)) / (r - tg) : 0;
  const pvTv = dcfValid ? tv / Math.pow(1 + r, years) : 0;
  const ev = pvExplicit + pvTv;
  const equity = ev + num(netCash);
  const perShare = shares > 0 ? equity / shares : 0;
  // risk metrics
  const z = invNorm(Math.min(Math.max(conf / 100, 0.5001), 0.9999));
  const sharpe = vol > 0 ? (exp - rf) / vol : 0;
  const dailyVol = (vol / 100) / Math.sqrt(252);
  const varPct = z * dailyVol * Math.sqrt(Math.max(horizon, 1)) * 100;
  const varDollars = (varPct / 100) * num(posVal);

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
            <Out label="Sharpe ratio" value={vol > 0 ? sharpe.toFixed(2) : "—"} accent warn={sharpe < 0} />
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
