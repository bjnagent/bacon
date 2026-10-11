"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiStream, ApiError } from "@/lib/client/api";
import { parseBriefing, type Briefing } from "@/lib/parsers";
import {
  EXTRA_KEYS, cleanToolResult, splitStream, symbolKey,
  type AnalysisMeta, type ExtraKey, type StoredAnalysis, type ToolExtras,
} from "@/lib/analysisStore";
import type { AnalyzeRequest } from "@/components/app/AppContext";

// One symbol's analysis: find what's stored, or stream a fresh run — never
// both, and never a paid run the member didn't ask for.
//
//   - A run happens only for an openAnalyze() request (search, a chip, a
//     "Analyze" button elsewhere) whose nonce hasn't been acted on, or for the
//     explicit Run / Refresh buttons. A bare /analyze/SYM link, a refresh of
//     the browser or a return to the tab only ever READS.
//   - Every load or run aborts the one before it, and unmounting aborts both.
//   - Deep-tool results live beside the briefing so a fresh run clears them
//     and a reopened analysis restores them.

export type Phase = "checking" | "none" | "streaming" | "ready" | "error";

export interface ToolStatus { loading: boolean; error: ApiError | null }

export interface AnalysisState {
  phase: Phase;
  meta: AnalysisMeta | null;
  briefing: Briefing | null;
  /** The briefing text as received (meta line removed) — the raw fallback. */
  body: string;
  extras: ToolExtras;
  tools: Record<ExtraKey, ToolStatus>;
  error: ApiError | null;
  /** What Retry repeats. */
  failed: "load" | "run" | null;
  /** Bumped by every load/run, so late answers for an older one are dropped. */
  epoch: number;
}

export interface RunArgs { asset: string; cls: string; force?: boolean }
export interface OpenRequest { id: string; symbol: string; nonce: number }

const idleTools = (): Record<ExtraKey, ToolStatus> =>
  Object.fromEntries(EXTRA_KEYS.map((k) => [k, { loading: false, error: null }])) as Record<ExtraKey, ToolStatus>;

const blank = (epoch: number, phase: Phase): AnalysisState => ({
  phase, meta: null, briefing: null, body: "", extras: {}, tools: idleTools(), error: null, failed: null, epoch,
});

const asApiError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, { error: "Something went wrong — please try again." });

const isAbort = (err: unknown, signal: AbortSignal) => signal.aborted || (err as Error)?.name === "AbortError";

const hasContent = (b: Briefing) => !!b.SUMMARY || Object.keys(b.lenses).length > 0;

// Requests already acted on, at module scope: a remount (or coming back to the
// tab) must never replay a run — that would bill the member twice.
let lastRunNonce = 0;

