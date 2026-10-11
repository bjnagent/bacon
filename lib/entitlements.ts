// Server-side plan resolution and the metering gate every AI route goes through.
//
// Posture, deliberately asymmetric:
//   - Plan lookup errors fail OPEN (to an ungated state). Wrongly blocking a
//     paying member is worse than a few cents of unbilled compute, and before
//     the billing migration is applied the app must behave exactly as it did.
//   - A feature the plan does not include fails CLOSED — that is the product,
//     not an outage.
//
// The decision itself (`resolvePlan`) is pure so it can be tested without a DB.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  ROUTE_GATES, TRIAL_DAYS, cheapestPlanWith, isPlanId, limitsFor, nextPlanFor, periodResetsAt, planHas,
  type Feature, type Meter, type PlanId,
} from "./plans";
import { isAdminEmail } from "./admin";
import { createAdminClient } from "./supabase/admin";

export type PlanSource = "subscription" | "trial" | "operator" | "free" | "fallback";

export interface PlanState {
  plan: PlanId;
  source: PlanSource;
  status: string;                       // active | trialing | past_due | canceled | free
  provider: string | null;              // stripe | app_store | manual
  interval: string | null;              // month | year
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  usage: Partial<Record<Meter, number>>;
  resetsAt: string;
}

interface SubRow {
  plan?: string; status?: string; provider?: string | null; current_period_end?: string | null;
  cancel_at_period_end?: boolean | null; billing_interval?: string | null;
}

/** Statuses that still carry the paid plan. past_due keeps access through the retry window. */
const LIVE = new Set(["active", "trialing", "past_due"]);
/** Grace after a period ends before access lapses — absorbs webhook lag on renewals. */
const GRACE_MS = 3 * 24 * 3600 * 1000;

export function resolvePlan(input: {
  email: string | null | undefined;
  subscription: SubRow | null;
  createdAt: string | null;
  usage?: Partial<Record<Meter, number>>;
  now?: Date;
}): PlanState {
  const now = input.now ?? new Date();
  const base = {
    provider: null, interval: null, periodEnd: null, cancelAtPeriodEnd: false, trialEndsAt: null,
    usage: input.usage ?? {}, resetsAt: periodResetsAt(now),
  };

  // The operator allowlist is never metered: it is the account that runs the desk.
  if (isAdminEmail(input.email)) return { ...base, plan: "desk", source: "operator", status: "active" };

  const s = input.subscription;
  if (s && isPlanId(s.plan) && s.plan !== "free" && LIVE.has(s.status ?? "")) {
    const end = s.current_period_end ? new Date(s.current_period_end).getTime() : null;
    if (end == null || end + GRACE_MS > now.getTime()) {
      return {
        ...base, plan: s.plan, source: "subscription", status: s.status ?? "active",
        provider: s.provider ?? null, interval: s.billing_interval ?? null,
        periodEnd: s.current_period_end ?? null, cancelAtPeriodEnd: !!s.cancel_at_period_end,
      };
    }
  }

  // Reverse trial: every new account runs on Pro for its first week, no card.
  // Seeing a brief built from your own watchlist is the product's aha moment;
  // making people pay before they have seen it would hide the thing we sell.
  if (input.createdAt) {
    const ends = new Date(input.createdAt).getTime() + TRIAL_DAYS * 24 * 3600 * 1000;
    if (ends > now.getTime()) {
      return { ...base, plan: "pro", source: "trial", status: "trialing", trialEndsAt: new Date(ends).toISOString() };
    }
  }

  return { ...base, plan: "free", source: "free", status: "free" };
}

/** The ungated state used when the billing schema isn't reachable. */
function fallbackState(email: string | null | undefined): PlanState {
  const s = resolvePlan({ email, subscription: null, createdAt: null });
  return s.source === "operator" ? s : { ...s, plan: "desk", source: "fallback", status: "active" };
}

export async function getPlanState(sb: SupabaseClient, user: { id: string; email?: string | null }): Promise<PlanState> {
  if (isAdminEmail(user.email)) return resolvePlan({ email: user.email, subscription: null, createdAt: null });
  try {
    const { data, error } = await sb.rpc("my_plan_state");
    if (error || !data) return fallbackState(user.email);
    const d = data as { subscription: SubRow | null; created_at: string | null; usage: Record<string, number> | null };
    return resolvePlan({ email: user.email, subscription: d.subscription, createdAt: d.created_at, usage: (d.usage ?? {}) as Partial<Record<Meter, number>> });
  } catch {
    return fallbackState(user.email);
  }
}

