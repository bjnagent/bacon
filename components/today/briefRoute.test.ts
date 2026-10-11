// GET /api/brief: which brief a member is shown. Lives with the Today
// components because it is the server half of the house-brief banner.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const HOUSE = "house-0000";
const USER = "user-1111";

interface Call { table: string; eqs: Record<string, unknown> }

/** A chainable stand-in for the supabase query builder that records filters. */
function fakeDb(rowsFor: (userId: string, table: string) => unknown[], calls: Call[]) {
  return {
    from(table: string) {
      const call: Call = { table, eqs: {} };
      calls.push(call);
      const q = {
        select: () => q, in: () => q, order: () => q, limit: () => q,
        eq: (k: string, v: unknown) => { call.eqs[k] = v; return q; },
        maybeSingle: () => Promise.resolve({ data: { items: rowsFor(String(call.eqs.user_id), table) }, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rowsFor(String(call.eqs.user_id), table), error: null }).then(res),
      };
      return q;
    },
  };
}

const pick = (user: string, name: string, symbol: string) => ({
  id: `${user}-${symbol}`, name, symbol, asset_class: "Equity / Stock", why: "t", now_catalyst: "s", check_text: "Confirm: a · Kill: b",
  action: "Buy — x", target: "est. 10", change_pct: null, data_source: "3–6 months", kind: "opportunity", created_at: "2026-10-11T03:00:00Z",
});

const rows = (userId: string, table: string) => {
  if (table === "daily_briefs") return userId === HOUSE ? [{ name: "House Co", ticker: "HSE", stop: "40", entry: "44–46", size: "3%" }] : [];
  if (userId === HOUSE) return [pick(HOUSE, "House Co", "HSE")];
  if (userId === USER) return [pick(USER, "Own Co", "OWN")];
  return [];
};

const userCalls: Call[] = [];
const adminCalls: Call[] = [];
let plan: { plan: string; source: string } = { plan: "free", source: "free" };

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  requireUser: async () => ({ sb: fakeDb(rows, userCalls), user: { id: USER, email: "u@x.y" } }),
}));
vi.mock("@/lib/entitlements", () => ({
  getPlanState: async () => plan,
  gate: async () => ({ ok: true, refund: async () => {} }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeDb(rows, adminCalls) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

beforeEach(() => { userCalls.length = 0; adminCalls.length = 0; plan = { plan: "free", source: "free" }; });
afterEach(() => { vi.unstubAllEnvs(); });

async function get() {
  const { GET } = await import("@/app/api/brief/route");
  const res = await GET();
  return { status: res.status, body: await res.json() as { brief: { items: { name: string; stop?: string; entry?: string }[] }; house: boolean } };
}

describe("GET /api/brief", () => {
  it("gives a free member the house brief, levels included", async () => {
    vi.stubEnv("HOUSE_USER_ID", HOUSE);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.house).toBe(true);
    expect(body.brief.items.map((i) => i.name)).toEqual(["House Co"]);
    expect(body.brief.items[0]).toMatchObject({ stop: "40", entry: "44–46" });
    // Read through the service role, scoped to the house account only.
    expect(adminCalls.every((c) => c.eqs.user_id === HOUSE)).toBe(true);
  });

  it("gives a paying (or trialing) member their own brief", async () => {
    vi.stubEnv("HOUSE_USER_ID", HOUSE);
    plan = { plan: "pro", source: "trial" };
    const { body } = await get();
    expect(body.house).toBe(false);
    expect(body.brief.items.map((i) => i.name)).toEqual(["Own Co"]);
    expect(adminCalls).toHaveLength(0);
  });

  it("treats an unreachable billing schema as entitled (fallback), never as free", async () => {
    vi.stubEnv("HOUSE_USER_ID", HOUSE);
    plan = { plan: "desk", source: "fallback" };
    const { body } = await get();
    expect(body.house).toBe(false);
  });

  it("never falls back to another account when HOUSE_USER_ID is unset", async () => {
    vi.stubEnv("HOUSE_USER_ID", "");
    const { body } = await get();
    expect(body.house).toBe(false);
    expect(body.brief.items.map((i) => i.name)).toEqual(["Own Co"]);
    expect(adminCalls).toHaveLength(0);
    expect(userCalls.find((c) => c.table === "scout_picks")?.eqs.user_id).toBe(USER);
  });
});
