"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Radar as RadarIcon, Compass, Plus, X, Trash2, ChevronRight, LayoutGrid, AlertTriangle, ArrowRight } from "lucide-react";
import { ASSET_CLASSES, SUGGESTED_THEMES, STANCES, mapClass, relTime, type StanceKey } from "@/lib/lenses";
import type { WatchRow, ThemeRow, ScoutPickRow } from "@/lib/types";
import type { ScoutResult } from "@/lib/parsers";
import BaconMark from "./BaconMark";
import TVLink from "./TVLink";
import MacroBackdrop from "./MacroBackdrop";

const CONVICTION_LABELS = ["—", "Watching", "Tentative", "Building", "Strong", "High"];

// Home: a Scout (theme-based idea finder) + a Tracking dashboard. Ported from the
// artifact's RadarView; window.storage is replaced with Supabase, and AI calls go
// through /api/scout and /api/track-update. The in-tab auto-sweep + discuss are
// deferred to the cron and chat slices.
export default function RadarView({ onAnalyze }: { onAnalyze: (t: { asset: string; cls: string }) => void }) {
  const [items, setItems] = useState<WatchRow[]>([]);
  const [scanning, setScanning] = useState<Record<string, boolean>>({});
  const [newSym, setNewSym] = useState("");
  const [newCls, setNewCls] = useState(ASSET_CLASSES[0]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [themeInput, setThemeInput] = useState("");
  const [scout, setScout] = useState<ScoutResult | null>(null);
  const [scoutLoading, setScoutLoading] = useState(false);
  const [scoutError, setScoutError] = useState<string | null>(null);
  const [freshFinds, setFreshFinds] = useState<ScoutPickRow[]>([]);
  const [autoOn, setAutoOn] = useState(false);
  const [lastSweepAt, setLastSweepAt] = useState<string | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scanRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, t, s, st] = await Promise.all([
          fetch("/api/watchlist"), fetch("/api/themes"), fetch("/api/scout"), fetch("/api/settings"),
        ]);
        const wd = await w.json(); const td = await t.json();
        const sd = await s.json(); const std = await st.json();
        if (cancelled) return;
        if (Array.isArray(wd.items)) setItems(wd.items);
        if (Array.isArray(td.themes)) setThemes(td.themes);
        if (Array.isArray(sd.picks)) setFreshFinds(sd.picks);
        if (std.settings) { setAutoOn((std.settings.scout_interval_minutes || 0) > 0); setLastSweepAt(std.settings.last_sweep_at ?? null); }
      } catch { /* leave empty; user can retry actions */ }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const patchItem = (id: string, p: Partial<WatchRow>) => setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...p } : it));

  const scanItem = async (id: string, symbol: string, assetClass: string) => {
    if (scanRef.current[id]) return;
    scanRef.current[id] = true;
    setScanning((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch("/api/track-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, symbol, assetClass }) });
      const data = await res.json();
      if (res.ok && data.update) {
        patchItem(id, { update_text: data.update.update, watch_text: data.update.watch, lean: data.update.lean, lean_reason: data.update.leanReason, status: "ok", last_scan_at: data.update.last_scan_at });
      } else {
        patchItem(id, { status: "error" });
      }
    } catch {
      patchItem(id, { status: "error" });
    } finally {
      delete scanRef.current[id];
      setScanning((s) => { const n = { ...s }; delete n[id]; return n; });
    }
  };

  const addTracked = async (symbol: string, cls: string) => {
    const sym = symbol.trim().toUpperCase();
    if (!sym || items.some((it) => it.symbol.toUpperCase() === sym)) return;
    try {
      const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, asset_class: cls }) });
      const data = await res.json();
      if (res.ok && data.item) {
        setItems((prev) => [...prev, data.item as WatchRow]);
        scanItem(data.item.id, data.item.symbol, data.item.asset_class);
      }
    } catch { /* ignore */ }
  };

  const manualAdd = () => { if (!newSym.trim()) return; addTracked(newSym, newCls); setNewSym(""); };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    try { await fetch(`/api/watchlist/${id}`, { method: "DELETE" }); } catch { /* ignore */ }
  };

  const savePatch = async (id: string, p: { thesis?: string; conviction?: number; note?: string }) => {
    try { await fetch(`/api/watchlist/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }); } catch { /* ignore */ }
  };

  const addTheme = async (label: string) => {
    const v = (label || "").trim();
    if (!v || themes.some((t) => t.label.toLowerCase() === v.toLowerCase())) return;
    try {
      const res = await fetch("/api/themes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: v }) });
      const data = await res.json();
      if (res.ok && data.theme) setThemes((prev) => [...prev, data.theme as ThemeRow]);
    } catch { /* ignore */ }
  };

  const removeTheme = async (id: string) => {
    setThemes((prev) => prev.filter((t) => t.id !== id));
    try { await fetch("/api/themes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); } catch { /* ignore */ }
  };

  const runScout = async () => {
    if (scoutLoading) return;
    setScoutLoading(true); setScoutError(null);
    try {
      const res = await fetch("/api/scout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ themes: themes.map((t) => t.label) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setScout(data.result as ScoutResult);
    } catch (err) { setScoutError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setScoutLoading(false); }
  };

  const toggleAuto = async () => {
    if (savingAuto) return;
    const next = autoOn ? 0 : 1440; // daily; the cron honors per-user cadence
    setSavingAuto(true); setAutoOn(!autoOn);
    try { await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scout_interval_minutes: next }) }); }
    catch { setAutoOn(autoOn); }
    finally { setSavingAuto(false); }
  };

  const isTracked = (a: string) => items.some((it) => it.symbol.toUpperCase() === (a || "").toUpperCase());
  const pendingCount = Object.keys(scanning).length;
  const rescanAll = () => { items.forEach((it) => scanItem(it.id, it.symbol, it.asset_class)); };

  return (
    <div className="pr-view">
      <MacroBackdrop />
      <div className="pr-rdr-head pr-rdr-head--split">
        <div className="pr-rdr-head-text">
          <div className="pr-hero-eyebrow">Scout · Track · Verify</div>
          <h1 className="pr-rdr-title">Your radar finds and watches. You decide.</h1>
          <p className="pr-rdr-honest">BACON scouts the public record — news, filings, catalysts — via live web search, and tracks how each name&apos;s story evolves. It carries no live price feed: updates are qualitative reads, not signals. Verify before acting. Not financial advice.</p>
        </div>
        <div className="pr-hero-prism"><BaconMark size={132} /></div>
      </div>

      <div className="pr-sec">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">Tracking</h2>
          <div className="pr-sec-actions">
            {items.length > 0 && <button className="pr-btn-sm" onClick={rescanAll} disabled={pendingCount > 0}>{pendingCount > 0 ? <><Loader2 size={13} className="pr-spin" /> {pendingCount} scanning</> : <><RefreshCw size={13} /> Rescan all</>}</button>}
          </div>
        </div>

        <div className="pr-add">
          <span className="pr-add-prompt">+</span>
          <input className="pr-input" placeholder="ADD A TICKER TO TRACK — e.g. NVDA, USD/JPY, GOLD" value={newSym} onChange={(e) => setNewSym(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") manualAdd(); }} aria-label="Add ticker" />
          <select className="pr-select" value={newCls} onChange={(e) => setNewCls(e.target.value)} aria-label="Asset class">{ASSET_CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="pr-btn" onClick={manualAdd} disabled={!newSym.trim()}>TRACK <Plus size={14} /></button>
        </div>

        {!loaded && (
          <div className="pr-trk-list" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="pr-skel-card">
                <div className="pr-skel pr-skel-line is-w40" />
                <div className="pr-skel pr-skel-line is-w90" />
                <div className="pr-skel pr-skel-line is-w70" />
              </div>
            ))}
          </div>
        )}
        {loaded && items.length === 0 && (
          <div className="pr-empty"><RadarIcon size={26} /><div>Nothing on the griddle yet. Scout picks below and tap <strong>+ Track</strong>, or add a ticker above — BACON then watches each name for new developments.</div></div>
        )}

        <div className="pr-trk-list">
          {items.map((it) => {
            const st = it.lean && it.lean in STANCES ? STANCES[it.lean as StanceKey] : null;
            const rel = relTime(it.last_scan_at);
            const isScan = !!scanning[it.id];
            return (
              <div key={it.id} className="pr-trk" style={{ "--h": st ? st.tone : "var(--muted2)" } as React.CSSProperties}>
                <div className="pr-trk-top">
                  <span className="pr-trk-name">{it.symbol.toUpperCase()}</span>
                  <span className="pr-trk-class">{it.asset_class}</span>
                  <span className="pr-trk-lean" style={st ? { color: st.tone, borderColor: st.tone } : {}}>{st ? st.label : "unscanned"}</span>
                </div>

                {isScan ? (
                  <div className="pr-trk-update is-scan"><Loader2 size={12} className="pr-spin" /> scanning the public record…</div>
                ) : it.status === "error" ? (
                  <div className="pr-trk-update is-err">scan failed — tap rescan to retry.</div>
                ) : it.update_text ? (
                  <div className="pr-trk-update">{it.update_text}{it.lean_reason && <span className="pr-trk-reason"> — {it.lean_reason}</span>}</div>
                ) : (
                  <div className="pr-trk-update is-muted">Not scanned yet — rescan to fetch the latest developments.</div>
                )}
                {it.watch_text && !isScan && <div className="pr-trk-watch"><span>WATCH ▸</span> {it.watch_text}</div>}

                <div className="pr-trk-meta">
                  <span className="pr-trk-when">{rel ? `scanned ${rel}` : "never scanned"}</span>
                  <div className="pr-trk-btns">
                    <button onClick={() => scanItem(it.id, it.symbol, it.asset_class)} disabled={isScan} title="Rescan"><RefreshCw size={13} /> rescan</button>
                    <button onClick={() => onAnalyze({ asset: it.symbol, cls: it.asset_class })} title="Open six-lens cockpit"><LayoutGrid size={13} /> lenses</button>
                    <TVLink sym={it.symbol} />
                    <button onClick={() => setExpanded(expanded === it.id ? null : it.id)} title="Thesis"><ChevronRight size={13} className={expanded === it.id ? "pr-rot" : ""} /> thesis</button>
                    <button onClick={() => remove(it.id)} className="is-danger" title="Remove"><Trash2 size={13} /></button>
                  </div>
                </div>

                {expanded === it.id && (
                  <div className="pr-trk-expand">
                    <label className="pr-wl-label">Your thesis</label>
                    <textarea className="pr-textarea" placeholder="Why might this work? Which lenses agree? What would prove you wrong?" value={it.thesis || ""} onChange={(e) => patchItem(it.id, { thesis: e.target.value })} onBlur={(e) => savePatch(it.id, { thesis: e.target.value })} rows={3} />
                    <div className="pr-wl-conviction">
                      <label className="pr-wl-label">Conviction</label>
                      <div className="pr-conviction-dots">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`pr-conviction-dot ${(it.conviction || 0) >= n ? "is-on" : ""}`} onClick={() => { patchItem(it.id, { conviction: n }); savePatch(it.id, { conviction: n }); }} aria-label={`Conviction ${n}`} />)}</div>
                      <span className="pr-conviction-val">{CONVICTION_LABELS[it.conviction || 0]}</span>
                    </div>
                    <input className="pr-wl-note" placeholder="Position note — size, entry zone, stop, review date…" value={it.note || ""} onChange={(e) => patchItem(it.id, { note: e.target.value })} onBlur={(e) => savePatch(it.id, { note: e.target.value })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pr-sec">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">Scout</h2>
          <div className="pr-sec-actions">
            <div className="pr-auto">
              <span className={`pr-auto-lbl ${autoOn ? "is-on" : ""}`}>{autoOn ? (lastSweepAt ? `● daily · swept ${relTime(lastSweepAt)}` : "● daily auto-sweep on") : "auto-sweep off"}</span>
              <button className="pr-btn-sm" onClick={toggleAuto} disabled={savingAuto}>{autoOn ? "Turn off" : "Auto-sweep daily"}</button>
            </div>
            <button className="pr-btn" onClick={runScout} disabled={scoutLoading}>{scoutLoading ? <><Loader2 size={14} className="pr-spin" /> SCOUTING</> : <><RadarIcon size={14} /> SCOUT NOW</>}</button>
          </div>
        </div>

        {loaded && autoOn && freshFinds.length === 0 && (
          <div className="pr-nudge"><Compass size={14} /> Auto-sweep is armed — your first <strong>fresh finds</strong> drop lands with the next daily sweep. Don&apos;t want to wait? Hit <strong>Scout now</strong>.</div>
        )}

        {freshFinds.length > 0 && (
          <>
            <div className="pr-summary">Fresh finds from your last automatic sweep — today&apos;s market movers and theme matches. Momentum decays; verify before acting.</div>
            <div className="pr-pick-grid">
              {freshFinds.map((p) => {
                const sym = (p.symbol && p.symbol !== "—") ? p.symbol : p.name;
                const tracked = isTracked(sym);
                return (
                  <div key={p.id} className="pr-pick">
                    <div className="pr-pick-head">
                      <div className="pr-pick-name">{p.name}{p.symbol && p.symbol !== "—" && <span className="pr-pick-ticker">{p.symbol}</span>}{p.kind === "mover" && p.change_pct && <span className="pr-pick-move">▲ {p.change_pct}</span>}</div>
                      <span className="pr-pick-class">{p.asset_class}</span>
                    </div>
                    <div className="pr-pick-why">{p.why}</div>
                    {p.now_catalyst && <div className="pr-pick-now"><span>NOW ▸</span> {p.now_catalyst}</div>}
                    {p.check_text && <div className="pr-pick-check"><span>CHECK</span> {p.check_text}</div>}
                    {p.data_source && <div className="pr-pick-src">% move via {p.data_source} · verify at source</div>}
                    <div className="pr-pick-actions">
                      <button className={`pr-pick-track ${tracked ? "is-on" : ""}`} onClick={() => addTracked(sym, mapClass(p.asset_class))} disabled={tracked}>{tracked ? <>✓ Tracking</> : <><Plus size={13} /> Track</>}</button>
                      <button className="pr-pick-lenses" onClick={() => onAnalyze({ asset: sym, cls: mapClass(p.asset_class) })}>Run lenses <ArrowRight size={13} /></button>
                      {p.symbol && p.symbol !== "—" && <TVLink sym={p.symbol} label={false} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="pr-scout-themes">
          <span className="pr-scout-lbl">themes</span>
          {themes.map((t) => <span key={t.id} className="pr-theme">{t.label}<button onClick={() => removeTheme(t.id)} aria-label={`Remove ${t.label}`}><X size={11} /></button></span>)}
          <span className="pr-theme-add">
            <input value={themeInput} onChange={(e) => setThemeInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addTheme(themeInput); setThemeInput(""); } }} placeholder="+ add theme" aria-label="Add theme" />
          </span>
        </div>
        {themes.length === 0 && (
          <div className="pr-theme-sugg">
            <span className="pr-scout-lbl">try</span>
            {SUGGESTED_THEMES.map((t) => <button key={t} className="pr-chip" onClick={() => addTheme(t)}>{t}</button>)}
          </div>
        )}

        {scoutLoading && <div className="pr-loading"><div className="pr-loading-text">Sniffing out fresh candidates across the public record…</div></div>}
        {scoutError && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Scout couldn&apos;t run.</strong><div className="pr-error-detail">{scoutError}. Try again.</div></div></div>}

        {!scoutLoading && !scout && themes.length === 0 && (
          <div className="pr-empty"><Compass size={26} /><div>Add a theme or two above, then hit <strong>Scout now</strong>. BACON surfaces real, timely candidates with the catalyst behind each. Or scout the broad market with no themes set.</div></div>
        )}

        {scout && (
          <>
            {scout.intro && <div className="pr-summary">{scout.intro}</div>}
            <div className="pr-pick-grid">
              {scout.picks.map((p, i) => {
                const sym = (p.ticker && p.ticker !== "—") ? p.ticker : p.name;
                const tracked = isTracked(sym);
                return (
                  <div key={i} className="pr-pick">
                    <div className="pr-pick-head">
                      <div className="pr-pick-name">{p.name}{p.ticker && p.ticker !== "—" && <span className="pr-pick-ticker">{p.ticker}</span>}</div>
                      <span className="pr-pick-class">{p.cls}</span>
                    </div>
                    <div className="pr-pick-why">{p.why}</div>
                    {p.now && <div className="pr-pick-now"><span>NOW ▸</span> {p.now}</div>}
                    {p.check && <div className="pr-pick-check"><span>CHECK</span> {p.check}</div>}
                    <div className="pr-pick-actions">
                      <button className={`pr-pick-track ${tracked ? "is-on" : ""}`} onClick={() => addTracked(sym, mapClass(p.cls))} disabled={tracked}>{tracked ? <>✓ Tracking</> : <><Plus size={13} /> Track</>}</button>
                      <button className="pr-pick-lenses" onClick={() => onAnalyze({ asset: sym, cls: mapClass(p.cls) })}>Run lenses <ArrowRight size={13} /></button>
                      {p.ticker && p.ticker !== "—" && <TVLink sym={p.ticker} label={false} />}
                    </div>
                  </div>
                );
              })}
            </div>
            {scout.caveat && <div className="pr-disclaimer">{scout.caveat}</div>}
          </>
        )}
      </div>
    </div>
  );
}
