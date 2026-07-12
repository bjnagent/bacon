"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Plus, Trash2, Telescope } from "lucide-react";
import { STANCES, type StanceKey } from "@/lib/lenses";
import { parseDebate } from "@/lib/parsers";
import { readTextStream } from "@/lib/readStream";
import { fetchJson } from "@/lib/fetchJson";
import { cachedJson, invalidate } from "@/lib/clientCache";
import BaconMark from "./BaconMark";

interface MarketStats { latest: { date: string; close: number }; qoqPct: number | null; yoyPct: number | null; spark: number[] }
interface Market { key: string; label: string; country: "SG" | "AU"; currency: string; unit: "index" | "price"; source: string; stats: MarketStats | null }
interface Valuation { entryDate: string; asOfDate: string; value: number; deltaPct: number }
interface Holding { id: string; label: string; market_key: string; purchase_price: number; purchase_date: string; valuation: Valuation | null }
interface Outlook {
  read: string; confirm: string; kill: string; stance: StanceKey;
  policy?: string; rates?: string; supply?: string; sentiment?: string; rental?: string;
  scenarios?: string; longrun?: string; carry?: string;
  verdict?: string; drivers?: string; stanceWhy?: string; // drivers = legacy shape
}
interface PropertyData { markets?: Market[]; portfolio?: Holding[]; outlooks?: Record<string, { body: Outlook; created_at: string }> }