/**
 * Service-role variant for crons, which have no user session. Reads the same
 * three inputs directly.
 */
export async function getPlanStateAdmin(userId: string, email: string | null | undefined): Promise<PlanState> {
  if (isAdminEmail(email)) return resolvePlan({ email, subscription: null, createdAt: null });
  try {
    const admin = createAdminClient();
    const [sub, prof] = await Promise.all([
      admin.from("subscriptions").select("plan,status,provider,current_period_end,cancel_at_period_end,billing_interval").eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
    ]);
    if (sub.error && /relation|does not exist|schema cache/i.test(sub.error.message)) return fallbackState(email);
    return resolvePlan({ email, subscription: (sub.data as SubRow | null) ?? null, createdAt: (prof.data as { created_at?: string } | null)?.created_at ?? null });
  } catch {
    return fallbackState(email);
  }
}

export interface UpgradeBody {
  error: string;
  code: "upgrade_required";
  reason: "feature" | "limit";
  feature?: Feature;
  meter?: Meter;
  plan: PlanId;
  suggested: PlanId | null;
  limit?: number;
  resetsAt?: string;
}

/** 402 with enough structure for the client to open the right paywall. */
export function upgradeResponse(body: Omit<UpgradeBody, "code" | "error"> & { error?: string }): NextResponse {
  const error = body.error ?? (body.reason === "feature"
    ? "This is part of a paid plan."
    : "You've used this month's allowance.");
  return NextResponse.json({ ...body, error, code: "upgrade_required" } satisfies UpgradeBody, { status: 402 });
}

export type GateOk = { ok: true; state: PlanState; remaining: number | null; refund: () => Promise<void> };
export type GateResult = GateOk | { ok: false; response: NextResponse };

/**
 * Check the plan, then atomically consume one unit of the route's meter.
 * Call it AFTER request validation (a malformed request must not cost a unit)
 * and BEFORE any paid work. Call `refund()` if the work then fails.
 */
export async function gate(
  sb: SupabaseClient,
  user: { id: string; email?: string | null },
  route: keyof typeof ROUTE_GATES,
): Promise<GateResult> {
  const { meter, feature } = ROUTE_GATES[route];
  const state = await getPlanState(sb, user);
  const noop = async () => {};

  if (state.source === "operator" || state.source === "fallback") {
    return { ok: true, state, remaining: null, refund: noop };
  }
  if (feature && !planHas(state.plan, feature)) {
    return { ok: false, response: upgradeResponse({ reason: "feature", feature, plan: state.plan, suggested: cheapestPlanWith(feature) }) };
  }
  const limit = limitsFor(state.plan, state.source === "trial")[meter];
  const over = () => upgradeResponse({ reason: "limit", meter, plan: state.plan, suggested: nextPlanFor(meter, state.plan), limit, resetsAt: state.resetsAt });
  if (limit <= 0) return { ok: false, response: over() };

  let remaining: number | null = null;
  try {
    const { data, error } = await sb.rpc("consume_feature", { p_feature: meter, p_limit: limit });
    if (!error && typeof data === "number") {
      if (data < 0) return { ok: false, response: over() };
      remaining = data;
    }
  } catch { /* fail open: metering outage must not block the request */ }

  const refund = async () => {
    try {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
      await createAdminClient().rpc("release_feature", { p_user: user.id, p_feature: meter });
    } catch { /* best effort */ }
  };
  return { ok: true, state, remaining, refund };
}

/** Feature check without consuming anything — for routes that aren't metered. */
export async function requireFeature(
  sb: SupabaseClient,
  user: { id: string; email?: string | null },
  feature: Feature,
): Promise<{ ok: true; state: PlanState } | { ok: false; response: NextResponse }> {
  const state = await getPlanState(sb, user);
  if (state.source === "operator" || state.source === "fallback" || planHas(state.plan, feature)) return { ok: true, state };
  return { ok: false, response: upgradeResponse({ reason: "feature", feature, plan: state.plan, suggested: cheapestPlanWith(feature) }) };
}
