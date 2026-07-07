"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, ArrowRight, Plus, AlertTriangle, RefreshCw, Mail, MailX } from "lucide-react";
import { mapClass, relTime } from "@/lib/lenses";
import type { ChatContext } from "@/lib/prompts";
import { fetchJson } from "@/lib/fetchJson";
import { cachedJson, invalidate } from "@/lib/clientCache";
import MacroBackdrop from "./MacroBackdrop";
import BaconMark from "./BaconMark";
import TVLink from "./TVLink";

interface BriefItem { id: string; name: string; ticker: string; cls: string; horizon: string; thesis: string; signals: string; checks: string }
interface Brief { intro: string | null; caveat: string | null; generatedAt: string | null; items: BriefItem[] }

// The cockpit: the system pieces together today's signals overnight and the
// user opens this to SEE what it found — no query required.
export default function TodayView({ onAnalyze, onDiscuss }: { onAnalyze: (t: { asset: string; cls: string }) => void; onDiscuss: (ctx: ChatContext) => void }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<Record<string, boolean>>({});
  const [emailOn, setEmailOn] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bd, wd, std] = await Promise.all([
          cachedJson("/api/brief", 60_000), cachedJson("/api/watchlist", 30_000), cachedJson("/api/settings", 60_000),
        ]) as [Record<string, unknown> & { brief?: Brief }, { items?: { symbol: string }[] }, { settings?: { brief_email_enabled?: boolean } }];
        if (cancelled) return;
        if (bd.brief) setBrief(bd.brief);
        if (Array.isArray(wd.items)) { const t: Record<string, boolean> = {}; wd.items.forEach((it: { symbol: string }) => { t[it.symbol.toUpperCase()] = true; }); setTracked(t); }
        if (std.settings) setEmailOn(!!std.settings.brief_email_enabled);
      } catch { /* empty state handles it */ }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const generate = async () => {
    if (generating) return;
    setGenerating(true); setError(null);
    try {
      const { ok, status, data } = await fetchJson("/api/brief", { method: "POST" });
      if (!ok) throw new Error(String(data.error || `Request failed (${status})`));
      invalidate("/api/brief");
      setBrief(data.brief as Brief);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setGenerating(false); }
  };

  const toggleEmail = async () => {
    if (savingEmail) return;
    const next = !emailOn;
    setSavingEmail(true); setEmailErr(null); setEmailOn(next);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief_email_enabled: next }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "save failed"); }
      invalidate("/api/settings");
    } catch (err) {
      setEmailOn(!next);
      setEmailErr(err instanceof Error && /column|schema/i.test(err.message) ? "Run the latest supabase/schema.sql once to enable email." : "Couldn't save — try again.");
    } finally { setSavingEmail(false); }
  };

  const track = async (ticker: string, cls: string) => {
    const sym = ticker.toUpperCase();
    if (tracked[sym]) return;
    setTracked((t) => ({ ...t, [sym]: true }));
    try { await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, asset_class: cls }) }); invalidate("/api/watchlist"); } catch { /* ignore */ }
  };

  const hasBrief = !!brief && brief.items.length > 0;

  return (
    <div className="pr-view">
      <MacroBackdrop />

      <div className="pr-sec pr-sec-flush">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">Today&apos;s brief</h2>
          <div className="pr-sec-actions">
            {hasBrief && brief!.generatedAt && <span className="pr-auto-lbl">assembled {relTime(brief!.generatedAt)}</span>}
            <button className={`pr-mailtoggle ${emailOn ? "is-on" : ""}`} onClick={toggleEmail} disabled={savingEmail} title={emailOn ? "Morning email is ON — the brief lands in your inbox after each sweep" : "Morning email is OFF"}>
              {emailOn ? <Mail size={13} /> : <MailX size={13} />} {emailOn ? "Email: ON" : "Email: OFF"}
            </button>
            <button className="pr-btn" onClick={generate} disabled={generating}>
              {generating ? <><Loader2 size={14} className="pr-spin" /> PIECING IT TOGETHER</> : <><RefreshCw size={14} /> {hasBrief ? "RE-SWEEP NOW" : "SWEEP NOW"}</>}
            </button>
          </div>
        </div>

        {generating && !hasBrief && (
          <div className="pr-loading"><div className="pr-loading-text">Reading the movers, the tape, and the macro backdrop — piecing today&apos;s signals together…</div></div>
        )}
        {emailErr && <div className="pr-nudge"><AlertTriangle size={14} /> {emailErr}</div>}
        {error && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn&apos;t assemble the brief.</strong><div className="pr-error-detail">{error}. Try again.</div></div></div>}

        {loaded && !hasBrief && !generating && (
          <div className="pr-empty">
            <BaconMark size={54} />
            <div><strong>The system hunts while you&apos;re away.</strong> Every day it pieces together real movers, headlines, and the macro backdrop to surface under-the-radar opportunities — no query needed. Your first brief lands with the nightly sweep, or hit <strong>Sweep now</strong>.</div>
          </div>
        )}

        {hasBrief && (
          <>
            {brief!.intro && <div className="pr-summary">{brief!.intro}</div>}
            <div className="pr-opp-list">
              {brief!.items.map((o, i) => {
                const sym = (o.ticker && o.ticker !== "—") ? o.ticker : o.name;
                const isTracked = tracked[sym.toUpperCase()];
                return (
                  <div key={o.id} className="pr-opp">
                    <div className="pr-opp-rank">{String(i + 1).padStart(2, "0")}</div>
                    <div className="pr-opp-main">
                      <div className="pr-pick-head">
                        <div className="pr-pick-name">{o.name}{o.ticker && o.ticker !== "—" && <span className="pr-pick-ticker">{o.ticker}</span>}{o.horizon && <span className="pr-opp-horizon">◷ {o.horizon}</span>}</div>
                        <span className="pr-pick-class">{o.cls}</span>
                      </div>
                      <div className="pr-pick-why">{o.thesis}</div>
                      {o.signals && <div className="pr-pick-now"><span>SIGNALS ▸</span> {o.signals}</div>}
                      {o.checks && <div className="pr-pick-check"><span>VERIFY</span> {o.checks}</div>}
                      <div className="pr-pick-actions">
                        <button className="pr-pick-lenses" onClick={() => onAnalyze({ asset: sym, cls: mapClass(o.cls) })}>Run lenses <ArrowRight size={13} /></button>
                        <button className={`pr-pick-track ${isTracked ? "is-on" : ""}`} onClick={() => track(sym, mapClass(o.cls))} disabled={!!isTracked}>{isTracked ? <>✓ Tracking</> : <><Plus size={13} /> Track</>}</button>
                        <button className="pr-news-discuss" onClick={() => onDiscuss({ kind: "asset", asset: sym, cls: mapClass(o.cls), title: sym.toUpperCase(), sub: "today's brief", notes: `From today's opportunity brief — Thesis: ${o.thesis}. Signals: ${o.signals}. ${o.checks}` })} title="Discuss"><Sparkles size={13} /></button>
                        {o.ticker && o.ticker !== "—" && <TVLink sym={o.ticker} label={false} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {brief!.caveat && <div className="pr-disclaimer">{brief!.caveat}</div>}
          </>
        )}
      </div>
    </div>
  );
}
