"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { RecordPayload } from "./recordModel";
import type { BriefRow } from "./briefModel";

// The Record tab's data: the account's calls (+ calibration memo) and its brief
// history, fetched together. The screen stays mounted while hidden, so this
// loads once on first show and then only refreshes — quietly, keeping what is
// on screen — when the tab comes back after the data has gone stale. Grading
// runs nightly, so ten minutes is generous.

export const STALE_MS = 10 * 60_000;

const asApiError = (e: unknown) =>
  e instanceof ApiError ? e : new ApiError(0, { error: "Couldn't load — check your connection.", code: "offline" });

export interface RecordData {
  record: RecordPayload | null;
  briefs: BriefRow[] | null;
  migrationNeeded: boolean;
  recordError: ApiError | null;
  briefsError: ApiError | null;
  /** First load hasn't finished yet. */
  loading: boolean;
  /** A load (first or refresh) is in flight. */
  busy: boolean;
  /** When the last load finished (ms), 0 before the first. */
  loadedAt: number;
  reload: () => Promise<void>;
  /** Patch one brief locally after a mutation (review, re-price). */
  updateBrief: (id: string, patch: Partial<BriefRow>) => void;
}

export function useRecordData(active: boolean): RecordData {
  const [record, setRecord] = useState<RecordPayload | null>(null);
  const [briefs, setBriefs] = useState<BriefRow[] | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [recordError, setRecordError] = useState<ApiError | null>(null);
  const [briefsError, setBriefsError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const inflight = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const reload = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    const [r, b] = await Promise.allSettled([
      apiFetch<RecordPayload>("/api/calibration", { paywall: false }),
      apiFetch<{ briefs?: BriefRow[]; migrationNeeded?: boolean }>("/api/brief/history", { paywall: false }),
    ]);
    inflight.current = false;
    if (!live.current) return;
    if (r.status === "fulfilled") {
      const v = r.value;
      setRecord({ ...v, calls: Array.isArray(v.calls) ? v.calls : [], memo: v.memo ?? "", minGraded: v.minGraded ?? 8 });
      setRecordError(null);
    } else {
      setRecordError(asApiError(r.reason));
    }
    if (b.status === "fulfilled") {
      setBriefs(Array.isArray(b.value.briefs) ? b.value.briefs : []);
      setMigrationNeeded(!!b.value.migrationNeeded);
      setBriefsError(null);
    } else {
      setBriefsError(asApiError(b.reason));
    }
    setBusy(false);
    setLoadedAt(Date.now());
  }, []);

  // First show, and stale-on-return. Deferred a tick so the state updates land
  // outside the effect body.
  useEffect(() => {
    if (!active) return;
    if (loadedAt && Date.now() - loadedAt < STALE_MS) return;
    const id = setTimeout(() => { void reload(); }, 0);
    return () => clearTimeout(id);
  }, [active, loadedAt, reload]);

  const updateBrief = useCallback((id: string, patch: Partial<BriefRow>) => {
    setBriefs((prev) => prev?.map((b) => (b.id === id ? { ...b, ...patch } : b)) ?? prev);
  }, []);

  return {
    record, briefs, migrationNeeded, recordError, briefsError,
    loading: loadedAt === 0, busy, loadedAt, reload, updateBrief,
  };
}
