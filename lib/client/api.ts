"use client";

// One client for every /api/* call. Three things every caller used to hand-roll:
//
//  1. Errors. Routes answer `{ error, code? }`; this turns that into a thrown
//     ApiError with a readable message, so views render `err.message` and stop
//     guessing at response shapes.
//  2. The paywall. A 402 `upgrade_required` opens the paywall sheet from here,
//     once, instead of every view having to know about plans.
//  3. Caching. `useApi` reads through the shared cache (lib/clientCache), so
//     tabs that need the same data share one request and switching back to a
//     tab is instant.

import { useCallback, useEffect, useRef, useState } from "react";
import { cachedJson, invalidate } from "@/lib/clientCache";
import { openPaywall, type PaywallRequest } from "./paywall";

export class ApiError extends Error {
  status: number;
  code?: string;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : `Request failed (${status})`);
    this.status = status;
    this.code = typeof body.code === "string" ? body.code : undefined;
    this.body = body;
  }
  get isUpgrade() { return this.code === "upgrade_required"; }
}

function friendly(status: number, text: string): Record<string, unknown> {
  try { const j = JSON.parse(text); if (j && typeof j === "object") return j; } catch { /* not JSON */ }
  if (status === 504 || /timeout/i.test(text)) return { error: "That took too long — please try again." };
  if (status === 401) return { error: "You've been signed out. Sign in again to continue.", code: "unauthenticated" };
  if (status >= 500) return { error: "Something went wrong on our side. Please try again." };
  return { error: `Request failed (${status})` };
}

/** Raise the paywall for an upgrade error (no-op for anything else). */
export function handleUpgrade(err: unknown): boolean {
  if (err instanceof ApiError && err.isUpgrade) {
    openPaywall(err.body as unknown as PaywallRequest);
    return true;
  }
  return false;
}

export async function apiFetch<T = Record<string, unknown>>(
  url: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; paywall?: boolean } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, { error: "You appear to be offline. Check your connection and try again.", code: "offline" });
  }
  const text = await res.text();
  if (!res.ok) {
    const err = new ApiError(res.status, friendly(res.status, text));
    if (init.paywall !== false) handleUpgrade(err);
    throw err;
  }
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return { text } as unknown as T; }
}

/**
 * POST and read a streamed text body, reporting the accumulated text as it
 * grows. Same error and paywall handling as apiFetch.
 */
export async function apiStream(
  url: string,
  body: unknown,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, { error: "You appear to be offline. Check your connection and try again.", code: "offline" });
  }
  if (!res.ok || !res.body) {
    const err = new ApiError(res.status, friendly(res.status, await res.text().catch(() => "")));
    handleUpgrade(err);
    throw err;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let acc = "";
  let rafId = 0;
  const flush = () => { rafId = 0; onChunk(acc); };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += dec.decode(value, { stream: true });
    // Coalesce to one UI update per frame — parsing on every network chunk
    // is hundreds of parses for a single briefing.
    if (!rafId && typeof requestAnimationFrame !== "undefined") rafId = requestAnimationFrame(flush);
  }
  if (rafId) cancelAnimationFrame(rafId);
  onChunk(acc);
  // The server appends this marker when the upstream model call fails mid-way.
  const m = acc.match(/\n\n\[error: ([^\]]*)\]\s*$/);
  if (m) throw new ApiError(502, { error: "The analysis was interrupted — please try again.", detail: m[1] });
  return acc;
}

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Re-fetch, bypassing the cache. */
  refresh: () => Promise<void>;
  /** Replace local data optimistically (e.g. after a mutation). */
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
}

/** Cached GET. `url = null` skips the request (dependent queries). */
export function useApi<T>(url: string | null, ttlMs = 30_000): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const live = useRef(true);
  // Set on mount as well as cleared on unmount: Strict Mode's simulated
  // unmount/remount would otherwise leave this false and drop every result.
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const load = useCallback(async (fresh: boolean) => {
    if (!url) return;
    if (fresh) invalidate(url);
    setLoading(true);
    try {
      const d = await cachedJson<T & { error?: string; code?: string }>(url, ttlMs);
      if (!live.current) return;
      if (d && typeof d === "object" && typeof (d as { error?: unknown }).error === "string") {
        setError(new ApiError(400, d as unknown as Record<string, unknown>));
      } else {
        setData(d as T);
        setError(null);
      }
    } catch {
      if (live.current) setError(new ApiError(0, { error: "Couldn't load — check your connection.", code: "offline" }));
    } finally {
      if (live.current) setLoading(false);
    }
  }, [url, ttlMs]);

  useEffect(() => {
    const id = setTimeout(() => { void load(false); }, 0);
    return () => clearTimeout(id);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);
  return { data, error, loading, refresh, setData };
}
