import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Fake Supabase admin client: records writes, serves canned reads.
const db = vi.hoisted(() => ({
  settings: null as { push_enabled?: boolean | null } | null,
  tokens: [] as { token: string; environment: string | null }[],
  deleted: [] as string[],
  updated: [] as { token: string; environment: string }[],
}));

vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain, eq: chain, order: chain, limit: chain,
        maybeSingle: async () => ({ data: table === "settings" ? db.settings : null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: table === "device_tokens" ? db.tokens : null, error: null }).then(res),
        delete: () => ({ in: (_c: string, list: string[]) => ({ then: (res: (v: unknown) => unknown) => { db.deleted.push(...list); return Promise.resolve({ error: null }).then(res); } }) }),
        update: (patch: { environment: string }) => ({ eq: (_c: string, token: string) => ({ then: (res: (v: unknown) => unknown) => { db.updated.push({ token, environment: patch.environment }); return Promise.resolve({ error: null }).then(res); } }) }),
      });
      return q;
    },
  }),
}));

const send = vi.hoisted(() => vi.fn());
vi.mock("./apns", async (orig) => ({ ...(await orig<typeof import("./apns")>()), sendNotifications: send }));
vi.mock("./log", () => ({ swallowed: vi.fn() }));

import { normalizeDeviceToken, notifyUser, parseRegistration } from "./push";

const HEX = "ab".repeat(32);
const ENV_KEYS = ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY", "APNS_BUNDLE_ID", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const saved: Partial<Record<string, string | undefined>> = {};

describe("device token validation", () => {
  it("accepts 64–200 hex chars, normalised to lower case", () => {
    expect(normalizeDeviceToken(HEX.toUpperCase())).toBe(HEX);
    expect(normalizeDeviceToken(` <${HEX}> `)).toBe(HEX);
    expect(normalizeDeviceToken("ab".repeat(100))).toBe("ab".repeat(100));
  });
  it("rejects anything else", () => {
    for (const bad of [undefined, null, 42, "", "ab".repeat(31), "a".repeat(201), "zz".repeat(32), `${HEX};drop`]) {
      expect(normalizeDeviceToken(bad)).toBeNull();
    }
  });
  it("parses a registration body, defaulting the environment to production", () => {
    expect(parseRegistration({ token: HEX, environment: "sandbox" })).toEqual({ token: HEX, environment: "sandbox" });
    expect(parseRegistration({ token: HEX })).toEqual({ token: HEX, environment: "production" });
    expect(parseRegistration({ token: HEX, environment: "development" })).toHaveProperty("error");
    expect(parseRegistration({ token: "nope" })).toHaveProperty("error");
    expect(parseRegistration(null)).toHaveProperty("error");
  });
});

describe("notifyUser", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.APNS_KEY_ID = "KEY";
    process.env.APNS_TEAM_ID = "TEAM";
    process.env.APNS_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----";
    process.env.APNS_BUNDLE_ID = "app.bacon.research";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    db.settings = null;
    db.tokens = [{ token: HEX, environment: "production" }, { token: "cd".repeat(32), environment: "sandbox" }];
    db.deleted = [];
    db.updated = [];
    send.mockReset();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it("is a no-op returning 0 when APNs isn't configured", async () => {
    delete process.env.APNS_PRIVATE_KEY;
    expect(await notifyUser("u1", { title: "x", body: "y" })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("respects the user's push switch", async () => {
    db.settings = { push_enabled: false };
    expect(await notifyUser("u1", { title: "x", body: "y" })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends to every device, prunes dead tokens and records gateway moves", async () => {
    send.mockResolvedValue([
      { token: HEX, ok: false, status: 410, environment: "production", remove: true },
      { token: "cd".repeat(32), ok: true, status: 200, environment: "production", remove: false, movedTo: "production" },
    ]);
    const n = await notifyUser("u1", { title: "Your brief is ready", body: "3 ideas", path: "/", kind: "brief" });
    expect(n).toBe(1);
    const [, targets, msg] = send.mock.calls[0];
    expect(targets).toHaveLength(2);
    expect(msg).toMatchObject({ title: "Your brief is ready", path: "/", kind: "brief", collapseId: "brief" });
    expect(db.deleted).toEqual([HEX]);
    expect(db.updated).toEqual([{ token: "cd".repeat(32), environment: "production" }]);
  });

  it("never throws, even when sending blows up", async () => {
    send.mockRejectedValue(new Error("boom"));
    await expect(notifyUser("u1", { title: "x", body: "y" })).resolves.toBe(0);
  });

  it("returns 0 when the account has no devices", async () => {
    db.tokens = [];
    expect(await notifyUser("u1", { title: "x", body: "y" })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
