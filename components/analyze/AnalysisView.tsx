"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bookmark, BookmarkCheck, ChevronLeft, Lock, MessageCircle, RefreshCw, ScanSearch, Share, WifiOff } from "lucide-react";
import { Badge, Button, Callout, Card, IconButton, Segmented, toast, type SegOption } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { ASSET_CLASSES, mapClass, relTime, splitSymCls } from "@/lib/lenses";
import { PLANS } from "@/lib/plans";
import { paths } from "@/lib/client/routes";
import { openPaywall, type PaywallRequest } from "@/lib/client/paywall";
import { invalidate } from "@/lib/clientCache";
import { isNative, share } from "@/lib/native";
import { isUsableBriefing, type AnalysisMeta, type ExtraKey } from "@/lib/analysisStore";
import { useAnalysis, type OpenRequest } from "./useAnalysis";
import { useAllowance } from "./useAllowance";
import { ChartPanel, DataCallouts, LensGrid, RawFallback, ReportSkeleton, VerdictCard, WorkingCard } from "./Report";
import { ToolPanel } from "./DeepTools";
import { TOOLS, TOOL_BY_KEY, chatNotes } from "./model";
import s from "./Analyze.module.css";

type TabKey = "lenses" | ExtraKey;

export default function AnalysisView({ symbol, open, onBack, onChanged }: {
  symbol: string;
  open: OpenRequest | null;
  onBack: () => void;
  /** History changed (a run was filed or a shared copy added). */
  onChanged: () => void;
}) {
  const app = useApp();
  const allowance = useAllowance();
  const { refreshMe } = app;

  const onSettled = useCallback((meta: AnalysisMeta | null, how: "run" | "load") => {
    if (how === "run") void refreshMe();
    if (!meta) return;
    if (meta.cache !== "own" || how === "run") { invalidate("/api/analyses"); onChanged(); }
    // An explicit run answered from history: say why it was instant and free.
    if (how === "run" && meta.cache !== "miss") {
      const age = relTime(meta.generatedAt) ?? "recently";
      toast.info(meta.cache === "hit" ? `Shared analysis from ${age} — no allowance used.` : `Your analysis from ${age} — no allowance used.`);
    }
  }, [refreshMe, onChanged]);

  const { state, run, retry, runTool } = useAnalysis(symbol, { request: app.analyzeRequest, open, onSettled });
  const { phase, meta, briefing, body, extras, tools, error } = state;

  const streaming = phase === "streaming";
  const done = phase === "ready";
  const usable = !!briefing && isUsableBriefing(briefing);
  const showReport = !!briefing && (streaming || usable || phase === "error");
  const rawFallback = done && !usable && body.trim() ? body : null;

  // What to call it, track it as and re-run it with.
  const reqForSym = app.analyzeRequest && app.route.symbol === symbol ? app.analyzeRequest : null;
  const [runCls, setRunCls] = useState(() => reqForSym?.cls ?? splitSymCls(symbol).cls);
  const cls = meta?.assetClass ?? runCls;
  const trackAs = meta?.resolved ?? symbol;
  const asset = meta?.query || symbol;
  const tracked = app.isTracked(trackAs);

  // ---- tabs + deep tools ---------------------------------------------------
  const [tab, setTab] = useState<TabKey>("lenses");
  const tryRunTool = useCallback((key: ExtraKey) => {
    const t = TOOL_BY_KEY[key];
    if (!meta || phase !== "ready" || !usable || extras[key] || tools[key].loading || tools[key].error) return;
    if (!app.can(t.feature)) return;
    void runTool(key, meta, asset).then(() => void refreshMe());
  }, [meta, phase, usable, extras, tools, app, runTool, asset, refreshMe]);

  const selectTab = (k: TabKey) => {
    setTab(k);
    if (k !== "lenses") tryRunTool(k);
  };
  // A tool tab opened mid-stream starts as soon as the lens read lands.
  useEffect(() => {
    if (tab === "lenses" || phase !== "ready") return;
    const t = setTimeout(() => tryRunTool(tab), 0);
    return () => clearTimeout(t);
  }, [tab, phase, tryRunTool]);

  const tabOptions: SegOption<TabKey>[] = [
    { value: "lenses", label: "Lenses" },
    ...TOOLS.map((t) => ({ value: t.key as TabKey, label: t.label, icon: app.can(t.feature) ? undefined : <Lock aria-label="Locked" /> })),
  ];

  // ---- header actions ------------------------------------------------------
  const notes = useMemo(() => chatNotes(briefing), [briefing]);
  const ask = () => app.openChat({ kind: "asset", asset: trackAs, cls, title: trackAs, sub: "Multi-lens analysis", notes });
  const toggleTrack = async () => {
    if (!tracked) { await app.trackSymbol(trackAs, cls); return; }
    if (await app.untrackSymbol(trackAs)) {
      toast(`${trackAs} removed from your watchlist`, { action: { label: "Undo", run: () => void app.trackSymbol(trackAs, cls) } });
    }
  };
  const doShare = async () => {
    const url = `${window.location.origin}${paths.analyze(symbol)}`;
    const sheet = isNative() || typeof navigator.share === "function";
    const ok = await share({ title: `${trackAs} on Bacon`, text: `The eight-lens read on ${trackAs}.`, url });
    if (ok && !sheet) toast("Link copied");
  };
  const refresh = () => {
    if (allowance?.out) { allowance.upgrade(); return; }
    setTab("lenses");
    void run({ asset, cls, force: true });
  };
  const runNow = () => void run({ asset: symbol, cls: runCls });

  // ---- status line -----------------------------------------------------------
  let status: React.ReactNode = null;
  if (streaming) status = <Badge tone="accent"><span className={s.liveDot} aria-hidden="true" />Live</Badge>;
  else if (meta && done) status = <span>Generated {relTime(meta.generatedAt) ?? "recently"}</span>;
  else if (phase === "none") status = <span>Not analyzed recently</span>;

  const subtitle = (
    <span className={s.statusLine}>
      <span>{cls}</span>
      {status && <><span aria-hidden="true">·</span>{status}</>}
      {meta?.shared && <Badge tone="info">Shared</Badge>}
      {meta?.resolved && meta.resolved !== symbol && <span className="t-3">Matched to {meta.resolved}</span>}
    </span>
  );

  return (
    <div className="page">
      <div className={s.backRow}>
        <Button variant="ghost" size="sm" icon={<ChevronLeft />} onClick={onBack} feedback={false} className={s.back}>Analyze</Button>
      </div>

      {/* PageHeader's layout, with the actions on their own row on phones so
          the symbol and its status line get the full width. */}
      <header className={`page-header ${s.header}`}>
        <div className="page-header-text">
          <h1 className={`page-title ${s.symbolTitle}`}>{symbol}</h1>
          <div className="page-subtitle">{subtitle}</div>
        </div>
        <div className={`page-actions ${s.actions}`}>
          <Button size="sm" variant={tracked ? "tonal" : "secondary"} icon={tracked ? <BookmarkCheck /> : <Bookmark />} onClick={() => void toggleTrack()} aria-pressed={tracked}>
            {tracked ? "Tracking" : "Track"}
          </Button>
          <IconButton label={`Ask Bacon about ${trackAs}`} onClick={ask}><MessageCircle /></IconButton>
          <IconButton label="Share" onClick={() => void doShare()}><Share /></IconButton>
          <IconButton label="Run a fresh analysis" onClick={refresh} disabled={streaming || phase === "checking" || phase === "none"}><RefreshCw /></IconButton>
        </div>
      </header>

      {phase === "checking" && <ReportSkeleton />}

      {phase === "none" && (
        <Card pad="lg" className={s.runCard}>
          <span className={s.runIcon} aria-hidden="true"><ScanSearch /></span>
          <div className="stack-sm">
            <h2 className="t-title">Analyze {symbol}</h2>
            <p className="t-2">No recent analysis to show. A fresh run reads {symbol} through eight independent lenses using live data — usually 20–40 seconds.</p>
          </div>
          <div className={s.runRow}>
            <label className="sr-only" htmlFor={`cls-${symbol}`}>Asset class</label>
            <select id={`cls-${symbol}`} className={`ui-select ${s.select}`} value={mapClass(runCls)} onChange={(e) => setRunCls(e.target.value)}>
              {ASSET_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {allowance?.out ? (
              <Button variant="primary" onClick={allowance.upgrade}>Upgrade for more</Button>
            ) : (
              <Button variant="primary" icon={<ScanSearch />} onClick={runNow}>Run analysis</Button>
            )}
          </div>
          {allowance && (
            <p className="t-caption">
              {allowance.out
                ? `You've used all ${allowance.limit} deep dives this month. A recent shared analysis may still open free — `
                : `Uses 1 of your ${allowance.left} remaining deep dive${allowance.left === 1 ? "" : "s"} this month.`}
              {allowance.out && <button type="button" className={s.linkBtn} onClick={runNow}>check anyway</button>}
            </p>
          )}
        </Card>
      )}

      {phase === "error" && error && (
        error.isUpgrade ? (
          <Callout tone="warn" icon={<AlertTriangle />}>
            <strong>{error.message}</strong> Reopening analyses in your history stays free.
            <div className={s.calloutActions}>
              <Button size="sm" variant="primary" onClick={() => openPaywall(error.body as PaywallRequest)}>See plans</Button>
            </div>
          </Callout>
        ) : (
          <Callout tone="neg" icon={error.code === "offline" ? <WifiOff /> : <AlertTriangle />}>
            {state.failed === "run" ? <strong>{error.message}</strong> : <><strong>Couldn&apos;t load this analysis.</strong> {error.message}</>}
            {state.failed === "run" && briefing ? " What arrived before it stopped is shown below." : ""}
            <div className={s.calloutActions}>
              <Button size="sm" icon={<RefreshCw />} onClick={retry}>Try again</Button>
            </div>
          </Callout>
        )
      )}

      {streaming && !briefing && <WorkingCard symbol={symbol} />}

      {showReport && briefing && (
        <>
          <VerdictCard briefing={briefing} done={done} />
          <DataCallouts meta={meta} briefing={briefing} done={done} />
          <ChartPanel symbol={trackAs} />
          <div className={s.tabs}>
            <Segmented<TabKey> label="Analysis views" value={tab} onChange={selectTab} options={tabOptions} />
          </div>
          {tab === "lenses" ? (
            <LensGrid briefing={briefing} streaming={streaming} />
          ) : (
            <ToolPanel
              toolKey={tab}
              allowed={app.can(TOOL_BY_KEY[tab].feature)}
              ready={done && usable}
              result={extras[tab]}
              status={tools[tab]}
              onRun={() => { if (meta) void runTool(tab, meta, asset).then(() => void refreshMe()); }}
              planName={app.me ? PLANS[app.me.plan.plan].name : undefined}
            />
          )}
        </>
      )}

      {rawFallback && <RawFallback text={rawFallback} />}

      <p className={`t-caption ${s.disclaimer}`}>
        Research, not investment advice. AI-generated: current facts are web-grounded, forward targets are labelled estimates, and charts come from TradingView.
      </p>
    </div>
  );
}
