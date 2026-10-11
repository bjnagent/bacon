import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// The per-account fallback calls getPlanStateAdmin, which builds its own
// service-role client; stand it in so the fallback path runs without a DB.
const getPlanStateAdmin = vi.fn();
vi.mock("@/lib/entitlements", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/entitlements")>();
  return { ...real, getPlanStateAdmin: (...a: Parameters<typeof real.getPlanStateAdmin>) => getPlanStateAdmin(...a) };
});

import { resolvePlan, type PlanState } from "@/lib/entitlements";
import {
  accountFromRow, briefPushBody, emailFor, entitled, hasFeature, houseUserId, isDue, killPushMessage, loadCronAccounts, mapPool,
  type CronAccount,
} from "./accounts";

const NOW = new Date("2026-10-11T12:00:00Z");
const DAY = 86_400_000;
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const HOUSE = "44444444-4444-4444-8444-444444444444";

const iso = (ms: number) => new Date(ms).toISOString();
const plan = (p: Partial<PlanState>): PlanState => ({
  plan: "free", source: "free", status: "free", provider: null, interval: null, periodEnd: null,
  cancelAtPeriodEnd: false, trialEndsAt: null, usage: {}, resetsAt: iso(NOW.getTime()), ...p,
});
const acct = (userId: string, p: Partial<PlanState>, email: string | null | undefined = null): CronAccount => ({ userId, email, plan: plan(p) });

const row = (o: Record<string, unknown>) => ({
  user_id: U1, email: "a@x.test", created_at: iso(NOW.getTime() - 60 * DAY),
  plan: null, status: null, provider: null, current_period_end: null, cancel_at_period_end: null, billing_interval: null, ...o,
}) as Parameters<typeof accountFromRow>[0];

