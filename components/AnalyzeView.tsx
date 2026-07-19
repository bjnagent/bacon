"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, ArrowRight, ArrowUpRight, AlertTriangle, Scale, LayoutGrid, Bookmark, MessageCircle, Users, ShieldAlert, Network } from "lucide-react";
import { LENSES, STANCES, ASSET_CLASSES, PERSONAS, overallLean, type LensKey, type StanceKey } from "@/lib/lenses";
import { toPoints, parseBriefing, type Briefing, type Debate } from "@/lib/parsers";
import { auditBriefingText } from "@/lib/verify";
import { readTextStream } from "@/lib/readStream";
import { invalidate } from "@/lib/clientCache";
import type { ChatContext } from "@/lib/prompts";
import Spectrum from "./Spectrum";
import BaconMark from "./BaconMark";
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
  const [subView, setSubView] = useState<"lenses" | "debate" | "personas" | "redteam" | "chain">("lenses");
  const [saved, setSaved] = useState(false);
  const [debate, setDebate] = useState<Debate | null>(null);
  const [debateLoading, setDebateLoading] = useState(false);
  const [debateError, setDebateError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Record<string, string> | null>(null);
  const [personasLoading, setPersonasLoading] = useState(false);
  const [personasError, setPersonasError] = useState<string | null>(null);
  const [redteam, setRedteam] = useState<Debate | null>(null);
  const [redteamLoading, setRedteamLoading] = useState(false);
  const [redteamError, setRedteamError] = useState<string | null>(null);
  const [chain, setChain] = useState<Debate | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const prevToken = useRef(0);

  const run = async (assetArg?: string, clsArg?: string) => {
    const asset = (assetArg ?? query).trim();
    const klass = clsArg ?? assetClass;
    if (!asset || loading) return;
    setLoading(true); setError(null); setBriefing(null); setRawFallback(null);
    setSaved(false); setSubView("lenses"); setDebate(null); setDebateError(null); setPersonas(null); setPersonasError(null);
    setRedteam(null); setRedteamError(null); setChain(null); setChainError(null);
    setAnalyzed(asset); // header + live chart mount immediately; lenses stream in
    try {
      // Progressive parse: panels appear as ===SECTION===s land — throttled to
      // one parse per frame rather than one per streamed chunk.
      let rafId = 0, last = "";
      const flush = () => { rafId = 0; const partial = parseBriefing(last); if (partial.SUMMARY || Object.keys(partial.lenses).length > 0) setBriefing(partial); };
      const full = await readTextStream("/api/analyze", { asset, assetClass: klass }, (acc) => { last = acc; if (!rafId) rafId = requestAnimationFrame(flush); });
      if (rafId) cancelAnimationFrame(rafId);
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

  const openRedteam = async () => {
    setSubView("redteam");
    if (redteam || redteamLoading || !analyzed) return;
    setRedteamLoading(true); setRedteamError(null);
    try {
      const res = await fetch("/api/redteam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset: analyzed, assetClass }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setRedteam(data.redteam as Debate);
    } catch (err) { setRedteamError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setRedteamLoading(false); }
  };

  const openChain = async () => {
    setSubView("chain");
    if (chain || chainLoading || !analyzed) return;
    setChainLoading(true); setChainError(null);
    try {
      const res = await fetch("/api/chain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset: analyzed, assetClass }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setChain(data.chain as Debate);
    } catch (err) { setChainError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setChainLoading(false); }
  };

  const save = async () => {
    if (saved) return;
    try {
      const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: analyzed, asset_class: assetClass }) });
      if (res.ok) { setSaved(true); invalidate("/api/watchlist"); } // refresh the shared cache so the save shows app-wide
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
  // Memoized on `briefing` so the streamed re-render (one setBriefing per frame)
  // doesn't re-run the lens loop + the four-regex figure audit over all 8 lenses
  // on every chunk — that was hundreds of full audits across a 20-40s stream.
  const { stances, lean, analysisNotes, dataCheck } = useMemo(() => {
    const stances: Partial<Record<LensKey, StanceKey>> = {};
    if (!briefing) return { stances, lean: null as ReturnType<typeof overallLean> | null, analysisNotes: undefined as string | undefined, dataCheck: null as ReturnType<typeof auditBriefingText> | null };
    LENSES.forEach((l) => { stances[l.key] = briefing.lenses[l.key]?.stance || "mixed"; });
    const lean = overallLean(stances);
    const analysisNotes = [briefing.SUMMARY && `Summary: ${briefing.SUMMARY}`, `Lens leans — ${LENSES.map((l) => `${l.name}: ${briefing.lenses[l.key]?.stance || "mixed"}`).join("; ")}`, briefing.BOTTOMLINE && `Bottom line: ${briefing.BOTTOMLINE}`].filter(Boolean).join("\n");
    const dataCheck = auditBriefingText({ summary: briefing.SUMMARY, bottomline: briefing.BOTTOMLINE, lensBodies: LENSES.map((l) => briefing.lenses[l.key]?.body || "") });
    return { stances, lean, analysisNotes, dataCheck };
  }, [briefing]);

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
          <div className="pr-bacon-bounce"><BaconMark size={46} /></div>
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
              <div className="pr-readout-leannote">how the lenses vote — the verdict below is the call</div>
            </div>
            <TVLink sym={analyzed} square />
            <button className="pr-readout-discuss" onClick={() => onDiscuss({ kind: "asset", asset: analyzed, cls: assetClass, title: analyzed.toUpperCase(), sub: "multi-lens analysis", notes: analysisNotes })} title="Discuss this asset"><MessageCircle size={16} /></button>
            <button className={`pr-readout-save ${saved ? "is-saved" : ""}`} onClick={save} disabled={saved} title={saved ? "On radar" : "Track on radar"}><Bookmark size={16} /></button>
          </div>

          {briefing.VERDICT && (() => {
            const head = briefing.VERDICT.split(/[·\n]/)[0].trim().toLowerCase();
            const tone = head.startsWith("buy") ? "is-buy" : head.startsWith("sell") ? "is-sell" : "is-hold";
            return (
              <div className={`pr-verdict-banner ${tone}`}>
                <div className="pr-verdict-call">{briefing.VERDICT.split("\n")[0]}</div>
                {briefing.VERDICT.split("\n").slice(1).map((l, i) => <div key={i} className="pr-verdict-line">{l}</div>)}
              </div>
            );
          })()}

          <div className="pr-result-chart"><TradingViewChart symbol={analyzed} height={360} /></div>

          <div className="pr-subnav">
            <button className={`pr-subnav-btn ${subView === "lenses" ? "is-active" : ""}`} onClick={() => setSubView("lenses")}><LayoutGrid size={14} /> Lens cockpit</button>
            <button className={`pr-subnav-btn ${subView === "debate" ? "is-active" : ""}`} onClick={openDebate}><Scale size={14} /> Bull vs Bear</button>
            <button className={`pr-subnav-btn ${subView === "redteam" ? "is-active" : ""}`} onClick={openRedteam}><ShieldAlert size={14} /> Red team</button>
            <button className={`pr-subnav-btn ${subView === "chain" ? "is-active" : ""}`} onClick={openChain}><Network size={14} /> Chain map</button>
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
              <div className="pr-grid" aria-live="polite" aria-busy={loading}>
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
              {dataCheck && dataCheck.total > 0 && (
                <div className={`pr-datacheck ${dataCheck.flagged.length ? "has-flags" : "is-clean"}`}>
                  <div className="pr-datacheck-head">
                    {dataCheck.flagged.length > 0 && <AlertTriangle size={13} />}
                    <span className="pr-datacheck-title">Data check</span>
                    <span className="pr-datacheck-sum">{dataCheck.total} hard figure{dataCheck.total === 1 ? "" : "s"} · {dataCheck.cited} sourced · {dataCheck.estimates} labeled estimates · {dataCheck.flagged.length} to verify</span>
                  </div>
                  {dataCheck.flagged.length > 0 && (
                    <ul className="pr-datacheck-list">
                      {dataCheck.flagged.slice(0, 6).map((f, i) => <li key={i}><strong>{f.figure}</strong> — {f.snippet}</li>)}
                      {dataCheck.flagged.length > 6 && <li className="pr-datacheck-more">+{dataCheck.flagged.length - 6} more…</li>}
                    </ul>
                  )}
                  <div className="pr-datacheck-foot">{dataCheck.flagged.length ? "These figures are stated as fact without a source — confirm before relying on them. (Labeled estimates are opinions, not facts, and aren't flagged.)" : "Every factual figure names a source or the live data; the rest are labeled estimates. Verify what matters."}</div>
                </div>
              )}
              <div className="pr-disclaimer">AI-generated opinion: current facts are web-grounded, forward targets are estimates. Charts are live via TradingView. You own the final decision.</div>
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
                  {debate.SYNTHESIS && <div className="pr-bottomline"><div className="pr-bottomline-label">Who wins &amp; why</div>{debate.SYNTHESIS}</div>}
                  <div className="pr-disclaimer">Both sides steelmanned from public information, then judged. A convincing argument still isn&apos;t a guarantee — watch the flip condition.</div>
                </>
              )}
            </div>
          )}

          {subView === "redteam" && (
            <div className="pr-debate">
              {redteamLoading && <div className="pr-loading"><div className="pr-loading-text"><Loader2 size={16} className="pr-spin" style={{ verticalAlign: "-3px", marginRight: 8 }} />Attacking the investment — worst case first…</div></div>}
              {redteamError && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn&apos;t run the red team.</strong><div className="pr-error-detail">{redteamError}. Try again.</div></div></div>}
              {redteam && (
                <>
                  <div className="pr-debate-card is-bear"><div className="pr-debate-head"><ShieldAlert size={16} /> 10 ways this loses your money</div><ul>{toPoints(redteam.RISKS).map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                  {redteam.ODDS && <div className="pr-bottomline"><div className="pr-bottomline-label">Which are actually likely</div>{redteam.ODDS}</div>}
                  {redteam.VERDICT && (() => {
                    const head = redteam.VERDICT.toLowerCase();
                    const tone = head.startsWith("proceed") ? (head.startsWith("proceed smaller") ? "is-hold" : "is-buy") : "is-sell";
                    return <div className={`pr-verdict-banner ${tone}`}><div className="pr-verdict-call">{redteam.VERDICT}</div></div>;
                  })()}
                  <div className="pr-disclaimer">The red team argues the downside on purpose — weigh it against the lens read before acting.</div>
                </>
              )}
            </div>
          )}

          {subView === "chain" && (
            <div className="pr-debate">
              {chainLoading && <div className="pr-loading"><div className="pr-loading-text"><Loader2 size={16} className="pr-spin" style={{ verticalAlign: "-3px", marginRight: 8 }} />Mapping second- and third-degree winners &amp; losers…</div></div>}
              {chainError && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn&apos;t map the chain.</strong><div className="pr-error-detail">{chainError}. Try again.</div></div></div>}
              {chain && (
                <>
                  {chain.MAP && <div className="pr-summary">{chain.MAP}</div>}
                  <div className="pr-debate-cols">
                    <div className="pr-debate-card is-bull"><div className="pr-debate-head"><ArrowUpRight size={16} /> Non-obvious winners</div><ul>{toPoints(chain.WINNERS).map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                    <div className="pr-debate-card is-bear"><div className="pr-debate-head"><ArrowRight size={16} style={{ transform: "rotate(45deg)" }} /> Gets disrupted</div><ul>{toPoints(chain.LOSERS).map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                  </div>
                  {chain.TOPPICKS && <div className="pr-bottomline"><div className="pr-bottomline-label">Real setups now</div>{chain.TOPPICKS}</div>}
                  <div className="pr-disclaimer">Chain names are one-step-removed candidates — run the full lens read on anything before buying.</div>
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
                  <div className="pr-disclaimer">Stylized disciplines, not the actual views of any person. Four different philosophies voting is signal — unanimity either way is worth noticing.</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
