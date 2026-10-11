// Route-level tests for the money path: the handlers themselves, called with
// real Request objects, against an in-memory database and a stubbed Stripe.
// Signature verification, form encoding and the event mapping are the real
// implementations; only the network edges are replaced.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { FakeDb, type Row } from "@/lib/billing.testing";
import { stripeSignatureHeader, type StripeSubscription } from "@/lib/stripe";

const h = vi.hoisted(() => ({
  admin: null as unknown,
  user: null as unknown,
  cookies: null as unknown,
}));
const stripe = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  retrieveSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
  cancelSubscription: vi.fn(),
  retrievePrice: vi.fn(),
}));
const anthropic = vi.hoisted(() => ({ ask: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.user }));
vi.mock("next/headers", () => ({ cookies: async () => h.cookies }));
vi.mock("@/lib/stripe", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/stripe")>()), ...stripe }));
vi.mock("@/lib/anthropic", () => ({ ask: anthropic.ask, MODEL: "claude-sonnet-5", BULK_MODEL: "claude-haiku-4-5" }));

import { POST as webhook } from "./webhook/route";
import { POST as revenuecat } from "./revenuecat/route";
import { POST as checkout } from "./checkout/route";
import { POST as portal } from "./portal/route";
import { DELETE as deleteAccount } from "../account/route";
import { GET as health } from "../health/route";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const HOUSE = "44444444-4444-4444-8444-444444444444";
const DAY = 86_400_000;
const future = (days = 20) => new Date(Date.now() + days * DAY).toISOString();

const ENV: Record<string, string> = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
  STRIPE_PRICE_PRO_YEARLY: "price_pro_y",
  STRIPE_PRICE_DESK_MONTHLY: "price_desk_m",
  STRIPE_PRICE_DESK_YEARLY: "price_desk_y",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  REVENUECAT_WEBHOOK_AUTH: "rc_secret",
  NEXT_PUBLIC_SITE_URL: "https://bacon.test",
  HOUSE_USER_ID: HOUSE,
  CRON_SECRET: "cron_secret",
};
const saved: Record<string, string | undefined> = {};
const EXTRA = ["STRIPE_AUTOMATIC_TAX", "REVENUECAT_ACCEPT_SANDBOX", "ADMIN_EMAILS"];

let db: FakeDb;
let deleteUser: ReturnType<typeof vi.fn>;
let signOut: ReturnType<typeof vi.fn>;
let deletedCookies: string[];
let claims: { sub: string; email: string | null } | null;

