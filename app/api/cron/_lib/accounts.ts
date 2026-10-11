// Who the background jobs run for, and the plumbing they share.
//
// Entitlement: a nightly job runs for an account only if its plan includes the
// feature the job delivers (personal_brief for the sweep, kill_watch for the
// watcher) — plus the house account (HOUSE_USER_ID), which always runs: it
// feeds the free tier's shared house brief and the public /record.
//
// Resolving a plan needs three inputs per account: the subscription row, the
// account's age (reverse trial) and its email (the operator allowlist is
// matched by email). Rather than page through auth.users with
// auth.admin.listUsers — this auth schema is shared with another app, so that
// would read every account of BOTH products, every night — one service-role
// RPC (`cron_accounts`, supabase/schema.sql "billing: webhooks") returns all
// three for exactly the candidate ids in a single round trip, and the decision
// itself is the same pure `resolvePlan` the request path uses.
//
// Before that RPC exists, it falls back to the per-account path
// (getPlanStateAdmin), fetching an email only when an operator allowlist is
// actually configured.

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminEmails } from "@/lib/admin";
import { getPlanStateAdmin, resolvePlan, type PlanState } from "@/lib/entitlements";
import { planHas, type Feature } from "@/lib/plans";
import { isUuid } from "@/lib/billing";
import type { OpportunityBrief } from "@/lib/parsers";

export interface CronAccount {
  userId: string;
  /** `undefined` = not looked up (see `emailFor`); `null` = the account has none. */
  email: string | null | undefined;
  plan: PlanState;
}

/** The configured house account id, if it is a well-formed uuid. */
export function houseUserId(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.HOUSE_USER_ID ?? "").trim().toLowerCase();
  return isUuid(v) ? v : null;
}

/** Does the plan include `feature`? Operator and fail-open ("fallback") states include everything. */
export function hasFeature(plan: PlanState, feature: Feature): boolean {
  return plan.source === "operator" || plan.source === "fallback" || planHas(plan.plan, feature);
}

/** Pure: should a job delivering `feature` run for this account? */
export function entitled(acct: CronAccount | undefined, feature: Feature, house: string | null): boolean {
  if (!acct) return false; // no auth user behind the settings row
  if (house && acct.userId.toLowerCase() === house) return true;
  return hasFeature(acct.plan, feature);
}

/** How far short of its cadence an account may be and still count as due (capped at half the cadence). */
export const CADENCE_SLACK_MS = 3 * 60 * 60_000;

/**
 * Pure: has an account's sweep cadence lapsed?
 *
 * Measured with slack, not exactly. The cron fires once a day but never at the
 * same second (Vercel only promises the hour on some plans), and `claim` stamps
 * the moment a run reached the account. Compared exactly, a 24h cadence came up
 * seconds short on the next day's run, so every daily account was swept every
 * OTHER day — which is what production did for weeks before this.
 */
export function isDue(lastSweepAt: string | null, cadenceMs: number, now: number): boolean {
  if (!lastSweepAt) return true;
  const last = new Date(lastSweepAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now - last >= cadenceMs - Math.min(CADENCE_SLACK_MS, cadenceMs / 2);
}

/** Bounded-concurrency map. A worker pool, not fixed batches: one slow item never idles the others. */
export async function mapPool<T, R>(items: readonly T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, worker));
  return out;
}

interface CronAccountRow {
  user_id: string;
  email: string | null;
  created_at: string | null;
  plan: string | null;
  status: string | null;
  provider: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  billing_interval: string | null;
}

/** Pure: an RPC row → the account's plan, exactly as the request path would resolve it. */
export function accountFromRow(r: CronAccountRow, now: Date = new Date()): CronAccount {
  const subscription = r.plan
    ? {
      plan: r.plan, status: r.status ?? undefined, provider: r.provider, current_period_end: r.current_period_end,
      cancel_at_period_end: r.cancel_at_period_end, billing_interval: r.billing_interval,
    }
    : null;
  return {
    userId: r.user_id,
    email: r.email ?? null,
    plan: resolvePlan({ email: r.email, subscription, createdAt: r.created_at, now }),
  };
}

export async function loadCronAccounts(
  admin: SupabaseClient,
  ids: string[],
  now: Date = new Date(),
): Promise<{ accounts: Map<string, CronAccount>; via: "rpc" | "fallback" }> {
  const accounts = new Map<string, CronAccount>();
  const unique = [...new Set(ids)];
  if (!unique.length) return { accounts, via: "rpc" };

  const { data, error } = await admin.rpc("cron_accounts", { p_ids: unique });
  if (!error && Array.isArray(data)) {
    for (const r of data as CronAccountRow[]) accounts.set(r.user_id, accountFromRow(r, now));
    return { accounts, via: "rpc" };
  }

  console.warn(`[cron] cron_accounts unavailable (${error?.message ?? "no data"}) — resolving plans one account at a time; apply supabase/schema.sql`);
  const needEmail = adminEmails().length > 0;
  await mapPool(unique, 8, async (id) => {
    let email: string | null | undefined;
    if (needEmail) {
      const { data: u } = await admin.auth.admin.getUserById(id).catch(() => ({ data: null }));
      email = u?.user?.email ?? null;
    }
    accounts.set(id, { userId: id, email, plan: await getPlanStateAdmin(id, email ?? null) });
  });
  return { accounts, via: "fallback" };
}

/** The account's email, looking it up only if the plan lookup didn't already return it. */
export async function emailFor(admin: SupabaseClient, acct: CronAccount): Promise<string | null> {
  if (acct.email !== undefined) return acct.email;
  try {
    const { data } = await admin.auth.admin.getUserById(acct.userId);
    acct.email = data?.user?.email ?? null;
  } catch {
    acct.email = null;
  }
  return acct.email;
}

/** Push copy for a finished brief: the lead idea and how many more there are. */
export function briefPushBody(brief: Pick<OpportunityBrief, "items">): string {
  const n = brief.items.length;
  const first = brief.items[0];
  if (!first) return "Today's brief is ready.";
  const lead = first.ticker && first.ticker !== "—" && !first.name.includes(first.ticker) ? `${first.name} (${first.ticker})` : first.name;
  if (n === 1) return `${lead} — today's one idea.`;
  return `${lead} and ${n - 1} more idea${n - 1 === 1 ? "" : "s"} in today's brief.`;
}

/** Push copy for kill-condition alerts. */
export function killPushMessage(alerts: { ticker: string; name?: string }[]): { title: string; body: string } {
  const label = (a: { ticker: string; name?: string }) => (a.ticker && a.ticker !== "—" ? a.ticker : a.name || a.ticker);
  if (alerts.length === 1) {
    return { title: "A kill condition may have triggered", body: `${label(alerts[0])} — re-check the thesis before relying on it.` };
  }
  const names = alerts.slice(0, 3).map(label).join(", ");
  const more = alerts.length > 3 ? ` and ${alerts.length - 3} more` : "";
  return { title: `${alerts.length} kill conditions may have triggered`, body: `${names}${more} — re-check before relying on them.` };
}
