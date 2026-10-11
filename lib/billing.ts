// Billing: turning provider events into the one `subscriptions` row per account
// that lib/entitlements.ts reads.
//
// Two channels write that row:
//   - Stripe (web) via /api/billing/webhook
//   - the App Store, through RevenueCat, via /api/billing/revenuecat
// plus 'manual' rows (founding members, comps) written by hand in SQL.
//
// Everything that decides WHAT to write is a pure function here, tested without
// a database or a network. The I/O at the bottom is thin: read the current row,
// ask `decideWrite` whether the incoming state may replace it, upsert.
//
// PROVIDER PRECEDENCE — the rule `decideWrite` enforces:
//
//   1. No row yet (or a row with no provider) → write.
//   2. Same provider → write. Exception: a NOT-live state for a DIFFERENT
//      subscription id than the live one on the row is a late event about a
//      subscription that was since replaced (old sub's `deleted` arriving after
//      the new sub's `created`) → ignore.
//   3. Different provider, and the row's subscription is not live → write.
//   4. Different provider, the row is live and the incoming state is not →
//      IGNORE. A Stripe cancellation can never downgrade an active App Store
//      plan, and an App Store expiry can never downgrade an active Stripe plan.
//   5. Both live on different channels (someone paying twice) → the incoming
//      one wins only if it is a HIGHER plan — or, against a 'manual' comp, an
//      equal-or-higher one (a paid plan supersedes a comp).
//
// "Live" is exactly what entitlements treats as paid (status active/trialing/
// past_due and not past its period end + grace) — computed by calling
// `resolvePlan`, so the two can't drift.
//
// The Stripe customer id is also kept in its own column, `stripe_customer_id`,
// which is written on every Stripe event even when rule 4/5 ignores the plan
// change. Whoever "owns" the row, a person with a Stripe customer can always
// reach the billing portal, and account deletion can always find their Stripe
// subscriptions to cancel.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { PLAN_ORDER, isPlanId, type PlanId } from "./plans";
import { resolvePlan } from "./entitlements";
import { idOf, type StripeCheckoutSession, type StripeEvent, type StripeInvoice, type StripeSubscription } from "./stripe";

export type PaidPlan = Exclude<PlanId, "free">;
export type Interval = "month" | "year";
export type Env = Record<string, string | undefined>;
export interface PlanInterval { plan: PaidPlan; interval: Interval }

/** The provider-owned columns of a `subscriptions` row. */
export interface SubscriptionState {
  plan: PlanId;
  status: string;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  product_id: string | null;
  billing_interval: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/** A row as read back — any column may be absent on an older schema. */
export interface ExistingRow extends Partial<SubscriptionState> {
  user_id?: string;
  stripe_customer_id?: string | null;
  updated_at?: string | null;
}

export type MapResult<T> = { ok: true; value: T } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Small shared helpers.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const RANK: Record<PlanId, number> = Object.fromEntries(PLAN_ORDER.map((p, i) => [p, i])) as Record<PlanId, number>;
export const planRank = (p: unknown): number => (isPlanId(p) ? RANK[p] : 0);

const isPaidPlan = (v: unknown): v is PaidPlan => v === "pro" || v === "desk";

function normInterval(v: unknown): Interval | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "month" || s === "monthly") return "month";
  if (s === "year" || s === "yearly" || s === "annual" || s === "annually") return "year";
  return null;
}

/** Constant-time string comparison that doesn't leak the length either. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/**
 * A same-origin path to send someone back to after Checkout or the portal.
 * Only the pathname survives (no query, no fragment, never a host), and
 * anything under /api falls back to "/".
 */
export function sanitizeReturnPath(v: unknown, fallback = "/"): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  if (!s || s.length > 512 || s[0] !== "/" || s[1] === "/" || s[1] === "\\") return fallback;
  if (/[\\\u0000-\u001F\u007F]/.test(s)) return fallback;
  let path: string;
  try {
    const base = "https://return.invalid";
    const u = new URL(s, base);
    if (u.origin !== base) return fallback;
    path = u.pathname;
  } catch {
    return fallback;
  }
  if (path.startsWith("//") || path === "/api" || path.startsWith("/api/")) return fallback;
  return path;
}

