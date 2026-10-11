"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { chunk, type Quote } from "./logic";

// /api/quotes caps one request at 25 symbols; a Desk watchlist can be 100.
const BATCH = 25;

/**
 * Real quotes for a set of quote keys (see logic.quoteKey): one request for
 * the whole list, then only newly added names. `refresh()` re-asks for all of
 * them and DROPS any symbol the provider no longer answers for — a price that
 * couldn't be re-fetched is never left on screen looking current.
 */
export function useQuotes(keys: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const asked = useRef<Set<string>>(new Set());
  const keyStr = [...new Set(keys)].sort().join(",");

  const load = useCallback(async (list: string[]) => {
    if (!list.length) return;
    list.forEach((k) => asked.current.add(k));
    const results = await Promise.all(
      chunk(list, BATCH).map((part) =>
        apiFetch<{ quotes?: Record<string, Quote> }>(`/api/quotes?symbols=${encodeURIComponent(part.join(","))}`, { paywall: false })
          .catch(() => null)),
    );
    setQuotes((prev) => {
      const next = { ...prev };
      for (const k of list) delete next[k];
      for (const r of results) if (r?.quotes) Object.assign(next, r.quotes);
      return next;
    });
  }, []);

  useEffect(() => {
    const missing = keyStr ? keyStr.split(",").filter((k) => !asked.current.has(k)) : [];
    if (missing.length) void load(missing);
  }, [keyStr, load]);

  const refresh = useCallback(() => load(keyStr ? keyStr.split(",") : []), [keyStr, load]);
  return { quotes, refresh };
}