beforeEach(() => {
  for (const k of [...Object.keys(ENV), ...EXTRA]) saved[k] = process.env[k];
  Object.assign(process.env, ENV);
  for (const k of EXTRA) delete process.env[k];
  Object.values(stripe).forEach((f) => f.mockReset());
  anthropic.ask.mockReset();

  db = new FakeDb([U1, U2, HOUSE]);
  deleteUser = vi.fn(async () => ({ error: null }));
  signOut = vi.fn(async () => ({ error: null }));
  deletedCookies = [];
  claims = { sub: U1, email: "a@x.test" };
  h.admin = Object.assign(db, { auth: { admin: { deleteUser } }, rpc: async () => ({ data: [], error: null }) });
  h.user = {
    from: (t: string) => db.from(t),
    auth: {
      getClaims: async () => (claims ? { data: { claims }, error: null } : { data: null, error: new Error("no session") }),
      signOut,
    },
  };
  h.cookies = {
    getAll: () => [{ name: "sb-bacon-auth-token.0", value: "a" }, { name: "sb-bacon-auth-token.1", value: "b" }, { name: "theme", value: "dark" }],
    delete: (name: string) => deletedCookies.push(name),
    set: vi.fn(),
  };
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const json = (url: string, body: unknown, init: RequestInit = {}) =>
  new Request(`https://bacon.test${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }, body: body === undefined ? undefined : JSON.stringify(body), ...init });

function sub(o: Partial<StripeSubscription> & { price?: string } = {}): StripeSubscription {
  return {
    id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, metadata: { user_id: U1, plan: "pro" },
    items: { data: [{ id: "si_1", price: { id: o.price ?? "price_pro_m", recurring: { interval: "month" } }, current_period_end: Math.floor(Date.now() / 1000) + 20 * 86400 }] },
    ...o,
  };
}
const liveRow = (o: Row = {}): Row => ({
  user_id: U1, plan: "pro", status: "active", provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: "sub_1",
  product_id: "price_pro_m", billing_interval: "month", current_period_end: future(), cancel_at_period_end: false, ...o,
});

// ---------------------------------------------------------------------------

describe("POST /api/billing/webhook (Stripe)", () => {
  const event = (o: Record<string, unknown> = {}) => JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", data: { object: sub() }, ...o });
  const signed = (payload: string, init: { secret?: string; t?: number } = {}) =>
    new Request("https://bacon.test/api/billing/webhook", {
      method: "POST", body: payload,
      headers: { "Stripe-Signature": stripeSignatureHeader(payload, init.secret ?? "whsec_test", init.t ?? Math.floor(Date.now() / 1000)) },
    });

  it("503 when billing isn't configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await webhook(signed(event()));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "billing_unconfigured" });
  });

  it("400 on a missing, wrong, or replayed signature — and nothing is written", async () => {
    const payload = event();
    const missing = await webhook(new Request("https://bacon.test/api/billing/webhook", { method: "POST", body: payload }));
    expect(missing.status).toBe(400);
    expect((await webhook(signed(payload, { secret: "whsec_wrong" }))).status).toBe(400);
    const replay = await webhook(signed(payload, { t: Math.floor(Date.now() / 1000) - 3600 }));
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ reason: "timestamp_out_of_tolerance" });
    expect(db.rows("billing_events")).toHaveLength(0);
    expect(db.rows("subscriptions")).toHaveLength(0);
  });

  it("400 when the signed body was tampered with in transit", async () => {
    const payload = event();
    const req = new Request("https://bacon.test/api/billing/webhook", {
      method: "POST", body: payload.replace("price_pro_m", "price_desk_y"),
      headers: { "Stripe-Signature": stripeSignatureHeader(payload, "whsec_test") },
    });
    expect((await webhook(req)).status).toBe(400);
  });

  it("processes a valid event once; a replay of the same id is acknowledged as a duplicate", async () => {
    stripe.retrieveSubscription.mockResolvedValue(sub({ cancel_at_period_end: true }));
    const first = await webhook(signed(event()));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, handled: true, applied: true });
    expect(db.sub(U1)).toMatchObject({ plan: "pro", status: "active", provider: "stripe", cancel_at_period_end: true, stripe_customer_id: "cus_1" });

    const again = await webhook(signed(event()));
    expect(await again.json()).toMatchObject({ ok: true, duplicate: true });
    expect(stripe.retrieveSubscription).toHaveBeenCalledTimes(1);
    expect(db.rows("billing_events")).toEqual([expect.objectContaining({ id: "evt_1", provider: "stripe", type: "customer.subscription.updated" })]);
  });

  it("acknowledges event types it doesn't act on without recording them", async () => {
    const res = await webhook(signed(event({ type: "charge.succeeded" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "charge.succeeded" });
    expect(db.rows("billing_events")).toHaveLength(0);
  });

  it("500 and releases the event when processing fails, so Stripe's retry is processed", async () => {
    const payload = event({ id: "evt_co", type: "checkout.session.completed", data: { object: { id: "cs_1", mode: "subscription", client_reference_id: U1, subscription: "sub_1", customer: "cus_1" } } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.retrieveSubscription.mockRejectedValueOnce(new Error("Stripe timeout"));
    const failed = await webhook(signed(payload));
    err.mockRestore();
    expect(failed.status).toBe(500);
    expect(db.rows("billing_events")).toHaveLength(0);

    stripe.retrieveSubscription.mockResolvedValueOnce(sub());
    const retried = await webhook(signed(payload));
    expect(retried.status).toBe(200);
    expect(db.sub(U1)).toMatchObject({ plan: "pro", status: "active" });
  });

  it("500 when the event ledger is missing (schema not applied) — never processes without it", async () => {
    db.failNext.billing_events = { code: "42P01", message: 'relation "billing_events" does not exist' };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await webhook(signed(event()));
    err.mockRestore();
    expect(res.status).toBe(500);
    expect(stripe.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("400 on a signed body that isn't a Stripe event", async () => {
    expect((await webhook(signed("not json"))).status).toBe(400);
    expect((await webhook(signed(JSON.stringify({ hello: "world" })))).status).toBe(400);
  });
});

describe("POST /api/billing/revenuecat", () => {
  const rcEvent = (o: Record<string, unknown> = {}) => ({
    event: {
      id: "rc_1", type: "INITIAL_PURCHASE", app_user_id: U1, original_app_user_id: U1, product_id: "bacon_desk_yearly",
      period_type: "NORMAL", expiration_at_ms: Date.now() + 300 * DAY, environment: "PRODUCTION", store: "APP_STORE",
      original_transaction_id: "otx_1", ...o,
    },
  });
  const post = (body: unknown, auth: string | null = "rc_secret") =>
    revenuecat(json("/api/billing/revenuecat", body, { headers: auth ? { Authorization: auth } : {} }));

  it("503 when unconfigured; 401 without the shared secret", async () => {
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    expect((await post(rcEvent())).status).toBe(503);
    process.env.REVENUECAT_WEBHOOK_AUTH = "rc_secret";
    expect((await post(rcEvent(), null)).status).toBe(401);
    expect((await post(rcEvent(), "rc_secre")).status).toBe(401);
    expect((await post(rcEvent(), "Bearer wrong")).status).toBe(401);
    expect(db.rows("subscriptions")).toHaveLength(0);
  });

  it("accepts the secret bare or as a Bearer token", async () => {
    expect((await post(rcEvent({ type: "TEST" }), "rc_secret")).status).toBe(200);
    expect((await post(rcEvent({ type: "TEST" }), "Bearer rc_secret")).status).toBe(200);
  });

  it("400 on a body that isn't a RevenueCat event", async () => {
    expect((await post({ nope: true })).status).toBe(400);
    expect((await post({ event: { type: "RENEWAL" } })).status).toBe(400);
  });

  it("TEST → 200 without touching the database", async () => {
    const res = await post(rcEvent({ type: "TEST" }));
    expect(await res.json()).toMatchObject({ ok: true, test: true });
    expect(db.rows("billing_events")).toHaveLength(0);
  });

  it("writes an App Store purchase, once", async () => {
    const res = await post(rcEvent());
    expect(await res.json()).toMatchObject({ ok: true, handled: true, applied: true });
    expect(db.sub(U1)).toMatchObject({ plan: "desk", billing_interval: "year", status: "active", provider: "app_store", provider_subscription_id: "otx_1" });
    expect(await (await post(rcEvent())).json()).toMatchObject({ duplicate: true });
  });

  it("ignores other stores, and sandbox when told to", async () => {
    expect(await (await post(rcEvent({ store: "PLAY_STORE" }))).json()).toMatchObject({ ignored: "store PLAY_STORE" });
    process.env.REVENUECAT_ACCEPT_SANDBOX = "0";
    expect(await (await post(rcEvent({ id: "rc_2", environment: "SANDBOX" }))).json()).toMatchObject({ ignored: "sandbox" });
    delete process.env.REVENUECAT_ACCEPT_SANDBOX;
    expect(await (await post(rcEvent({ id: "rc_3", environment: "SANDBOX" }))).json()).toMatchObject({ applied: true });
  });

  it("a lapsing App Store plan falls back to a live Stripe subscription", async () => {
    db.rows("subscriptions").push(liveRow({ provider: "app_store", provider_customer_id: U1, provider_subscription_id: "otx_1", stripe_customer_id: "cus_1", plan: "desk", product_id: "bacon_desk_yearly" }));
    stripe.listSubscriptions.mockResolvedValue({ data: [sub({ status: "canceled", id: "sub_old" }), sub()] });
    await post(rcEvent({ type: "EXPIRATION", expiration_at_ms: Date.now() + 300 * DAY }));
    expect(stripe.listSubscriptions).toHaveBeenCalledWith("cus_1");
    expect(db.sub(U1)).toMatchObject({ provider: "stripe", plan: "pro", status: "active", provider_subscription_id: "sub_1" });
  });
});

describe("POST /api/billing/checkout", () => {
  const post = (body: unknown) => checkout(json("/api/billing/checkout", body));
  const params = () => stripe.createCheckoutSession.mock.calls[0][0] as Record<string, unknown>;
  beforeEach(() => { stripe.createCheckoutSession.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }); });

  it("401 signed out; 400 on a bad plan, interval or body", async () => {
    claims = null;
    expect((await post({ plan: "pro", interval: "month" })).status).toBe(401);
    claims = { sub: U1, email: "a@x.test" };
    expect((await post({ plan: "free", interval: "month" })).status).toBe(400);
    expect((await post({ plan: "pro", interval: "weekly" })).status).toBe(400);
    expect((await checkout(new Request("https://bacon.test/api/billing/checkout", { method: "POST", body: "{nope" }))).status).toBe(400);
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("503 billing_unconfigured without Stripe keys or the price", async () => {
    delete process.env.STRIPE_PRICE_DESK_YEARLY;
    const res = await post({ plan: "desk", interval: "year" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Billing isn't configured yet.", code: "billing_unconfigured" });
    delete process.env.STRIPE_SECRET_KEY;
    expect((await post({ plan: "pro", interval: "month" })).status).toBe(503);
  });

  it("creates a subscription Checkout for a new customer", async () => {
    const res = await post({ plan: "pro", interval: "year", returnPath: "/account" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/cs_1" });
    expect(params()).toEqual({
      mode: "subscription",
      line_items: [{ price: "price_pro_y", quantity: 1 }],
      success_url: "https://bacon.test/account?upgraded=1",
      cancel_url: "https://bacon.test/account",
      client_reference_id: U1,
      allow_promotion_codes: true,
      metadata: { user_id: U1, plan: "pro", interval: "year" },
      subscription_data: { metadata: { user_id: U1, plan: "pro" } },
      customer_email: "a@x.test",
    });
  });

  it("409 inside the iOS app — purchases there must go through the App Store", async () => {
    const res = await checkout(json("/api/billing/checkout", { plan: "pro", interval: "month" }, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 BaconApp" },
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "use_in_app_purchase" });
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("never redirects off-site", async () => {
    await post({ plan: "pro", interval: "month", returnPath: "https://evil.test/phish" });
    expect(params()).toMatchObject({ success_url: "https://bacon.test/?upgraded=1", cancel_url: "https://bacon.test/" });
  });

  it("reuses the stored Stripe customer instead of the email", async () => {
    db.rows("subscriptions").push(liveRow({ status: "canceled" }));
    await post({ plan: "desk", interval: "month" });
    expect(params()).toMatchObject({ customer: "cus_1" });
    expect(params().customer_email).toBeUndefined();
  });

  it("reuses a Stripe customer kept while another channel owned the row", async () => {
    db.rows("subscriptions").push(liveRow({ provider: "app_store", status: "expired", stripe_customer_id: "cus_kept" }));
    await post({ plan: "pro", interval: "month" });
    expect(params()).toMatchObject({ customer: "cus_kept" });
  });

  it("turns on automatic tax, letting Stripe update an existing customer's address", async () => {
    process.env.STRIPE_AUTOMATIC_TAX = "1";
    db.rows("subscriptions").push(liveRow({ status: "canceled" }));
    await post({ plan: "pro", interval: "month" });
    expect(params()).toMatchObject({ automatic_tax: { enabled: true }, customer_update: { address: "auto", name: "auto" } });
  });

  it("409 when a live App Store subscription exists", async () => {
    db.rows("subscriptions").push(liveRow({ provider: "app_store", provider_customer_id: U1 }));
    const res = await post({ plan: "desk", interval: "month" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("app_store_subscription");
    expect(body.error).toMatch(/App Store/);
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("an expired App Store subscription doesn't block web checkout", async () => {
    db.rows("subscriptions").push(liveRow({ provider: "app_store", status: "expired" }));
    expect((await post({ plan: "pro", interval: "month" })).status).toBe(200);
  });

  it("an existing Stripe subscriber: same plan → 409, another plan → the portal's confirm-change page", async () => {
    db.rows("subscriptions").push(liveRow());
    const same = await post({ plan: "pro", interval: "month" });
    expect(same.status).toBe(409);
    expect(await same.json()).toMatchObject({ code: "already_subscribed" });

    stripe.retrieveSubscription.mockResolvedValue(sub());
    stripe.createPortalSession.mockResolvedValue({ id: "bps_1", url: "https://billing.stripe.test/confirm" });
    const other = await post({ plan: "desk", interval: "year", returnPath: "/pricing" });
    expect(await other.json()).toEqual({ url: "https://billing.stripe.test/confirm" });
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
    expect(stripe.createPortalSession.mock.calls[0][0]).toMatchObject({
      customer: "cus_1",
      flow_data: { type: "subscription_update_confirm", subscription_update_confirm: { subscription: "sub_1", items: [{ id: "si_1", price: "price_desk_y", quantity: 1 }] } },
    });
  });

  it("a running founding-member comp on the same plan bills from when the comp ends", async () => {
    const ends = future(60);
    db.rows("subscriptions").push(liveRow({ provider: "manual", provider_customer_id: null, provider_subscription_id: null, current_period_end: ends }));
    await post({ plan: "pro", interval: "month" });
    expect((params().subscription_data as Record<string, unknown>).trial_end).toBe(Math.floor(Date.parse(ends) / 1000));
    stripe.createCheckoutSession.mockClear();
    await post({ plan: "desk", interval: "month" });
    expect((params().subscription_data as Record<string, unknown>).trial_end).toBeUndefined();
  });

  it("502 with a readable message when Stripe fails", async () => {
    stripe.createCheckoutSession.mockRejectedValue(new Error("Stripe POST /v1/checkout/sessions failed (400 resource_missing): No such price"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ plan: "pro", interval: "month" });
    err.mockRestore();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "billing_error" });
  });
});

describe("POST /api/billing/portal", () => {
  it("404 when there's no Stripe customer, with App Store guidance when that's the channel", async () => {
    const none = await portal(json("/api/billing/portal", { returnPath: "/account" }));
    expect(none.status).toBe(404);
    expect(await none.json()).toMatchObject({ code: "no_billing_account" });

    db.rows("subscriptions").push(liveRow({ provider: "app_store", provider_customer_id: U1 }));
    const apple = await portal(json("/api/billing/portal", { returnPath: "/account" }));
    expect(apple.status).toBe(404);
    expect(await apple.json()).toMatchObject({ code: "app_store_subscription" });
    expect(stripe.createPortalSession).not.toHaveBeenCalled();
  });

  it("returns a portal session for the stored customer", async () => {
    db.rows("subscriptions").push(liveRow());
    stripe.createPortalSession.mockResolvedValue({ id: "bps_1", url: "https://billing.stripe.test/p" });
    const res = await portal(json("/api/billing/portal", { returnPath: "/account" }));
    expect(await res.json()).toEqual({ url: "https://billing.stripe.test/p" });
    expect(stripe.createPortalSession).toHaveBeenCalledWith({ customer: "cus_1", return_url: "https://bacon.test/account" });
  });

  it("401 signed out", async () => {
    claims = null;
    expect((await portal(json("/api/billing/portal", {}))).status).toBe(401);
  });
});

describe("DELETE /api/account", () => {
  const del = (body?: unknown) => deleteAccount(json("/api/account", body, { method: "DELETE" }));

  it("requires { confirm: 'DELETE' }", async () => {
    expect((await del()).status).toBe(400);
    expect((await del({ confirm: "delete" })).status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses to delete the house account", async () => {
    claims = { sub: HOUSE, email: "house@x.test" };
    expect((await del({ confirm: "DELETE" })).status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("cancels open Stripe subscriptions, deletes the user, signs out and expires the sb- cookies", async () => {
    db.rows("subscriptions").push(liveRow());
    stripe.listSubscriptions.mockResolvedValue({ data: [sub(), sub({ id: "sub_2", status: "past_due" }), sub({ id: "sub_3", status: "canceled" })] });
    stripe.cancelSubscription.mockResolvedValue({});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await del({ confirm: "DELETE" });
    info.mockRestore();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, appStore: false });
    expect(stripe.cancelSubscription.mock.calls.map((c) => c[0]).sort()).toEqual(["sub_1", "sub_2"]);
    expect(deleteUser).toHaveBeenCalledWith(U1);
    expect(signOut).toHaveBeenCalled();
    expect(deletedCookies.sort()).toEqual(["sb-bacon-auth-token.0", "sb-bacon-auth-token.1"]);
  });

  it("reports a live App Store subscription (which only Apple can cancel)", async () => {
    db.rows("subscriptions").push(liveRow({ provider: "app_store", provider_customer_id: U1 }));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await del({ confirm: "DELETE" });
    info.mockRestore();
    expect(await res.json()).toEqual({ ok: true, appStore: true });
    expect(stripe.listSubscriptions).not.toHaveBeenCalled();
  });

  it("still deletes when Stripe is down (best effort, logged for manual follow-up)", async () => {
    db.rows("subscriptions").push(liveRow());
    stripe.listSubscriptions.mockRejectedValue(new Error("Couldn't reach Stripe"));
    stripe.cancelSubscription.mockRejectedValue(new Error("Couldn't reach Stripe"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await del({ confirm: "DELETE" });
    const logged = err.mock.calls.map((c) => String(c[0])).join("\n");
    err.mockRestore(); info.mockRestore();
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalled();
    expect(logged).toMatch(/MANUAL ACTION.*sub_1/);
  });

  it("500 — and still signed in — when the deletion itself fails", async () => {
    deleteUser.mockResolvedValueOnce({ error: { message: "db down" } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await del({ confirm: "DELETE" });
    err.mockRestore();
    expect(res.status).toBe(500);
    expect(signOut).not.toHaveBeenCalled();
    expect(deletedCookies).toHaveLength(0);
  });

  it("401 signed out", async () => {
    claims = null;
    expect((await del({ confirm: "DELETE" })).status).toBe(401);
  });
});

describe("GET /api/health", () => {
  const get = (auth?: string) => health(new NextRequest("https://bacon.test/api/health", { headers: auth ? { Authorization: auth } : {} }));

  it("public: only ok + version, and never calls Anthropic", async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.2.3";
    for (const auth of [undefined, "Bearer wrong"]) {
      const body = await (await get(auth)).json();
      expect(body).toEqual({ ok: true, version: "1.2.3" });
    }
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    expect(anthropic.ask).not.toHaveBeenCalled();
    expect(stripe.retrievePrice).not.toHaveBeenCalled();
  });

  it("with the cron secret: providers (presence only) and live probes", async () => {
    anthropic.ask.mockResolvedValue("OK");
    stripe.retrievePrice.mockImplementation(async (id: string) => ({ id, active: true, recurring: { interval: id.endsWith("_y") ? "year" : "month" } }));
    const body = await (await get("Bearer cron_secret")).json();
    expect(anthropic.ask).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      ok: true, model: "claude-sonnet-5", bulkModel: "claude-haiku-4-5",
      providers: { stripe: true, stripe_webhook: true, revenuecat_webhook: true, stripe_prices: { pro_monthly: true, desk_yearly: true } },
      checks: { stripe: { pro_monthly: "ok", pro_yearly: "ok", desk_monthly: "ok", desk_yearly: "ok" } },
    });
    expect(JSON.stringify(body)).not.toContain("sk_test_x");
    expect(JSON.stringify(body)).not.toContain("whsec_test");
  });
});
