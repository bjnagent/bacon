import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import {
  apnsConfigFromEnv, buildHeaders, buildPayload, closeApnsConnections, isDeadToken, normalizePem, providerToken, resetApnsCaches,
  sendNotifications, signJwt, type ApnsConfig,
} from "./apns";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const cfg: ApnsConfig = { keyId: "ABC123DEFG", teamId: "TEAM123456", privateKey: PEM, bundleId: "app.bacon.research" };
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

function verifyJwt(jwt: string, key: KeyObject): boolean {
  const [h, c, s] = jwt.split(".");
  return verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
}

beforeEach(() => resetApnsCaches());

describe("normalizePem", () => {
  const body = PEM.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  it("accepts a real PEM unchanged (plus trailing newline)", () => {
    expect(normalizePem(PEM).trim()).toBe(PEM.trim());
  });
  it("unescapes \\n one-liners from env vars", () => {
    const oneLine = PEM.trim().replace(/\n/g, "\\n");
    expect(normalizePem(`"${oneLine}"`).trim()).toBe(PEM.trim());
  });
  it("wraps a bare base64 body", () => {
    const pem = normalizePem(body);
    expect(pem.startsWith("-----BEGIN PRIVATE KEY-----\n")).toBe(true);
    // The wrapped key is usable.
    expect(verifyJwt(signJwt({ ...cfg, privateKey: pem }), publicKey)).toBe(true);
  });
});

describe("apnsConfigFromEnv", () => {
  it("is null unless every variable is present", () => {
    expect(apnsConfigFromEnv({})).toBeNull();
    expect(apnsConfigFromEnv({ APNS_KEY_ID: "k", APNS_TEAM_ID: "t", APNS_PRIVATE_KEY: PEM })).toBeNull();
  });
  it("falls back to CAP_APP_ID for the topic and reads APNS_ENV", () => {
    const c = apnsConfigFromEnv({ APNS_KEY_ID: "k", APNS_TEAM_ID: "t", APNS_PRIVATE_KEY: PEM, CAP_APP_ID: "x.y.z", APNS_ENV: "sandbox" });
    expect(c).toMatchObject({ keyId: "k", teamId: "t", bundleId: "x.y.z", defaultEnvironment: "sandbox" });
    const d = apnsConfigFromEnv({ APNS_KEY_ID: "k", APNS_TEAM_ID: "t", APNS_PRIVATE_KEY: PEM, APNS_BUNDLE_ID: "a.b", CAP_APP_ID: "x.y.z" });
    expect(d?.bundleId).toBe("a.b");
    expect(d?.defaultEnvironment).toBeUndefined();
  });
});

describe("provider token (ES256 JWT)", () => {
  it("has the APNs header and claims and a valid P-256 signature", () => {
    const jwt = signJwt(cfg, 1_700_000_000);
    const [h, c] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(decode(c)).toEqual({ iss: "TEAM123456", iat: 1_700_000_000 });
    expect(Buffer.from(jwt.split(".")[2], "base64url")).toHaveLength(64); // raw r||s, not DER
    expect(verifyJwt(jwt, publicKey)).toBe(true);
  });

  it("is cached for ~50 minutes, then re-signed", () => {
    const t0 = 1_700_000_000_000;
    const a = providerToken(cfg, t0);
    expect(providerToken(cfg, t0 + 49 * 60_000)).toBe(a);
    const b = providerToken(cfg, t0 + 51 * 60_000);
    expect(b).not.toBe(a);
    expect(decode(b.split(".")[1]).iat).toBe(Math.floor((t0 + 51 * 60_000) / 1000));
    expect(providerToken(cfg, t0 + 52 * 60_000, true)).not.toBe(b);
  });
});

