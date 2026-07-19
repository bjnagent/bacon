"use client";

// Tiny shared GET cache for the cockpit views. Solves two real costs:
// duplicate fetches (several components read /api/watchlist) and refetch storms
// on tab switches. In-flight requests are deduped; mutations call invalidate().
const store = new Map<string, { t: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
// Bumped on every invalidate(). A request captures the epoch when it starts and
// refuses to cache its result if the epoch advanced meanwhile — otherwise a GET
// already in flight when a mutation invalidates could resolve afterward and
// re-cache now-stale data for a full TTL, masking the just-written change.
let epoch = 0;

export async function cachedJson<T = Record<string, unknown>>(url: string, ttlMs = 30_000): Promise<T> {
  const hit = store.get(url);
  if (hit && Date.now() - hit.t < ttlMs) return hit.data as T;
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;
  const startEpoch = epoch;
  const p = (async () => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && epoch === startEpoch) store.set(url, { t: Date.now(), data });
      return data as T;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p as Promise<T>;
}

// Drop every cached entry (and any in-flight fetch's right to re-cache) whose URL
// starts with the prefix (e.g. "/api/watchlist").
export function invalidate(prefix: string): void {
  epoch++;
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
  for (const key of inflight.keys()) if (key.startsWith(prefix)) inflight.delete(key);
}