let prevAdmins: string | undefined;
beforeEach(() => { prevAdmins = process.env.ADMIN_EMAILS; process.env.ADMIN_EMAILS = "ops@bacon.test"; getPlanStateAdmin.mockReset(); });
afterEach(() => { if (prevAdmins === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prevAdmins; });

describe("entitled — who the nightly jobs run for", () => {
  it("free accounts get neither the personal sweep nor the kill watch", () => {
    const a = acct(U1, { plan: "free", source: "free" });
    expect(entitled(a, "personal_brief", null)).toBe(false);
    expect(entitled(a, "kill_watch", null)).toBe(false);
  });

  it("Pro and Desk subscribers get both", () => {
    for (const p of ["pro", "desk"] as const) {
      const a = acct(U1, { plan: p, source: "subscription", status: "active" });
      expect(entitled(a, "personal_brief", null)).toBe(true);
      expect(entitled(a, "kill_watch", null)).toBe(true);
    }
  });

  it("the reverse trial (Pro) is swept — it's the aha moment", () => {
    expect(entitled(acct(U1, { plan: "pro", source: "trial", status: "trialing" }), "personal_brief", null)).toBe(true);
  });

  it("the operator and the fail-open fallback are always in", () => {
    expect(entitled(acct(U1, { plan: "desk", source: "operator" }), "personal_brief", null)).toBe(true);
    expect(entitled(acct(U1, { plan: "desk", source: "fallback" }), "kill_watch", null)).toBe(true);
  });

  it("the house account always runs, whatever its plan", () => {
    const house = acct(HOUSE, { plan: "free", source: "free" });
    expect(entitled(house, "personal_brief", HOUSE)).toBe(true);
    expect(entitled(house, "kill_watch", HOUSE)).toBe(true);
    expect(entitled(house, "personal_brief", null)).toBe(false);
    expect(entitled(acct(U1, { plan: "free" }), "personal_brief", HOUSE)).toBe(false);
  });

  it("a settings row with no account behind it never runs", () => {
    expect(entitled(undefined, "personal_brief", HOUSE)).toBe(false);
  });

  it("hasFeature gates delivery channels by plan", () => {
    expect(hasFeature(plan({ plan: "free" }), "email_brief")).toBe(false);
    expect(hasFeature(plan({ plan: "pro", source: "subscription" }), "push_alerts")).toBe(true);
    expect(hasFeature(plan({ plan: "free", source: "operator" }), "push_alerts")).toBe(true);
  });
});

describe("houseUserId", () => {
  it("accepts a uuid, normalised; rejects anything else", () => {
    expect(houseUserId({ HOUSE_USER_ID: ` ${HOUSE.toUpperCase()} ` })).toBe(HOUSE);
    expect(houseUserId({ HOUSE_USER_ID: "not-a-uuid" })).toBeNull();
    expect(houseUserId({})).toBeNull();
  });
});

describe("isDue — sweep cadence", () => {
  const t = NOW.getTime();
  const H = 3_600_000;

  it("a daily account is due on the next daily run even when that run starts a little earlier", () => {
    // Swept at 13:00:27 yesterday; today's cron reached it at 13:00:05.
    expect(isDue(iso(t - DAY + 22_000), DAY, t)).toBe(true);
    // Vercel may fire anywhere in the hour: 13:55 yesterday, 13:02 today.
    expect(isDue(iso(t - DAY + 53 * 60_000), DAY, t)).toBe(true);
  });

  it("is not due twice in one day (a manual re-run after the nightly one sweeps nobody)", () => {
    expect(isDue(iso(t - 2 * H), DAY, t)).toBe(false);
    expect(isDue(iso(t - 20 * H), DAY, t)).toBe(false);
  });

  it("never-swept or unreadable timestamps are due", () => {
    expect(isDue(null, DAY, t)).toBe(true);
    expect(isDue("not a date", DAY, t)).toBe(true);
  });

  it("caps the slack at half the cadence for short cadences, and keeps longer ones honest", () => {
    expect(isDue(iso(t - 2 * H), 4 * H, t)).toBe(true);
    expect(isDue(iso(t - 1 * H), 4 * H, t)).toBe(false);
    expect(isDue(iso(t - 6 * DAY), 7 * DAY, t)).toBe(false);
    expect(isDue(iso(t - 7 * DAY + 10 * 60_000), 7 * DAY, t)).toBe(true);
  });
});

describe("accountFromRow — resolves exactly like the request path", () => {
  it("a live paid subscription", () => {
    const a = accountFromRow(row({ plan: "desk", status: "active", provider: "stripe", current_period_end: iso(NOW.getTime() + 10 * DAY), billing_interval: "year" }), NOW);
    expect(a.plan).toMatchObject({ plan: "desk", source: "subscription", provider: "stripe", interval: "year" });
    expect(a.email).toBe("a@x.test");
  });

  it("a canceled subscription on an old account is free", () => {
    const a = accountFromRow(row({ plan: "pro", status: "canceled", provider: "stripe" }), NOW);
    expect(a.plan).toMatchObject({ plan: "free", source: "free" });
  });

  it("a new account with no subscription is on the reverse trial", () => {
    const a = accountFromRow(row({ created_at: iso(NOW.getTime() - 2 * DAY) }), NOW);
    expect(a.plan).toMatchObject({ plan: "pro", source: "trial" });
  });

  it("the operator allowlist is matched by the email the RPC returns", () => {
    const a = accountFromRow(row({ email: "OPS@bacon.test" }), NOW);
    expect(a.plan.source).toBe("operator");
  });

  it("matches resolvePlan for the same inputs", () => {
    const r = row({ plan: "pro", status: "past_due", provider: "app_store", current_period_end: iso(NOW.getTime() - DAY), cancel_at_period_end: true });
    const expected = resolvePlan({
      email: r.email, createdAt: r.created_at, now: NOW,
      subscription: { plan: "pro", status: "past_due", provider: "app_store", current_period_end: r.current_period_end, cancel_at_period_end: true, billing_interval: null },
    });
    expect(accountFromRow(r, NOW).plan).toEqual(expected);
  });
});

describe("loadCronAccounts", () => {
  it("resolves every candidate in one RPC round trip", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        row({ user_id: U1, plan: "pro", status: "active", provider: "stripe", current_period_end: iso(NOW.getTime() + 5 * DAY) }),
        row({ user_id: U2 }),
      ],
      error: null,
    }));
    const getUserById = vi.fn();
    const admin = { rpc, auth: { admin: { getUserById } } } as unknown as SupabaseClient;
    const { accounts, via } = await loadCronAccounts(admin, [U1, U2, U1, U3], NOW);
    expect(via).toBe("rpc");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("cron_accounts", { p_ids: [U1, U2, U3] });
    expect(getUserById).not.toHaveBeenCalled();
    expect(accounts.get(U1)?.plan.plan).toBe("pro");
    expect(accounts.get(U2)?.plan.plan).toBe("free");
    expect(accounts.has(U3)).toBe(false); // no auth user → not entitled to anything
  });

  it("does nothing for no candidates", async () => {
    const rpc = vi.fn();
    const { accounts } = await loadCronAccounts({ rpc } as unknown as SupabaseClient, []);
    expect(accounts.size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falls back to per-account lookups before the RPC exists, fetching emails only for the operator check", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "Could not find the function public.cron_accounts" } }));
    const getUserById = vi.fn(async (id: string) => ({ data: { user: { email: id === U1 ? "ops@bacon.test" : "b@x.test" } } }));
    getPlanStateAdmin.mockImplementation(async (_id: string, email: string | null) => resolvePlan({ email, subscription: null, createdAt: null, now: NOW }));
    const admin = { rpc, auth: { admin: { getUserById } } } as unknown as SupabaseClient;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { accounts, via } = await loadCronAccounts(admin, [U1, U2], NOW);
    warn.mockRestore();
    expect(via).toBe("fallback");
    expect(getUserById).toHaveBeenCalledTimes(2);
    expect(getPlanStateAdmin).toHaveBeenCalledWith(U1, "ops@bacon.test");
    expect(accounts.get(U1)?.plan.source).toBe("operator");
    expect(accounts.get(U2)?.plan.source).toBe("free");
  });

  it("skips the email lookups entirely when no operator allowlist is configured", async () => {
    delete process.env.ADMIN_EMAILS;
    const rpc = vi.fn(async () => ({ data: null, error: { message: "missing" } }));
    const getUserById = vi.fn();
    getPlanStateAdmin.mockResolvedValue(plan({ plan: "desk", source: "fallback" }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { accounts } = await loadCronAccounts({ rpc, auth: { admin: { getUserById } } } as unknown as SupabaseClient, [U1], NOW);
    warn.mockRestore();
    expect(getUserById).not.toHaveBeenCalled();
    expect(accounts.get(U1)?.email).toBeUndefined();
    expect(getPlanStateAdmin).toHaveBeenCalledWith(U1, null);
  });
});

describe("emailFor", () => {
  it("uses the email already resolved, else looks it up once", async () => {
    const getUserById = vi.fn(async () => ({ data: { user: { email: "late@x.test" } } }));
    const admin = { auth: { admin: { getUserById } } } as unknown as SupabaseClient;
    expect(await emailFor(admin, acct(U1, {}, "known@x.test"))).toBe("known@x.test");
    expect(await emailFor(admin, acct(U1, {}, null))).toBeNull();
    const a: CronAccount = { userId: U2, email: undefined, plan: plan({}) };
    expect(await emailFor(admin, a)).toBe("late@x.test");
    expect(await emailFor(admin, a)).toBe("late@x.test");
    expect(getUserById).toHaveBeenCalledTimes(1);
  });
});

describe("mapPool", () => {
  it("never runs more than `size` at once, and keeps result order", async () => {
    let inFlight = 0, peak = 0;
    const out = await mapPool([50, 10, 30, 5, 20, 1], 3, async (ms, i) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBe(3);
  });

  it("handles empty input and a pool larger than the work", async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
    expect(await mapPool([1, 2], 10, async (x) => x * 2)).toEqual([2, 4]);
  });
});

describe("push copy", () => {
  const item = (name: string, ticker: string) => ({ name, ticker }) as Parameters<typeof briefPushBody>[0]["items"][number];

  it("names the lead idea and counts the rest", () => {
    expect(briefPushBody({ items: [item("Cameco", "CCJ"), item("Copper", "HG"), item("TLT", "TLT")] })).toBe("Cameco (CCJ) and 2 more ideas in today's brief.");
    expect(briefPushBody({ items: [item("Cameco", "CCJ"), item("Copper", "HG")] })).toBe("Cameco (CCJ) and 1 more idea in today's brief.");
    expect(briefPushBody({ items: [item("Gold", "—")] })).toBe("Gold — today's one idea.");
    expect(briefPushBody({ items: [] })).toBe("Today's brief is ready.");
  });

  it("doesn't repeat a ticker that is the name", () => {
    expect(briefPushBody({ items: [item("TLT", "TLT")] })).toBe("TLT — today's one idea.");
  });

  it("kill alerts: one names it, several list up to three", () => {
    expect(killPushMessage([{ ticker: "CCJ", name: "Cameco" }])).toEqual({
      title: "A kill condition may have triggered", body: "CCJ — re-check the thesis before relying on it.",
    });
    const many = killPushMessage([{ ticker: "A" }, { ticker: "—", name: "Copper" }, { ticker: "C" }, { ticker: "D" }]);
    expect(many.title).toBe("4 kill conditions may have triggered");
    expect(many.body).toBe("A, Copper, C and 1 more — re-check before relying on them.");
  });
});
