"use client";

import { useApp } from "@/components/app/AppContext";
import { nextPlanFor } from "@/lib/plans";
import { openPaywall } from "@/lib/client/paywall";

/**
 * This month's deep-dive allowance — "2 of 30 left" — or null when the account
 * is unmetered (operator, billing not configured) or /api/me hasn't loaded.
 * `low` is the last fifth (at least the last one), when an upgrade is worth a mention.
 */
export function useAllowance() {
  const app = useApp();
  const left = app.remaining("analysis");
  const limit = app.me?.limits.analysis ?? null;
  const plan = app.me?.plan ?? null;
  if (left == null || limit == null || limit <= 0 || !plan) return null;
  const upgrade = () => openPaywall({
    reason: "limit", meter: "analysis", plan: plan.plan, suggested: nextPlanFor("analysis", plan.plan), limit, resetsAt: plan.resetsAt,
  });
  return { left, limit, low: left <= Math.max(1, Math.floor(limit * 0.2)), out: left <= 0, upgrade };
}
