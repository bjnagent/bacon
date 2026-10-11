"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, RefreshCw, Users, WifiOff, CircleAlert } from "lucide-react";
import { Button, Callout, Card, Section, Skeleton, SkeletonCard, toast } from "@/components/ui";
import BaconMark from "@/components/BaconMark";
import { useApp } from "@/components/app/AppContext";
import { apiFetch, apiStream, ApiError, useApi } from "@/lib/client/api";
import { openPaywall } from "@/lib/client/paywall";
import { paths } from "@/lib/client/routes";
import { invalidate } from "@/lib/clientCache";
import { mapClass } from "@/lib/lenses";
import { share } from "@/lib/native";
import { track } from "@/lib/track";
import { swallowed } from "@/lib/log";
import MacroStrip from "./MacroStrip";
import IdeaCard from "./IdeaCard";
import DataCheck from "./DataCheck";
import ExampleBrief from "./ExampleBrief";
import ActivationCard, { type ActivationState } from "./ActivationCard";
import {
  ago, ideaChatContext, itemSymbol, quoteSymbols, streamToBrief,
  type Brief, type BriefItem, type BriefResponse, type QuoteLite,
} from "./brief";
import { useNow } from "./useNow";
import s from "./Today.module.css";

/** Re-read the brief when Today comes back after this long (the nightly run may have landed). */
const BRIEF_STALE_MS = 10 * 60_000;
/** Quotes go stale much faster; re-read on return after this long. */
const QUOTE_STALE_MS = 2 * 60_000;
/** Live (crypto) quotes tick while the brief is on screen. */
const LIVE_POLL_MS = 60_000;

const upgradeForBrief = () => openPaywall({ reason: "feature", feature: "personal_brief", suggested: "pro" });

function progressCopy(b: Brief | null): string {
  const n = b?.items.length ?? 0;
  if (n > 0) return `Writing up idea ${n}…`;
  if (b?.intro) return "Weighing where the signals agree…";
  return "Reading the movers, filings and macro backdrop…";
}

/**
 * Today's brief: macro context, the desk note, ranked ideas with their calls,
 * the data check, and the one disclaimer. Owns the brief's data (GET), its
 * regeneration (streamed POST), and the quotes for the names in it.
 */