/** The public origin for redirect URLs: NEXT_PUBLIC_SITE_URL, else the request's own. */
export function siteOrigin(requestUrl: string, env: Env = process.env): string {
  const configured = (env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(requestUrl).origin;
}

/** Does this row currently grant its paid plan? Same answer entitlements gives. */
export function isLive(row: Partial<SubscriptionState> | null | undefined, now: Date = new Date()): boolean {
  if (!row || !isPlanId(row.plan)) return false;
  return resolvePlan({
    email: null, createdAt: null, now,
    subscription: { plan: row.plan, status: row.status, current_period_end: row.current_period_end ?? null },
  }).source === "subscription";
}

// ---------------------------------------------------------------------------
// Precedence.

export type Decision = { apply: boolean; reason: string };

export function decideWrite(existing: ExistingRow | null, incoming: SubscriptionState, now: Date = new Date()): Decision {
  if (!existing || !existing.provider) return { apply: true, reason: "no current subscription" };
  const curLive = isLive(existing, now);
  const newLive = isLive(incoming, now);

  if (existing.provider === incoming.provider) {
    const a = existing.provider_subscription_id, b = incoming.provider_subscription_id;
    if (curLive && !newLive && a && b && a !== b) {
      return { apply: false, reason: `ignored: ${b} is not live and the row holds a different live ${existing.provider} subscription (${a})` };
    }
    return { apply: true, reason: `${incoming.provider} update` };
  }
  if (!curLive) return { apply: true, reason: `current ${existing.provider} subscription is not live` };
  if (!newLive) {
    return { apply: false, reason: `ignored: ${incoming.provider} state "${incoming.status}" would downgrade a live ${existing.provider} subscription` };
  }
  const up = planRank(incoming.plan), cur = planRank(existing.plan);
  if (up > cur || (existing.provider === "manual" && up >= cur)) {
    return { apply: true, reason: `${incoming.provider} ${incoming.plan} supersedes ${existing.provider} ${existing.plan}` };
  }
  return { apply: false, reason: `ignored: live ${existing.provider} ${existing.plan} outranks ${incoming.provider} ${incoming.plan}` };
}

// ---------------------------------------------------------------------------
// Stripe → state.

/** Price ids from the environment, by plan and interval. */
export function stripePrices(env: Env = process.env): Record<PaidPlan, Record<Interval, string | undefined>> {
  const v = (k: string) => (env[k] ?? "").trim() || undefined;
  return {
    pro: { month: v("STRIPE_PRICE_PRO_MONTHLY"), year: v("STRIPE_PRICE_PRO_YEARLY") },
    desk: { month: v("STRIPE_PRICE_DESK_MONTHLY"), year: v("STRIPE_PRICE_DESK_YEARLY") },
  };
}

export function stripePriceFor(plan: PaidPlan, interval: Interval, env: Env = process.env): string | null {
  return stripePrices(env)[plan][interval] ?? null;
}

export function planForStripePrice(priceId: string | null | undefined, env: Env = process.env): PlanInterval | null {
  if (!priceId) return null;
  const prices = stripePrices(env);
  for (const plan of ["pro", "desk"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (prices[plan][interval] === priceId) return { plan, interval };
    }
  }
  return null;
}

/** Stripe's status vocabulary → ours. Only active/trialing/past_due carry a plan. */
export function mapStripeStatus(status: string | null | undefined): string {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return status;
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    case "incomplete": // first payment still pending (e.g. 3-D Secure) — no access yet
    case "paused":     // trial ended with no payment method
      return status;
    default:
      return "canceled";
  }
}

const LIVE_STRIPE = new Set(["active", "trialing", "past_due"]);
const toIso = (sec: number | null | undefined) =>
  typeof sec === "number" && Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000).toISOString() : null;

