"use client";

// Native in-app purchase bridge (iOS), through the RevenueCat Capacitor plugin
// compiled into the app. Like lib/native.ts it talks to `window.Capacitor`
// directly — @revenuecat/purchases-capacitor is never imported, so none of it
// ships in the web bundle.
//
// Identity: RevenueCat's app user id IS the Supabase user id (configure/logIn
// below), so the RevenueCat → /api/billing/revenuecat webhook can write
// `subscriptions` for the right account. See docs/ios.md for the App Store
// Connect + RevenueCat setup this expects:
//   products  bacon_pro_monthly, bacon_pro_yearly, bacon_desk_monthly, bacon_desk_yearly
//   entitlements "pro", "desk"

import { plugin } from "@/lib/native";
import type { PlanId } from "@/lib/plans";
import type { Interval } from "./billing";

type Paid = Exclude<PlanId, "free">;

interface RcProduct { identifier: string; priceString?: string }
interface RcPackage {
  identifier: string;
  packageType?: string;
  product: RcProduct;
  offeringIdentifier?: string;
  presentedOfferingContext?: Record<string, unknown>;
}
interface RcOffering { identifier: string; availablePackages: RcPackage[] }
interface RcOfferings { current: RcOffering | null; all: Record<string, RcOffering> }
interface RcCustomerInfo { entitlements?: { active?: Record<string, unknown> } }

type Fn = (opts?: Record<string, unknown>) => unknown;
type PurchasesPlugin = Partial<Record<
  "configure" | "isConfigured" | "getAppUserID" | "logIn" | "logOut" | "getOfferings" | "purchasePackage" | "restorePurchases",
  Fn
>>;

function rc(): PurchasesPlugin | null {
  return plugin("Purchases") as PurchasesPlugin | null;
}

async function invoke<T>(p: PurchasesPlugin, method: keyof PurchasesPlugin, opts?: Record<string, unknown>): Promise<T> {
  const fn = p[method];
  if (typeof fn !== "function") throw new Error("In-app purchase isn't available in this version of the app. Update Bacon from the App Store.");
  return (await fn(opts)) as T;
}

// ---------------------------------------------------------------------------
// Product mapping (pure; exported for tests)

/** App Store product id for a plan + billing period, e.g. bacon_pro_yearly. */
export function productIdFor(plan: Paid, interval: Interval): string {
  return `bacon_${plan}_${interval === "year" ? "yearly" : "monthly"}`;
}

/**
 * The package to buy: the one whose product id matches exactly (searching the
 * current offering first), else the MONTHLY/ANNUAL package of an offering named
 * after the plan.
 */
export function findPackage(offerings: RcOfferings | null | undefined, plan: Paid, interval: Interval): RcPackage | null {
  if (!offerings) return null;
  const id = productIdFor(plan, interval);
  const all = Object.values(offerings.all ?? {});
  const ordered = offerings.current ? [offerings.current, ...all.filter((o) => o.identifier !== offerings.current!.identifier)] : all;
  for (const o of ordered) {
    const hit = o.availablePackages?.find((p) => p.product?.identifier === id);
    if (hit) return hit;
  }
  const named = offerings.all?.[plan] ?? all.find((o) => o.identifier.toLowerCase() === plan);
  if (named) {
    const type = interval === "year" ? "ANNUAL" : "MONTHLY";
    const rcId = interval === "year" ? "$rc_annual" : "$rc_monthly";
    return named.availablePackages?.find((p) => p.packageType === type || p.identifier === rcId) ?? null;
  }
  return null;
}

export function activeEntitlements(info: RcCustomerInfo | null | undefined): string[] {
  return Object.keys(info?.entitlements?.active ?? {});
}

// RevenueCat error codes (PURCHASES_ERROR_CODE). The plugin rejects with
// { message, code, data: { readableErrorCode, userCancelled?, ... } }.
const CANCELLED = "1";
const MESSAGES: Record<string, string> = {
  "2": "The App Store couldn't complete the purchase. You haven't been charged — please try again.",
  "3": "Purchases are turned off on this device (Settings → Screen Time → Content & Privacy).",
  "5": "That plan isn't available in your App Store region yet.",
  "6": "This Apple ID already has a Bacon subscription. Tap Restore purchases to bring it to this account.",
  "7": "This Apple ID's subscription is linked to a different Bacon account. Sign in to that account, or manage it in Settings → Apple ID → Subscriptions.",
  "10": "Couldn't reach the App Store. Check your connection and try again.",
  "20": "Your purchase is waiting for approval. Your plan unlocks as soon as it's approved.",
  "35": "Couldn't reach the App Store. Check your connection and try again.",
};

