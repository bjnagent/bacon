// Apple Push Notification service (APNs) client: token-based auth over HTTP/2.
//
// No SDK: APNs is one POST per device on a long-lived HTTP/2 connection,
// authenticated by a short ES256 JWT signed with the team's .p8 key. Node's own
// http2 + crypto cover it, and keep the dependency (and its attack surface) out.
//
// Server-only (node:http2 / node:crypto). lib/push.ts decides who to notify;
// this module only knows how to talk to Apple.
//
// Env:
//   APNS_KEY_ID       10-char key id of the .p8 "Apple Push Notifications service" key
//   APNS_TEAM_ID      10-char Apple Developer team id
//   APNS_PRIVATE_KEY  the .p8 contents (PEM; "\n"-escaped one-liners and bare base64 accepted)
//   APNS_BUNDLE_ID    the app's bundle id = apns-topic (falls back to CAP_APP_ID)
//   APNS_ENV          optional "sandbox" | "production": gateway for tokens with no stored
//                     environment (default production). Each token's own stored environment
//                     always wins — that's what the app reported when it registered.

import { createPrivateKey, sign as cryptoSign, type KeyObject } from "node:crypto";
import http2 from "node:http2";

export type ApnsEnvironment = "production" | "sandbox";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** PKCS#8 PEM of the .p8 key. */
  privateKey: string;
  /** apns-topic: the app's bundle identifier. */
  bundleId: string;
  /** Gateway for tokens whose stored environment is missing or unrecognised. */
  defaultEnvironment?: ApnsEnvironment;
}

export interface ApnsMessage {
  title: string;
  body: string;
  /** In-app path opened on tap ("/", "/analyze/NVDA"). Read by NativeBridge. */
  path?: string;
  kind?: string;
  badge?: number;
  /** Notifications sharing an id replace each other on the device (≤ 64 bytes). */
  collapseId?: string;
}

export interface ApnsTarget {
  token: string;
  environment?: string | null;
}

export interface ApnsResult {
  token: string;
  /** HTTP status from APNs; 0 when the request never got an answer. */
  status: number;
  ok: boolean;
  /** APNs `reason` on failure, e.g. "BadDeviceToken", "Unregistered". */
  reason?: string;
  /** Gateway the final attempt went to. */
  environment: ApnsEnvironment;
  /** The token is dead (uninstalled / invalid / wrong app): delete it. */
  remove: boolean;
  /** Delivered on the OTHER gateway than the one stored: update the stored environment. */
  movedTo?: ApnsEnvironment;
}

export const APNS_HOSTS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

const JWT_TTL_MS = 50 * 60 * 1000; // Apple: refresh at most every 20 min, never older than 60.
const DEFAULT_TIMEOUT_MS = 8_000;
const EXPIRY_S = 24 * 3600; // keep trying an offline device for a day, then drop

// ---------------------------------------------------------------------------
// Config