export function stripeSubscriptionToState(sub: StripeSubscription, env: Env = process.env): MapResult<SubscriptionState> {
  const items = sub.items?.data ?? [];
  let matched: { item: (typeof items)[number]; pi: PlanInterval } | null = null;
  for (const item of items) {
    const pi = planForStripePrice(item.price?.id, env);
    if (pi) { matched = { item, pi }; break; }
  }
  const item = matched?.item ?? items[0];
  const status = mapStripeStatus(sub.status);
  const live = LIVE_STRIPE.has(status);

  let plan: PlanId;
  let interval: string | null;
  if (matched) {
    plan = matched.pi.plan;
    interval = matched.pi.interval;
  } else if (isPaidPlan(sub.metadata?.plan)) {
    // A price that isn't (or is no longer) in the env — e.g. a grandfathered
    // price. Checkout stamps the plan on the subscription's metadata.
    plan = sub.metadata.plan;
    interval = normInterval(item?.price?.recurring?.interval);
  } else if (!live) {
    plan = "free";
    interval = normInterval(item?.price?.recurring?.interval);
  } else {
    return { ok: false, reason: `unknown Stripe price ${item?.price?.id ?? "(none)"} on live subscription ${sub.id}` };
  }

  const periodEnd = sub.current_period_end ?? matched?.item.current_period_end ?? items[0]?.current_period_end ?? null;
  return {
    ok: true,
    value: {
      plan,
      status,
      provider: "stripe",
      provider_customer_id: idOf(sub.customer),
      provider_subscription_id: sub.id,
      product_id: item?.price?.id ?? null,
      billing_interval: interval,
      current_period_end: toIso(periodEnd),
      // Newer portal flows schedule a cancellation with `cancel_at` rather than
      // the flag; either way the plan won't renew.
      cancel_at_period_end: !!sub.cancel_at_period_end || (live && typeof sub.cancel_at === "number" && sub.cancel_at > 0),
    },
  };
}

/** The subscription an invoice belongs to, in either API shape. */
export function invoiceSubscriptionId(inv: StripeInvoice): string | null {
  return idOf(inv.subscription ?? null) ?? idOf(inv.parent?.subscription_details?.subscription ?? null);
}

export const STRIPE_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

// ---------------------------------------------------------------------------
// RevenueCat (App Store) → state.

export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  new_product_id?: string | null;
  period_type?: string | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  environment?: string | null;
  store?: string | null;
  original_transaction_id?: string | null;
  cancel_reason?: string | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

export const DEFAULT_REVENUECAT_PRODUCTS: Record<string, PlanInterval> = {
  bacon_pro_monthly: { plan: "pro", interval: "month" },
  bacon_pro_yearly: { plan: "pro", interval: "year" },
  bacon_desk_monthly: { plan: "desk", interval: "month" },
  bacon_desk_yearly: { plan: "desk", interval: "year" },
};

/**
 * Product id → plan. Defaults to the bacon_<plan>_<monthly|yearly> convention;
 * REVENUECAT_PRODUCT_MAP (JSON) adds or overrides entries, each either
 * "pro:month" or { "plan": "pro", "interval": "year" }. Malformed entries are
 * dropped rather than guessed at.
 */
export function revenueCatProducts(env: Env = process.env): Record<string, PlanInterval> {
  const out = { ...DEFAULT_REVENUECAT_PRODUCTS };
  const raw = env.REVENUECAT_PRODUCT_MAP;
  if (!raw || !raw.trim()) return out;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return out; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
    let plan: unknown, interval: unknown;
    if (typeof v === "string") [plan, interval] = v.split(/[:/]/);
    else if (v && typeof v === "object") ({ plan, interval } = v as { plan?: unknown; interval?: unknown });
    const iv = normInterval(interval);
    const p = typeof plan === "string" ? plan.trim().toLowerCase() : plan;
    if (isPaidPlan(p) && iv) out[id] = { plan: p, interval: iv };
  }
  return out;
}

/** The Supabase user an event is about. Anonymous RevenueCat ids are ignored. */
export function revenueCatUserId(e: Pick<RevenueCatEvent, "app_user_id" | "original_app_user_id">): string | null {
  if (isUuid(e.app_user_id)) return e.app_user_id.toLowerCase();
  if (isUuid(e.original_app_user_id)) return e.original_app_user_id.toLowerCase();
  return null;
}