export function isCancellation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; userCancelled?: unknown; data?: { userCancelled?: unknown; readableErrorCode?: unknown; code?: unknown } };
  return String(e.code ?? e.data?.code ?? "") === CANCELLED || e.userCancelled === true || e.data?.userCancelled === true
    || e.data?.readableErrorCode === "PURCHASE_CANCELLED" || e.data?.readableErrorCode === "PurchaseCancelledError";
}

/** A sentence a person can act on, from whatever the plugin rejected with. */
export function purchaseErrorMessage(err: unknown): string {
  const e = (err && typeof err === "object" ? err : {}) as { code?: unknown; message?: unknown; data?: { code?: unknown } };
  const code = String(e.code ?? e.data?.code ?? "");
  if (MESSAGES[code]) return MESSAGES[code];
  const msg = typeof e.message === "string" ? e.message.trim() : "";
  return msg && msg.length < 200 ? msg : "The purchase didn't go through. You haven't been charged — please try again.";
}

// ---------------------------------------------------------------------------
// Identity
//
// Every purchase must be made by the Supabase account, never by RevenueCat's
// anonymous "$RCAnonymousID:…" user: the webhook (/api/billing/revenuecat)
// ignores anonymous purchases, so one made that way would charge the person
// and unlock nothing.

const ANONYMOUS = /^\$RCAnonymousID:/;

let identified: string | null = null;
let identifying: Promise<void> | null = null;

/** Serialise identity changes: a second call waits for the first to finish. */
function serial(task: () => Promise<void>): Promise<void> {
  const run = (identifying ?? Promise.resolve()).then(task);
  identifying = run.catch(() => {});
  return run;
}

async function currentAppUserId(p: PurchasesPlugin): Promise<string | null> {
  const cur = await invoke<{ appUserID?: string }>(p, "getAppUserID").catch(() => null);
  return cur?.appUserID ?? null;
}

/**
 * Point RevenueCat at this account: configure once per app launch with the
 * Supabase user id as the app user id, or logIn() when the SDK is already
 * running as someone else (or anonymously). Idempotent and safe to call on
 * every /api/me load. No-op on the web or without a key.
 */
export function identifyPurchaser(userId: string): Promise<void> {
  const p = rc();
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;
  if (!p || !apiKey || !userId) return Promise.resolve();
  if (identified === userId) return Promise.resolve();
  return serial(async () => {
    if (identified === userId) return;
    // The native SDK outlives page loads: an earlier page in this launch may
    // already have configured it.
    const state = await invoke<{ isConfigured?: boolean }>(p, "isConfigured").catch(() => ({ isConfigured: false }));
    if (!state?.isConfigured) await invoke(p, "configure", { apiKey, appUserID: userId });
    if ((await currentAppUserId(p)) !== userId) await invoke(p, "logIn", { appUserID: userId });
    identified = userId;
  });
}

/**
 * Sign RevenueCat out (the account signed out): the next purchase on this
 * device can't land on the previous account. Safe to call any time.
 */
export function signOutPurchaser(): Promise<void> {
  const p = rc();
  if (!p) return Promise.resolve();
  return serial(async () => {
    identified = null;
    const state = await invoke<{ isConfigured?: boolean }>(p, "isConfigured").catch(() => ({ isConfigured: false }));
    if (!state?.isConfigured) return;
    const cur = await currentAppUserId(p);
    // logOut() on an already-anonymous user is an error in RevenueCat.
    if (cur && !ANONYMOUS.test(cur)) await invoke(p, "logOut").catch(() => {});
  });
}

/**
 * Guarantee the SDK is logged in as `userId` (not anonymous, not a previous
 * account) before money moves. Throws a readable Error if it can't be.
 */
async function ensureLinked(p: PurchasesPlugin, userId: string): Promise<void> {
  if (!process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY) throw new Error("In-app purchase isn't set up in this build.");
  try {
    await identifyPurchaser(userId);
    // Re-check the native state itself rather than trusting the cache:
    // something else in this launch may have logged the SDK out.
    if ((await currentAppUserId(p)) !== userId) {
      await serial(async () => { await invoke(p, "logIn", { appUserID: userId }); });
    }
  } catch (e) {
    identified = null;
    throw new Error(purchaseErrorMessage(e));
  }
  const now = await currentAppUserId(p);
  if (now !== userId || ANONYMOUS.test(now)) {
    identified = null;
    throw new Error("Couldn't link the App Store to your Bacon account. Please try again.");
  }
  identified = userId;
}

