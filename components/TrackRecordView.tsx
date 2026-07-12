"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronDown, AlertTriangle, Microscope, LineChart, ShieldAlert } from "lucide-react";
import type { StoredBriefItem } from "@/lib/brief";
import BaconMark from "./BaconMark";
import { computeScoreboard, type DayTotals } from "@/lib/scoreboard";
import { fetchJson } from "@/lib/fetchJson";
import { cachedJson, invalidate } from "@/lib/clientCache";

interface KillAlert { at?: string; note?: string; items?: { ticker?: string; name?: string; why?: string }[] }
interface BriefRow { id: string; brief_date: string; intro: string | null; caveat: string | null; items: StoredBriefItem[]; reviewed_at: string | null; roi?: (DayTotals & { asOf?: string }) | null; kill_alert?: KillAlert | null }

// One opportunity's hypothetical $10K result, or why it couldn't be priced.
interface RoiResult {
  name: string; ticker: string;
  entryDate?: string; entryClose?: number; asOfDate?: string; asOfClose?: number;
  invested?: number; value?: number; roiPct?: number; skipped?: string;
  quoteKind?: "commodity" | "fx"; entryQuote?: string; asOfQuote?: string; // commodity/FX basis, in the instrument's own unit
}
interface RoiTotals { count: number; invested: number; value: number; asOf: string; roiPct: number }
interface RoiData { unavailable?: boolean; error?: string; since?: string; invested?: number; results?: RoiResult[]; totals?: RoiTotals | null }

const VERDICT_TONE: Record<string, string> = {
  "played-out": "is-good", "developing": "is-live", "faded": "is-mute", "invalidated": "is-bad",
};

// Exact to the cent — this is a money figure, not a rounded headline.
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

