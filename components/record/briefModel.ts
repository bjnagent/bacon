// Shapes and pure helpers for the brief history half of the Record tab: the
// stored daily briefs, their live "$10K since flagged" pricing, and the
// kill-condition alerts the nightly watcher writes onto them.

import type { StoredBriefItem } from "@/lib/brief";
import type { DayTotals } from "@/lib/scoreboard";

export interface KillAlertItem { ticker?: string; name?: string; why?: string }
export interface KillAlert { at?: string; note?: string; items?: KillAlertItem[] }

/** GET /api/brief/history row. */
export interface BriefRow {
  id: string;
  brief_date: string;
  intro: string | null;
  caveat: string | null;
  items: StoredBriefItem[];
  reviewed_at: string | null;
  roi?: (DayTotals & { asOf?: string }) | null;
  kill_alert?: KillAlert | null;
}

/** One opportunity's hypothetical $10K result, or why it couldn't be priced. */
export interface RoiResult {
  name: string; ticker: string;
  entryDate?: string; entryClose?: number; asOfDate?: string; asOfClose?: number;
  invested?: number; value?: number; roiPct?: number; skipped?: string;
  /** Commodity/FX basis, preformatted in the instrument's own unit. */
  quoteKind?: "commodity" | "fx"; entryQuote?: string; asOfQuote?: string;
}
export interface RoiTotals extends DayTotals { count: number; asOf: string }
/** POST /api/brief/roi, or a stored snapshot seeded from the history row. */
export interface RoiData { since?: string; invested?: number; results?: RoiResult[]; totals?: RoiTotals | null; unavailable?: boolean; error?: string }

export const isPriced = (r: RoiResult | undefined): r is RoiResult & { value: number; invested: number; roiPct: number } =>
  !!r && typeof r.value === "number" && typeof r.invested === "number" && typeof r.roiPct === "number";

/**
 * Seed per-brief pricing from the stored snapshots, so already-priced days
 * show their total immediately and DON'T re-hit the rate-limited price
 * provider just because the brief was opened. "Re-price" still refreshes.
 */
export function seedRoi(briefs: BriefRow[]): Record<string, RoiData> {
  const out: Record<string, RoiData> = {};
  for (const b of briefs) {
    const t = b.roi;
    if (t && t.invested) {
      out[b.id] = {
        results: [],
        totals: { count: t.count ?? 1, invested: t.invested, value: t.value, asOf: t.asOf ?? "", roiPct: t.roiPct, spyPct: t.spyPct ?? null, alphaPct: t.alphaPct ?? null },
      };
    }
  }
  return out;
}

/** Display name for a brief idea: its ticker when it has a real one. */
export const ideaKey = (k: { ticker?: string; name?: string }) =>
  (k.ticker && k.ticker !== "—" ? k.ticker : k.name) || "an idea";

export interface ActiveKill { briefId: string; briefDate: string; at?: string; note?: string; item: KillAlertItem }

/** Every kill-condition hit across the history, newest brief first. */
export function activeKills(briefs: BriefRow[]): ActiveKill[] {
  const out: ActiveKill[] = [];
  for (const b of briefs) {
    for (const item of b.kill_alert?.items ?? []) {
      out.push({ briefId: b.id, briefDate: b.brief_date, at: b.kill_alert?.at, note: b.kill_alert?.note, item });
    }
  }
  return out;
}

export const VERDICT: Record<string, { label: string; tone: "pos" | "neg" | "info" | "neutral" }> = {
  "played-out": { label: "Played out", tone: "pos" },
  developing: { label: "Developing", tone: "info" },
  faded: { label: "Faded", tone: "neutral" },
  invalidated: { label: "Invalidated", tone: "neg" },
};
