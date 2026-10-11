"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkCheck, BookmarkPlus, ChevronRight, CircleAlert, MessageCircle, Newspaper, RefreshCw, SlidersHorizontal, WifiOff } from "lucide-react";
import { Badge, Button, Callout, Chip, EmptyState, IconButton, Section, Sheet, SkeletonCard, Ticker, toast } from "@/components/ui";
import TVLink from "@/components/TVLink";
import { useApp } from "@/components/app/AppContext";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { paths } from "@/lib/client/routes";
import { invalidate } from "@/lib/clientCache";
import { mapClass } from "@/lib/lenses";
import { hasTicker, type Tone } from "./brief";
import {
  fromParsed, fromRow, leanTone, matchesFilter, newsFilters, recencyLabel, tagLabel,
  type Headline, type NewsFilter, type NewsParsed, type NewsRow,
} from "./news";
import { useNow } from "./useNow";
import s from "./Headlines.module.css";

const SOURCES = ["All", "Reuters", "Bloomberg", "CNBC", "WSJ", "FT", "Yahoo Finance", "MarketWatch"];
const STALE_MS = 10 * 60_000;

interface Fresh { items: Headline[]; intro: string | null; note: string | null; at: number }

function badgeTone(t: Tone): "pos" | "neg" | "neutral" {
  return t === "pos" ? "pos" : t === "neg" ? "neg" : "neutral";
}

/**
 * Headlines as signals — paraphrased and attributed (the copyright rule lives
 * in the news prompt), each turned into a one-tap analysis when it names a
 * ticker. The cached batch is read on open; Refresh pulls a fresh live-search
 * batch and costs one unit of the plan's refresh allowance.
 */
