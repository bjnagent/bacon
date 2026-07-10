"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, ArrowRight, ArrowUpRight, AlertTriangle, Scale, LayoutGrid, Bookmark, MessageCircle, Users } from "lucide-react";
import { LENSES, STANCES, ASSET_CLASSES, PERSONAS, overallLean, type LensKey, type StanceKey } from "@/lib/lenses";
import { toPoints, parseBriefing, type Briefing, type Debate } from "@/lib/parsers";
import { readTextStream } from "@/lib/readStream";
import type { ChatContext } from "@/lib/prompts";
import Spectrum from "./Spectrum";
import ConvictionRadar from "./ConvictionRadar";
import TVLink from "./TVLink";
import TradingViewChart from "./TradingViewChart";

// Six-lens cockpit + convergence gauge + Bull/Bear debate. Ported from the
// artifact's AnalyzeView; the in-browser Anthropic calls are replaced by our
// server routes (/api/analyze, /api/debate) and "save" persists to Supabase.
export default function AnalyzeView({ target, onDiscuss, quickSyms = [] }: { target?: { asset: string; cls: string; token: number }; onDiscuss: (ctx: ChatContext) => void; quickSyms?: string[] }) {
  const [query, setQuery] = useState("");
  const [assetClass, setAssetClass] = useState(ASSET_CLASSES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [rawFallback, setRawFallback] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState("");
  const [ranAt, setRanAt] = useState("");
  const [subView, setSubView] = useState<"lenses" | "debate" | "personas">("lenses");
  const [saved, setSaved] = useState(false);
  const [debate, setDebate] = useState<Debate | null>(null);
  const [debateLoading, setDebateLoading] = useState(false);
  const [debateError, setDebateError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Record<string, string> | null>(null);
  const [personasLoading, setPersonasLoading] = useState(false);
  const [personasError, setPersonasError] = useState<string | null>(null);
  const prevToken = useRef(0);

  const run = async (assetArg?: string, clsArg?: string) => {
    const asset = (assetArg ?? query).trim();
    const klass = clsArg ?? assetClass;
    if (!asset || loading) return;
    setLoading(true); setError(null); setBriefing(null); setRawFallback(null);
    setSaved(false); setSubView("lenses"); setDebate(null); setDebateError(null); setPersonas(null); setPersonasError(null);
    setAnalyzed(asset); // header + live chart mount immediately; lenses stream in
    try {
      const full = await readTextStream("/api/analyze", { asset, assetClass: klass }, (acc) => {
        // Progressive parse: panels appear the moment their ===SECTION=== lands.
        const partial = parseBriefing(acc);
        if (partial.SUMMARY || Object.keys(partial.lenses).length > 0) setBriefing(partial);
      });
      const parsed = parseBriefing(full);
      if (parsed.SUMMARY || Object.keys(parsed.lenses).length >= 3) setBriefing(parsed);
      else { setBriefing(null); setRawFallback(full); }
      setRanAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) { setBriefing(null); setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setLoading(false); }
  };

  const openDebate = async () => {
    setSubView("debate");
    if (debate || debateLoading || !analyzed) return;
    setDebateLoading(true); setDebateError(null);
    try {
      const res = await fetch("/api/debate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset: analyzed, assetClass }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setDebate(data.debate as Debate);
    } catch (err) { setDebateError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setDebateLoading(false); }
  };

  const openPersonas = async () => {
    setSubView("personas");
    if (personas || personasLoading || !analyzed) return;
    setPersonasLoading(true); setPersonasError(null);
    try {
      const res = await fetch("/api/personas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset: analyzed, assetClass }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setPersonas(data.personas as Record<string, string>);
    } catch (err) { setPersonasError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setPersonasLoading(false); }
  };

  const save = async () => {
    if (saved) return;
    try {
      const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: analyzed, asset_class: assetClass }) });
      if (res.ok) setSaved(true);
    } catch { /* leave unsaved; user can retry */ }
  };

  // When opened from Radar/Scout with a target, auto-run that asset. setState is
  // deferred into a timeout so it doesn't fire synchronously inside the effect.
  useEffect(() => {
    if (!target?.token || target.token === prevToken.current) return;
    prevToken.current = target.token;
    const asset = target.asset, cls = target.cls;
    const id = setTimeout(() => { setQuery(asset); setAssetClass(cls); run(asset, cls); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.token]);

  const hasBriefing = !!briefing;
  const stances: Partial<Record<LensKey, StanceKey>> = {};
  if (hasBriefing) LENSES.forEach((l) => { stances[l.key] = briefing!.lenses[l.key]?.stance || "mixed"; });
  const lean = hasBriefing ? overallLean(stances) : null;
  const analysisNotes = hasBriefing && briefing
    ? [briefing.SUMMARY && `Summary: ${briefing.SUMMARY}`, `Lens leans — ${LENSES.map((l) => `${l.name}: ${briefing.lenses[l.key]?.stance || "mixed"}`).join("; ")}`, briefing.BOTTOMLINE && `Bottom line: ${briefing.BOTTOMLINE}`].filter(Boolean).join("\n")
    : undefined;

  return (
    <div className="pr-view">
      {!hasBriefing && !rawFallback && !loading && (
        <div className="pr-hero">
          <div className="pr-hero-eyebrow">Deep-dive · multi-lens cockpit</div>
          <h1 className="pr-hero-title">Run any asset through eight professional lenses.</h1>
          <Spectrum height={6} className="pr-hero-spectrum" />
          <p className="pr-hero-sub">For when you want the full read on one name. BACON pulls live public data to show what each lens sees, where they converge, and what you must verify — then save it to your radar to keep tracking it.</p>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="pr-command">
        <div className="pr-command-row">
          <span className="pr-command-prompt">›</span>
          <input className="pr-input" placeholder="TICKER OR ASSET — e.g. NVDA, USD/JPY, GOLD, VOO, BTC" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Asset to analyze" />
          <select className="pr-select" value={assetClass} onChange={(e) => setAssetClass(e.target.value)} aria-label="Asset class">{ASSET_CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="pr-btn" type="submit" disabled={!query.trim() || loading}>{loading ? <Loader2 size={16} className="pr-spin" /> : <>RUN <ArrowRight size={15} /></>}</button>
        </div>
        <div className="pr-command-hint">Live web search · typically 20–40s · live chart via TradingView</div>
        {!hasBriefing && !loading && quickSyms.length > 0 && (
          <div className="pr-quickrun">
            <span className="pr-quickrun-lbl">Your radar ▸</span>
            {quickSyms.slice(0, 8).map((s) => (
              <button key={s} type="button" className="pr-chip" onClick={() => { setQuery(s); setAssetClass(s.includes("/") ? "FX / Currency pair" : assetClass); run(s, s.includes("/") ? "FX / Currency pair" : undefined); }}>{s}</button>
            ))}
          </div>
        )}
      </form>

      {loading && !hasBriefing && (
        <div className="pr-loading">
          <div className="pr-loading-lenses">{LENSES.map((l, i) => <div key={l.key} className="pr-loading-lens" style={{ animationDelay: `${i * 0.18}s` }}><span className="pr-loading-dot" style={{ background: l.hue }} />{l.short}</div>)}</div>
          <div className="pr-loading-text">Sizzling through every lens — live search on the wire…</div>
        </div>
      )}
      {error && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn&apos;t complete the analysis.</strong><div className="pr-error-detail">{error}. Check your connection and try again — the live search occasionally times out.</div></div></div>}
      {rawFallback && <div className="pr-result"><div className="pr-raw">{rawFallback}</div></div>}

      {hasBriefing && briefing && (
        <div className="pr-result">
          <div className="pr-readout">
            <div className="pr-readout-id">
              <div className="pr-readout-ticker">{analyzed.toUpperCase()}</div>
              <div className="pr-readout-sub">{assetClass}<span className="pr-readout-sep">·</span>analyzed {ranAt}</div>
            </div>
            <div className="pr-readout-lean">
              <div className="pr-readout-leanlabel">Aggregate lens lean</div>
              <div className="pr-readout-leanval" style={{ color: lean!.tone }}>{lean!.label}</div>
              <div className="pr-readout-leannote">synthesis of the lens stances — not a rating or signal</div>
            </div>
            <TVLink sym={analyzed} square />
            <button className="pr-readout-discuss" onClick={() => onDiscuss({ kind: "asset", asset: analyzed, cls: assetClass, title: analyzed.toUpperCase(), sub: "multi-lens analysis", notes: analysisNotes })} title="Discuss this asset"><MessageCircle size={16} /></button>
            <button className={`pr-readout-save ${saved ? "is-saved" : ""}`} onClick={save} disabled={saved} title={saved ? "On radar" : "Track on radar"}><Bookmark size={16} /></button>
          </div>

          <div className="pr-result-chart"><TradingViewChart symbol={analyzed} height={360} /></div>

          <div className="pr-subnav">
            <button className={`pr-subnav-btn ${subView === "lenses" ? "is-active" : ""}`} onClick={() => setSubView("lenses")}><LayoutGrid size={14} /> Lens cockpit</button>
            <button className={`pr-subnav-btn ${subView === "debate" ? "is-active" : ""}`} onClick={openDebate}><Scale size={14} /> Bull vs Bear</button>
            <button className={`pr-subnav-btn ${subView === "personas" ? "is-active" : ""}`} onClick={openPersonas}><Users size={14} /> Investor takes</button>
          </div>

          {subView === "lenses" && (
            <>
              {briefing.SUMMARY && <div className="pr-summary">{briefing.SUMMARY}</div>}
              <div className="pr-cluster">
                <div className="pr-cluster-gauge">
                  <div className="pr-cluster-cap">Convergence gauge</div>
                  <ConvictionRadar stances={stances} />
                </div>
                <div className="pr-cluster-bank">
                  <div className="pr-cluster-cap">Lens stance bank</div>
                  <div className="pr-led-list">
                    {LENSES.map((l) => { const st = STANCES[stances[l.key] || "mixed"]; return (
                      <div key={l.key} className="pr-led-row">
                        <span className="pr-led" style={{ background: st.tone, boxShadow: `0 0 7px ${st.tone}` }} />
                        <span className="pr-led-name">{l.name}</span>
                        <span className="pr-led-stance" style={{ color: st.tone }}>{st.label}</span>
                      </div>); })}
                  </div>
                  <div className="pr-cluster-note">Where each lens leans in BACON&apos;s reading. The gauge shape shows convergence — not a score, rating, or forecast.</div>
                </div>
              </div>
              <div className="pr-grid">
                {LENSES.map((l, i) => { const sec = briefing.lenses[l.key]; const st = STANCES[sec?.stance || "mixed"]; return (
                  <div key={l.key} className="pr-panel" style={{ "--h": l.hue } as React.CSSProperties}>
                    <div className="pr-panel-top">
                      <span className="pr-panel-idx">L{String(i + 1).padStart(2, "0")}</span>
                      <span className="pr-panel-name" style={{ color: l.hue }}>{l.name}</span>
                      <span className="pr-panel-stance" style={{ color: st.tone, borderColor: st.tone }}>{st.label}</span>
                    </div>
                    <p className="pr-panel-body">{sec?.body || "No read returned."}</p>
                    {sec?.verify && <div className="pr-panel-verify"><span style={{ color: l.hue }}>VERIFY ▸</span> {sec.verify}</div>}
                  </div>); })}
              </div>
              {briefing.BOTTOMLINE && <div className="pr-bottomline"><div className="pr-bottomline-label">Bottom line</div>{briefing.BOTTOMLINE}</div>}
              <div className="pr-disclaimer">BACON synthesizes public information and may be incomplete or out of date. Live prices/charts are from TradingView; Bacon&apos;s analysis stays qualitative and is not financial advice. The lenses can disagree — confirm every figure independently and decide for yourself.</div>
            </>
          )}

          {subView === "debate" && (
            <div className="pr-debate">
              {debateLoading && <div className="pr-loading"><div className="pr-loading-text"><Loader2 size={16} className="pr-spin" style={{ verticalAlign: "-3px", marginRight: 8 }} />Steelmanning both sides from current sources…</div></div>}
              {debateError && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn&apos;t run the debate.</strong><div className="pr-error-detail">{debateError}. Try again.</div></div></div>}
              {debate && (
                <>
                  <div className="pr-debate-cols">
                    <div className="pr-debate-card is-bull"><div className="pr-debate-head"><ArrowUpRight size={16} /> The bull case</div><ul>{toPoints(debate.BULL).map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                    <div className="pr-debate-card is-bear"><div className="pr-debate-head"><ArrowRight size={16} style={{ transform: "rotate(45deg)" }} /> The bear case</div><ul>{toPoints(debate.BEAR).map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                  </div>
                  {debate.SYNTHESIS && <div className="pr-bottomline"><div className="pr-bottomline-label">Where it hinges</div>{debate.SYNTHESIS}</div>}
                  <div className="pr-disclaimer">This steelmans both sides from public information to expose the real disagreement. It is not a recommendation — a convincing argument is not the same as a correct one.</div>
                </>
              )}
            </div>
          )}

          {subView === "personas" && (
            <div className="pr-debate">
              {personasLoading && <div className="pr-loading"><div className="pr-loading-text"><Loader2 size={16} className="pr-spin" style={{ verticalAlign: "-3px", marginRight: 8 }} />Reading the asset through four investor disciplines…</div></div>}
              {personasError && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn&apos;t run the takes.</strong><div className="pr-error-detail">{personasError}. Try again.</div></div></div>}
              {personas && (
                <>
                  <div className="pr-grid">
                    {PERSONAS.map((p) => (
                      <div key={p.key} className="pr-panel" style={{ "--h": p.hue } as React.CSSProperties}>
                        <div className="pr-panel-top">
                          <span className="pr-panel-name" style={{ color: p.hue }}>{p.name}</span>
                          <span className="pr-panel-stance" style={{ color: p.hue, borderColor: p.hue }}>{p.lens}</span>
                        </div>
                        <p className="pr-panel-body">{personas[p.key] || "No read returned."}</p>
                      </div>
                    ))}
                  </div>
                  <div className="pr-disclaimer">Stylized analytical lenses in the spirit of well-known disciplines — not the actual views of any person, and not advice. Steelman each, then verify independently.</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
