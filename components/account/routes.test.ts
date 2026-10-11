// The settings and password routes, against a fake Supabase client. What
// matters most: a paid toggle can't be switched on without the plan, but can
// always be switched off; a missing row is created; errors keep one shape.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

type Result = { data: unknown; error: { code?: string; message: string; status?: number } | null };

const calls: { op: string; table?: string; arg?: unknown }[] = [];
let selectResult: Result;
let updateResult: Result;
let insertResult: Result;
let updateUserResult: { error: { code?: string; message: string; status?: number } | null };

function builder(table: string) {
  let op = "select";
  const b = {
    select(cols?: string) { if (op === "select") calls.push({ op: "select", table, arg: cols }); return b; },
    update(patch: unknown) { op = "update"; calls.push({ op, table, arg: patch }); return b; },
    insert(row: unknown) { op = "insert"; calls.push({ op, table, arg: row }); return b; },
    eq() { return b; },
    maybeSingle: () => Promise.resolve(selectResult),
    then(res: (r: Result) => unknown, rej?: (e: unknown) => unknown) {
      return Promise.resolve(op === "update" ? updateResult : insertResult).then(res, rej);
    },
  };
  return b;
}

const sb = {
  from: (t: string) => builder(t),
  auth: { updateUser: vi.fn(async (attrs: { password: string }) => { void attrs; return updateUserResult; }) },
};

const requireFeature = vi.fn();
vi.mock("@/lib/entitlements", () => ({ requireFeature: (...a: unknown[]) => requireFeature(...a) }));
let authed = true;
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>();
  return {
    ...real,
    requireUser: async () => (authed ? { sb, user: { id: "u1", email: "a@b.co" } } : real.unauthorized()),
  };
});

const settings = await import("@/app/api/settings/route");
const password = await import("@/app/api/account/password/route");

const req = (body: unknown, method = "PATCH") =>
  new Request("http://x/api/settings", { method, headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  calls.length = 0;
  authed = true;
  selectResult = { data: null, error: null };
  updateResult = { data: [{ user_id: "u1" }], error: null };
  insertResult = { data: [{ user_id: "u1" }], error: null };
  updateUserResult = { error: null };
  requireFeature.mockReset();
  requireFeature.mockResolvedValue({ ok: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/settings", () => {
  it("reads explicit columns and answers defaults when there is no row", async () => {
    const res = await settings.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toMatchObject({ scout_interval_minutes: 0, push_enabled: true, voices: "" });
    const sel = calls.find((c) => c.op === "select");
    expect(sel?.arg).not.toBe("*");
    expect(String(sel?.arg)).toContain("push_enabled");
  });

  it("falls back for a database missing the newest columns", async () => {
    let n = 0;
    selectResult = { data: null, error: { code: "42703", message: "column settings.push_enabled does not exist" } };
    const orig = sb.from;
    sb.from = (t: string) => {
      const b = orig(t);
      b.maybeSingle = () => Promise.resolve(n++ === 0 ? selectResult : { data: { scout_interval_minutes: 1440 }, error: null });
      return b;
    };
    const res = await settings.GET();
    sb.from = orig;
    expect(res.status).toBe(200);
    expect((await res.json()).settings).toMatchObject({ scout_interval_minutes: 1440, push_enabled: true });
  });

  it("401s when signed out", async () => {
    authed = false;
    const res = await settings.GET();
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/settings", () => {
  it("checks the plan before turning a paid feature on", async () => {
    requireFeature.mockResolvedValue({ ok: false, response: NextResponse.json({ code: "upgrade_required", error: "This is part of a paid plan." }, { status: 402 }) });
    const res = await settings.PATCH(req({ watch_enabled: true }));
    expect(res.status).toBe(402);
    expect(requireFeature).toHaveBeenCalledWith(sb, { id: "u1", email: "a@b.co" }, "kill_watch");
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("always lets a paid feature be turned off", async () => {
    const res = await settings.PATCH(req({ watch_enabled: false, scout_interval_minutes: 0 }));
    expect(res.status).toBe(200);
    expect(requireFeature).not.toHaveBeenCalled();
    expect(calls.find((c) => c.op === "update")?.arg).toMatchObject({ watch_enabled: false, scout_interval_minutes: 0 });
  });

  it("creates the row when the account has none", async () => {
    updateResult = { data: [], error: null };
    const res = await settings.PATCH(req({ push_enabled: false }));
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.op === "insert")?.arg).toMatchObject({ user_id: "u1", push_enabled: false });
  });

  it("400s on malformed JSON and invalid values, with one error shape", async () => {
    const bad = await settings.PATCH(req("{nope"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "Bad request", code: "bad_request" });
    const tz = await settings.PATCH(req({ timezone: "Nowhere/Land" }));
    expect(tz.status).toBe(400);
    expect((await tz.json()).error).toMatch(/IANA/);
  });

  it("doesn't leak database error text", async () => {
    updateResult = { data: null, error: { code: "XX000", message: "relation secret_internal does not exist" } };
    const res = await settings.PATCH(req({ push_enabled: true }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret_internal");
  });
});

describe("POST /api/account/password", () => {
  const post = (body: unknown) => password.POST(req(body, "POST"));

  it("enforces the minimum length", async () => {
    const res = await post({ password: "short" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Use at least 8 characters.", code: "weak_password" });
    expect(sb.auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password", async () => {
    const res = await post({ password: "correct horse" });
    expect(res.status).toBe(200);
    expect(sb.auth.updateUser).toHaveBeenCalledWith({ password: "correct horse" });
  });

  it("explains the common Supabase refusals", async () => {
    updateUserResult = { error: { code: "same_password", message: "New password should be different" } };
    expect((await (await post({ password: "correct horse" })).json()).error).toMatch(/current password/);
    updateUserResult = { error: { code: "reauthentication_needed", message: "x", status: 401 } };
    expect((await post({ password: "correct horse" })).status).toBe(403);
  });

  it("rejects non-string and malformed bodies", async () => {
    expect((await post({ password: 12345678 })).status).toBe(400);
    expect((await post("{")).status).toBe(400);
  });
});