/** The slice of GET /api/me the purchase flow reads. */
export interface PurchaseAccount {
  user?: { id?: string | null } | null;
  plan?: { plan?: string; source?: string; provider?: string | null } | null;
}

async function loadAccount(): Promise<PurchaseAccount | null> {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    return res.ok ? ((await res.json()) as PurchaseAccount) : null;
  } catch {
    return null;
  }
}

/** A live web (Stripe) subscription: the plan is managed there, not in the App Store. */
export function hasLiveWebSubscription(me: PurchaseAccount | null | undefined): boolean {
  return me?.plan?.source === "subscription" && me.plan.provider === "stripe";
}

function webSubscriberMessage(): string {
  const host = typeof window !== "undefined" ? window.location.host : "";
  return `You subscribe on the web — manage it at ${host || "Bacon"} on the web.`;
}

/** Test hook. */
export function resetPurchasesState(): void {
  identified = null;
  identifying = null;
}

// ---------------------------------------------------------------------------
// Purchase / restore

/**
 * Buy a plan through StoreKit. Resolves true once the App Store confirms an
 * active entitlement, false if the user cancelled; throws a readable Error
 * otherwise. Access itself is granted server-side by the RevenueCat webhook.
 *
 * `me` (the app's /api/me state) saves a round trip; without it the account is
 * read fresh. Refuses — before any App Store sheet — when the account already
 * pays through Stripe on the web.
 */
export async function purchase(plan: Paid, interval: Interval, me?: PurchaseAccount | null): Promise<boolean> {
  const p = rc();
  if (!p) throw new Error("In-app purchase isn't available here.");
  const account = me?.user?.id && me.plan ? me : await loadAccount();
  const userId = account?.user?.id;
  if (!userId) throw new Error("Sign in again to subscribe.");
  if (hasLiveWebSubscription(account)) throw new Error(webSubscriberMessage());
  await ensureLinked(p, userId);

  const offerings = await invoke<RcOfferings>(p, "getOfferings").catch((e) => {
    throw new Error(purchaseErrorMessage(e));
  });
  const pkg = findPackage(offerings, plan, interval);
  if (!pkg) throw new Error("That plan isn't available from the App Store right now. Please try again later.");

  let result: { customerInfo?: RcCustomerInfo } | null;
  try {
    result = await invoke<{ customerInfo?: RcCustomerInfo }>(p, "purchasePackage", { aPackage: pkg });
  } catch (e) {
    if (isCancellation(e)) return false;
    throw new Error(purchaseErrorMessage(e));
  }
  // The plan's own entitlement — or any: a Desk subscriber's purchase can also
  // carry "pro", and the server decides the plan from the webhook anyway.
  if (activeEntitlements(result?.customerInfo).length > 0) {
    await waitForServerPlan((m) => m.plan?.plan === plan);
    return true;
  }
  throw new Error("The App Store took your purchase but hasn't confirmed it yet. Tap Restore purchases in a minute.");
}

/** Restore earlier App Store purchases to this account. True if any entitlement is active. */
export async function restore(me?: PurchaseAccount | null): Promise<boolean> {
  const p = rc();
  if (!p) return false;
  const account = me?.user?.id ? me : await loadAccount();
  const userId = account?.user?.id;
  if (!userId) throw new Error("Sign in again to restore purchases.");
  await ensureLinked(p, userId);
  try {
    const info = await invoke<RcCustomerInfo>(p, "restorePurchases");
    const ok = activeEntitlements(info).length > 0;
    if (ok) await waitForServerPlan(() => true);
    return ok;
  } catch (e) {
    throw new Error(purchaseErrorMessage(e));
  }
}

/**
 * The webhook that grants the plan lands a moment after StoreKit confirms.
 * Give it a few seconds, so the caller's refreshMe() shows the paid plan
 * rather than "Free" with a "Welcome to Pro" toast on top.
 */
async function waitForServerPlan(matches: (me: PurchaseAccount) => boolean, maxMs = 6_000): Promise<void> {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const me = await loadAccount();
    if (me?.plan?.source === "operator") return;
    if (me?.plan?.source === "subscription" && me.plan.provider === "app_store" && matches(me)) return;
    await new Promise((r) => setTimeout(r, 1_200));
  }
}
