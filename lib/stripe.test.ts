import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  encodeForm, verifyStripeSignature, stripeSignatureHeader, computeStripeSignature, stripeRequest, StripeError,
  STRIPE_API_VERSION, idOf,
} from "./stripe";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
const NOW_MS = 1_760_000_000_000;
const T = Math.floor(NOW_MS / 1000);

describe("encodeForm", () => {
  it("encodes flat params", () => {
    expect(encodeForm({ mode: "subscription", quantity: 1, allow_promotion_codes: true })).toBe(
      "mode=subscription&quantity=1&allow_promotion_codes=true",
    );
  });

  it("uses bracket notation for nested objects and indexed arrays", () => {
    const s = encodeForm({
      line_items: [{ price: "price_123", quantity: 1 }],
      metadata: { user_id: "u-1", plan: "pro" },
      subscription_data: { metadata: { user_id: "u-1" }, trial_end: 1700000000 },
    });
    expect(s.split("&")).toEqual([
      "line_items[0][price]=price_123",
      "line_items[0][quantity]=1",
      "metadata[user_id]=u-1",
      "metadata[plan]=pro",
      "subscription_data[metadata][user_id]=u-1",
      "subscription_data[trial_end]=1700000000",
    ]);
  });

  it("encodes deep flow_data with arrays of objects", () => {
    const s = encodeForm({
      flow_data: { type: "subscription_update_confirm", subscription_update_confirm: { subscription: "sub_1", items: [{ id: "si_1", price: "price_2" }] } },
    });
    expect(s).toContain("flow_data[subscription_update_confirm][items][0][id]=si_1");
    expect(s).toContain("flow_data[subscription_update_confirm][items][0][price]=price_2");
  });

  it("percent-encodes values (and keys) but leaves brackets literal", () => {
    const s = encodeForm({ success_url: "https://x.test/a b?upgraded=1&x=y", customer_email: "a+b@x.test", "odd key": "v" });
    expect(s).toContain("success_url=https%3A%2F%2Fx.test%2Fa%20b%3Fupgraded%3D1%26x%3Dy");
    expect(s).toContain("customer_email=a%2Bb%40x.test");
    expect(s).toContain("odd%20key=v");
  });

  it("skips null/undefined but keeps empty strings and false", () => {
    expect(encodeForm({ a: null, b: undefined, c: "", d: false, e: { f: null } })).toBe("c=&d=false");
  });
});

