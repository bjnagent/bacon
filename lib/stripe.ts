// A deliberately tiny Stripe client: fetch + form encoding + webhook signature
// verification. No SDK — the surface Bacon uses is six endpoints, and the SDK
// would be the largest dependency in the server bundle for it.
//
// Server-only (node:crypto, the secret key). Every call pins `Stripe-Version`,
// so a dashboard-side default-version bump can never change the shape of the
// objects this code reads. Webhook PAYLOADS are a different matter — their
// shape follows the version set on the webhook endpoint in the dashboard — so
// the readers in lib/billing.ts accept both the pre- and post-2025 shapes.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Pinned API version. Override only to test an upgrade. */
export const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2025-03-31.basil";
const API = "https://api.stripe.com";
const DEFAULT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Form encoding. Stripe takes application/x-www-form-urlencoded with nested
// keys in bracket notation: `metadata[user_id]=…`, `line_items[0][price]=…`.
// Brackets are sent literally (the official SDKs do the same); everything else
// is percent-encoded.

export type FormValue =
  | string | number | boolean | null | undefined
  | FormValue[]
  | { [key: string]: FormValue };

const enc = (s: string) => encodeURIComponent(s);

export function encodeForm(params: Record<string, FormValue>): string {
  const out: string[] = [];
  const walk = (key: string, v: FormValue): void => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(`${key}[${i}]`, x));
      return;
    }
    if (typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(`${key}[${enc(k)}]`, x);
      return;
    }
    out.push(`${key}=${enc(String(v))}`);
  };
  for (const [k, v] of Object.entries(params)) walk(enc(k), v);
  return out.join("&");
}

// ---------------------------------------------------------------------------
// Requests.

export class StripeError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly type?: string;
  readonly requestId?: string;
  constructor(message: string, status: number, code?: string, type?: string, requestId?: string) {
    super(message);
    this.name = "StripeError";
    this.status = status;
    this.code = code;
    this.type = type;
    this.requestId = requestId;
  }
}

export interface StripeRequestOptions {
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Defaults to STRIPE_SECRET_KEY. */
  secretKey?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export async function stripeRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, FormValue>,
  opts: StripeRequestOptions = {},
): Promise<T> {
  const key = opts.secretKey ?? process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeError("Stripe isn't configured (STRIPE_SECRET_KEY is unset).", 0, "billing_unconfigured");

  const form = params ? encodeForm(params) : "";
  const url = `${API}${path}${method !== "POST" && form ? `?${form}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      method,
      headers,
      body: method === "POST" ? form : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new StripeError(`Stripe didn't answer ${method} ${path} within ${timeoutMs}ms.`, 0, "timeout");
    }
    throw new StripeError(`Couldn't reach Stripe for ${method} ${path}: ${(e as Error)?.message ?? String(e)}`, 0, "network");
  }

  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body: reported below */ }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string; type?: string } } | null)?.error;
    const detail = err?.message ?? (text.slice(0, 200) || res.statusText || "no body");
    throw new StripeError(
      `Stripe ${method} ${path} failed (${res.status}${err?.code ? ` ${err.code}` : ""}): ${detail}`,
      res.status, err?.code, err?.type, res.headers.get("request-id") ?? undefined,
    );
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// The objects Bacon reads — only the fields it reads, all optional where a
// Stripe API version may omit them.

export type Expandable<T extends { id: string }> = string | T;

export interface StripePrice {
  id: string;
  active?: boolean;
  recurring?: { interval?: string } | null;
}

export interface StripeSubscriptionItem {
  id: string;
  price: StripePrice;
  quantity?: number;
  /** 2025-03-31.basil and later: the billing period lives on the item. */
  current_period_end?: number;
}

export interface StripeSubscription {
  id: string;
  object?: string;
  customer: Expandable<{ id: string }>;
  status: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  /** Before 2025-03-31.basil the billing period lived on the subscription. */
  current_period_end?: number;
  metadata?: Record<string, string> | null;
  items?: { data: StripeSubscriptionItem[] };
}

export interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  mode?: string;
  customer?: Expandable<{ id: string }> | null;
  subscription?: Expandable<{ id: string }> | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
}

