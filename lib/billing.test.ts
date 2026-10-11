import { describe, it, expect, vi } from "vitest";
import {
  claimEvent, decideWrite, invoiceSubscriptionId, isLive, isUuid, mapStripeStatus, planForStripePrice,
  processRevenueCatEvent, processStripeEvent, releaseEvent, revenueCatEventToState, revenueCatProducts,
  revenueCatUserId, safeEqual, sanitizeReturnPath, siteOrigin, stripeCustomerOf, stripePriceFor,
  stripeSubscriptionToState, DEFAULT_REVENUECAT_PRODUCTS,
  type ExistingRow, type RevenueCatEvent, type SubscriptionState,
} from "./billing";
import type { StripeEvent, StripeSubscription } from "./stripe";
import { FakeDb as BaseFakeDb } from "./billing.testing";

// ---------------------------------------------------------------------------
// Fixtures

const NOW = new Date("2026-10-11T12:00:00Z");
const DAY = 86_400_000;
const sec = (ms: number) => Math.floor(ms / 1000);
const FUTURE = NOW.getTime() + 20 * DAY;
const PAST = NOW.getTime() - 10 * DAY;

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

const ENV = {
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
  STRIPE_PRICE_PRO_YEARLY: "price_pro_y",
  STRIPE_PRICE_DESK_MONTHLY: "price_desk_m",
  STRIPE_PRICE_DESK_YEARLY: "price_desk_y",
};

function stripeSub(o: {
  id?: string; customer?: string; status?: string; price?: string; interval?: string; periodEndMs?: number;
  onSubscription?: boolean; cancelAtPeriodEnd?: boolean; cancelAt?: number | null; metadata?: Record<string, string> | null;
} = {}): StripeSubscription {
  const end = sec(o.periodEndMs ?? FUTURE);
  return {
    id: o.id ?? "sub_1",
    object: "subscription",
    customer: o.customer ?? "cus_1",
    status: o.status ?? "active",
    cancel_at_period_end: o.cancelAtPeriodEnd ?? false,
    cancel_at: o.cancelAt ?? null,
    metadata: o.metadata === undefined ? { user_id: U1, plan: "pro" } : o.metadata,
    ...(o.onSubscription ? { current_period_end: end } : {}),
    items: {
      data: [{
        id: "si_1",
        price: { id: o.price ?? "price_pro_m", recurring: { interval: o.interval ?? "month" } },
        ...(o.onSubscription ? {} : { current_period_end: end }),
      }],
    },
  };
}

function state(o: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    plan: "pro", status: "active", provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: "sub_1",
    product_id: "price_pro_m", billing_interval: "month", current_period_end: new Date(FUTURE).toISOString(),
    cancel_at_period_end: false, ...o,
  };
}

function rc(o: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: "rc_evt_1", type: "INITIAL_PURCHASE", app_user_id: U1, original_app_user_id: U1, product_id: "bacon_pro_monthly",
    period_type: "NORMAL", expiration_at_ms: FUTURE, environment: "PRODUCTION", store: "APP_STORE",
    original_transaction_id: "otx_1", ...o,
  };
}

// In-memory supabase-js stand-in; U1 and U2 exist as auth users.
class FakeDb extends BaseFakeDb {
  constructor() { super([U1, U2]); }
}

const evt = <T>(type: string, object: T, id = "evt_1"): StripeEvent<T> => ({ id, type, data: { object } });

// ---------------------------------------------------------------------------

