"use client";

// Tiny shared GET cache for the cockpit views. Solves two real costs:
// duplicate fetches (several components read /api/watchlist) and refetch storms
// on tab switches. In-flight requests are deduped; mutations call invalidate().
const store = new Map<string, { t: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedJson<T = Record<string, unknown>>(url: string, ttlMs = 30_000): Promise<T> {
  const hit = store.get(url);
  if (hit && Date.now() - hit.t < ttlMs) return hit.data as T;
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;
  const p = (async () => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) store.set(url, { t: Date.now(), data });
      return data as T;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p as Promise<T>;
}

// Drop every cached entry whose URL starts with the prefix (e.g. "/api/watchlist").
export function invalidate(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
