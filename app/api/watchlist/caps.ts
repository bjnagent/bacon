// Plan caps on the two lists a member curates — tracked names and scout themes.
//
// These are not metered like the AI routes (nothing is consumed per add); they
// are a ceiling on how much nightly work one account asks the sweep to do, so
// they are checked against the current row count at insert time.
//
// Lives next to the watchlist route rather than in lib/ because only the
// watchlist and themes routes enforce it; the catalog numbers themselves stay
// in lib/plans.ts.

import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";
import { getPlanState, upgradeResponse } from "@/lib/entitlements";

export type CapKind = "watchlistMax" | "themesMax";

/** The cheapest plan above `current` with a bigger cap — what the paywall offers. */
export function nextPlanForCap(kind: CapKind, current: PlanId): PlanId | null {
  const cur = PLANS[current][kind];
  const at = PLAN_ORDER.indexOf(current);
  return PLAN_ORDER.find((p) => PLAN_ORDER.indexOf(p) > at && PLANS[p][kind] > cur) ?? null;
}

/** "You're tracking 5 of 5 names on Free." — the paywall uses it as its title. */
export function capMessage(kind: CapKind, used: number, max: number, plan: PlanId): string {
  const name = PLANS[plan].name;
  return kind === "watchlistMax"
    ? `You're tracking ${used} of ${max} ${max === 1 ? "name" : "names"} on ${name}.`
    : `You're following ${used} of ${max} ${max === 1 ? "theme" : "themes"} on ${name}.`;
}

/**
 * Null when another row fits; otherwise the 402 to return. Fails OPEN on a
 * count error, matching lib/entitlements: wrongly blocking a paying member is
 * worse than one extra row. The count-then-insert window can let a burst of
 * parallel adds land one or two over the cap — acceptable for a soft ceiling,
 * and duplicates are still impossible (the unique index decides those).
 */
export async function overCap(
  sb: SupabaseClient,
  user: { id: string; email?: string | null },
  table: "watchlist" | "themes",
  kind: CapKind,
): Promise<NextResponse | null> {
  const state = await getPlanState(sb, user);
  if (state.source === "operator" || state.source === "fallback") return null;
  const max = PLANS[state.plan][kind];
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true });
  if (error || typeof count !== "number" || count < max) return null;
  return upgradeResponse({
    reason: "limit",
    plan: state.plan,
    suggested: nextPlanForCap(kind, state.plan),
    limit: max,
    error: capMessage(kind, count, max, state.plan),
  });
}

/** Postgres unique_violation — the per-user unique index caught a duplicate. */
export const isDuplicate = (err: { code?: string } | null | undefined) => err?.code === "23505";