const msIso = (ms: number | null | undefined) =>
  typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;

/** Events that move the billing period forward (or start it). */
const RC_ACTIVATE = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED"]);
export const REVENUECAT_EVENTS = new Set([
  ...RC_ACTIVATE, "CANCELLATION", "EXPIRATION", "BILLING_ISSUE", "SUBSCRIPTION_PAUSED", "TRANSFER", "TEST",
]);

export function revenueCatEventToState(
  e: RevenueCatEvent,
  existing: ExistingRow | null,
  products: Record<string, PlanInterval>,
  now: Date = new Date(),
): MapResult<SubscriptionState> {
  if (!REVENUECAT_EVENTS.has(e.type) || e.type === "TEST" || e.type === "TRANSFER") {
    return { ok: false, reason: `event type ${e.type} doesn't map to a subscription state` };
  }
  const userId = revenueCatUserId(e);
  if (!userId) return { ok: false, reason: "anonymous or missing app_user_id" };

  const prior = existing?.provider === "app_store" ? existing : null;
  const expiresAt = msIso(e.expiration_at_ms);

  // Out-of-order delivery: an event about an OLDER period than the one on the
  // row is stale. (Not applied to CANCELLATION — a refund legitimately moves
  // the expiry earlier.)
  if (prior && expiresAt && prior.current_period_end && (RC_ACTIVATE.has(e.type) || e.type === "EXPIRATION")) {
    const sameSub = !prior.provider_subscription_id || !e.original_transaction_id || prior.provider_subscription_id === e.original_transaction_id;
    if (sameSub && Date.parse(expiresAt) + 1000 < Date.parse(prior.current_period_end)) {
      return { ok: false, reason: `stale ${e.type}: expires ${expiresAt}, row already runs to ${prior.current_period_end}` };
    }
  }

  // Which product the row should carry.
  let productId = e.product_id ?? prior?.product_id ?? null;
  let pi: PlanInterval | null = productId ? products[productId] ?? null : null;
  if (e.type === "PRODUCT_CHANGE" && e.new_product_id) {
    // An upgrade takes effect at once; a downgrade (or a crossgrade to a longer
    // period) only at the next renewal, which arrives as a RENEWAL carrying the
    // new product. Until then the better of the two is what they're paying for.
    const next = products[e.new_product_id] ?? null;
    if (next && (!pi || planRank(next.plan) > planRank(pi.plan))) { pi = next; productId = e.new_product_id; }
  }
  if (!pi && prior && isPaidPlan(prior.plan)) {
    pi = { plan: prior.plan, interval: normInterval(prior.billing_interval) ?? "month" };
  }
  if (!pi) return { ok: false, reason: `unknown App Store product ${e.product_id ?? "(none)"}` };

  const trial = (e.period_type ?? "").toUpperCase() === "TRIAL";
  const liveStatus = trial ? "trialing" : "active";
  let status: string;
  let cancel = false;
  switch (e.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
      status = liveStatus;
      break;
    case "CANCELLATION":
    case "SUBSCRIPTION_PAUSED":
      // Auto-renew is off; access runs to the period end. A refund also arrives
      // as CANCELLATION, with the expiry moved to the refund time — so an expiry
      // already in the past means access ends now.
      if (expiresAt && Date.parse(expiresAt) <= now.getTime()) {
        status = "expired";
      } else {
        status = prior?.status === "past_due" ? "past_due" : liveStatus;
        cancel = true;
      }
      break;
    case "EXPIRATION":
      status = "expired";
      break;
    case "BILLING_ISSUE":
      // Keeps access through Apple's billing-retry / grace window.
      status = "past_due";
      cancel = !!prior?.cancel_at_period_end;
      break;
    default:
      return { ok: false, reason: `unhandled ${e.type}` };
  }

  return {
    ok: true,
    value: {
      plan: pi.plan,
      status,
      provider: "app_store",
      provider_customer_id: userId,
      provider_subscription_id: e.original_transaction_id ?? prior?.provider_subscription_id ?? null,
      product_id: productId,
      billing_interval: pi.interval,
      current_period_end: expiresAt ?? prior?.current_period_end ?? null,
      cancel_at_period_end: cancel,
    },
  };
}