describe("verifyStripeSignature", () => {
  const header = (body = BODY, t = T, secret = SECRET) => stripeSignatureHeader(body, secret, t);

  it("accepts a correctly signed payload", () => {
    expect(verifyStripeSignature(BODY, header(), SECRET, 300, NOW_MS)).toEqual({ ok: true, timestamp: T });
  });

  it("matches Stripe's scheme: HMAC-SHA256 over `${t}.${body}` with the whole whsec_ string", () => {
    const manual = createHmac("sha256", SECRET).update(`${T}.${BODY}`).digest("hex");
    expect(computeStripeSignature(BODY, SECRET, T)).toBe(manual);
    expect(verifyStripeSignature(BODY, `t=${T},v1=${manual}`, SECRET, 300, NOW_MS).ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const tampered = BODY.replace("sub_1", "sub_2");
    expect(verifyStripeSignature(tampered, header(), SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "no_matching_signature" });
  });

  it("rejects a body re-serialised with different whitespace", () => {
    const pretty = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyStripeSignature(pretty, header(), SECRET, 300, NOW_MS).ok).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifyStripeSignature(BODY, header(BODY, T, "whsec_other"), SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "no_matching_signature" });
  });

  it("rejects a timestamp swapped into a valid signature (t is signed)", () => {
    const sig = computeStripeSignature(BODY, SECRET, T - 10_000);
    expect(verifyStripeSignature(BODY, `t=${T},v1=${sig}`, SECRET, 300, NOW_MS).ok).toBe(false);
  });

  it("rejects a replay outside the tolerance window, in either direction", () => {
    const old = header(BODY, T - 301);
    expect(verifyStripeSignature(BODY, old, SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
    const future = header(BODY, T + 301);
    expect(verifyStripeSignature(BODY, future, SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
    // Edge of the window is still accepted.
    expect(verifyStripeSignature(BODY, header(BODY, T - 300), SECRET, 300, NOW_MS).ok).toBe(true);
  });

  it("honours a custom tolerance, and 0 disables the window", () => {
    const h = header(BODY, T - 100);
    expect(verifyStripeSignature(BODY, h, SECRET, 60, NOW_MS).ok).toBe(false);
    expect(verifyStripeSignature(BODY, header(BODY, T - 100_000), SECRET, 0, NOW_MS).ok).toBe(true);
  });

  it("accepts any matching v1 (secret rolling) and ignores v0", () => {
    const good = computeStripeSignature(BODY, SECRET, T);
    const other = computeStripeSignature(BODY, "whsec_old", T);
    expect(verifyStripeSignature(BODY, `t=${T},v1=${other},v1=${good},v0=deadbeef`, SECRET, 300, NOW_MS).ok).toBe(true);
    expect(verifyStripeSignature(BODY, `t=${T},v0=${good}`, SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "malformed_header" });
  });

  it("tolerates whitespace around header parts", () => {
    const good = computeStripeSignature(BODY, SECRET, T);
    expect(verifyStripeSignature(BODY, ` t=${T} , v1=${good} `, SECRET, 300, NOW_MS).ok).toBe(true);
  });

  it("reports missing and malformed headers", () => {
    expect(verifyStripeSignature(BODY, null, SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "missing_header" });
    expect(verifyStripeSignature(BODY, "", SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "missing_header" });
    expect(verifyStripeSignature(BODY, "garbage", SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifyStripeSignature(BODY, `t=abc,v1=${"a".repeat(64)}`, SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifyStripeSignature(BODY, `v1=${"a".repeat(64)}`, SECRET, 300, NOW_MS)).toEqual({ ok: false, reason: "malformed_header" });
  });

  it("rejects non-hex or wrong-length signatures without throwing", () => {
    expect(verifyStripeSignature(BODY, `t=${T},v1=zz`, SECRET, 300, NOW_MS).ok).toBe(false);
    expect(verifyStripeSignature(BODY, `t=${T},v1=${"ab".repeat(16)}`, SECRET, 300, NOW_MS).ok).toBe(false);
    expect(verifyStripeSignature(BODY, `t=${T},v1=${"g".repeat(64)}`, SECRET, 300, NOW_MS).ok).toBe(false);
  });

  it("refuses to verify without a secret", () => {
    expect(verifyStripeSignature(BODY, header(), "", 300, NOW_MS)).toEqual({ ok: false, reason: "missing_secret" });
    expect(verifyStripeSignature(BODY, header(), undefined, 300, NOW_MS)).toEqual({ ok: false, reason: "missing_secret" });
  });
});

describe("stripeRequest", () => {
  const rejection = (p: Promise<unknown>) => p.then(() => { throw new Error("expected a rejection"); }, (e: unknown) => e as StripeError);
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  it("POSTs a form body with the bearer key, pinned version and idempotency key", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }));
    const res = await stripeRequest<{ url: string }>("POST", "/v1/checkout/sessions", { mode: "subscription", line_items: [{ price: "p", quantity: 1 }] }, {
      secretKey: "sk_test_x", fetchImpl: fetchImpl as unknown as typeof fetch, idempotencyKey: "idem-1",
    });
    expect(res.url).toBe("https://checkout.stripe.test/cs_1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("mode=subscription&line_items[0][price]=p&line_items[0][quantity]=1");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer sk_test_x");
    expect(h["Stripe-Version"]).toBe(STRIPE_API_VERSION);
    expect(h["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(h["Idempotency-Key"]).toBe("idem-1");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("puts GET params in the query string and sends no body", async () => {
    const fetchImpl = vi.fn(async () => ok({ data: [] }));
    await stripeRequest("GET", "/v1/subscriptions", { customer: "cus_1", status: "all", limit: 100 }, { secretKey: "sk", fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/subscriptions?customer=cus_1&status=all&limit=100");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("turns a Stripe error body into a readable StripeError", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "No such price: 'price_x'", code: "resource_missing", type: "invalid_request_error" } }), {
      status: 400, headers: { "request-id": "req_123" },
    }));
    const err = await rejection(stripeRequest("GET", "/v1/prices/price_x", undefined, { secretKey: "sk", fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(err).toBeInstanceOf(StripeError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("resource_missing");
    expect(err.requestId).toBe("req_123");
    expect(err.message).toContain("No such price");
    expect(err.message).toContain("400");
  });

  it("reports non-JSON error bodies", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 }));
    const err = await rejection(stripeRequest("GET", "/v1/x", undefined, { secretKey: "sk", fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(err.status).toBe(502);
    expect(err.message).toContain("bad gateway");
  });

  it("names a timeout as a timeout", async () => {
    const fetchImpl = vi.fn(async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); });
    const err = await rejection(stripeRequest("GET", "/v1/x", undefined, { secretKey: "sk", fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5 }));
    expect(err.code).toBe("timeout");
    expect(err.message).toMatch(/within 5ms/);
  });

  it("names a network failure", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const err = await rejection(stripeRequest("GET", "/v1/x", undefined, { secretKey: "sk", fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(err.code).toBe("network");
  });

  it("fails fast, without a request, when no key is configured", async () => {
    const prev = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    const fetchImpl = vi.fn();
    const err = await rejection(stripeRequest("GET", "/v1/x", undefined, { fetchImpl: fetchImpl as unknown as typeof fetch }));
    if (prev !== undefined) process.env.STRIPE_SECRET_KEY = prev;
    expect(err.code).toBe("billing_unconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("idOf", () => {
  it("reads ids from strings and expanded objects", () => {
    expect(idOf("cus_1")).toBe("cus_1");
    expect(idOf({ id: "cus_2" })).toBe("cus_2");
    expect(idOf(null)).toBeNull();
    expect(idOf(undefined)).toBeNull();
  });
});
