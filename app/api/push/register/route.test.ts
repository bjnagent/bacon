import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const calls = vi.hoisted(() => ({
  upserts: [] as { client: string; row: Record<string, unknown>; opts: unknown }[],
  deletes: [] as { filters: [string, unknown][] }[],
  user: { id: "user-1", email: "a@b.c" } as { id: string; email: string } | null,
  upsertError: null as null | { message: string },
}));

function fakeClient(name: string) {
  return {
    from: () => ({
      upsert: async (row: Record<string, unknown>, opts: unknown) => { calls.upserts.push({ client: name, row, opts }); return { error: calls.upsertError }; },
      delete: () => {
        const entry = { filters: [] as [string, unknown][] };
        calls.deletes.push(entry);
        const q = {
          eq(col: string, v: unknown) { entry.filters.push([col, v]); return q; },
          then(res: (v: unknown) => unknown) { return Promise.resolve({ error: null }).then(res); },
        };
        return q;
      },
    }),
  };
}

vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/api")>();
  return {
    ...actual,
    requireUser: vi.fn(async () => (calls.user ? { sb: fakeClient("user"), user: calls.user } : actual.unauthorized())),
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient("admin") }));
vi.mock("@/lib/log", () => ({ swallowed: vi.fn() }));

import { POST, DELETE } from "./route";

const HEX = "0f".repeat(32);
const req = (method: string, body: unknown) =>
  new Request("http://localhost/api/push/register", { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };

beforeEach(() => {
  calls.upserts = []; calls.deletes = []; calls.user = { id: "user-1", email: "a@b.c" }; calls.upsertError = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
});
afterEach(() => {
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
});

describe("POST /api/push/register", () => {
  it("401s without a session", async () => {
    calls.user = null;
    const res = await POST(req("POST", { token: HEX, environment: "production" }));
    expect(res.status).toBe(401);
    expect(calls.upserts).toHaveLength(0);
  });

  it("400s on a malformed body, token or environment", async () => {
    for (const body of ["{not json", { environment: "production" }, { token: "xyz", environment: "production" }, { token: HEX, environment: "dev" }, { token: "ab".repeat(20) }]) {
      const res = await POST(req("POST", body));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "bad_request" });
    }
    expect(calls.upserts).toHaveLength(0);
  });

  it("upserts on the token (moving it to this account) via the service role", async () => {
    const res = await POST(req("POST", { token: HEX.toUpperCase(), environment: "sandbox" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls.upserts).toHaveLength(1);
    const { client, row, opts } = calls.upserts[0];
    expect(client).toBe("admin");
    expect(opts).toEqual({ onConflict: "token" });
    expect(row).toMatchObject({ user_id: "user-1", token: HEX, platform: "ios", environment: "sandbox" });
    expect(typeof row.last_seen_at).toBe("string");
  });

  it("falls back to the user's own client when no service role is configured", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await POST(req("POST", { token: HEX }));
    expect(res.status).toBe(200);
    expect(calls.upserts[0]).toMatchObject({ client: "user", row: { environment: "production" } });
  });

  it("500s with a readable error when the write fails", async () => {
    calls.upsertError = { message: "rls" };
    const res = await POST(req("POST", { token: HEX, environment: "production" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/register/);
  });
});

describe("DELETE /api/push/register", () => {
  it("removes only the caller's own token", async () => {
    const res = await DELETE(req("DELETE", { token: HEX }));
    expect(res.status).toBe(200);
    expect(calls.deletes[0].filters).toEqual([["token", HEX], ["user_id", "user-1"]]);
  });
  it("validates the token and the session", async () => {
    expect((await DELETE(req("DELETE", { token: "nope" }))).status).toBe(400);
    calls.user = null;
    const res = await DELETE(req("DELETE", { token: HEX }));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });
});