// ---------------------------------------------------------------------------
// I/O. `db` is always the service-role client: `subscriptions` has no write
// policy, by design, so nothing else can write it.

type Db = SupabaseClient;

interface PgError { message: string; code?: string }
function dbError(what: string, err: PgError): Error {
  return new Error(`${what}: ${err.code ? `${err.code} ` : ""}${err.message}`);
}

/**
 * Record a provider event id before processing it. "duplicate" means it was
 * already processed (or is being processed) — answer 200 and do nothing.
 * Throws if the table is missing, so the provider retries once the schema is
 * applied instead of the event being processed without a ledger.
 */
export async function claimEvent(db: Db, id: string, provider: "stripe" | "revenuecat", type: string): Promise<"new" | "duplicate"> {
  const { error } = await db.from("billing_events").insert({ id, provider, type });
  if (!error) return "new";
  if (error.code === "23505") return "duplicate";
  throw dbError("billing_events insert", error);
}

/** Undo a claim when processing failed, so the provider's retry is processed. */
export async function releaseEvent(db: Db, id: string): Promise<void> {
  try {
    const { error } = await db.from("billing_events").delete().eq("id", id);
    if (error) console.error(`[billing] couldn't release event ${id}: ${error.message}`);
  } catch (e) {
    console.error(`[billing] couldn't release event ${id}:`, e);
  }
}

export async function readSubscription(db: Db, userId: string): Promise<ExistingRow | null> {
  // select("*"): tolerate columns this code knows about not existing yet.
  const { data, error } = await db.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw dbError("subscriptions read", error);
  return (data as ExistingRow | null) ?? null;
}

/** The account's Stripe customer, from the dedicated column or a Stripe-owned row. */
export function stripeCustomerOf(row: ExistingRow | null | undefined): string | null {
  if (!row) return null;
  if (row.stripe_customer_id) return row.stripe_customer_id;
  if (row.provider === "stripe" && row.provider_customer_id) return row.provider_customer_id;
  return null;
}

export interface WriteOutcome {
  userId: string;
  applied: boolean;
  reason: string;
  state: SubscriptionState;
}

export async function writeSubscription(
  db: Db,
  userId: string,
  incoming: SubscriptionState,
  opts: {
    now?: Date;
    stripeCustomerId?: string | null;
    existing?: ExistingRow | null;
    /** Skip `decideWrite` — for a caller that has already decided, with this reason. */
    force?: string;
  } = {},
): Promise<WriteOutcome> {
  const now = opts.now ?? new Date();
  const existing = opts.existing !== undefined ? opts.existing : await readSubscription(db, userId);
  const d: Decision = opts.force ? { apply: true, reason: opts.force } : decideWrite(existing, incoming, now);
  const cus = opts.stripeCustomerId ?? null;

  if (d.apply) {
    const row: Record<string, unknown> = { user_id: userId, ...incoming, updated_at: now.toISOString() };
    if (cus) row.stripe_customer_id = cus;
    const { error } = await db.from("subscriptions").upsert(row, { onConflict: "user_id" });
    if (error) {
      // FK violation: the account was deleted (late webhook after DELETE /api/account).
      if (error.code === "23503") return { userId, applied: false, reason: "account no longer exists", state: incoming };
      throw dbError("subscriptions upsert", error);
    }
  } else if (cus && existing && existing.stripe_customer_id !== cus) {
    const { error } = await db.from("subscriptions").update({ stripe_customer_id: cus }).eq("user_id", userId);
    if (error && error.code !== "23503") throw dbError("subscriptions link customer", error);
  }
  return { userId, applied: d.apply, reason: d.reason, state: incoming };
}

export interface ProcessResult {
  handled: boolean;
  note?: string;
  outcome?: WriteOutcome;
}

// ---- Stripe