/** Accepts a real PEM, a PEM with literal "\n" escapes (env-var friendly) or the bare base64 body. */
export function normalizePem(raw: string): string {
  let s = raw.trim().replace(/^["']|["']$/g, "").replace(/\\r/g, "").replace(/\\n/g, "\n").trim();
  if (!s.includes("-----BEGIN")) {
    const body = s.replace(/\s+/g, "");
    s = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join("\n") ?? body}\n-----END PRIVATE KEY-----`;
  }
  return s + "\n";
}

export function asEnvironment(v: unknown): ApnsEnvironment | null {
  if (v === "production" || v === "sandbox") return v;
  if (v === "development") return "sandbox";
  return null;
}

/** APNs settings from the environment, or null when push isn't configured. */
export function apnsConfigFromEnv(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const privateKey = env.APNS_PRIVATE_KEY?.trim();
  const bundleId = (env.APNS_BUNDLE_ID || env.CAP_APP_ID)?.trim();
  if (!keyId || !teamId || !privateKey || !bundleId) return null;
  return { keyId, teamId, privateKey: normalizePem(privateKey), bundleId, defaultEnvironment: asEnvironment(env.APNS_ENV) ?? undefined };
}

// ---------------------------------------------------------------------------
// Provider token (ES256 JWT)

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

const keyCache = new Map<string, KeyObject>();
function keyObject(pem: string): KeyObject {
  let k = keyCache.get(pem);
  if (!k) { k = createPrivateKey(pem); keyCache.set(pem, k); }
  return k;
}

/** Signs a fresh provider token. `iat` in seconds. */
export function signJwt(cfg: Pick<ApnsConfig, "keyId" | "teamId" | "privateKey">, iat: number = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat }));
  const input = `${header}.${claims}`;
  // JOSE wants the raw 64-byte r||s signature, not DER.
  const sig = cryptoSign("sha256", Buffer.from(input), { key: keyObject(cfg.privateKey), dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}

const jwtCache = new Map<string, { jwt: string; at: number }>();

/** The cached provider token (re-signed after ~50 minutes, or when forced). */
export function providerToken(cfg: ApnsConfig, now: number = Date.now(), force = false): string {
  const id = `${cfg.teamId}:${cfg.keyId}`;
  const hit = jwtCache.get(id);
  if (!force && hit && now - hit.at < JWT_TTL_MS) return hit.jwt;
  const jwt = signJwt(cfg, Math.floor(now / 1000));
  jwtCache.set(id, { jwt, at: now });
  return jwt;
}

/** Test hook. */
export function resetApnsCaches(): void {
  jwtCache.clear();
  keyCache.clear();
}

// ---------------------------------------------------------------------------
// Payload

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** The JSON body APNs delivers. Custom keys sit beside `aps` and reach the app as `notification.data`. */
export function buildPayload(msg: ApnsMessage): Record<string, unknown> {
  const aps: Record<string, unknown> = {
    alert: { title: clip(msg.title, 120), body: clip(msg.body, 600) },
    sound: "default",
  };
  if (typeof msg.badge === "number" && msg.badge >= 0) aps.badge = Math.floor(msg.badge);
  // Groups a kind's notifications together in Notification Center.
  if (msg.kind) aps["thread-id"] = msg.kind;
  const payload: Record<string, unknown> = { aps };
  if (msg.path && msg.path.startsWith("/") && !msg.path.startsWith("//")) payload.path = msg.path;
  if (msg.kind) payload.kind = msg.kind;
  return payload;
}

export function buildHeaders(cfg: ApnsConfig, msg: ApnsMessage, jwt: string, nowSec: number = Math.floor(Date.now() / 1000)): Record<string, string> {
  const h: Record<string, string> = {
    authorization: `bearer ${jwt}`,
    "apns-topic": cfg.bundleId,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "apns-expiration": String(nowSec + EXPIRY_S),
    "content-type": "application/json",
  };
  if (msg.collapseId) h["apns-collapse-id"] = msg.collapseId.slice(0, 64);
  return h;
}

/** Errors that mean the token itself is useless and should be forgotten. */
export function isDeadToken(status: number, reason?: string): boolean {
  if (status === 410) return true; // Unregistered / ExpiredToken: app uninstalled or token rotated
  return status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic");
}

const otherEnv = (e: ApnsEnvironment): ApnsEnvironment => (e === "production" ? "sandbox" : "production");

// ---------------------------------------------------------------------------
// Transport

interface Attempt { status: number; reason?: string }

// One HTTP/2 connection per gateway, shared by every send in this process and
// closed after a quiet spell. Apple asks providers to keep connections open
// across notifications — a cron that opened one per user would look like a
// connection flood — while an idle socket must not hold a serverless
// invocation (or a test run) open: idle connections are unref'd.
const IDLE_MS = 30_000;
interface Pooled { s: http2.ClientHttp2Session; active: number; idle?: ReturnType<typeof setTimeout> }
const pool = new Map<string, Pooled>();

function drop(origin: string, s: http2.ClientHttp2Session) {
  const e = pool.get(origin);
  if (e?.s === s) { clearTimeout(e.idle); pool.delete(origin); }
}

function acquire(origin: string): http2.ClientHttp2Session {
  let e = pool.get(origin);
  if (!e || e.s.closed || e.s.destroyed) {
    const s = http2.connect(origin);
    s.on("error", () => drop(origin, s)); // surfaced per request
    s.on("goaway", () => drop(origin, s));
    s.on("close", () => drop(origin, s));
    e = { s, active: 0 };
    pool.set(origin, e);
  }
  clearTimeout(e.idle);
  e.active++;
  e.s.ref();
  return e.s;
}

function release(origin: string, s: http2.ClientHttp2Session, broken: boolean) {
  const e = pool.get(origin);
  if (!e || e.s !== s) return;
  e.active = Math.max(0, e.active - 1);
  if (broken) {
    // A timed-out or failed connection is not reused; close() lets any other
    // in-flight stream on it finish first.
    drop(origin, s);
    try { s.close(); } catch { /* ignore */ }
    return;
  }
  if (e.active === 0) {
    s.unref();
    e.idle = setTimeout(() => { drop(origin, s); try { s.close(); } catch { /* ignore */ } }, IDLE_MS);
    e.idle.unref?.();
  }
}

/** Close every pooled APNs connection now (end of a batch, tests). */
export function closeApnsConnections(): void {
  for (const [origin, e] of [...pool]) {
    drop(origin, e.s);
    try { e.s.close(); } catch { /* ignore */ }
    setTimeout(() => { try { e.s.destroy(); } catch { /* ignore */ } }, 1_000).unref?.();
  }
}

function post(s: http2.ClientHttp2Session, token: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<Attempt> {
  return new Promise((resolve) => {
    let settled = false;
    let req: http2.ClientHttp2Stream | undefined;
    const done = (a: Attempt) => { if (!settled) { settled = true; clearTimeout(timer); resolve(a); } };
    const timer = setTimeout(() => {
      try { req?.close(http2.constants.NGHTTP2_CANCEL); } catch { /* ignore */ }
      done({ status: 0, reason: "Timeout" });
    }, timeoutMs);
    try {
      req = s.request({ ":method": "POST", ":path": `/3/device/${token}`, ...headers });
    } catch (e) {
      done({ status: 0, reason: e instanceof Error ? e.message : "RequestFailed" });
      return;
    }
    let status = 0;
    let data = "";
    req.setEncoding("utf8");
    req.on("response", (h) => { status = Number(h[":status"]) || 0; });
    req.on("data", (c: string) => { if (data.length < 4096) data += c; });
    req.on("end", () => {
      let reason: string | undefined;
      if (data) { try { reason = (JSON.parse(data) as { reason?: string }).reason; } catch { /* not JSON */ } }
      done({ status, reason });
    });
    req.on("error", (e) => done({ status: 0, reason: e.message || "StreamError" }));
    req.end(body);
  });
}

export interface SendOptions {
  timeoutMs?: number;
  /** Test hook: replace the gateway origins (e.g. an h2c server on localhost). */
  hosts?: Partial<Record<ApnsEnvironment, string>>;
  now?: number;
}

/**
 * Send one notification to each target. Never throws: every token gets an
 * ApnsResult. A token APNs calls BadDeviceToken is retried once on the other
 * gateway, because a sandbox token sent to production (or the reverse) fails
 * exactly that way — the stored environment is a hint, not a fact.
 */
export async function sendNotifications(cfg: ApnsConfig, targets: ApnsTarget[], msg: ApnsMessage, opts: SendOptions = {}): Promise<ApnsResult[]> {
  const hosts = { ...APNS_HOSTS, ...(opts.hosts ?? {}) };
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify(buildPayload(msg));
  let jwt: string;
  try {
    jwt = providerToken(cfg, opts.now);
  } catch (e) {
    const reason = `InvalidProviderKey: ${e instanceof Error ? e.message : String(e)}`;
    return targets.map((t) => ({ token: t.token, status: 0, ok: false, reason, environment: asEnvironment(t.environment) ?? cfg.defaultEnvironment ?? "production", remove: false }));
  }

  const once = async (token: string, env: ApnsEnvironment): Promise<Attempt> => {
    const origin = hosts[env];
    let s: http2.ClientHttp2Session;
    try { s = acquire(origin); } catch (e) { return { status: 0, reason: e instanceof Error ? e.message : "ConnectFailed" }; }
    const a = await post(s, token, buildHeaders(cfg, msg, jwt), body, timeoutMs);
    release(origin, s, a.status === 0);
    return a;
  };
  const attempt = async (token: string, env: ApnsEnvironment): Promise<Attempt> => {
    let a = await once(token, env);
    if (a.status === 403 && (a.reason === "ExpiredProviderToken" || a.reason === "InvalidProviderToken")) {
      // Our cached token went stale (clock skew, revoked key): re-sign once.
      jwt = providerToken(cfg, opts.now, true);
      a = await once(token, env);
    }
    return a;
  };

  return Promise.all(targets.map(async (t): Promise<ApnsResult> => {
    const env = asEnvironment(t.environment) ?? cfg.defaultEnvironment ?? "production";
    let a = await attempt(t.token, env);
    let used = env;
    if (a.status === 400 && a.reason === "BadDeviceToken") {
      const alt = otherEnv(env);
      const b = await attempt(t.token, alt);
      if (b.status === 200 || !isDeadToken(b.status, b.reason)) { a = b; used = alt; }
    }
    const ok = a.status === 200;
    return {
      token: t.token, status: a.status, ok, reason: ok ? undefined : a.reason, environment: used,
      remove: !ok && isDeadToken(a.status, a.reason),
      movedTo: ok && used !== asEnvironment(t.environment) ? used : undefined,
    };
  }));
}