describe("small helpers", () => {
  it("isUuid", () => {
    expect(isUuid(U1)).toBe(true);
    expect(isUuid(U1.toUpperCase())).toBe(true);
    expect(isUuid("$RCAnonymousID:abc")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it("safeEqual", () => {
    expect(safeEqual("secret-value", "secret-value")).toBe(true);
    expect(safeEqual("secret-value", "secret-valuf")).toBe(false);
    expect(safeEqual("short", "a-much-longer-string")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("sanitizeReturnPath keeps same-origin paths only", () => {
    expect(sanitizeReturnPath("/account")).toBe("/account");
    expect(sanitizeReturnPath("/analyze/NVDA?tab=1#x")).toBe("/analyze/NVDA");
    expect(sanitizeReturnPath("/a/../b")).toBe("/b");
    for (const bad of ["https://evil.test/x", "//evil.test", "/\\evil.test", "/\t/evil.test", "javascript:alert(1)", "", "account", "/api/billing/portal", "/api", null, 7, "/" + "a".repeat(600)]) {
      expect(sanitizeReturnPath(bad)).toBe("/");
    }
    expect(sanitizeReturnPath("//evil.test", "/pricing")).toBe("/pricing");
  });

  it("siteOrigin prefers the configured site URL", () => {
    expect(siteOrigin("http://localhost:3000/api/billing/checkout", { NEXT_PUBLIC_SITE_URL: "https://bacon.example/" })).toBe("https://bacon.example");
    expect(siteOrigin("http://localhost:3000/api/billing/checkout", {})).toBe("http://localhost:3000");
  });

  it("stripeCustomerOf reads the dedicated column, else a Stripe-owned row", () => {
    expect(stripeCustomerOf({ stripe_customer_id: "cus_a", provider: "app_store", provider_customer_id: U1 })).toBe("cus_a");
    expect(stripeCustomerOf({ provider: "stripe", provider_customer_id: "cus_b" })).toBe("cus_b");
    expect(stripeCustomerOf({ provider: "app_store", provider_customer_id: U1 })).toBeNull();
    expect(stripeCustomerOf(null)).toBeNull();
  });

  it("isLive follows entitlements: live statuses within period + grace", () => {
    expect(isLive(state(), NOW)).toBe(true);
    expect(isLive(state({ status: "past_due" }), NOW)).toBe(true);
    expect(isLive(state({ status: "canceled" }), NOW)).toBe(false);
    expect(isLive(state({ status: "expired" }), NOW)).toBe(false);
    expect(isLive(state({ current_period_end: new Date(NOW.getTime() - 2 * DAY).toISOString() }), NOW)).toBe(true); // grace
    expect(isLive(state({ current_period_end: new Date(NOW.getTime() - 4 * DAY).toISOString() }), NOW)).toBe(false);
    expect(isLive(state({ plan: "free" }), NOW)).toBe(false);
    expect(isLive(null, NOW)).toBe(false);
  });
});

describe("Stripe price → plan", () => {
  it("maps each configured price id to its plan and interval", () => {
    expect(planForStripePrice("price_pro_m", ENV)).toEqual({ plan: "pro", interval: "month" });
    expect(planForStripePrice("price_pro_y", ENV)).toEqual({ plan: "pro", interval: "year" });
    expect(planForStripePrice("price_desk_m", ENV)).toEqual({ plan: "desk", interval: "month" });
    expect(planForStripePrice("price_desk_y", ENV)).toEqual({ plan: "desk", interval: "year" });
    expect(planForStripePrice("price_other", ENV)).toBeNull();
    expect(planForStripePrice(null, ENV)).toBeNull();
    expect(planForStripePrice("price_pro_m", {})).toBeNull();
  });

  it("looks up the price for a plan + interval", () => {
    expect(stripePriceFor("desk", "year", ENV)).toBe("price_desk_y");
    expect(stripePriceFor("pro", "month", { STRIPE_PRICE_PRO_MONTHLY: "  " })).toBeNull();
  });
});

describe("mapStripeStatus", () => {
  it.each([
    ["active", "active"], ["trialing", "trialing"], ["past_due", "past_due"],
    ["canceled", "canceled"], ["unpaid", "canceled"], ["incomplete_expired", "canceled"],
    ["incomplete", "incomplete"], ["paused", "paused"], ["something_new", "canceled"], [undefined, "canceled"],
  ])("%s → %s", (input, out) => {
    expect(mapStripeStatus(input as string | undefined)).toBe(out);
  });
});

describe("stripeSubscriptionToState", () => {
  it("reads the period end from the item (2025-03-31.basil and later)", () => {
    const r = stripeSubscriptionToState(stripeSub(), ENV);
    expect(r).toEqual({
      ok: true,
      value: {
        plan: "pro", status: "active", provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: "sub_1",
        product_id: "price_pro_m", billing_interval: "month",
        current_period_end: new Date(sec(FUTURE) * 1000).toISOString(), cancel_at_period_end: false,
      },
    });
  });

  it("reads the period end from the subscription (older API versions)", () => {
    const r = stripeSubscriptionToState(stripeSub({ onSubscription: true, price: "price_desk_y", interval: "year" }), ENV);
    expect(r.ok && r.value).toMatchObject({ plan: "desk", billing_interval: "year", current_period_end: new Date(sec(FUTURE) * 1000).toISOString() });
  });

  it("maps cancel_at_period_end and a scheduled cancel_at", () => {
    const a = stripeSubscriptionToState(stripeSub({ cancelAtPeriodEnd: true }), ENV);
    expect(a.ok && a.value.cancel_at_period_end).toBe(true);
    const b = stripeSubscriptionToState(stripeSub({ cancelAt: sec(FUTURE) }), ENV);
    expect(b.ok && b.value.cancel_at_period_end).toBe(true);
  });

  it("maps terminal statuses to canceled", () => {
    for (const s of ["canceled", "unpaid", "incomplete_expired"]) {
      const r = stripeSubscriptionToState(stripeSub({ status: s }), ENV);
      expect(r.ok && r.value.status).toBe("canceled");
    }
  });

  it("reads an expanded customer object", () => {
    const sub = { ...stripeSub(), customer: { id: "cus_obj" } };
    const r = stripeSubscriptionToState(sub, ENV);
    expect(r.ok && r.value.provider_customer_id).toBe("cus_obj");
  });

  it("falls back to the plan stamped on the metadata for an unlisted price", () => {
    const r = stripeSubscriptionToState(stripeSub({ price: "price_legacy", interval: "year", metadata: { user_id: U1, plan: "desk" } }), ENV);
    expect(r.ok && r.value).toMatchObject({ plan: "desk", billing_interval: "year", product_id: "price_legacy" });
  });

  it("refuses to guess a plan for a live subscription on an unknown price", () => {
    const r = stripeSubscriptionToState(stripeSub({ price: "price_mystery", metadata: {} }), ENV);
    expect(r.ok).toBe(false);
  });

  it("records an ended subscription on an unknown price as free", () => {
    const r = stripeSubscriptionToState(stripeSub({ price: "price_mystery", status: "canceled", metadata: {} }), ENV);
    expect(r.ok && r.value).toMatchObject({ plan: "free", status: "canceled" });
  });
});

describe("invoiceSubscriptionId", () => {
  it("reads both invoice shapes", () => {
    expect(invoiceSubscriptionId({ id: "in_1", subscription: "sub_a" })).toBe("sub_a");
    expect(invoiceSubscriptionId({ id: "in_1", subscription: { id: "sub_b" } })).toBe("sub_b");
    expect(invoiceSubscriptionId({ id: "in_1", parent: { subscription_details: { subscription: "sub_c" } } })).toBe("sub_c");
    expect(invoiceSubscriptionId({ id: "in_1" })).toBeNull();
  });
});

describe("decideWrite — provider precedence", () => {
  const live = (o: Partial<SubscriptionState>) => state(o);

  it("writes when there is no row, or the row has no provider", () => {
    expect(decideWrite(null, state(), NOW).apply).toBe(true);
    expect(decideWrite({ plan: "free", status: "active", provider: null }, state(), NOW).apply).toBe(true);
  });

  it("same provider: updates apply, including downgrades and cancellations", () => {
    expect(decideWrite(live({}), state({ status: "canceled" }), NOW).apply).toBe(true);
    expect(decideWrite(live({ plan: "desk" }), state({ plan: "pro" }), NOW).apply).toBe(true);
  });

  it("same provider: a late not-live event for a REPLACED subscription is ignored", () => {
    const row = live({ provider_subscription_id: "sub_new" });
    expect(decideWrite(row, state({ provider_subscription_id: "sub_old", status: "canceled" }), NOW).apply).toBe(false);
    // …but a live state for the other subscription still applies.
    expect(decideWrite(row, state({ provider_subscription_id: "sub_old" }), NOW).apply).toBe(true);
  });

  it("Stripe never downgrades a live App Store plan", () => {
    const appStore = live({ provider: "app_store", plan: "pro" });
    expect(decideWrite(appStore, state({ status: "canceled" }), NOW)).toMatchObject({ apply: false });
    expect(decideWrite(appStore, state({ status: "incomplete" }), NOW)).toMatchObject({ apply: false });
  });

  it("the App Store never downgrades a live Stripe plan", () => {
    const stripe = live({ provider: "stripe", plan: "desk" });
    expect(decideWrite(stripe, state({ provider: "app_store", status: "expired" }), NOW).apply).toBe(false);
  });

  it("another provider writes freely once the row's subscription isn't live", () => {
    const lapsed = live({ provider: "app_store", status: "expired" });
    expect(decideWrite(lapsed, state(), NOW).apply).toBe(true);
    const oldPeriod = live({ provider: "app_store", current_period_end: new Date(NOW.getTime() - 5 * DAY).toISOString() });
    expect(decideWrite(oldPeriod, state(), NOW).apply).toBe(true);
  });

  it("both live on different channels: only a higher plan takes over", () => {
    const appPro = live({ provider: "app_store", plan: "pro" });
    expect(decideWrite(appPro, state({ plan: "desk" }), NOW).apply).toBe(true);
    expect(decideWrite(appPro, state({ plan: "pro" }), NOW).apply).toBe(false);
    const stripeDesk = live({ provider: "stripe", plan: "desk" });
    expect(decideWrite(stripeDesk, state({ provider: "app_store", plan: "pro" }), NOW).apply).toBe(false);
  });

  it("a paid plan supersedes a live manual comp of the same or lower tier", () => {
    const comp = live({ provider: "manual", plan: "pro" });
    expect(decideWrite(comp, state({ plan: "pro" }), NOW).apply).toBe(true);
    expect(decideWrite(comp, state({ plan: "desk", provider: "app_store" }), NOW).apply).toBe(true);
    expect(decideWrite(live({ provider: "manual", plan: "desk" }), state({ plan: "pro" }), NOW).apply).toBe(false);
    // A lapsing paid sub never ends a live comp.
    expect(decideWrite(comp, state({ status: "canceled" }), NOW).apply).toBe(false);
  });
});

describe("RevenueCat product map", () => {
  it("defaults to the bacon_<plan>_<period> convention", () => {
    expect(revenueCatProducts({})).toEqual(DEFAULT_REVENUECAT_PRODUCTS);
    expect(revenueCatProducts({}).bacon_desk_yearly).toEqual({ plan: "desk", interval: "year" });
  });

  it("adds and overrides from REVENUECAT_PRODUCT_MAP, in either form", () => {
    const m = revenueCatProducts({
      REVENUECAT_PRODUCT_MAP: JSON.stringify({
        "com.x.pro.m": "pro:month",
        "com.x.desk.y": { plan: "desk", interval: "yearly" },
        bacon_pro_monthly: "desk:month",
        bad1: "gold:month",
        bad2: "pro:weekly",
        bad3: 5,
      }),
    });
    expect(m["com.x.pro.m"]).toEqual({ plan: "pro", interval: "month" });
    expect(m["com.x.desk.y"]).toEqual({ plan: "desk", interval: "year" });
    expect(m.bacon_pro_monthly).toEqual({ plan: "desk", interval: "month" });
    expect(m.bad1).toBeUndefined();
    expect(m.bad2).toBeUndefined();
    expect(m.bad3).toBeUndefined();
  });

  it("ignores malformed JSON", () => {
    expect(revenueCatProducts({ REVENUECAT_PRODUCT_MAP: "{not json" })).toEqual(DEFAULT_REVENUECAT_PRODUCTS);
    expect(revenueCatProducts({ REVENUECAT_PRODUCT_MAP: "[1,2]" })).toEqual(DEFAULT_REVENUECAT_PRODUCTS);
  });
});

describe("revenueCatUserId", () => {
  it("uses the Supabase uuid and ignores anonymous ids", () => {
    expect(revenueCatUserId({ app_user_id: U1 })).toBe(U1);
    expect(revenueCatUserId({ app_user_id: "$RCAnonymousID:abc", original_app_user_id: U2 })).toBe(U2);
    expect(revenueCatUserId({ app_user_id: "$RCAnonymousID:abc", original_app_user_id: "$RCAnonymousID:def" })).toBeNull();
    expect(revenueCatUserId({ app_user_id: U1.toUpperCase() })).toBe(U1);
  });
});

describe("revenueCatEventToState", () => {
  const P = revenueCatProducts({});
  const map = (e: RevenueCatEvent, existing: ExistingRow | null = null) => revenueCatEventToState(e, existing, P, NOW);
  const appRow = (o: Partial<ExistingRow> = {}): ExistingRow => ({
    user_id: U1, plan: "pro", status: "active", provider: "app_store", provider_customer_id: U1, provider_subscription_id: "otx_1",
    product_id: "bacon_pro_monthly", billing_interval: "month", current_period_end: new Date(FUTURE).toISOString(), cancel_at_period_end: false, ...o,
  });

  it("INITIAL_PURCHASE → active, with the expiry as the period end", () => {
    const r = map(rc());
    expect(r).toEqual({
      ok: true,
      value: {
        plan: "pro", status: "active", provider: "app_store", provider_customer_id: U1, provider_subscription_id: "otx_1",
        product_id: "bacon_pro_monthly", billing_interval: "month", current_period_end: new Date(FUTURE).toISOString(), cancel_at_period_end: false,
      },
    });
  });

  it("a TRIAL period → trialing", () => {
    const r = map(rc({ period_type: "TRIAL", product_id: "bacon_desk_yearly" }));
    expect(r.ok && r.value).toMatchObject({ status: "trialing", plan: "desk", billing_interval: "year" });
  });

  it("RENEWAL and UNCANCELLATION → active, cancel flag cleared", () => {
    for (const type of ["RENEWAL", "UNCANCELLATION", "SUBSCRIPTION_EXTENDED"]) {
      const r = map(rc({ type, expiration_at_ms: FUTURE + 30 * DAY }), appRow({ cancel_at_period_end: true }));
      expect(r.ok && r.value).toMatchObject({ status: "active", cancel_at_period_end: false });
    }
  });

  it("CANCELLATION → still active until expiry, cancel_at_period_end", () => {
    const r = map(rc({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }), appRow());
    expect(r.ok && r.value).toMatchObject({ status: "active", cancel_at_period_end: true });
  });

  it("CANCELLATION during a billing issue keeps past_due", () => {
    const r = map(rc({ type: "CANCELLATION" }), appRow({ status: "past_due" }));
    expect(r.ok && r.value).toMatchObject({ status: "past_due", cancel_at_period_end: true });
  });

  it("CANCELLATION for a refund (expiry already passed) → expired now", () => {
    const r = map(rc({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", expiration_at_ms: NOW.getTime() - 60_000 }), appRow());
    expect(r.ok && r.value).toMatchObject({ status: "expired", cancel_at_period_end: false });
  });

  it("SUBSCRIPTION_PAUSED → access to period end, won't renew", () => {
    const r = map(rc({ type: "SUBSCRIPTION_PAUSED" }), appRow());
    expect(r.ok && r.value).toMatchObject({ status: "active", cancel_at_period_end: true });
  });

  it("EXPIRATION → expired", () => {
    const r = map(rc({ type: "EXPIRATION", expiration_at_ms: FUTURE }), appRow());
    expect(r.ok && r.value).toMatchObject({ status: "expired" });
    expect(isLive(r.ok ? r.value : null, NOW)).toBe(false);
  });

  it("BILLING_ISSUE → past_due (keeps access through the retry window)", () => {
    const r = map(rc({ type: "BILLING_ISSUE" }), appRow());
    expect(r.ok && r.value).toMatchObject({ status: "past_due" });
    expect(isLive(r.ok ? r.value : null, NOW)).toBe(true);
  });

  it("PRODUCT_CHANGE: an upgrade applies at once, a downgrade waits for renewal", () => {
    const up = map(rc({ type: "PRODUCT_CHANGE", product_id: "bacon_pro_monthly", new_product_id: "bacon_desk_monthly" }), appRow());
    expect(up.ok && up.value).toMatchObject({ plan: "desk", product_id: "bacon_desk_monthly", status: "active" });
    const down = map(rc({ type: "PRODUCT_CHANGE", product_id: "bacon_desk_monthly", new_product_id: "bacon_pro_monthly" }), appRow({ plan: "desk" }));
    expect(down.ok && down.value).toMatchObject({ plan: "desk", product_id: "bacon_desk_monthly" });
    // The RENEWAL that follows carries the new product.
    const renewal = map(rc({ type: "RENEWAL", product_id: "bacon_pro_monthly", expiration_at_ms: FUTURE + 30 * DAY }), appRow({ plan: "desk", product_id: "bacon_desk_monthly" }));
    expect(renewal.ok && renewal.value).toMatchObject({ plan: "pro" });
  });

  it("ignores an event about an older period than the row holds (out-of-order delivery)", () => {
    const row = appRow({ current_period_end: new Date(FUTURE + 30 * DAY).toISOString() });
    expect(map(rc({ type: "EXPIRATION", expiration_at_ms: FUTURE }), row).ok).toBe(false);
    expect(map(rc({ type: "RENEWAL", expiration_at_ms: FUTURE }), row).ok).toBe(false);
    // A different App Store subscription (new original transaction) isn't stale.
    expect(map(rc({ type: "INITIAL_PURCHASE", original_transaction_id: "otx_2", expiration_at_ms: FUTURE }), row).ok).toBe(true);
  });

  it("an unknown product falls back to the plan already on an App Store row, else is ignored", () => {
    const r = map(rc({ type: "EXPIRATION", product_id: "com.unknown" }), appRow({ plan: "desk", billing_interval: "year" }));
    expect(r.ok && r.value).toMatchObject({ plan: "desk", billing_interval: "year", status: "expired" });
    expect(map(rc({ product_id: "com.unknown" })).ok).toBe(false);
  });

  it("ignores anonymous users and non-state events", () => {
    expect(map(rc({ app_user_id: "$RCAnonymousID:1", original_app_user_id: "$RCAnonymousID:1" })).ok).toBe(false);
    expect(map(rc({ type: "TEST" })).ok).toBe(false);
    expect(map(rc({ type: "NON_RENEWING_PURCHASE" })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// I/O against the fake database.

describe("event ledger", () => {
  it("claims an event once; a replay is a duplicate", async () => {
    const db = new FakeDb();
    expect(await claimEvent(db.asClient(), "evt_1", "stripe", "invoice.paid")).toBe("new");
    expect(await claimEvent(db.asClient(), "evt_1", "stripe", "invoice.paid")).toBe("duplicate");
    expect(db.rows("billing_events")).toHaveLength(1);
  });

  it("throws when the ledger itself is unavailable (so the provider retries)", async () => {
    const db = new FakeDb();
    db.failNext.billing_events = { code: "42P01", message: 'relation "billing_events" does not exist' };
    await expect(claimEvent(db.asClient(), "evt_1", "stripe", "x")).rejects.toThrow(/billing_events/);
  });

  it("releases a claim so a retry is processed", async () => {
    const db = new FakeDb();
    await claimEvent(db.asClient(), "evt_9", "revenuecat", "RENEWAL");
    await releaseEvent(db.asClient(), "evt_9");
    expect(await claimEvent(db.asClient(), "evt_9", "revenuecat", "RENEWAL")).toBe("new");
  });
});

describe("processStripeEvent", () => {
  const deps = (subs: Record<string, StripeSubscription>) => ({
    env: ENV, now: NOW,
    retrieveSubscription: vi.fn(async (id: string) => {
      if (!subs[id]) throw new Error(`no such subscription ${id}`);
      return subs[id];
    }),
  });

  it("checkout.session.completed links the customer and writes the plan", async () => {
    const db = new FakeDb();
    const d = deps({ sub_1: stripeSub({ price: "price_desk_y", interval: "year", metadata: {} }) });
    const res = await processStripeEvent(db.asClient(), evt("checkout.session.completed", {
      id: "cs_1", mode: "subscription", client_reference_id: U1, customer: "cus_1", subscription: "sub_1", metadata: { user_id: U1 },
    }), d);
    expect(res.handled).toBe(true);
    expect(d.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(db.sub(U1)).toMatchObject({
      plan: "desk", status: "active", provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: "sub_1",
      product_id: "price_desk_y", billing_interval: "year", stripe_customer_id: "cus_1", cancel_at_period_end: false,
      updated_at: NOW.toISOString(),
    });
  });

  it("checkout.session.completed without a user reference or for a one-off payment is a no-op", async () => {
    const db = new FakeDb();
    const d = deps({});
    expect((await processStripeEvent(db.asClient(), evt("checkout.session.completed", { id: "cs", mode: "subscription", subscription: "sub_1" }), d)).handled).toBe(false);
    expect((await processStripeEvent(db.asClient(), evt("checkout.session.completed", { id: "cs", mode: "payment", client_reference_id: U1 }), d)).handled).toBe(false);
    expect(db.rows("subscriptions")).toHaveLength(0);
  });

  it("checkout.session.completed fails loudly if the subscription can't be read (Stripe retries)", async () => {
    const db = new FakeDb();
    await expect(processStripeEvent(db.asClient(), evt("checkout.session.completed", {
      id: "cs", mode: "subscription", client_reference_id: U1, subscription: "sub_missing",
    }), deps({}))).rejects.toThrow(/sub_missing/);
  });

  it("customer.subscription.updated re-reads the subscription and records a scheduled cancellation", async () => {
    const db = new FakeDb();
    const fresh = stripeSub({ cancelAtPeriodEnd: true });
    const d = deps({ sub_1: fresh });
    // The payload is stale (not canceling); the fresh read wins.
    await processStripeEvent(db.asClient(), evt("customer.subscription.updated", stripeSub()), d);
    expect(db.sub(U1)).toMatchObject({ plan: "pro", status: "active", cancel_at_period_end: true });
  });

  it("customer.subscription.created/updated use the payload when the re-read fails", async () => {
    const db = new FakeDb();
    await processStripeEvent(db.asClient(), evt("customer.subscription.created", stripeSub({ status: "trialing" })), deps({}));
    expect(db.sub(U1)).toMatchObject({ status: "trialing", plan: "pro" });
  });

  it("customer.subscription.deleted → canceled (no plan)", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state(), stripe_customer_id: "cus_1" });
    const gone = stripeSub({ status: "canceled" });
    await processStripeEvent(db.asClient(), evt("customer.subscription.deleted", gone), deps({ sub_1: gone }));
    expect(db.sub(U1)).toMatchObject({ status: "canceled" });
    expect(isLive(db.sub(U1), NOW)).toBe(false);
  });

  it("finds the account by stored customer when the subscription has no metadata", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U2, plan: "free", status: "canceled", provider: "app_store", stripe_customer_id: "cus_9" });
    const sub = stripeSub({ customer: "cus_9", metadata: null });
    await processStripeEvent(db.asClient(), evt("customer.subscription.updated", sub), deps({ sub_1: sub }));
    expect(db.sub(U2)).toMatchObject({ provider: "stripe", plan: "pro", status: "active" });
  });

  it("…or by a Stripe-owned row's provider_customer_id", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U2, ...state({ provider_customer_id: "cus_7", status: "active" }) });
    const sub = stripeSub({ customer: "cus_7", metadata: null, status: "past_due" });
    await processStripeEvent(db.asClient(), evt("customer.subscription.updated", sub), deps({ sub_1: sub }));
    expect(db.sub(U2)).toMatchObject({ status: "past_due" });
  });

  it("an unknown customer is acknowledged, not written", async () => {
    const db = new FakeDb();
    const sub = stripeSub({ customer: "cus_nobody", metadata: null });
    const res = await processStripeEvent(db.asClient(), evt("customer.subscription.updated", sub), deps({ sub_1: sub }));
    expect(res.handled).toBe(false);
    expect(res.note).toMatch(/cus_nobody/);
    expect(db.rows("subscriptions")).toHaveLength(0);
  });

  it("invoice.payment_failed (new invoice shape) → past_due", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state(), stripe_customer_id: "cus_1" });
    const d = deps({ sub_1: stripeSub({ status: "past_due" }) });
    await processStripeEvent(db.asClient(), evt("invoice.payment_failed", { id: "in_1", parent: { subscription_details: { subscription: "sub_1" } } }), d);
    expect(db.sub(U1)).toMatchObject({ status: "past_due" });
  });

  it("invoice.paid (old invoice shape) → renews the period", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state({ status: "past_due", current_period_end: new Date(PAST).toISOString() }) });
    const renewed = stripeSub({ periodEndMs: FUTURE + 30 * DAY });
    await processStripeEvent(db.asClient(), evt("invoice.paid", { id: "in_2", subscription: "sub_1" }), deps({ sub_1: renewed }));
    expect(db.sub(U1)).toMatchObject({ status: "active", current_period_end: new Date(sec(FUTURE + 30 * DAY) * 1000).toISOString() });
  });

  it("an invoice that isn't for a subscription is ignored", async () => {
    const db = new FakeDb();
    const res = await processStripeEvent(db.asClient(), evt("invoice.paid", { id: "in_3" }), deps({}));
    expect(res.handled).toBe(false);
  });

  it("never downgrades a live App Store plan — but still links the Stripe customer", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state({ provider: "app_store", provider_customer_id: U1, provider_subscription_id: "otx_1" }) });
    const canceled = stripeSub({ status: "canceled", customer: "cus_5" });
    const res = await processStripeEvent(db.asClient(), evt("customer.subscription.deleted", canceled), deps({ sub_1: canceled }));
    expect(res.outcome?.applied).toBe(false);
    expect(db.sub(U1)).toMatchObject({ provider: "app_store", status: "active", stripe_customer_id: "cus_5" });
  });

  it("ignores a late cancellation of a subscription that was since replaced", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state({ provider_subscription_id: "sub_new" }), stripe_customer_id: "cus_1" });
    const old = stripeSub({ id: "sub_old", status: "canceled" });
    const res = await processStripeEvent(db.asClient(), evt("customer.subscription.deleted", old), deps({ sub_old: old }));
    expect(res.outcome?.applied).toBe(false);
    expect(db.sub(U1)).toMatchObject({ provider_subscription_id: "sub_new", status: "active" });
  });

  it("a late webhook for a deleted account is acknowledged, not retried forever", async () => {
    const db = new FakeDb();
    db.users.delete(U1);
    const sub = stripeSub({ status: "canceled" });
    const res = await processStripeEvent(db.asClient(), evt("customer.subscription.deleted", sub), deps({ sub_1: sub }));
    expect(res.outcome).toMatchObject({ applied: false, reason: "account no longer exists" });
  });

  it("a live subscription on an unknown price links the customer but writes no plan", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, plan: "free", status: "canceled", provider: null });
    const sub = stripeSub({ price: "price_mystery", metadata: { user_id: U1 } });
    const res = await processStripeEvent(db.asClient(), evt("customer.subscription.created", sub), deps({ sub_1: sub }));
    expect(res.handled).toBe(false);
    expect(res.note).toMatch(/price_mystery/);
    expect(db.sub(U1)).toMatchObject({ plan: "free", stripe_customer_id: "cus_1" });
  });

  it("ignores event types it doesn't handle", async () => {
    const db = new FakeDb();
    expect((await processStripeEvent(db.asClient(), evt("charge.refunded", {}), deps({}))).handled).toBe(false);
  });
});