export interface StripeDeps {
  /** Fresh read of a subscription — makes processing independent of event order. */
  retrieveSubscription: (id: string) => Promise<StripeSubscription>;
  env?: Env;
  now?: Date;
}

/** Who a Stripe subscription belongs to: its metadata, else a stored customer link. */
export async function stripeUserFor(db: Db, sub: StripeSubscription): Promise<string | null> {
  const meta = sub.metadata?.user_id;
  if (isUuid(meta)) return meta.toLowerCase();
  const cus = idOf(sub.customer);
  if (!cus) return null;
  const byColumn = await db.from("subscriptions").select("user_id").eq("stripe_customer_id", cus).limit(1);
  if (!byColumn.error && byColumn.data?.length) return (byColumn.data[0] as { user_id: string }).user_id;
  const byRow = await db.from("subscriptions").select("user_id").eq("provider", "stripe").eq("provider_customer_id", cus).limit(1);
  if (byRow.error) throw dbError("subscriptions customer lookup", byRow.error);
  return byRow.data?.length ? (byRow.data[0] as { user_id: string }).user_id : null;
}

async function applyStripeSubscription(db: Db, userId: string, sub: StripeSubscription, deps: StripeDeps): Promise<ProcessResult> {
  const cus = idOf(sub.customer);
  const mapped = stripeSubscriptionToState(sub, deps.env);
  if (!mapped.ok) {
    // Still link the customer, so the portal works while someone fixes the price env.
    if (cus) {
      const existing = await readSubscription(db, userId);
      if (existing && existing.stripe_customer_id !== cus) {
        await db.from("subscriptions").update({ stripe_customer_id: cus }).eq("user_id", userId);
      }
    }
    return { handled: false, note: mapped.reason };
  }
  const outcome = await writeSubscription(db, userId, mapped.value, { now: deps.now, stripeCustomerId: cus });
  return { handled: true, outcome };
}

export async function processStripeEvent(db: Db, event: StripeEvent, deps: StripeDeps): Promise<ProcessResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as StripeCheckoutSession;
      if (s.mode && s.mode !== "subscription") return { handled: false, note: `checkout mode ${s.mode}` };
      const ref = s.client_reference_id ?? s.metadata?.user_id;
      const subId = idOf(s.subscription ?? null);
      if (!isUuid(ref)) return { handled: false, note: "checkout session has no user reference" };
      if (!subId) return { handled: false, note: "checkout session has no subscription" };
      const sub = await deps.retrieveSubscription(subId);
      return applyStripeSubscription(db, ref.toLowerCase(), sub, deps);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const payload = event.data.object as StripeSubscription;
      // Re-read so a delayed or out-of-order event can't write stale state; the
      // payload is a complete subscription, so it's a safe fallback.
      let sub = payload;
      try { sub = await deps.retrieveSubscription(payload.id); }
      catch (e) { console.warn(`[billing] using event payload for ${payload.id}: ${(e as Error).message}`); }
      const userId = await stripeUserFor(db, sub);
      if (!userId) return { handled: false, note: `no account for Stripe customer ${idOf(sub.customer) ?? "?"}` };
      return applyStripeSubscription(db, userId, sub, deps);
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subId = invoiceSubscriptionId(event.data.object as StripeInvoice);
      if (!subId) return { handled: false, note: "invoice isn't for a subscription" };
      const sub = await deps.retrieveSubscription(subId);
      const userId = await stripeUserFor(db, sub);
      if (!userId) return { handled: false, note: `no account for Stripe customer ${idOf(sub.customer) ?? "?"}` };
      return applyStripeSubscription(db, userId, sub, deps);
    }
    default:
      return { handled: false, note: `ignored ${event.type}` };
  }
}

// ---- RevenueCat

export interface RevenueCatDeps {
  env?: Env;
  now?: Date;
  /**
   * When an App Store plan lapses for someone who ALSO has a Stripe customer,
   * look for a live Stripe subscription to fall back to (someone who paid on
   * both channels). Optional: omitted when Stripe isn't configured.
   */
  findLiveStripeSubscription?: (customerId: string) => Promise<StripeSubscription | null>;
}