export interface StripeInvoice {
  id: string;
  customer?: Expandable<{ id: string }> | null;
  /** Before 2025-03-31.basil. */
  subscription?: Expandable<{ id: string }> | null;
  /** 2025-03-31.basil and later. */
  parent?: { subscription_details?: { subscription?: Expandable<{ id: string }> | null } | null } | null;
}

export interface StripeEvent<T = unknown> {
  id: string;
  type: string;
  created?: number;
  livemode?: boolean;
  data: { object: T };
}

export const idOf = (v: Expandable<{ id: string }> | null | undefined): string | null =>
  typeof v === "string" ? v : v && typeof v.id === "string" ? v.id : null;

const seg = (id: string) => encodeURIComponent(id);

export const retrieveSubscription = (id: string, opts?: StripeRequestOptions) =>
  stripeRequest<StripeSubscription>("GET", `/v1/subscriptions/${seg(id)}`, undefined, opts);

export const listSubscriptions = (customer: string, opts?: StripeRequestOptions) =>
  stripeRequest<{ data: StripeSubscription[]; has_more?: boolean }>("GET", "/v1/subscriptions", { customer, status: "all", limit: 100 }, opts);

/** Cancel immediately (not at period end). */
export const cancelSubscription = (id: string, opts?: StripeRequestOptions) =>
  stripeRequest<StripeSubscription>("DELETE", `/v1/subscriptions/${seg(id)}`, undefined, opts);

export const createCheckoutSession = (params: Record<string, FormValue>, opts?: StripeRequestOptions) =>
  stripeRequest<StripeCheckoutSession>("POST", "/v1/checkout/sessions", params, opts);

export const createPortalSession = (params: Record<string, FormValue>, opts?: StripeRequestOptions) =>
  stripeRequest<{ id: string; url: string }>("POST", "/v1/billing_portal/sessions", params, opts);

export const retrievePrice = (id: string, opts?: StripeRequestOptions) =>
  stripeRequest<StripePrice>("GET", `/v1/prices/${seg(id)}`, undefined, opts);

// ---------------------------------------------------------------------------
// Webhook signatures.
//
// Header: `Stripe-Signature: t=1700000000,v1=<hex>,v1=<hex>,v0=<hex>`. The
// signed payload is `${t}.${rawBody}`, HMAC-SHA256 keyed with the endpoint's
// whsec_… secret (the whole string, prefix included). There can be several v1
// values while a secret is being rolled; any match is accepted. v0 is Stripe's
// test scheme and is ignored.
//
// The body must be the exact bytes Stripe sent — read with `req.text()` before
// anything parses it. Re-serialising parsed JSON changes whitespace and key
// order and no signature will ever match.
//
// The timestamp check is what makes a captured request useless later: the
// signature covers `t`, so an attacker can't refresh it, and anything outside
// the tolerance window (either direction) is refused.

export type SignatureFailure =
  | "missing_secret"
  | "missing_header"
  | "malformed_header"
  | "no_matching_signature"
  | "timestamp_out_of_tolerance";

export type SignatureResult = { ok: true; timestamp: number } | { ok: false; reason: SignatureFailure };

export function computeStripeSignature(payload: string, secret: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

/** A valid header for `payload` — for tests and local webhook replays. */
export function stripeSignatureHeader(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${computeStripeSignature(payload, secret, timestamp)}`;
}

export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | null | undefined,
  toleranceSec = 300,
  now: number = Date.now(),
): SignatureResult {
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!header) return { ok: false, reason: "missing_header" };

  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = /^\d{1,12}$/.test(v) ? Number(v) : NaN;
    else if (k === "v1" && v) v1.push(v);
  }
  if (t == null || !Number.isFinite(t) || !v1.length) return { ok: false, reason: "malformed_header" };

  const expected = Buffer.from(computeStripeSignature(rawBody, secret, t), "hex");
  const matched = v1.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    const got = Buffer.from(sig, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!matched) return { ok: false, reason: "no_matching_signature" };

  if (toleranceSec > 0 && Math.abs(Math.floor(now / 1000) - t) > toleranceSec) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }
  return { ok: true, timestamp: t };
}