describe("processRevenueCatEvent", () => {
  const run = (db: FakeDb, e: RevenueCatEvent, extra: Parameters<typeof processRevenueCatEvent>[2] = {}) =>
    processRevenueCatEvent(db.asClient(), e, { now: NOW, env: {}, ...extra });

  it("INITIAL_PURCHASE creates an App Store row", async () => {
    const db = new FakeDb();
    const res = await run(db, rc());
    expect(res.outcome?.applied).toBe(true);
    expect(db.sub(U1)).toMatchObject({ plan: "pro", status: "active", provider: "app_store", provider_customer_id: U1, product_id: "bacon_pro_monthly" });
  });

  it("walks a subscription through its life", async () => {
    const db = new FakeDb();
    await run(db, rc({ period_type: "TRIAL" }));
    expect(db.sub(U1)?.status).toBe("trialing");
    await run(db, rc({ type: "RENEWAL", expiration_at_ms: FUTURE + 30 * DAY }));
    expect(db.sub(U1)).toMatchObject({ status: "active", current_period_end: new Date(FUTURE + 30 * DAY).toISOString() });
    await run(db, rc({ type: "CANCELLATION", expiration_at_ms: FUTURE + 30 * DAY }));
    expect(db.sub(U1)).toMatchObject({ status: "active", cancel_at_period_end: true });
    await run(db, rc({ type: "UNCANCELLATION", expiration_at_ms: FUTURE + 30 * DAY }));
    expect(db.sub(U1)).toMatchObject({ cancel_at_period_end: false });
    await run(db, rc({ type: "BILLING_ISSUE", expiration_at_ms: FUTURE + 30 * DAY }));
    expect(db.sub(U1)?.status).toBe("past_due");
    await run(db, rc({ type: "EXPIRATION", expiration_at_ms: FUTURE + 30 * DAY }));
    expect(db.sub(U1)?.status).toBe("expired");
  });

  it("an App Store expiry never downgrades a live Stripe plan", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state({ plan: "desk" }), stripe_customer_id: "cus_1" });
    const res = await run(db, rc({ type: "EXPIRATION" }));
    expect(res.outcome?.applied).toBe(false);
    expect(db.sub(U1)).toMatchObject({ provider: "stripe", plan: "desk" });
  });

  it("a higher App Store plan takes over from a live Stripe one", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state({ plan: "pro" }), stripe_customer_id: "cus_1" });
    await run(db, rc({ product_id: "bacon_desk_monthly" }));
    // The Stripe customer link survives the takeover.
    expect(db.sub(U1)).toMatchObject({ provider: "app_store", plan: "desk", stripe_customer_id: "cus_1" });
  });

  it("when the App Store lapses but a Stripe subscription is live, Stripe is restored", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({
      user_id: U1, ...state({ provider: "app_store", plan: "desk", provider_customer_id: U1, provider_subscription_id: "otx_1", product_id: "bacon_desk_monthly" }),
      stripe_customer_id: "cus_1",
    });
    const findLiveStripeSubscription = vi.fn(async () => stripeSub({ metadata: { user_id: U1 } }));
    const res = await run(db, rc({ type: "EXPIRATION", product_id: "bacon_desk_monthly" }), { env: ENV, findLiveStripeSubscription });
    expect(findLiveStripeSubscription).toHaveBeenCalledWith("cus_1");
    expect(res.outcome?.reason).toMatch(/App Store expired; live Stripe subscription sub_1 restored/);
    expect(db.sub(U1)).toMatchObject({ provider: "stripe", plan: "pro", status: "active" });
  });

  it("…and simply expires when there is no live Stripe subscription", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state({ provider: "app_store", provider_subscription_id: "otx_1" }), stripe_customer_id: "cus_1" });
    await run(db, rc({ type: "EXPIRATION" }), { env: ENV, findLiveStripeSubscription: async () => null });
    expect(db.sub(U1)).toMatchObject({ provider: "app_store", status: "expired" });
  });

  it("ignores anonymous purchasers", async () => {
    const db = new FakeDb();
    const res = await run(db, rc({ app_user_id: "$RCAnonymousID:x", original_app_user_id: "$RCAnonymousID:x" }));
    expect(res.handled).toBe(false);
    expect(db.rows("subscriptions")).toHaveLength(0);
  });

  it("uses REVENUECAT_PRODUCT_MAP", async () => {
    const db = new FakeDb();
    await run(db, rc({ product_id: "com.acme.bacon.desk" }), { env: { REVENUECAT_PRODUCT_MAP: '{"com.acme.bacon.desk":"desk:year"}' } });
    expect(db.sub(U1)).toMatchObject({ plan: "desk", billing_interval: "year" });
  });

  it("TRANSFER moves the subscription to the new account", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state({ provider: "app_store", provider_customer_id: U1, provider_subscription_id: "otx_1", product_id: "bacon_pro_yearly", billing_interval: "year" }) });
    const res = await run(db, { id: "rc_t", type: "TRANSFER", transferred_from: [U1], transferred_to: [U2] });
    expect(res.handled).toBe(true);
    expect(db.sub(U1)).toMatchObject({ status: "transferred" });
    expect(isLive(db.sub(U1), NOW)).toBe(false);
    expect(db.sub(U2)).toMatchObject({ provider: "app_store", plan: "pro", status: "active", provider_customer_id: U2, billing_interval: "year" });
  });

  it("TRANSFER leaves another account's Stripe row alone", async () => {
    const db = new FakeDb();
    db.rows("subscriptions").push({ user_id: U1, ...state() });
    await run(db, { id: "rc_t", type: "TRANSFER", transferred_from: [U1], transferred_to: [U2] });
    expect(db.sub(U1)).toMatchObject({ provider: "stripe", status: "active" });
    expect(db.sub(U2)).toBeUndefined();
  });

  it("TRANSFER between anonymous ids does nothing", async () => {
    const db = new FakeDb();
    const res = await run(db, { id: "rc_t", type: "TRANSFER", transferred_from: ["$RCAnonymousID:a"], transferred_to: ["$RCAnonymousID:b"] });
    expect(res.handled).toBe(false);
  });
});
