"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle, Newspaper, Plus, ArrowRight, MessageCircle } from "lucide-react";
import { mapClass } from "@/lib/lenses";
import type { ChatContext } from "@/lib/prompts";
import TVLink from "./TVLink";

const SOURCES = ["All", "CNBC", "Bloomberg", "Yahoo Finance", "Reuters", "WSJ", "FT", "MarketWatch"];

interface NewsDisplay { head: string; source: string; why: string; ticker: string; cls: string; signal: string; when: string }

// Headlines as signals — paraphrased + attributed (copyright rule lives in the
// prompt). Cached server-side; Refresh pulls a fresh live-search batch.
export default function NewsView({ onAnalyze, onDiscuss }: { onAnalyze: (t: { asset: string; cls: string }) => void; onDiscuss: (ctx: ChatContext) => void }) {
  const [source, setSource] = useState("All");
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intro, setIntro] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [items, setItems] = useState<NewsDisplay[]>([]);
  const [tracked, setTracked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [n, w] = await Promise.all([fetch("/api/news"), fetch("/api/watchlist")]);
        const nd = await n.json(); const wd = await w.json();
        if (cancelled) return;
        if (Array.isArray(nd.items)) setItems(nd.items.map((r: { headline: string; source: string; why: string; symbol: string; asset_class: string; signal: string; recency: string }) => ({ head: r.headline, source: r.source, why: r.why, ticker: r.symbol, cls: r.asset_class, signal: r.signal, when: r.recency })));
        if (Array.isArray(wd.items)) { const t: Record<string, boolean> = {}; wd.items.forEach((it: { symbol: string }) => { t[it.symbol.toUpperCase()] = true; }); setTracked(t); }
      } catch { /* leave empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const load = async (src?: string, foc?: string) => {
    if (loading) return;
    const s = src ?? source; const f = (foc ?? focus).trim();
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: s, focus: f }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setIntro(data.result.intro); setNote(data.result.note);
      setItems(data.result.items as NewsDisplay[]);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setLoading(false); }
  };

  const track = async (ticker: string, cls: string) => {
    const sym = ticker.toUpperCase();
    if (tracked[sym]) return;
    setTracked((t) => ({ ...t, [sym]: true }));
    try { await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, asset_class: cls }) }); } catch { /* ignore */ }
  };

  return (
    <div className="pr-view">
      <div className="pr-rdr-head">
        <div className="pr-hero-eyebrow">Signals · Headlines</div>
        <h1 className="pr-rdr-title">The tape, read for opportunities.</h1>
        <p className="pr-rdr-honest">BACON pulls current business headlines from major outlets via live web search, paraphrased and attributed — then turns any with a tradable angle into a one-tap deep-dive or a tracked name. Headlines are summaries of public reporting; verify at the source. Not advice.</p>
      </div>

      <div className="pr-sec pr-sec-flush">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">Headlines</h2>
          <div className="pr-sec-actions">
            <button className="pr-btn" onClick={() => load()} disabled={loading}>{loading ? <><Loader2 size={14} className="pr-spin" /> PULLING</> : <><RefreshCw size={14} /> REFRESH</>}</button>
          </div>
        </div>

        <div className="pr-src-row">
          {SOURCES.map((s) => <button key={s} className={`pr-src ${source === s ? "is-on" : ""}`} onClick={() => { setSource(s); load(s, focus); }}>{s}</button>)}
        </div>
        <div className="pr-add pr-add-news">
          <span className="pr-add-prompt">/</span>
          <input className="pr-input" placeholder="FOCUS — e.g. semiconductors, fed, energy (optional)" value={focus} onChange={(e) => setFocus(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(source, focus); }} aria-label="News focus" />
          <button className="pr-btn-sm" onClick={() => load(source, focus)} disabled={loading}>Apply</button>
        </div>

        {loading && <div className="pr-loading"><div className="pr-loading-text">Scanning the wires for market-moving headlines…</div></div>}
        {error && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn&apos;t fetch headlines.</strong><div className="pr-error-detail">{error}. Try again.</div></div></div>}
        {!loading && items.length === 0 && !error && <div className="pr-empty"><Newspaper size={26} /><div>Hit <strong>Refresh</strong> to pull the latest business headlines. Anything with a clear ticker becomes a one-tap deep-dive.</div></div>}

        {items.length > 0 && (
          <>
            {intro && <div className="pr-summary">{intro}</div>}
            <div className="pr-news-list">
              {items.map((n, i) => {
                const hasTk = n.ticker && n.ticker !== "—";
                const isTracked = hasTk && tracked[n.ticker.toUpperCase()];
                return (
                  <div key={i} className="pr-news">
                    <div className="pr-news-meta">
                      <span className="pr-news-src">{n.source || "WIRE"}</span>
                      {n.signal && <span className="pr-news-sig">{n.signal}</span>}
                      {n.when && n.when !== "—" && <span className="pr-news-when">{n.when}</span>}
                    </div>
                    <div className="pr-news-head">{n.head}</div>
                    {n.why && <div className="pr-news-why">{n.why}</div>}
                    <div className="pr-news-actions">
                      {hasTk ? (
                        <>
                          <span className="pr-news-tk">{n.ticker}</span>
                          <button className="pr-news-dd" onClick={() => onAnalyze({ asset: n.ticker, cls: mapClass(n.cls) })}>Deep dive <ArrowRight size={13} /></button>
                          <button className={`pr-news-tr ${isTracked ? "is-on" : ""}`} onClick={() => track(n.ticker, mapClass(n.cls))} disabled={!!isTracked} title={isTracked ? "Tracking" : "Track"}>{isTracked ? "✓" : <Plus size={13} />}</button>
                          <TVLink sym={n.ticker} label={false} />
                        </>
                      ) : (
                        <span className="pr-news-macro">macro / no single ticker</span>
                      )}
                      <button className="pr-news-discuss" onClick={() => onDiscuss({ kind: "news", headline: n.head, ticker: hasTk ? n.ticker : undefined, cls: n.cls, title: hasTk ? n.ticker : "Headline", sub: "news item" })} title="Discuss this headline"><MessageCircle size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            {note && <div className="pr-disclaimer">{note}</div>}
          </>
        )}
      </div>
    </div>
  );
}