// The track record: every brief the system has produced, by date — and an
// honest "how did it age?" review pass per brief. Credibility loop.
export default function TrackRecordView() {
  const [briefs, setBriefs] = useState<BriefRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roi, setRoi] = useState<Record<string, RoiData>>({});
  const [pricing, setPricing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await cachedJson<{ briefs?: BriefRow[]; migrationNeeded?: boolean }>("/api/brief/history", 60_000);
        if (cancelled) return;
        if (Array.isArray(data.briefs)) {
          setBriefs(data.briefs);
          // Seed the stored ROI snapshots so already-priced days show their total
          // instantly and DON'T re-hit the rate-limited provider on expand. A
          // manual "Re-price" still refreshes to the latest value.
          const seeded: Record<string, RoiData> = {};
          for (const b of data.briefs) {
            if (b.roi && b.roi.invested) seeded[b.id] = { results: [], totals: { count: b.roi.count ?? 1, invested: b.roi.invested, value: b.roi.value, asOf: b.roi.asOf ?? "", roiPct: b.roi.roiPct } };
          }
          if (Object.keys(seeded).length) setRoi(seeded);
        }
        if (data.migrationNeeded) setMigrationNeeded(true);
      } catch { /* empty state */ }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const review = async (id: string) => {
    if (reviewing) return;
    setReviewing(id); setError(null);
    try {
      const { ok, status, data } = await fetchJson("/api/brief/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!ok) throw new Error(String(data.error || `Request failed (${status})`));
      invalidate("/api/brief");
      setBriefs((prev) => prev.map((b) => b.id === id ? { ...b, items: data.items as StoredBriefItem[], reviewed_at: data.reviewed_at as string } : b));
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setReviewing(null); }
  };

  // "$10K since flagged" — a hypothetical stake at each opportunity's flag-day
  // close, valued at today's close. Live (real prices), never stored — so the
  // money value is exact as of the moment you look.
  const priceRoi = async (id: string) => {
    if (pricing) return;
    setPricing(id); setError(null);
    try {
      const { ok, status, data } = await fetchJson("/api/brief/roi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!ok) throw new Error(String(data.error || `Request failed (${status})`));
      setRoi((prev) => ({ ...prev, [id]: data as RoiData }));
    } catch (err) { setError(err instanceof Error ? err.message : "Pricing failed"); }
    finally { setPricing(null); }
  };

  // Expand a record and, the first time it opens, price it automatically so the
  // exact ROI + money value are already on screen — no extra click.
  const toggleRecord = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && !roi[next] && !pricing) priceRoi(next);
  };

  const liveTotals: Record<string, DayTotals | undefined> = {};
  briefs.forEach((b) => { const t = roi[b.id]?.totals; if (t) liveTotals[b.id] = t; });
  const score = computeScoreboard(briefs, liveTotals);

  return (
    <div className="pr-view">
      <div className="pr-sec pr-sec-flush">
        <div className="pr-sec-head"><h2 className="pr-section-title">Track record</h2></div>

        {(score.pricedDays > 0 || score.graded > 0) && (
          <div className="pr-score">
            {score.pricedDays > 0 && <>
              <div className="pr-score-cell"><span className="pr-score-lbl">Hypothetically staked</span><span className="pr-score-val">{usd(score.invested)}</span></div>
              <div className="pr-score-cell"><span className="pr-score-lbl">Worth today</span><span className={`pr-score-val ${score.roiPct >= 0 ? "is-up" : "is-down"}`}>{usd(score.value)}</span></div>
              <div className="pr-score-cell"><span className="pr-score-lbl">Return</span><span className={`pr-score-val ${score.roiPct >= 0 ? "is-up" : "is-down"}`}>{score.roiPct >= 0 ? "▲" : "▼"} {pct(score.roiPct)}</span></div>
            </>}
            {score.hitRatePct != null && (
              <div className="pr-score-cell"><span className="pr-score-lbl">Hit rate</span><span className="pr-score-val">{Math.round(score.hitRatePct)}% <em>({score.wins}/{score.graded})</em></span></div>
            )}
            <div className="pr-score-note">Across {score.pricedDays > 0 ? `${score.pricedDays} priced day${score.pricedDays === 1 ? "" : "s"}` : "graded calls"} — hypothetical $10K per idea, real prices, excludes fees. Not advice.</div>
          </div>
        )}

        {migrationNeeded && (
          <div className="pr-nudge"><AlertTriangle size={14} /> The track record needs one schema update: run the latest <strong>supabase/schema.sql</strong> in the Supabase SQL editor (it&apos;s idempotent). Briefs start recording from the next sweep.</div>
        )}
        {error && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Review failed.</strong><div className="pr-error-detail">{error}. Try again.</div></div></div>}

        {loaded && !migrationNeeded && briefs.length === 0 && (
          <div className="pr-empty"><BaconMark size={46} /><div>No briefs recorded yet. Each daily sweep (or <strong>Sweep now</strong> on Today) files its brief here — then ask <strong>How did it age?</strong> to grade the calls against what actually happened.</div></div>
        )}

        <div className="pr-record-list">
          {briefs.map((b) => {
            const isOpen = open === b.id;
            const verdicts = b.items.filter((i) => i.verdict);
            return (
              <div key={b.id} className={`pr-record ${isOpen ? "is-open" : ""}`}>
                <button className="pr-record-head" onClick={() => toggleRecord(b.id)} aria-expanded={isOpen}>
                  <span className="pr-record-date">{b.brief_date}</span>
                  <span className="pr-record-sum">{b.items.length} opportunities{b.reviewed_at ? ` · reviewed` : ""}</span>
                  {verdicts.length > 0 && (
                    <span className="pr-record-verdicts">
                      {verdicts.map((i, n) => <em key={n} className={`pr-verdict ${VERDICT_TONE[i.verdict || ""] || "is-mute"}`}>{i.verdict}</em>)}
                    </span>
                  )}
                  {b.kill_alert?.items?.length ? <span className="pr-record-killflag" title="Kill-condition watch flagged this brief"><ShieldAlert size={13} /></span> : null}
                  {(() => { const t = roi[b.id]?.totals ?? b.roi; return t && t.invested ? <span className={`pr-record-roi ${t.roiPct >= 0 ? "is-up" : "is-down"}`}>{t.roiPct >= 0 ? "▲" : "▼"} {pct(t.roiPct)}</span> : null; })()}
                  <ChevronDown size={16} className={`pr-fw-chev ${isOpen ? "is-open" : ""}`} />
                </button>
                {isOpen && (() => {
                  const priced = roi[b.id];
                  const byIndex = priced?.results ?? [];
                  return (
                  <div className="pr-record-body">
                    {b.kill_alert?.items?.length ? (
                      <div className="pr-killalert">
                        <div className="pr-killalert-head"><ShieldAlert size={14} /> Kill-condition watch</div>
                        <ul className="pr-killalert-list">
                          {b.kill_alert.items.map((k, n) => <li key={n}><strong>{k.ticker && k.ticker !== "—" ? k.ticker : k.name}</strong> — {k.why}</li>)}
                        </ul>
                        <div className="pr-killalert-note">{b.kill_alert.note || "A kill condition may have triggered — re-check before relying on this idea."}</div>
                      </div>
                    ) : null}
                    {b.intro && <div className="pr-summary">{b.intro}</div>}
                    {b.items.map((o, i) => {
                      const r = byIndex[i];
                      return (
                      <div key={i} className="pr-record-item">
                        <div className="pr-record-item-head">
                          <strong>{o.name}</strong>{o.ticker && o.ticker !== "—" && <span className="pr-pick-ticker">{o.ticker}</span>}
                          {o.horizon && <span className="pr-opp-horizon">◷ {o.horizon}</span>}
                          {o.verdict && <em className={`pr-verdict ${VERDICT_TONE[o.verdict] || "is-mute"}`}>{o.verdict}</em>}
                        </div>
                        <div className="pr-pick-why">{o.thesis}</div>
                        {(o.action || o.target) && (
                          <div className={`pr-call ${(o.action || "").toLowerCase().startsWith("watch") ? "is-hold" : "is-buy"}`}>
                            {o.action && <span className="pr-call-action">{o.action}</span>}
                            {o.target && <span className="pr-call-target">◎ {o.target}</span>}
                          </div>
                        )}
                        {o.outcome && <div className="pr-pick-now"><span>SINCE THEN ▸</span> {o.outcome}</div>}
                        {r && (r.value != null ? (
                          <div className={`pr-roi ${r.roiPct! >= 0 ? "is-up" : "is-down"}`}>
                            <span className="pr-roi-lead">{usd(r.invested!)} → {usd(r.value!)}</span>
                            <em className="pr-roi-delta">{r.roiPct! >= 0 ? "▲" : "▼"} {signedUsd(r.value! - r.invested!)} · {pct(r.roiPct!)}</em>
                            <span className="pr-roi-basis">{r.entryClose != null && (r.entryQuote
                              ? `entry ${r.entryQuote} on ${r.entryDate} → ${r.asOfQuote} on ${r.asOfDate}`
                              : `entry ${usd(r.entryClose)} on ${r.entryDate} → ${usd(r.asOfClose!)} on ${r.asOfDate}`)}</span>
                          </div>
                        ) : (
                          <div className="pr-roi is-skip"><span className="pr-roi-lead">{usd(10000)} → not priced</span><span className="pr-roi-basis">{r.skipped}</span></div>
                        ))}
                      </div>
                      );
                    })}

                    {pricing === b.id && !priced && (
                      <div className="pr-roi-loading"><Loader2 size={13} className="pr-spin" /> Pricing a {usd(10000)} stake in each at that day&apos;s close…</div>
                    )}
                    {priced?.totals && (
                      <div className={`pr-roi-total ${priced.totals.roiPct >= 0 ? "is-up" : "is-down"}`}>
                        Hypothetical {usd(priced.totals.invested)} basket ({priced.totals.count}×{usd(10000)}) → <strong>{usd(priced.totals.value)}</strong> <em>{priced.totals.roiPct >= 0 ? "▲" : "▼"} {signedUsd(priced.totals.value - priced.totals.invested)} · {pct(priced.totals.roiPct)}</em> as of {priced.totals.asOf}
                      </div>
                    )}
                    {priced && (priced.unavailable || (!priced.totals && !byIndex.some((r) => r.value != null))) && (
                      <div className="pr-roi-note">{priced.error || "No opportunities on this day had a priceable US-equity ticker."}</div>
                    )}
                    {priced?.totals && <div className="pr-roi-note">Exact money value, live as of {priced.totals.asOf}. Hypothetical entry at that day&apos;s close — excludes fees, dividends and slippage. Real prices via market-data provider. Not advice.</div>}

                    <div className="pr-record-actions">
                      <button className="pr-btn-sm" onClick={() => review(b.id)} disabled={reviewing === b.id}>
                        {reviewing === b.id ? <><Loader2 size={13} className="pr-spin" /> Checking what happened…</> : <><Microscope size={13} /> {b.reviewed_at ? "Re-review" : "How did it age?"}</>}
                      </button>
                      <button className="pr-btn-sm" onClick={() => priceRoi(b.id)} disabled={pricing === b.id}>
                        {pricing === b.id ? <><Loader2 size={13} className="pr-spin" /> Pricing…</> : <><LineChart size={13} /> {priced ? "Re-price $10K" : "Price $10K"}</>}
                      </button>
                    </div>
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        {briefs.length > 0 && <div className="pr-disclaimer">Outcomes are qualitative summaries of public reporting — an honesty loop, not a performance figure. Not financial advice.</div>}
      </div>
    </div>
  );
}
