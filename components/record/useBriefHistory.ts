"use client";

import { useCallback, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { invalidate } from "@/lib/clientCache";
import { computeScoreboard, type DayTotals, type Scoreboard } from "@/lib/scoreboard";
import { toast } from "@/components/ui";
import type { StoredBriefItem } from "@/lib/brief";
import { seedRoi, type BriefRow, type RoiData } from "./briefModel";

// The brief history's actions: price a day's ideas as $10K stakes (live, real
// closes), and ask "how did it age?" (a metered, web-searched review). Kept in
// a hook so the kill-alert banner at the top of the screen and the history list
// further down open the same brief sheet with the same state.

export interface BriefHistoryApi {
  roiFor: (id: string) => RoiData | undefined;
  priceError: Record<string, string>;
  pricing: string | null;
  reviewing: string | null;
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
  price: (id: string) => Promise<void>;
  review: (id: string) => Promise<void>;
  score: Scoreboard;
}

export function useBriefHistory(briefs: BriefRow[], updateBrief: (id: string, patch: Partial<BriefRow>) => void, onReviewed?: () => void): BriefHistoryApi {
  // Stored snapshots seed the view; a live re-price overrides its day.
  const seeded = useMemo(() => seedRoi(briefs), [briefs]);
  const [live, setLive] = useState<Record<string, RoiData>>({});
  const [priceError, setPriceError] = useState<Record<string, string>>({});
  const [pricing, setPricing] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const roiFor = useCallback((id: string) => live[id] ?? seeded[id], [live, seeded]);

  const price = useCallback(async (id: string) => {
    if (pricing) return;
    setPricing(id);
    setPriceError((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      const data = await apiFetch<RoiData>("/api/brief/roi", { body: { id } });
      setLive((prev) => ({ ...prev, [id]: data }));
    } catch (e) {
      setPriceError((prev) => ({ ...prev, [id]: e instanceof ApiError ? e.message : "Pricing failed — please try again." }));
    } finally {
      setPricing(null);
    }
  }, [pricing]);

  // Opening a brief prices it the first time, so the money view is already on
  // screen. Days with a stored snapshot don't re-price on open — that would
  // spend the price provider's small daily allowance just for looking.
  const open = useCallback((id: string) => {
    setOpenId(id);
    if (!live[id] && !seeded[id] && !pricing) void price(id);
  }, [live, seeded, pricing, price]);

  const close = useCallback(() => setOpenId(null), []);

  const review = useCallback(async (id: string) => {
    if (reviewing) return;
    setReviewing(id);
    try {
      const data = await apiFetch<{ items: StoredBriefItem[]; reviewed_at: string }>("/api/brief/review", { body: { id } });
      updateBrief(id, { items: data.items, reviewed_at: data.reviewed_at });
      // Today's brief reads the same rows; drop its cached copy.
      invalidate("/api/brief");
      onReviewed?.();
      toast("Review saved — see how each idea aged.");
    } catch (e) {
      // A 402 has already opened the paywall; anything else gets said plainly.
      if (!(e instanceof ApiError && e.isUpgrade)) toast.error(e instanceof ApiError ? e.message : "The review didn't finish — please try again.");
    } finally {
      setReviewing(null);
    }
  }, [reviewing, updateBrief, onReviewed]);

  const score = useMemo(() => {
    const totals: Record<string, DayTotals | undefined> = {};
    for (const [id, r] of Object.entries(live)) if (r.totals) totals[id] = r.totals;
    return computeScoreboard(briefs, totals);
  }, [briefs, live]);

  return { roiFor, priceError, pricing, reviewing, openId, open, close, price, review, score };
}