export default function BriefPane({ active, onUpdated }: { active: boolean; onUpdated?: (iso: string | null) => void }) {
  const app = useApp();
  const now = useNow();
  const briefApi = useApi<BriefResponse>("/api/brief", 60_000);
  const { refresh: refreshBrief } = briefApi;
  const canonical = briefApi.data?.brief ?? null;
  const house = !!briefApi.data?.house;
  const hasBrief = !!canonical && canonical.items.length > 0;
  const canBuild = app.can("personal_brief");
  const left = app.remaining("sweep");

  // ---- staleness ---------------------------------------------------------
  const fetchedAt = useRef(0);
  useEffect(() => { if (briefApi.data) fetchedAt.current = Date.now(); }, [briefApi.data]);
  useEffect(() => { onUpdated?.(canonical?.generatedAt ?? null); }, [canonical?.generatedAt, onUpdated]);

  // ---- generation (streamed) --------------------------------------------
  const [generating, setGenerating] = useState(false);
  const [streamBrief, setStreamBrief] = useState<Brief | null>(null);
  const [genError, setGenError] = useState<ApiError | Error | null>(null);
  const busy = useRef(false);

  // Local ticks for the checklist, so a step the user JUST completed is
  // checked off without waiting for /api/activation to be re-read.
  const [actPatch, setActPatch] = useState<Partial<ActivationState>>({});
  const activationApi = useApi<ActivationState>(hasBrief && !house ? "/api/activation" : null, 60_000);
  const activation = activationApi.data && typeof activationApi.data.swept === "boolean"
    ? { ...activationApi.data, ...actPatch } : null;

  const generate = useCallback(async (from?: string) => {
    if (busy.current) return;
    if (!canBuild) { upgradeForBrief(); return; }
    busy.current = true;
    setGenerating(true); setGenError(null); setStreamBrief(null);
    track("action", "sweep", from);
    let last: Brief | null = null;
    try {
      // apiStream already coalesces chunks to one callback per animation frame,
      // so this parses at most once per frame rather than once per chunk.
      await apiStream("/api/brief", undefined, (acc) => {
        const b = streamToBrief(acc);
        if (b) { last = b; setStreamBrief(b); }
      });
      if (!(last as Brief | null)?.items.length) {
        throw new Error("No ideas came back this time and nothing was saved. Try again in a few minutes.");
      }
      // The checklist reads from the server, but this sweep just happened.
      invalidate("/api/activation");
      setActPatch((p) => ({ ...p, swept: true }));
      // Swap the streamed view for the persisted brief (real ids + timestamp).
      await refreshBrief();
      void app.refreshMe();
      toast("Your brief is ready");
    } catch (err) {
      // A 402 has already opened the paywall; anything else is shown inline.
      if (!(err instanceof ApiError && err.isUpgrade)) setGenError(err instanceof Error ? err : new Error("Something went wrong"));
    } finally {
      busy.current = false;
      setGenerating(false);
      setStreamBrief(null);
    }
  }, [canBuild, refreshBrief, app]);

  // ---- quotes ------------------------------------------------------------
  // Current prices for the names in the persisted brief. Crypto comes back
  // real-time; equities are the last close and are labelled as such. Not
  // fetched for the streaming preview — tickers there are half-written.
  const symKey = useMemo(() => quoteSymbols(canonical?.items ?? []).join(","), [canonical]);
  const [quotes, setQuotes] = useState<{ key: string; at: number; map: Record<string, QuoteLite> }>({ key: "", at: 0, map: {} });
  // Returns a canceller so an effect can drop a response that lands after the
  // brief (and so the symbol list) has changed under it.
  const pullQuotes = useCallback((key: string) => {
    let live = true;
    if (key) {
      apiFetch<{ quotes?: Record<string, QuoteLite> }>(`/api/quotes?symbols=${encodeURIComponent(key)}`, { paywall: false })
        .then((d) => { if (live) setQuotes({ key, at: Date.now(), map: d.quotes ?? {} }); })
        // A missing price must never blank the brief — the analysis stands on
        // its own and the chip simply doesn't render.
        .catch((err) => swallowed("today: quotes", err));
    }
    return () => { live = false; };
  }, []);
  useEffect(() => pullQuotes(symKey), [symKey, pullQuotes]);
  const anyLive = useMemo(() => Object.values(quotes.map).some((q) => q.live), [quotes.map]);
  useEffect(() => {
    if (!active || !anyLive || !symKey) return;
    let cancel = () => {};
    const id = setInterval(() => {
      if (document.visibilityState === "visible") { cancel(); cancel = pullQuotes(symKey); }
    }, LIVE_POLL_MS);
    return () => { clearInterval(id); cancel(); };
  }, [active, anyLive, symKey, pullQuotes]);

  // ---- becoming active again -------------------------------------------
  // The screen stays mounted while hidden; refresh quietly on return only when
  // what we're showing is old enough that the nightly run (or the market) may
  // have moved on. Nothing refetches on an ordinary tab switch.
  const quotesAt = useRef(0);
  useEffect(() => { quotesAt.current = quotes.at; }, [quotes.at]);
  useEffect(() => {
    if (!active || busy.current) return;
    const t = Date.now();
    if (fetchedAt.current && t - fetchedAt.current > BRIEF_STALE_MS) void refreshBrief();
    if (quotesAt.current && t - quotesAt.current > QUOTE_STALE_MS) return pullQuotes(symKey);
    // Only on the transition to active — not every time the symbol list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ---- per-idea actions ------------------------------------------------
  const analyze = useCallback((o: BriefItem) => {
    invalidate("/api/activation");
    setActPatch((p) => ({ ...p, analyzed: true }));
    app.openAnalyze({ asset: itemSymbol(o), cls: mapClass(o.cls), run: true });
  }, [app]);

  const trackIdea = useCallback(async (sym: string, cls: string) => {
    if (app.isTracked(sym)) { app.navigate(paths.watchlist()); return; }
    const ok = await app.trackSymbol(sym, mapClass(cls));
    if (ok) setActPatch((p) => ({ ...p, tracked: true }));
  }, [app]);

  const shareIdea = useCallback(async (o: BriefItem) => {
    const sym = itemSymbol(o).toUpperCase();
    const url = `${window.location.origin}${paths.analyze(sym)}`;
    track("action", "share", sym);
    const sheet = typeof navigator !== "undefined" && typeof navigator.share === "function";
    const ok = await share({ title: `${o.name || sym} on Bacon`, text: `${o.name || sym}${o.action ? ` — ${o.action}` : ""}`, url });
    // With no share sheet the helper copies the link instead; say so.
    if (ok && !sheet) toast("Link copied");
  }, []);

  // ---- render -----------------------------------------------------------
  const shown: Brief | null = generating ? streamBrief : canonical;
  const shownItems = shown?.items ?? [];
  const top = canonical?.items[0];
  const firstIdea = top ? { sym: itemSymbol(top), cls: mapClass(top.cls) } : null;
  const initialLoading = briefApi.loading && !briefApi.data;
  const loadFailed = !briefApi.data && !!briefApi.error;
  const showExample = !generating && !initialLoading && !loadFailed && !hasBrief;

  const refreshControl = canBuild ? (
    <div className={s.refresh}>
      <Button size="sm" icon={<RefreshCw />} loading={generating} onClick={() => void generate()}>
        {generating ? "Building…" : "Refresh brief"}
      </Button>
      {left != null && <span className={s.refreshLeft}>{left === 0 ? "None left this month" : `${left} left this month`}</span>}
    </div>
  ) : (
    <Button size="sm" variant="tonal" icon={<Lock />} onClick={upgradeForBrief}>Upgrade</Button>
  );

  return (
    <div className={s.pane}>
      <MacroStrip />

      {house && hasBrief && (
        <div className={s.house}>
          <Users aria-hidden="true" />
          <span className={s.houseText}><strong>House brief</strong> — the same for every free member</span>
          <button type="button" className={s.houseCta} onClick={upgradeForBrief}>Get one built around your watchlist</button>
        </div>
      )}

      {loadFailed && (
        <Callout tone="neg" icon={briefApi.error?.code === "offline" ? <WifiOff /> : <CircleAlert />}>
          <strong>Couldn&apos;t load today&apos;s brief.</strong> {briefApi.error?.message}
          <div className={s.calloutActions}><Button size="sm" onClick={() => void refreshBrief()}>Try again</Button></div>
        </Callout>
      )}

      {genError && !generating && (
        <Callout tone="neg" icon={genError instanceof ApiError && genError.code === "offline" ? <WifiOff /> : <CircleAlert />}>
          <strong>Couldn&apos;t build the brief.</strong> {genError.message}
          <div className={s.calloutActions}><Button size="sm" onClick={() => void generate()}>Try again</Button></div>
        </Callout>
      )}

      {initialLoading && (
        <div className="stack" aria-busy="true" aria-label="Loading today's brief">
          <Card><Skeleton lines={2} /></Card>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      )}

      {showExample && <ExampleBrief onBuild={() => void generate("from-sample")} now={now} />}

      {hasBrief && !generating && !house && activation && (
        <ActivationCard
          state={activation}
          firstIdea={firstIdea}
          onSweep={() => void generate()}
          onTrack={(sym, cls) => void trackIdea(sym, cls)}
          onAnalyze={(t) => { if (top) analyze(top); else app.openAnalyze({ ...t, run: true }); }}
        />
      )}

      {generating && (
        <Card className={s.building} aria-live="polite">
          <BaconMark size={36} />
          <div className={s.buildingText}>
            <strong>Building your brief</strong>
            <span>{progressCopy(streamBrief)}</span>
          </div>
          <span className="ui-spinner" aria-hidden="true" />
        </Card>
      )}

      {shown?.intro && (
        <Card className={s.note}>
          <div className={s.noteHead}>
            <BaconMark size={22} />
            <span className={s.noteTitle}>Desk note</span>
            {!generating && canonical?.generatedAt && <span className={s.noteWhen}>{ago(canonical.generatedAt, now)}</span>}
          </div>
          <p className={s.noteText}>{shown.intro}</p>
        </Card>
      )}

      {(hasBrief || generating) && (
        <Section
          title="Ideas"
          sub={generating ? "Ranked by how many independent signals agree" : `${shownItems.length} idea${shownItems.length === 1 ? "" : "s"}, ranked by how many independent signals agree`}
          action={refreshControl}
        >
          {/* Announce ideas to assistive tech as they stream in. */}
          <div className="stack" aria-live="polite" aria-busy={generating}>
            {shownItems.map((o, i) => {
              const sym = itemSymbol(o);
              return (
                <IdeaCard
                  key={o.id}
                  item={o}
                  rank={i + 1}
                  variant={generating ? "preview" : "live"}
                  quote={quotes.map[o.ticker?.trim().toUpperCase()]}
                  quoteFetchedAt={quotes.at}
                  now={now}
                  tracked={app.isTracked(sym)}
                  onAnalyze={() => analyze(o)}
                  onTrack={() => void trackIdea(sym, o.cls)}
                  onAsk={() => app.openChat(ideaChatContext(o))}
                  onShare={() => void shareIdea(o)}
                />
              );
            })}
            {generating && Array.from({ length: shownItems.length < 3 ? 3 - shownItems.length : 1 }, (_, i) => (
              <SkeletonCard key={`sk-${i}`} lines={4} />
            ))}
          </div>
        </Section>
      )}

      {hasBrief && !generating && <DataCheck items={canonical!.items} />}

      {hasBrief && !generating && (
        <p className={s.footnote}>
          {canonical!.caveat || "Research, not investment advice."}
          {" "}Prices are labelled live or delayed close at their source; charts open on TradingView.
        </p>
      )}
    </div>
  );
}