export function useAnalysis(symbol: string, opts: {
  request: AnalyzeRequest | null;
  open: OpenRequest | null;
  /** After a run or load settles with content (refresh allowance + history). */
  onSettled?: (meta: AnalysisMeta | null, how: "run" | "load") => void;
}) {
  const [state, setState] = useState<AnalysisState>(() => blank(0, "checking"));
  const ctrl = useRef<AbortController | null>(null);
  const toolCtrls = useRef(new Map<ExtraKey, AbortController>());
  const lastRun = useRef<RunArgs | null>(null);
  const lastLoad = useRef<{ cls: string | null; id: string | null }>({ cls: null, id: null });
  const started = useRef(false);
  // The epoch lives in a ref so a callback can tell, synchronously, whether
  // the load/run it belongs to is still the current one.
  const epochRef = useRef(0);
  const handledOpen = useRef(0);
  const onSettled = useRef(opts.onSettled);
  useEffect(() => { onSettled.current = opts.onSettled; }, [opts.onSettled]);

  const begin = useCallback(() => {
    ctrl.current?.abort();
    toolCtrls.current.forEach((c) => c.abort());
    toolCtrls.current.clear();
    const c = new AbortController();
    ctrl.current = c;
    return c;
  }, []);

  useEffect(() => () => {
    ctrl.current?.abort();
    toolCtrls.current.forEach((c) => c.abort());
  }, []);

  const run = useCallback(async (args: RunArgs) => {
    const c = begin();
    lastRun.current = args;
    const epoch = ++epochRef.current;
    setState(blank(epoch, "streaming"));
    let meta: AnalysisMeta | null = null;
    try {
      await apiStream("/api/analyze", { asset: args.asset, assetClass: args.cls, force: !!args.force }, (acc) => {
        if (c.signal.aborted) return;
        // apiStream calls this at most once per animation frame, so this is
        // the only parse of the stream — and the last call carries the full text.
        const split = splitStream(acc);
        meta = split.meta ?? meta;
        const b = parseBriefing(split.body);
        setState((s) => (s.epoch !== epoch ? s : { ...s, meta: meta ?? s.meta, body: split.body, briefing: hasContent(b) ? b : s.briefing }));
      }, c.signal);
      if (c.signal.aborted) return;
      setState((s) => (s.epoch !== epoch ? s : { ...s, phase: "ready" }));
      onSettled.current?.(meta, "run");
    } catch (err) {
      if (isAbort(err, c.signal)) return;
      setState((s) => (s.epoch !== epoch ? s : { ...s, phase: "error", failed: "run", error: asApiError(err) }));
      onSettled.current?.(null, "run");
    }
  }, [begin]);

  const settleStored = useCallback((c: AbortController, epoch: number, a: StoredAnalysis | null) => {
    if (c.signal.aborted) return;
    setState((s) => {
      if (s.epoch !== epoch) return s;
      if (!a) return { ...s, phase: "none" };
      return { ...s, phase: "ready", meta: a.meta, body: a.content, briefing: parseBriefing(a.content), extras: a.extras ?? {} };
    });
    if (a) onSettled.current?.(a.meta, "load");
  }, []);

  /** The analysis to show for this symbol, without running one. */
  const load = useCallback(async (cls: string | null) => {
    const c = begin();
    lastLoad.current = { cls, id: null };
    const epoch = ++epochRef.current;
    setState(blank(epoch, "checking"));
    try {
      const q = new URLSearchParams({ symbol });
      if (cls) q.set("cls", cls);
      const d = await apiFetch<{ analysis: StoredAnalysis | null }>(`/api/analyses?${q}`, { signal: c.signal });
      settleStored(c, epoch, d.analysis ?? null);
    } catch (err) {
      if (isAbort(err, c.signal)) return;
      setState((s) => (s.epoch !== epoch ? s : { ...s, phase: "error", failed: "load", error: asApiError(err) }));
    }
  }, [begin, settleStored, symbol]);

  /** One specific analysis from history (the Recent list). */
  const loadById = useCallback(async (id: string) => {
    const c = begin();
    lastLoad.current = { cls: null, id };
    const epoch = ++epochRef.current;
    setState(blank(epoch, "checking"));
    try {
      const d = await apiFetch<{ analysis: StoredAnalysis }>(`/api/analyses/${encodeURIComponent(id)}`, { signal: c.signal });
      settleStored(c, epoch, d.analysis ?? null);
    } catch (err) {
      if (isAbort(err, c.signal)) return;
      setState((s) => (s.epoch !== epoch ? s : { ...s, phase: "error", failed: "load", error: asApiError(err) }));
    }
  }, [begin, settleStored]);

  // Decide what this symbol needs. Deferred a tick: openAnalyze() updates the
  // request and the URL separately, and whichever lands second must win — a
  // run supersedes (aborts) a lookup that started a moment earlier.
  const { request, open } = opts;
  useEffect(() => {
    const t = setTimeout(() => {
      const req = request && symbolKey(request.asset) === symbolKey(symbol) ? request : null;
      if (req?.run && req.nonce > lastRunNonce) {
        lastRunNonce = req.nonce;
        started.current = true;
        void run({ asset: req.asset, cls: req.cls });
        return;
      }
      if (open && symbolKey(open.symbol) === symbolKey(symbol) && open.nonce > handledOpen.current) {
        handledOpen.current = open.nonce;
        started.current = true;
        void loadById(open.id);
        return;
      }
      if (started.current) return;
      started.current = true;
      void load(req?.cls ?? null);
    }, 0);
    return () => clearTimeout(t);
  }, [symbol, request, open, run, load, loadById]);

  const retry = useCallback(() => {
    if (state.failed === "run" && lastRun.current) void run(lastRun.current);
    else if (lastLoad.current.id) void loadById(lastLoad.current.id);
    else void load(lastLoad.current.cls);
  }, [state.failed, run, load, loadById]);

  /** Run one deep tool for the analysis on screen. Saved onto it server-side. */
  const runTool = useCallback(async (key: ExtraKey, meta: AnalysisMeta, asset: string) => {
    toolCtrls.current.get(key)?.abort();
    const c = new AbortController();
    toolCtrls.current.set(key, c);
    const epoch = epochRef.current;
    setState((s) => (s.epoch !== epoch ? s : { ...s, tools: { ...s.tools, [key]: { loading: true, error: null } } }));
    const settle = (patch: Partial<AnalysisState> & { status: ToolStatus }) => setState((s) => (s.epoch !== epoch ? s : {
      ...s, ...(patch.extras ? { extras: patch.extras } : {}), tools: { ...s.tools, [key]: patch.status },
    }));
    try {
      const d = await apiFetch<Record<string, unknown>>(`/api/${key}`, {
        body: { asset, assetClass: meta.assetClass, ...(meta.id ? { analysisId: meta.id } : {}) },
        signal: c.signal,
      });
      if (c.signal.aborted) return;
      const result = cleanToolResult(d[key]);
      if (!result) {
        settle({ status: { loading: false, error: new ApiError(502, { error: "That came back empty — please try again." }) } });
        return;
      }
      setState((s) => (s.epoch !== epoch ? s : { ...s, extras: { ...s.extras, [key]: result }, tools: { ...s.tools, [key]: { loading: false, error: null } } }));
    } catch (err) {
      if (isAbort(err, c.signal)) return;
      settle({ status: { loading: false, error: asApiError(err) } });
    } finally {
      if (toolCtrls.current.get(key) === c) toolCtrls.current.delete(key);
    }
  }, []);

  return { state, run, retry, runTool };
}