describe("payload + headers", () => {
  it("builds aps.alert with sound, thread and the in-app path beside aps", () => {
    expect(buildPayload({ title: "Brief ready", body: "3 ideas", path: "/", kind: "brief" })).toEqual({
      aps: { alert: { title: "Brief ready", body: "3 ideas" }, sound: "default", "thread-id": "brief" },
      path: "/",
      kind: "brief",
    });
  });
  it("adds a badge only when given, drops non-app paths, clips long text", () => {
    const p = buildPayload({ title: "t".repeat(500), body: "b".repeat(5000), path: "https://evil.example", badge: 3 });
    const aps = p.aps as { alert: { title: string; body: string }; badge: number };
    expect(aps.badge).toBe(3);
    expect(p.path).toBeUndefined();
    expect(aps.alert.title.length).toBeLessThanOrEqual(120);
    expect(aps.alert.body.length).toBeLessThanOrEqual(600);
    expect(buildPayload({ title: "x", body: "y", path: "//evil" }).path).toBeUndefined();
    expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThan(4096);
  });
  it("sends the headers APNs requires", () => {
    const h = buildHeaders(cfg, { title: "x", body: "y", collapseId: "brief" }, "JWT", 1000);
    expect(h).toMatchObject({
      authorization: "bearer JWT",
      "apns-topic": "app.bacon.research",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": "brief",
      "apns-expiration": String(1000 + 86400),
    });
  });
});