export async function processRevenueCatEvent(db: Db, event: RevenueCatEvent, deps: RevenueCatDeps = {}): Promise<ProcessResult> {
  const now = deps.now ?? new Date();
  const products = revenueCatProducts(deps.env);

  if (event.type === "TRANSFER") return transferRevenueCat(db, event, products, now);

  const userId = revenueCatUserId(event);
  if (!userId) return { handled: false, note: "anonymous or missing app_user_id" };
  const existing = await readSubscription(db, userId);
  const mapped = revenueCatEventToState(event, existing, products, now);
  if (!mapped.ok) return { handled: false, note: mapped.reason };

  // The App Store side is lapsing on a row it owns — if they also pay on the
  // web, write that instead of leaving them on free until Stripe next speaks.
  const cus = stripeCustomerOf(existing);
  if (!isLive(mapped.value, now) && existing?.provider === "app_store" && cus && deps.findLiveStripeSubscription) {
    try {
      const live = await deps.findLiveStripeSubscription(cus);
      const fallback = live ? stripeSubscriptionToState(live, deps.env) : null;
      if (fallback?.ok && isLive(fallback.value, now)) {
        const outcome = await writeSubscription(db, userId, fallback.value, {
          now, existing, stripeCustomerId: cus, force: `App Store ${mapped.value.status}; live Stripe subscription ${fallback.value.provider_subscription_id} restored`,
        });
        return { handled: true, outcome };
      }
    } catch (e) {
      console.warn(`[billing] Stripe fallback lookup failed for ${userId}: ${(e as Error).message}`);
    }
  }

  const outcome = await writeSubscription(db, userId, mapped.value, { now, existing });
  return { handled: true, outcome };
}

/**
 * TRANSFER: the same Apple ID's purchase moved to another app_user_id (someone
 * restored purchases while signed in to a different Bacon account). The plan
 * goes with it: the source accounts' App Store rows are marked "transferred"
 * (not live), and the destination gets the subscription.
 */
async function transferRevenueCat(db: Db, e: RevenueCatEvent, products: Record<string, PlanInterval>, now: Date): Promise<ProcessResult> {
  const to = (e.transferred_to ?? []).find(isUuid)?.toLowerCase() ?? null;
  const from = (e.transferred_from ?? []).filter(isUuid).map((s) => s.toLowerCase()).filter((id) => id !== to);
  if (!to && !from.length) return { handled: false, note: "transfer between anonymous ids" };

  let moved: SubscriptionState | null = null;
  for (const id of from) {
    const row = await readSubscription(db, id);
    if (!row || row.provider !== "app_store" || !isPlanId(row.plan)) continue;
    const state: SubscriptionState = {
      plan: row.plan, status: row.status ?? "active", provider: "app_store",
      provider_customer_id: row.provider_customer_id ?? null, provider_subscription_id: row.provider_subscription_id ?? null,
      product_id: row.product_id ?? null, billing_interval: row.billing_interval ?? null,
      current_period_end: row.current_period_end ?? null, cancel_at_period_end: !!row.cancel_at_period_end,
    };
    if (!moved || (isLive(state, now) && !isLive(moved, now))) moved = state;
    const { error } = await db.from("subscriptions")
      .update({ status: "transferred", cancel_at_period_end: false, updated_at: now.toISOString() })
      .eq("user_id", id).eq("provider", "app_store");
    if (error) throw dbError("subscriptions transfer-out", error);
  }

  if (!to) return { handled: true, note: `transferred out of ${from.length} account(s) to an anonymous id` };
  if (!moved) {
    // Nothing on file for the source; build it from the event if it says enough.
    const derived = revenueCatEventToState({ ...e, type: "RENEWAL", app_user_id: to }, null, products, now);
    if (!derived.ok) return { handled: false, note: `transfer to ${to}: nothing on file to move (${derived.reason})` };
    moved = derived.value;
  }
  const outcome = await writeSubscription(db, to, { ...moved, provider_customer_id: to }, { now });
  return { handled: true, outcome };
}