export default function HeadlinesPane({ active, onUpdated }: { active: boolean; onUpdated?: (iso: string | null) => void }) {
  const app = useApp();
  const now = useNow();
  const newsApi = useApi<{ items?: NewsRow[] }>("/api/news", 60_000);
  const { refresh: reloadNews } = newsApi;
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [filter, setFilter] = useState<NewsFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [optsOpen, setOptsOpen] = useState(false);
  const [source, setSource] = useState("All");
  const [focus, setFocus] = useState("");
  const busy = useRef(false);

  // A just-pulled batch wins over the cached read until the cache catches up.
  const items: Headline[] = useMemo(
    () => fresh?.items ?? (Array.isArray(newsApi.data?.items) ? newsApi.data!.items.map(fromRow) : []),
    [fresh, newsApi.data],
  );
  const filters = useMemo(() => newsFilters(items), [items]);
  const visible = useMemo(() => items.filter((n) => matchesFilter(n, filter)), [items, filter]);
  const newest = useMemo(() => items.reduce<string | null>((m, n) => (n.createdAt && (!m || n.createdAt > m) ? n.createdAt : m), null), [items]);
  useEffect(() => { onUpdated?.(newest); }, [newest, onUpdated]);

  const fetchedAt = useRef(0);
  useEffect(() => { if (newsApi.data) fetchedAt.current = Date.now(); }, [newsApi.data]);
  useEffect(() => {
    // Quietly re-read the cached batch on return if it's old (the nightly run
    // writes headlines too). A batch pulled in this session is already newest.
    if (!active || fresh || busy.current) return;
    if (fetchedAt.current && Date.now() - fetchedAt.current > STALE_MS) void reloadNews();
  }, [active, fresh, reloadNews]);

  const refresh = useCallback(async (src: string, foc: string) => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true); setError(null);
    try {
      const d = await apiFetch<{ result?: { intro: string | null; items: NewsParsed[]; note: string | null } }>("/api/news", { body: { source: src, focus: foc.trim() } });
      const parsed = d.result?.items ?? [];
      const at = new Date().toISOString();
      setFresh({ items: parsed.map((n, i) => fromParsed(n, i, at)), intro: d.result?.intro ?? null, note: d.result?.note ?? null, at: Date.now() });
      setFilter("all");
      invalidate("/api/news");
      void app.refreshMe();
      toast(`${parsed.length} fresh headline${parsed.length === 1 ? "" : "s"}`);
    } catch (err) {
      // A 402 has already opened the paywall.
      if (!(err instanceof ApiError && err.isUpgrade)) setError(err instanceof Error ? err : new Error("Something went wrong"));
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }, [app]);

  const track = useCallback(async (sym: string, cls: string) => {
    if (app.isTracked(sym)) { app.navigate(paths.watchlist()); return; }
    await app.trackSymbol(sym, mapClass(cls));
  }, [app]);

  const left = app.remaining("update");
  const custom = source !== "All" || !!focus.trim();
  const initialLoading = newsApi.loading && !newsApi.data && !fresh;
  const loadFailed = !newsApi.data && !!newsApi.error && !fresh;
  const activeFilter = filters.find((f) => f.id === filter);
  const hasTickers = items.some((n) => hasTicker(n));

  const sub = custom
    ? [source !== "All" && source, focus.trim() && `Focus: ${focus.trim()}`].filter(Boolean).join(" · ")
    : "Paraphrased from major outlets, attributed to each";

  return (
    <div className={s.pane}>
      <Section
        title="Latest"
        sub={sub}
        action={
          <div className={s.toolbar}>
            <IconButton label="Refresh options" active={custom} onClick={() => setOptsOpen(true)}><SlidersHorizontal /></IconButton>
            <div className={s.refresh}>
              <Button size="sm" icon={<RefreshCw />} loading={refreshing} onClick={() => void refresh(source, focus)}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
              {left != null && <span className={s.left}>{left === 0 ? "None left this month" : `${left} left this month`}</span>}
            </div>
          </div>
        }
      >
        {items.length > 0 && (
          <div className={`hscroll ${s.filters}`} role="group" aria-label="Filter headlines">
            {filters.map((f) => (
              <Chip key={f.id} pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}<span className={s.count}>{f.count}</span>
              </Chip>
            ))}
          </div>
        )}

        {error && !refreshing && (
          <Callout tone="neg" icon={error instanceof ApiError && error.code === "offline" ? <WifiOff /> : <CircleAlert />}>
            <strong>Couldn&apos;t refresh headlines.</strong> {error.message}
            <div className={s.calloutActions}><Button size="sm" onClick={() => void refresh(source, focus)}>Try again</Button></div>
          </Callout>
        )}

        {loadFailed && (
          <Callout tone="neg" icon={newsApi.error?.code === "offline" ? <WifiOff /> : <CircleAlert />}>
            <strong>Couldn&apos;t load headlines.</strong> {newsApi.error?.message}
            <div className={s.calloutActions}><Button size="sm" onClick={() => void reloadNews()}>Try again</Button></div>
          </Callout>
        )}

        {refreshing && (
          <div className={s.scanning} role="status" aria-live="polite">
            <span className="ui-spinner" aria-hidden="true" />
            Scanning the wires for market-moving headlines…
          </div>
        )}

        {fresh?.intro && !refreshing && <p className={s.intro}>{fresh.intro}</p>}

        {initialLoading && (
          <div className="stack" aria-busy="true" aria-label="Loading headlines">
            <SkeletonCard lines={2} /><SkeletonCard lines={2} /><SkeletonCard lines={2} />
          </div>
        )}

        {!initialLoading && !loadFailed && items.length === 0 && !refreshing && (
          <div className="ui-card">
            <EmptyState
              icon={<Newspaper />}
              title="No headlines yet"
              body="Pull the latest market-moving business news, paraphrased and attributed to each outlet. Anything with a clear ticker becomes a one-tap analysis."
              actions={<Button variant="primary" icon={<RefreshCw />} onClick={() => void refresh(source, focus)}>Refresh headlines</Button>}
            />
          </div>
        )}

        {items.length > 0 && visible.length === 0 && (
          <div className={s.filteredEmpty}>
            <span>No {activeFilter?.label.toLowerCase() ?? "matching"} headlines in this batch.</span>
            <Button size="sm" variant="ghost" onClick={() => setFilter("all")}>Show all</Button>
          </div>
        )}

        {visible.length > 0 && (
          <ul className={s.list} aria-busy={refreshing}>
            {visible.map((n) => {
              const tk = hasTicker(n) ? n.ticker.trim() : "";
              const tracked = tk ? app.isTracked(tk) : false;
              const when = recencyLabel(n.when, n.createdAt, now);
              const tag = tagLabel(n.signal);
              return (
                <li key={n.key} className={`ui-card ${s.card}`}>
                  <div className={s.meta}>
                    <span className={s.source}>{n.source || "Newswire"}</span>
                    {when && <><span aria-hidden="true">·</span><span>{when}</span></>}
                    {tag && <span className={s.tag}><Badge tone={badgeTone(leanTone(n.signal))}>{tag}</Badge></span>}
                  </div>
                  <h3 className={s.head}>{n.head}</h3>
                  {n.why && <p className={s.why}><span className={s.whyLabel}>Why it matters</span> {n.why}</p>}
                  <div className={s.actions}>
                    {tk ? (
                      <button
                        type="button" className={s.tickerBtn}
                        aria-label={`Analyze ${tk}`}
                        onClick={() => app.openAnalyze({ asset: tk, cls: mapClass(n.cls), run: true })}
                      >
                        <Ticker>{tk}</Ticker><span>Analyze</span><ChevronRight aria-hidden="true" />
                      </button>
                    ) : (
                      <span className={s.macro}>Macro · no single ticker</span>
                    )}
                    <span className={s.spacer} />
                    {tk && (
                      <IconButton
                        label={tracked ? `Tracking ${tk} — open watchlist` : `Track ${tk}`}
                        active={tracked}
                        onClick={() => void track(tk, n.cls)}
                      >
                        {tracked ? <BookmarkCheck /> : <BookmarkPlus />}
                      </IconButton>
                    )}
                    <IconButton
                      label="Ask Bacon about this headline"
                      onClick={() => app.openChat({
                        kind: "news", headline: n.head, ticker: tk || undefined, cls: n.cls,
                        title: tk || "Headline", sub: "news item", notes: n.why ? `Why it matters: ${n.why}` : undefined,
                      })}
                    >
                      <MessageCircle />
                    </IconButton>
                    {tk && <span className={s.tv}><TVLink sym={tk} label={false} /></span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {items.length > 0 && (
          <p className={s.footnote}>
            {fresh?.note || "Headlines are paraphrased from public reporting and attributed to each outlet — verify at the source. Research, not investment advice."}
            {hasTickers && " Charts open on TradingView."}
          </p>
        )}
      </Section>

      <Sheet
        open={optsOpen}
        onClose={() => setOptsOpen(false)}
        title="Refresh options"
        footer={
          <Button
            variant="primary" block icon={<RefreshCw />} disabled={refreshing}
            onClick={() => { setOptsOpen(false); void refresh(source, focus); }}
          >
            Refresh headlines
          </Button>
        }
      >
        <div className={s.opts}>
          <div className="ui-field">
            <span className="ui-label" id="news-outlet">Outlet</span>
            <div className="row-wrap" role="group" aria-labelledby="news-outlet">
              {SOURCES.map((x) => <Chip key={x} pressed={source === x} onClick={() => setSource(x)}>{x}</Chip>)}
            </div>
          </div>
          <label className="ui-field">
            <span className="ui-label">Focus</span>
            <input
              className="ui-input" value={focus} maxLength={200} enterKeyHint="go"
              placeholder="e.g. semiconductors, the Fed, energy"
              onChange={(e) => setFocus(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setOptsOpen(false); void refresh(source, focus); } }}
            />
            <span className="ui-hint">Optional. Leave blank for the whole market.</span>
          </label>
        </div>
      </Sheet>
    </div>
  );
}
