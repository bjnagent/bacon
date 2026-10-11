import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextPlanForCap, capMessage, isDuplicate, overCap } from "./caps";
import { PLANS } from "@/lib/plans";

describe("nextPlanForCap", () => {
  it("offers the next plan up with a bigger list", () => {
    expect(nextPlanForCap("watchlistMax", "free")).toBe("pro");
    expect(nextPlanForCap("themesMax", "free")).toBe("pro");
    expect(nextPlanForCap("watchlistMax", "pro")).toBe("desk");
  });
  it("offers nothing from the top plan", () => {
    expect(nextPlanForCap("watchlistMax", "desk")).toBeNull();
    expect(nextPlanForCap("themesMax", "desk")).toBeNull();
  });
  it("only ever suggests a plan whose cap is genuinely larger", () => {
    for (const kind of ["watchlistMax", "themesMax"] as const) {
      for (const plan of ["free", "pro"] as const) {
        const next = nextPlanForCap(kind, plan);
        if (next) expect(PLANS[next][kind]).toBeGreaterThan(PLANS[plan][kind]);
      }
    }
  });
});

describe("capMessage", () => {
  it("states the count, the cap and the plan in plain words", () => {
    expect(capMessage("watchlistMax", 5, 5, "free")).toBe("You're tracking 5 of 5 names on Free.");
    expect(capMessage("themesMax", 3, 3, "free")).toBe("You're following 3 of 3 themes on Free.");
  });
  it("singularises a cap of one", () => {
    expect(capMessage("watchlistMax", 1, 1, "free")).toBe("You're tracking 1 of 1 name on Free.");
  });
});

describe("isDuplicate", () => {
  it("recognises Postgres unique violations only", () => {
    expect(isDuplicate({ code: "23505" })).toBe(true);
    expect(isDuplicate({ code: "42501" })).toBe(false);
    expect(isDuplicate(null)).toBe(false);
  });
});

// A stand-in client: my_plan_state answers with the given account, and the
// head-count query with the given row count (or an error).
function fakeSb(opts: { createdDaysAgo: number; count: number | null; countError?: boolean }) {
  const created = new Date(Date.now() - opts.createdDaysAgo * 86_400_000).toISOString();
  return {
    rpc: async () => ({ data: { subscription: null, created_at: created, usage: {} }, error: null }),
    from: () => ({
      select: async () => (opts.countError ? { count: null, error: { message: "boom" } } : { count: opts.count, error: null }),
    }),
  } as unknown as SupabaseClient;
}
const user = { id: "u1", email: "member@example.com" };

describe("overCap", () => {
  it("answers 402 upgrade_required with the plan, the cap and the next plan up", async () => {
    const res = await overCap(fakeSb({ createdDaysAgo: 60, count: 5 }), user, "watchlist", "watchlistMax");
    expect(res?.status).toBe(402);
    const body = await res!.json();
    expect(body).toMatchObject({
      error: "You're tracking 5 of 5 names on Free.", code: "upgrade_required", reason: "limit", plan: "free", suggested: "pro", limit: 5,
    });
    // No meter: the paywall titles a list cap from `error`, not a monthly allowance.
    expect(body.meter).toBeUndefined();
  });
  it("lets the add through under the cap", async () => {
    expect(await overCap(fakeSb({ createdDaysAgo: 60, count: 4 }), user, "watchlist", "watchlistMax")).toBeNull();
  });
  it("uses the trial plan's (Pro) cap during the reverse trial", async () => {
    expect(await overCap(fakeSb({ createdDaysAgo: 2, count: 5 }), user, "watchlist", "watchlistMax")).toBeNull();
  });
  it("applies the themes cap to themes", async () => {
    const res = await overCap(fakeSb({ createdDaysAgo: 60, count: 3 }), user, "themes", "themesMax");
    expect((await res!.json()).error).toBe("You're following 3 of 3 themes on Free.");
  });
  it("fails open when the count can't be read", async () => {
    expect(await overCap(fakeSb({ createdDaysAgo: 60, count: null, countError: true }), user, "watchlist", "watchlistMax")).toBeNull();
  });
});