const money = (n: number, ccy: string) => `${ccy} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (n: number, dp = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 26 - 2}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox="0 0 100 30" className="pr-spark" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? "var(--good)" : "var(--bad)"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The property cockpit: real SG + AU indices (quarterly — they lag), qualitative
// AI outlooks with confirm/kill checkpoints, and the user's own properties
// valued against their market index. Index-implied estimates, never appraisals.
export default function PropertyView() {
  const [data, setData] = useState<PropertyData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outlooks, setOutlooks] = useState<Record<string, Outlook>>({});
  const [outlookBusy, setOutlookBusy] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState({ label: "", market_key: "sg-hdb", purchase_price: "", purchase_date: "" });
  const [saving, setSaving] = useState(false);

  const load = async (fresh = false) => {
    try {
      if (fresh) invalidate("/api/property");
      const d = await cachedJson<PropertyData>("/api/property", fresh ? 0 : 120_000);
      setData(d);
      const seeded: Record<string, Outlook> = {};
      for (const [k, v] of Object.entries(d.outlooks ?? {})) seeded[k] = v.body;
      setOutlooks((prev) => ({ ...seeded, ...prev }));
    } catch { setError("Couldn't load property data — try again."); }
    finally { setLoaded(true); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await cachedJson<PropertyData>("/api/property", 120_000);
        if (cancelled) return;
        setData(d);
        const seeded: Record<string, Outlook> = {};
        for (const [k, v] of Object.entries(d.outlooks ?? {})) seeded[k] = v.body;
        setOutlooks((prev) => ({ ...seeded, ...prev }));
      } catch { if (!cancelled) setError("Couldn't load property data — try again."); }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const runOutlook = async (key: string) => {
    if (outlookBusy) return;
    setOutlookBusy(key); setError(null);
    try {
      const toOutlook = (raw: string): Outlook | null => {
        const sec = parseDebate(raw);
        if (!sec.READ) return null;
        const head = (sec.VERDICT || "").trim().toLowerCase();
        const stance: StanceKey = head.startsWith("buy") ? "constructive" : head.startsWith("avoid") || head.startsWith("sell") ? "cautious" : "mixed";
        return {
          read: sec.READ, policy: sec.POLICY, rates: sec.RATES, supply: sec.SUPPLY, sentiment: sec.SENTIMENT,
          rental: sec.RENTAL, scenarios: sec.SCENARIOS, longrun: sec.LONGRUN, carry: sec.CARRY, verdict: sec.VERDICT,
          confirm: sec.CONFIRM || "", kill: sec.KILL || "", stance,
        };
      };
      let rafId = 0, last = "";
      const flush = () => { rafId = 0; const o = toOutlook(last); if (o) setOutlooks((prev) => ({ ...prev, [key]: o })); };
      await readTextStream("/api/property/outlook", { market: key }, (acc) => { last = acc; if (!rafId) rafId = requestAnimationFrame(flush); });
      if (rafId) cancelAnimationFrame(rafId);
      const final = toOutlook(last);
      if (final) setOutlooks((prev) => ({ ...prev, [key]: final }));
    } catch (err) { setError(err instanceof Error ? err.message : "Outlook failed"); }
    finally { setOutlookBusy(null); }
  };

  const addProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const { ok, data: d } = await fetchJson("/api/property", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, purchase_price: Number(form.purchase_price) }) });
      if (!ok) throw new Error(String(d.error || "Couldn't save"));
      setForm({ label: "", market_key: form.market_key, purchase_price: "", purchase_date: "" });
      setOpenForm(false);
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save"); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await fetch(`/api/property/${id}`, { method: "DELETE" }); await load(true); } catch { /* retryable */ }
  };

  const markets = data?.markets ?? [];
  const portfolio = data?.portfolio ?? [];
  const marketLabel = (key: string) => markets.find((m) => m.key === key)?.label ?? key;
  const marketCcy = (key: string) => markets.find((m) => m.key === key)?.currency ?? "";

  return (
    <div className="pr-view">
      <div className="pr-sec pr-sec-flush">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">Property markets</h2>
          <div className="pr-sec-actions"><span className="pr-auto-lbl">SG + AU · quarterly indices — they lag</span></div>
        </div>
        {error && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Something went wrong.</strong><div className="pr-error-detail">{error}</div></div></div>}
        {!loaded && <div className="pr-loading"><div className="pr-bacon-bounce"><BaconMark size={46} /></div><div className="pr-loading-text">Pulling the real property indices…</div></div>}

        <div className="pr-prop-grid">
          {markets.map((m) => {
            const o = outlooks[m.key];
            const st = o ? STANCES[o.stance] : null;
            return (
              <div key={m.key} className="pr-prop">
                <div className="pr-prop-head">
                  <div className="pr-prop-name">{m.label}</div>
                  <span className="pr-prop-country">{m.country}</span>
                </div>
                {m.stats ? (
                  <>
                    <div className="pr-prop-stats">
                      <span className="pr-prop-level">{m.unit === "price" ? money(m.stats.latest.close, m.currency) : m.stats.latest.close.toFixed(1)}</span>
                      {m.stats.qoqPct != null && <em className={`pr-prop-chg ${m.stats.qoqPct >= 0 ? "is-up" : "is-down"}`}>QoQ {pct(m.stats.qoqPct)}</em>}
                      {m.stats.yoyPct != null && <em className={`pr-prop-chg ${m.stats.yoyPct >= 0 ? "is-up" : "is-down"}`}>YoY {pct(m.stats.yoyPct)}</em>}
                    </div>
                    <Spark values={m.stats.spark} />
                    <div className="pr-prop-src">{m.source} · as of {m.stats.latest.date}</div>
                  </>
                ) : (
                  <div className="pr-prop-src">Awaiting index data from {m.source} — check the deployment&apos;s network access to this source.</div>
                )}
                {o && (
                  <div className="pr-prop-outlook">
                    {o.verdict ? (() => {
                      const head = o.verdict.trim().toLowerCase();
                      const tone = head.startsWith("buy") ? "is-buy" : head.startsWith("avoid") || head.startsWith("sell") ? "is-sell" : "is-hold";
                      return <div className={`pr-verdict-banner ${tone}`}><div className="pr-verdict-call">{o.verdict}</div></div>;
                    })() : st && <span className="pr-panel-stance" style={{ color: st.tone, borderColor: st.tone }}>{st.label}</span>}
                    <p>{o.read}</p>
                    {([["POLICY", o.policy], ["RATES", o.rates], ["SUPPLY", o.supply], ["SENTIMENT", o.sentiment], ["RENTAL", o.rental]] as const)
                      .filter(([, v]) => v)
                      .map(([k, v]) => <div key={k} className="pr-prop-dim"><span>{k}</span> {v}</div>)}
                    {o.scenarios && <div className="pr-pick-now"><span>12-MO SCENARIOS (EST.) ▸</span> {o.scenarios}</div>}
                    {o.longrun && <div className="pr-pick-now"><span>5 &amp; 10-YR (EST.) ▸</span> {o.longrun}</div>}
                    {o.carry && <div className="pr-carry"><span>RENT vs MORTGAGE ▸</span> {o.carry}</div>}
                    {o.drivers && <div className="pr-prop-drivers">{o.drivers}</div>}
                    {o.confirm && <div className="pr-pick-check"><span>CONFIRM</span> {o.confirm}</div>}
                    {o.kill && <div className="pr-pick-check"><span>KILL</span> {o.kill}</div>}
                  </div>
                )}
                <div className="pr-record-actions">
                  <button className="pr-btn-sm" onClick={() => runOutlook(m.key)} disabled={outlookBusy === m.key}>
                    {outlookBusy === m.key ? <><Loader2 size={13} className="pr-spin" /> Policy, rates, supply, sentiment…</> : <><Telescope size={13} /> {o ? "Refresh deep view" : "Deep view"}</>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pr-sec">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">My properties</h2>
          <div className="pr-sec-actions">
            <button className="pr-btn-sm" onClick={() => setOpenForm((v) => !v)}><Plus size={13} /> Add property</button>
          </div>
        </div>

        {openForm && (
          <form className="pr-prop-form" onSubmit={addProperty}>
            <input className="pr-input" placeholder="Label — e.g. Tampines 4-room, Marrickville house" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} aria-label="Property label" />
            <select className="pr-select" value={form.market_key} onChange={(e) => setForm({ ...form, market_key: e.target.value })} aria-label="Market">
              {markets.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <input className="pr-input" type="number" min="1" placeholder="Purchase price" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} aria-label="Purchase price" />
            <input className="pr-input" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} aria-label="Purchase date" />
            <button className="pr-btn" type="submit" disabled={saving}>{saving ? <Loader2 size={14} className="pr-spin" /> : "SAVE"}</button>
          </form>
        )}

        {loaded && portfolio.length === 0 && !openForm && (
          <div className="pr-empty"><BaconMark size={46} /><div><strong>Track your own properties against the market.</strong> Add a property with its purchase price and date — Bacon scales it by the real market index since then. An index-implied estimate, not an appraisal.</div></div>
        )}

        <div className="pr-prop-list">
          {portfolio.map((p) => {
            const ccy = marketCcy(p.market_key);
            return (
              <div key={p.id} className="pr-prop is-holding">
                <div className="pr-prop-head">
                  <div className="pr-prop-name">{p.label}</div>
                  <button className="pr-news-discuss" onClick={() => remove(p.id)} title="Remove"><Trash2 size={13} /></button>
                </div>
                <div className="pr-prop-src">{marketLabel(p.market_key)} · bought {p.purchase_date} for {money(Number(p.purchase_price), ccy)}</div>
                {p.valuation ? (
                  <div className={`pr-roi ${p.valuation.deltaPct >= 0 ? "is-up" : "is-down"}`}>
                    <span className="pr-roi-lead">{money(Number(p.purchase_price), ccy)} → {money(p.valuation.value, ccy)}</span>
                    <em className="pr-roi-delta">{p.valuation.deltaPct >= 0 ? "▲" : "▼"} {pct(p.valuation.deltaPct, 2)}</em>
                    <span className="pr-roi-basis">index {p.valuation.entryDate} → {p.valuation.asOfDate}</span>
                  </div>
                ) : (
                  <div className="pr-roi is-skip"><span className="pr-roi-lead">awaiting index data</span></div>
                )}
              </div>
            );
          })}
        </div>
        {portfolio.length > 0 && <div className="pr-disclaimer">Estimates scale your purchase price by the market index move since purchase — they ignore the specific property, renovations, leasehold decay and transaction costs. A study aid, not an appraisal or advice.</div>}
      </div>
    </div>
  );
}