describe("isDeadToken", () => {
  it("treats 410 and bad/foreign tokens as dead, everything else as transient", () => {
    expect(isDeadToken(410, "Unregistered")).toBe(true);
    expect(isDeadToken(400, "BadDeviceToken")).toBe(true);
    expect(isDeadToken(400, "DeviceTokenNotForTopic")).toBe(true);
    expect(isDeadToken(400, "PayloadTooLarge")).toBe(false);
    expect(isDeadToken(403, "ExpiredProviderToken")).toBe(false);
    expect(isDeadToken(429, "TooManyRequests")).toBe(false);
    expect(isDeadToken(500)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End to end against two local HTTP/2 (h2c) servers standing in for the
// production and sandbox gateways.

type Behaviour = (token: string, headers: http2.IncomingHttpHeaders) => { status: number; reason?: string } | "hang";
interface Gateway { origin: string; server: http2.Http2Server; seen: { token: string; headers: http2.IncomingHttpHeaders; body: string }[]; behave: Behaviour }

async function gateway(): Promise<Gateway> {
  const gw = { seen: [], behave: () => ({ status: 200 }) } as unknown as Gateway;
  gw.server = http2.createServer();
  gw.server.on("stream", (stream, headers) => {
    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (c: string) => { body += c; });
    stream.on("end", () => {
      const token = String(headers[":path"]).replace("/3/device/", "");
      gw.seen.push({ token, headers, body });
      const r = gw.behave(token, headers);
      if (r === "hang") return;
      stream.respond({ ":status": r.status, "content-type": "application/json" });
      stream.end(r.status === 200 ? "" : JSON.stringify({ reason: r.reason }));
    });
    stream.on("error", () => {});
  });
  await new Promise<void>((resolve) => gw.server.listen(0, "127.0.0.1", resolve));
  gw.origin = `http://127.0.0.1:${(gw.server.address() as AddressInfo).port}`;
  return gw;
}

describe("sendNotifications", () => {
  let prod: Gateway;
  let sandbox: Gateway;
  const hosts = () => ({ production: prod.origin, sandbox: sandbox.origin });

  beforeAll(async () => { prod = await gateway(); sandbox = await gateway(); });
  afterAll(async () => {
    closeApnsConnections();
    await Promise.all([prod, sandbox].map((g) => new Promise((r) => g.server.close(r))));
  });
  beforeEach(() => {
    for (const g of [prod, sandbox]) { g.seen = []; g.behave = () => ({ status: 200 }); }
  });

  it("delivers to each token on its stored gateway with a signed bearer token", async () => {
    const r = await sendNotifications(cfg, [{ token: TOKEN_A, environment: "production" }, { token: TOKEN_B, environment: "sandbox" }],
      { title: "Kill condition hit", body: "NVDA closed below 95", path: "/analyze/NVDA", kind: "kill" }, { hosts: hosts() });
    expect(r.map((x) => [x.token, x.ok, x.environment, x.remove])).toEqual([[TOKEN_A, true, "production", false], [TOKEN_B, true, "sandbox", false]]);
    expect(prod.seen.map((s) => s.token)).toEqual([TOKEN_A]);
    expect(sandbox.seen.map((s) => s.token)).toEqual([TOKEN_B]);
    const { headers, body } = prod.seen[0];
    expect(headers["apns-topic"]).toBe("app.bacon.research");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["apns-priority"]).toBe("10");
    expect(verifyJwt(String(headers.authorization).replace(/^bearer /, ""), publicKey)).toBe(true);
    expect(JSON.parse(body)).toMatchObject({ aps: { alert: { title: "Kill condition hit" } }, path: "/analyze/NVDA", kind: "kill" });
  });

  it("reuses one connection per gateway across sends", async () => {
    let connections = 0;
    const onConn = () => { connections++; };
    prod.server.on("session", onConn);
    try {
      closeApnsConnections();
      for (let i = 0; i < 3; i++) {
        await sendNotifications(cfg, [{ token: TOKEN_A, environment: "production" }], { title: "x", body: "y" }, { hosts: hosts() });
      }
      expect(prod.seen).toHaveLength(3);
      expect(connections).toBe(1);
    } finally {
      prod.server.off("session", onConn);
    }
  });

  it("flags uninstalled tokens (410) for removal", async () => {
    prod.behave = () => ({ status: 410, reason: "Unregistered" });
    const [r] = await sendNotifications(cfg, [{ token: TOKEN_A, environment: "production" }], { title: "x", body: "y" }, { hosts: hosts() });
    expect(r).toMatchObject({ ok: false, status: 410, reason: "Unregistered", remove: true });
  });

  it("retries BadDeviceToken on the other gateway and reports the move", async () => {
    prod.behave = () => ({ status: 400, reason: "BadDeviceToken" });
    const [r] = await sendNotifications(cfg, [{ token: TOKEN_A, environment: "production" }], { title: "x", body: "y" }, { hosts: hosts() });
    expect(r).toMatchObject({ ok: true, environment: "sandbox", movedTo: "sandbox", remove: false });
    expect(sandbox.seen).toHaveLength(1);
  });

  it("removes a token both gateways reject", async () => {
    prod.behave = () => ({ status: 400, reason: "BadDeviceToken" });
    sandbox.behave = () => ({ status: 400, reason: "BadDeviceToken" });
    const [r] = await sendNotifications(cfg, [{ token: TOKEN_A, environment: "production" }], { title: "x", body: "y" }, { hosts: hosts() });
    expect(r).toMatchObject({ ok: false, reason: "BadDeviceToken", remove: true });
  });

  it("uses APNS_ENV only for tokens without a stored environment", async () => {
    const r = await sendNotifications({ ...cfg, defaultEnvironment: "sandbox" },
      [{ token: TOKEN_A, environment: null }, { token: TOKEN_B, environment: "production" }], { title: "x", body: "y" }, { hosts: hosts() });
    expect(sandbox.seen.map((s) => s.token)).toEqual([TOKEN_A]);
    expect(prod.seen.map((s) => s.token)).toEqual([TOKEN_B]);
    // An unknown stored environment that worked on the default is recorded.
    expect(r[0]).toMatchObject({ ok: true, environment: "sandbox", movedTo: "sandbox" });
    expect(r[1]).toMatchObject({ ok: true, environment: "production", movedTo: undefined });
  });

  it("re-signs once when APNs says the provider token expired", async () => {
    let calls = 0;
    prod.behave = () => (++calls === 1 ? { status: 403, reason: "ExpiredProviderToken" } : { status: 200 });
    const [r] = await sendNotifications(cfg, [{ token: TOKEN_A, environment: "production" }], { title: "x", body: "y" }, { hosts: hosts(), now: Date.now() });
    expect(r.ok).toBe(true);
    expect(prod.seen).toHaveLength(2);
  });

  it("times out without throwing and keeps the token", async () => {
    prod.behave = () => "hang";
    const [r] = await sendNotifications(cfg, [{ token: TOKEN_A, environment: "production" }], { title: "x", body: "y" }, { hosts: hosts(), timeoutMs: 150 });
    expect(r).toMatchObject({ ok: false, status: 0, reason: "Timeout", remove: false });
  });

  it("reports an unusable signing key per token instead of throwing", async () => {
    const r = await sendNotifications({ ...cfg, privateKey: "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----\n" },
      [{ token: TOKEN_A }], { title: "x", body: "y" }, { hosts: hosts() });
    expect(r[0]).toMatchObject({ ok: false, status: 0, remove: false });
    expect(r[0].reason).toMatch(/InvalidProviderKey/);
  });

  it("survives an unreachable gateway", async () => {
    const r = await sendNotifications(cfg, [{ token: TOKEN_A, environment: "production" }], { title: "x", body: "y" },
      { hosts: { production: "http://127.0.0.1:9", sandbox: "http://127.0.0.1:9" }, timeoutMs: 2000 });
    expect(r[0]).toMatchObject({ ok: false, status: 0, remove: false });
  });
});
