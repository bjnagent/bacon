"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, ArrowRight, Plus, AlertTriangle, RefreshCw, Mail, MailX, ShieldAlert, ShieldOff } from "lucide-react";
import { mapClass, relTime } from "@/lib/lenses";
import type { ChatContext } from "@/lib/prompts";
import { parseOpportunities } from "@/lib/parsers";
import { auditFigures } from "@/lib/verify";
import { readTextStream } from "@/lib/readStream";
import { cachedJson, invalidate } from "@/lib/clientCache";
import { track as trackEvent } from "@/lib/track";
import { SAMPLE_INTRO, SAMPLE_ITEMS } from "@/lib/sampleBrief";
import MacroBackdrop from "./MacroBackdrop";
import BaconMark from "./BaconMark";
import TVLink from "./TVLink";
import ActivationChecklist, { type ActivationState } from "./ActivationChecklist";
import { swallowed } from "@/lib/log";

interface BriefItem { id: string; name: string; ticker: string; cls: string; horizon: string; thesis: string; signals: string; checks: string; action?: string; target?: string }
interface Brief { intro: string | null; caveat: string | null; generatedAt: string | null; items: BriefItem[] }

// Shown to an account that has never swept. `GET /api/brief` returns the latest
// brief with no date filter, so an empty response means "never generated one",
// not "none today" — which makes this precisely a first-run surface rather than
// something a returning user sees every morning before the cron fires.
//
// The example is marked in three independent places — the banner, a chip on
// every card, and the dashed frame — because the one thing worse than a blank
// slate on a financial product is a persuasive brief the user thinks is theirs.
// The cards deliberately carry no Track or Run-lenses buttons: acting on an
// example is never the intended next step, and the single CTA says so.
function SampleBrief({ onSweep }: { onSweep: () => void }) {
  const [autoOn, setAutoOn] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  useEffect(() => { trackEvent("view", "sample-brief"); }, []);

  // New accounts now default to a daily sweep, so this is no longer the only
  // thing standing between a user and tomorrow's brief. It still earns its
  // place: accounts created before that default, and anyone who switched the
  // sweep off, land here with nothing arriving on its own — and the only other
  // switch lives over on Radar, where they have no reason to look.
  const enableDaily = async () => {
    if (savingAuto || autoOn) return;
    setSavingAuto(true); setAutoOn(true);
    trackEvent("action", "auto-sweep-on", "from-sample");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scout_interval_minutes: 1440 }),   // daily; the cron honors per-user cadence
      });
      if (!res.ok) throw new Error("save failed");
      invalidate("/api/settings");
    } catch { setAutoOn(false); }
    finally { setSavingAuto(false); }
  };

  return (
    <section className="pr-sample" aria-label="Example brief">
      <div className="pr-sample-head">
        <BaconMark size={44} />
        <div className="pr-sample-copy">
          <div className="pr-sample-tag">Example — not your data</div>
          <strong>This is the shape of a brief.</strong> Bacon reads the movers, the filings and the macro
          backdrop, then writes up only the places where more than one signal agrees — no query needed.
          Below is an example; yours is built from today&apos;s real market.
        </div>
        {/* No busy state needed: `generating` unmounts this in favour of the
            full-width loader, so the button never lives long enough to spin. */}
        <button className="pr-btn" onClick={() => { trackEvent("action", "sweep", "from-sample"); onSweep(); }}>
          <RefreshCw size={14} /> SWEEP MY REAL SIGNALS
        </button>
      </div>

      <div className="pr-summary is-sample">{SAMPLE_INTRO}</div>
      <div className="pr-opp-list is-sample">
        {SAMPLE_ITEMS.map((o, i) => (
          <div key={o.id} className="pr-opp is-sample">
            <div className="pr-opp-rank">{String(i + 1).padStart(2, "0")}</div>
            <div className="pr-opp-main">
              <div className="pr-pick-head">
                <div className="pr-pick-name">{o.name}<span className="pr-sample-chip">example</span>{o.horizon && <span className="pr-opp-horizon">◷ {o.horizon}</span>}</div>
                <span className="pr-pick-class">{o.cls}</span>
              </div>
              <div className="pr-pick-why">{o.thesis}</div>
              <div className="pr-pick-now"><span>SIGNALS ▸</span> {o.signals}</div>
              <div className="pr-pick-check"><span>VERIFY</span> {o.checks}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Deliberately stated as opt-in rather than promised: nothing arrives on
          its own until this is switched on. */}
      <div className="pr-sample-foot">
        <span>
          {autoOn
            ? "Auto-sweep is on — tomorrow's brief will be waiting for you."
            : "Briefs don't arrive on their own yet. Turn on the daily sweep and Bacon assembles tomorrow's before you're up."}
        </span>
        <button className={`pr-mailtoggle ${autoOn ? "is-on" : ""}`} onClick={enableDaily} disabled={savingAuto || autoOn}>
          {autoOn ? <>✓ Daily sweep on</> : "Sweep for me daily"}
        </button>
      </div>
      <div className="pr-disclaimer">
        An illustration of the format, not a recommendation — the subjects are generic on purpose. Your
        brief names real securities, states its call, and shows the kill condition that would end it.
      </div>
    </section>
  );
}

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
  const [watchOn, setWatchOn] = useState(false);
  const [savingWatch, setSavingWatch] = useState(false);
  const [activation, setActivation] = useState<ActivationState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bd, wd, std, ad] = await Promise.all([
          cachedJson("/api/brief", 60_000), cachedJson("/api/watchlist", 30_000), cachedJson("/api/settings", 60_000),
          cachedJson("/api/activation", 60_000),
        ]) as [Record<string, unknown> & { brief?: Brief }, { items?: { symbol: string }[] }, { settings?: { brief_email_enabled?: boolean; watch_enabled?: boolean } }, Partial<ActivationState>];
        if (cancelled) return;
        if (bd.brief) setBrief(bd.brief);
        if (Array.isArray(wd.items)) { const t: Record<string, boolean> = {}; wd.items.forEach((it: { symbol: string }) => { t[it.symbol.toUpperCase()] = true; }); setTracked(t); }
        if (std.settings) { setEmailOn(!!std.settings.brief_email_enabled); setWatchOn(!!std.settings.watch_enabled); }
        if (typeof ad.swept === "boolean") setActivation({ swept: ad.swept, tracked: !!ad.tracked, analyzed: !!ad.analyzed });
      } catch (err) {
        // The empty state still handles it — but silently swallowing this is
        // how a real failure comes to look exactly like a new account with
        // nothing in it, which is the same trap the admin console fell into.
        swallowed("today: initial load", err);
      }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const generate = async () => {
    if (generating) return;
    setGenerating(true); setError(null);
    const toItems = (acc: string): Brief | null => {
      const b = parseOpportunities(acc);
      if (!b.intro && b.items.length === 0) return null;
      return {
        intro: b.intro, caveat: b.caveat, generatedAt: null,
        items: b.items.map((o, i) => ({
          id: `stream-${i}`, name: o.name, ticker: o.ticker, cls: o.cls, horizon: o.horizon,
          thesis: o.thesis, signals: o.signals, action: o.action, target: o.target,
          checks: [o.confirm && `Confirm: ${o.confirm}`, o.kill && `Kill: ${o.kill}`].filter(Boolean).join(" · "),
        })),
      };
    };
    try {
      // Cards materialize as the synthesis writes them — but parse at most once
      // per frame instead of on every chunk (hundreds of parses otherwise).
      let rafId = 0, last = "";
      const flush = () => { rafId = 0; const b = toItems(last); if (b) setBrief(b); };
      await readTextStream("/api/brief", undefined, (acc) => { last = acc; if (!rafId) rafId = requestAnimationFrame(flush); });
      if (rafId) cancelAnimationFrame(rafId);
      const bEnd = toItems(last); if (bEnd) setBrief(bEnd);
      invalidate("/api/brief");
      // The checklist reads from the server, but this sweep just happened —
      // waiting for a refetch would leave step one unticked in front of the
      // person who just completed it.
      invalidate("/api/activation");
      setActivation((a) => (a ? { ...a, swept: true } : a));
      // Swap in the persisted canonical brief (real row ids + timestamp).
      try {
        const res = await fetch("/api/brief");
        const data = await res.json();
        if (res.ok && data.brief?.items?.length) setBrief(data.brief as Brief);
      } catch { /* streamed view is already correct */ }
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

  const toggleWatch = async () => {
    if (savingWatch) return;
    const next = !watchOn;
    setSavingWatch(true); setEmailErr(null); setWatchOn(next);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watch_enabled: next }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "save failed"); }
      invalidate("/api/settings");
    } catch (err) {
      setWatchOn(!next);
      setEmailErr(err instanceof Error && /column|schema/i.test(err.message) ? "Run the latest supabase/schema.sql once to enable the watcher." : "Couldn't save — try again.");
    } finally { setSavingWatch(false); }
  };

  const track = async (ticker: string, cls: string) => {
    const sym = ticker.toUpperCase();
    if (tracked[sym]) return;
    setTracked((t) => ({ ...t, [sym]: true }));
    setActivation((a) => (a ? { ...a, tracked: true } : a));
    try { await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, asset_class: cls }) }); invalidate("/api/watchlist"); invalidate("/api/activation"); } catch { /* ignore */ }
  };

  const hasBrief = !!brief && brief.items.length > 0;
  // The checklist points every step at the SAME name — the top idea from
  // today's brief — so the three actions compose into one story rather than
  // asking the user to pick a subject three times.
  const top = brief?.items[0];
  const firstIdea = top
    ? { sym: (top.ticker && top.ticker !== "—") ? top.ticker : top.name, cls: mapClass(top.cls) }
    : null;

  return (
    <div className="pr-view">
      <MacroBackdrop />

      <div className="pr-sec pr-sec-flush">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">Today&apos;s brief</h2>
          <div className="pr-sec-actions">
            {hasBrief && brief!.generatedAt && <span className="pr-auto-lbl">assembled {relTime(brief!.generatedAt)}</span>}
            <button className={`pr-mailtoggle ${watchOn ? "is-on" : ""}`} onClick={toggleWatch} disabled={savingWatch} title={watchOn ? "Kill-condition watch is ON — the system re-checks each idea's kill trigger daily and flags it on Record (and emails if email is on)" : "Kill-condition watch is OFF"}>
              {watchOn ? <ShieldAlert size={13} /> : <ShieldOff size={13} />} {watchOn ? "Watch: ON" : "Watch: OFF"}
            </button>
            <button className={`pr-mailtoggle ${emailOn ? "is-on" : ""}`} onClick={toggleEmail} disabled={savingEmail} title={emailOn ? "Morning email is ON — the brief lands in your inbox after each sweep" : "Morning email is OFF"}>
              {emailOn ? <Mail size={13} /> : <MailX size={13} />} {emailOn ? "Email: ON" : "Email: OFF"}
            </button>
            <button className="pr-btn" onClick={generate} disabled={generating}>
              {generating ? <><Loader2 size={14} className="pr-spin" /> PIECING IT TOGETHER</> : <><RefreshCw size={14} /> {hasBrief ? "RE-SWEEP NOW" : "SWEEP NOW"}</>}
            </button>
          </div>
        </div>

        {generating && !hasBrief && (
          <div className="pr-loading"><div className="pr-bacon-bounce"><BaconMark size={46} /></div><div className="pr-loading-text">Reading the movers, the tape, and the macro backdrop — piecing today&apos;s signals together…</div></div>
        )}
        {emailErr && <div className="pr-nudge"><AlertTriangle size={14} /> {emailErr}</div>}
        {error && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn&apos;t assemble the brief.</strong><div className="pr-error-detail">{error}. Try again.</div></div></div>}

        {loaded && !hasBrief && !generating && <SampleBrief onSweep={generate} />}

        {/* Only once a brief exists. Before that the sample above is the
            guidance and carries one clear CTA; a second competing checklist
            would split attention at exactly the moment we want a single act. */}
        {hasBrief && activation && (
          <ActivationChecklist
            state={activation}
            firstIdea={firstIdea}
            onSweep={generate}
            onTrack={(sym, cls) => void track(sym, cls)}
            onAnalyze={(t) => { invalidate("/api/activation"); onAnalyze(t); }}
          />
        )}

        {hasBrief && (
          <>
            {brief!.intro && <div className="pr-summary">{brief!.intro}</div>}
            {/* Announce opportunities to assistive tech as they stream in. */}
            <div className="pr-opp-list" aria-live="polite" aria-busy={generating}>
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
                      {(o.action || o.target) && (() => {
                        const head = (o.action || "").split(/[—-]/)[0].trim().toLowerCase();
                        const tone = head.startsWith("watch") ? "is-hold" : head.startsWith("sell") || head.startsWith("avoid") ? "is-sell" : "is-buy";
                        return (
                          <div className={`pr-call ${tone}`}>
                            {o.action && <span className="pr-call-action">{o.action}</span>}
                            {o.target && <span className="pr-call-target">◎ {o.target}</span>}
                          </div>
                        );
                      })()}
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
            {(() => {
              // Verification gate: flag any hard figure across today's ideas that
              // doesn't cite a source. Only surfaces when there's something to check.
              const check = auditFigures(brief!.items.map((o) => `${o.thesis} ${o.signals}`).join(" \n "));
              if (!check.flagged.length) return null;
              return (
                <div className="pr-datacheck has-flags">
                  <div className="pr-datacheck-head">
                    <AlertTriangle size={13} />
                    <span className="pr-datacheck-title">Data check</span>
                    <span className="pr-datacheck-sum">{check.total} hard figure{check.total === 1 ? "" : "s"} in today&apos;s ideas · {check.estimates} labeled estimates · {check.flagged.length} stated as fact without a source</span>
                  </div>
                  <ul className="pr-datacheck-list">
                    {check.flagged.slice(0, 5).map((f, i) => <li key={i}><strong>{f.figure}</strong> — {f.snippet}</li>)}
                    {check.flagged.length > 5 && <li className="pr-datacheck-more">+{check.flagged.length - 5} more…</li>}
                  </ul>
                  <div className="pr-datacheck-foot">Facts should carry a source; labeled estimates are Bacon&apos;s own calls. These figures are neither — verify before acting.</div>
                </div>
              );
            })()}
            {brief!.caveat && <div className="pr-disclaimer">{brief!.caveat}</div>}
          </>
        )}
      </div>
    </div>
  );
}
