"use client";

import { useEffect, useState } from "react";
import { Loader2, History, ChevronDown, AlertTriangle, Microscope } from "lucide-react";
import type { StoredBriefItem } from "@/lib/brief";

interface BriefRow { id: string; brief_date: string; intro: string | null; caveat: string | null; items: StoredBriefItem[]; reviewed_at: string | null }

const VERDICT_TONE: Record<string, string> = {
  "played-out": "is-good", "developing": "is-live", "faded": "is-mute", "invalidated": "is-bad",
};

// The track record: every brief the system has produced, by date — and an
// honest "how did it age?" review pass per brief. Credibility loop.
export default function TrackRecordView() {
  const [briefs, setBriefs] = useState<BriefRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/brief/history");
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.briefs)) setBriefs(data.briefs);
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
      const res = await fetch("/api/brief/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setBriefs((prev) => prev.map((b) => b.id === id ? { ...b, items: data.items, reviewed_at: data.reviewed_at } : b));
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setReviewing(null); }
  };

  return (
    <div className="pr-view">
      <div className="pr-sec pr-sec-flush">
        <div className="pr-sec-head"><h2 className="pr-section-title">Track record</h2></div>

        {migrationNeeded && (
          <div className="pr-nudge"><AlertTriangle size={14} /> The track record needs one schema update: run the latest <strong>supabase/schema.sql</strong> in the Supabase SQL editor (it&apos;s idempotent). Briefs start recording from the next sweep.</div>
        )}
        {error && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Review failed.</strong><div className="pr-error-detail">{error}. Try again.</div></div></div>}

        {loaded && !migrationNeeded && briefs.length === 0 && (
          <div className="pr-empty"><History size={26} /><div>No briefs recorded yet. Each daily sweep (or <strong>Sweep now</strong> on Today) files its brief here — then ask <strong>How did it age?</strong> to grade the calls against what actually happened.</div></div>
        )}

        <div className="pr-record-list">
          {briefs.map((b) => {
            const isOpen = open === b.id;
            const verdicts = b.items.filter((i) => i.verdict);
            return (
              <div key={b.id} className={`pr-record ${isOpen ? "is-open" : ""}`}>
                <button className="pr-record-head" onClick={() => setOpen(isOpen ? null : b.id)} aria-expanded={isOpen}>
                  <span className="pr-record-date">{b.brief_date}</span>
                  <span className="pr-record-sum">{b.items.length} opportunities{b.reviewed_at ? ` · reviewed` : ""}</span>
                  {verdicts.length > 0 && (
                    <span className="pr-record-verdicts">
                      {verdicts.map((i, n) => <em key={n} className={`pr-verdict ${VERDICT_TONE[i.verdict || ""] || "is-mute"}`}>{i.verdict}</em>)}
                    </span>
                  )}
                  <ChevronDown size={16} className={`pr-fw-chev ${isOpen ? "is-open" : ""}`} />
                </button>
                {isOpen && (
                  <div className="pr-record-body">
                    {b.intro && <div className="pr-summary">{b.intro}</div>}
                    {b.items.map((o, i) => (
                      <div key={i} className="pr-record-item">
                        <div className="pr-record-item-head">
                          <strong>{o.name}</strong>{o.ticker && o.ticker !== "—" && <span className="pr-pick-ticker">{o.ticker}</span>}
                          {o.horizon && <span className="pr-opp-horizon">◷ {o.horizon}</span>}
                          {o.verdict && <em className={`pr-verdict ${VERDICT_TONE[o.verdict] || "is-mute"}`}>{o.verdict}</em>}
                        </div>
                        <div className="pr-pick-why">{o.thesis}</div>
                        {o.outcome && <div className="pr-pick-now"><span>SINCE THEN ▸</span> {o.outcome}</div>}
                      </div>
                    ))}
                    <div className="pr-record-actions">
                      <button className="pr-btn-sm" onClick={() => review(b.id)} disabled={reviewing === b.id}>
                        {reviewing === b.id ? <><Loader2 size={13} className="pr-spin" /> Checking what happened…</> : <><Microscope size={13} /> {b.reviewed_at ? "Re-review" : "How did it age?"}</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {briefs.length > 0 && <div className="pr-disclaimer">Outcomes are qualitative summaries of public reporting — an honesty loop, not a performance figure. Not financial advice.</div>}
      </div>
    </div>
  );
}
