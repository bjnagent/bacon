// Route-level tests for the nightly jobs' entitlement wiring: who gets swept /
// watched, the house account, the footprint gate, the compare-and-set claim,
// and that delivery (email, push) is gated on the plan and on the brief
// actually being saved. Every AI / market / email / push edge is stubbed.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDb, type Row } from "@/lib/billing.testing";
import type { OpportunityBrief, OpportunityItem } from "@/lib/parsers";

const h = vi.hoisted(() => ({ admin: null as unknown }));
const m = vi.hoisted(() => ({
  askCheap: vi.fn(),
  generateBrief: vi.fn(),
  notifyUser: vi.fn(),
  sendBriefEmail: vi.fn(),
  sendKillAlertEmail: vi.fn(),
  recordCalls: vi.fn(),
  gradeCalls: vi.fn(),
  gradeForecasts: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));
vi.mock("@/lib/ai", () => ({ askCheap: m.askCheap }));
vi.mock("@/lib/brief", async (orig) => ({ ...(await orig<typeof import("@/lib/brief")>()), generateBrief: m.generateBrief }));
vi.mock("@/lib/push", () => ({ notifyUser: m.notifyUser }));
vi.mock("@/lib/email", () => ({ emailEnabled: () => true, sendBriefEmail: m.sendBriefEmail, sendKillAlertEmail: m.sendKillAlertEmail }));
vi.mock("@/lib/calls", async (orig) => ({ ...(await orig<typeof import("@/lib/calls")>()), recordCalls: m.recordCalls, gradeCalls: m.gradeCalls }));
vi.mock("@/lib/forecastRecord", () => ({ getForecastMemo: async () => "", recordForecasts: async () => {}, gradeForecasts: m.gradeForecasts }));
vi.mock("@/lib/forecast", () => ({ getForecasts: async () => [] }));
vi.mock("@/lib/priceCache", () => ({ getCachedSeries: async () => null }));
vi.mock("@/lib/snapshot", () => ({
  readMarketWide: async () => ({ movers: [], losers: [], mostActive: [], sectors: [], macro: [], commodities: [], fx: [], insiders: [] }),
  fetchMarketWide: async () => ({}),
  cacheMarketWide: async () => {},
}));

import { GET as sweep } from "./sweep/route";
import { GET as watch } from "./watch/route";

const PRO = "11111111-1111-4111-8111-111111111111";
const FREE = "22222222-2222-4222-8222-222222222222";
const TRIAL = "33333333-3333-4333-8333-333333333333";
const HOUSE = "44444444-4444-4444-8444-444444444444";
const RACED = "55555555-5555-4555-8555-555555555555";
const NOTDUE = "66666666-6666-4666-8666-666666666666";
const ALL = [PRO, FREE, TRIAL, HOUSE, RACED, NOTDUE];

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

const item = (name: string, ticker: string): OpportunityItem => ({
  name, ticker, cls: "Equity / Stock", horizon: "3–6 months", thesis: "t", signals: "s", action: "Buy", target: "est. +10%",
  confirm: "c", kill: "k", entry: "", stop: "", size: "",
});
const BRIEF: OpportunityBrief = { intro: "Intro.", items: [item("Cameco", "CCJ"), item("Copper", "HG")], caveat: null };

// Who each account is, as the cron_accounts RPC would report it.
const ACCOUNTS: Record<string, { email: string; created_at: string; sub: Row | null }> = {
  [PRO]: { email: "pro@x.test", created_at: ago(90 * DAY), sub: { plan: "pro", status: "active", provider: "stripe", current_period_end: ahead(10 * DAY) } },
  [FREE]: { email: "free@x.test", created_at: ago(90 * DAY), sub: null },
  [TRIAL]: { email: "trial@x.test", created_at: ago(2 * DAY), sub: null },
  [HOUSE]: { email: "house@x.test", created_at: ago(400 * DAY), sub: null },
  [RACED]: { email: "raced@x.test", created_at: ago(90 * DAY), sub: { plan: "desk", status: "active", provider: "app_store", current_period_end: ahead(10 * DAY) } },
  [NOTDUE]: { email: "nd@x.test", created_at: ago(90 * DAY), sub: { plan: "desk", status: "active", provider: "stripe", current_period_end: ahead(10 * DAY) } },
};
const settings = (user_id: string, o: Row = {}): Row => ({
  user_id, scout_interval_minutes: 1440, last_sweep_at: null, news_source: "All", news_focus: "", brief_email_enabled: true,
  push_enabled: true, voices: "", watch_enabled: true, ...o,
});

let db: FakeDb;
const saved: Record<string, string | undefined> = {};
const ENV_KEYS = ["CRON_SECRET", "HOUSE_USER_ID", "ADMIN_EMAILS", "ADVICE_EMAILS"];

function seed() {
  db = new FakeDb(ALL);
  db.tables.settings = [
    settings(PRO), settings(FREE), settings(TRIAL), settings(RACED),
    settings(HOUSE, { scout_interval_minutes: 0, brief_email_enabled: true }), // toggle OFF — still swept
    settings(NOTDUE, { last_sweep_at: ago(60 * 60_000) }),
  ];
  // Footprints: TRIAL has none (an account from the app that shares this database).
  db.tables.watchlist = [{ id: "w1", user_id: PRO, symbol: "CCJ", asset_class: "Equity / Stock" }];
  db.tables.user_events = [{ user_id: FREE }, { user_id: RACED }, { user_id: NOTDUE }];
  db.tables.chat_messages = [];
  db.tables.themes = [];
  db.tables.news_items = [];
  db.tables.daily_briefs = [];
  db.tables.subscriptions = [];
  db.tables.profiles = [];
  db.rpcs.cron_accounts = ({ p_ids }) => {
    // Another run claims RACED between our settings read and our claim.
    const raced = db.rows("settings").find((r) => r.user_id === RACED);
    if (raced) raced.last_sweep_at = new Date().toISOString();
    return (p_ids as string[]).filter((id) => ACCOUNTS[id]).map((id) => {
      const a = ACCOUNTS[id];
      return {
        user_id: id, email: a.email, created_at: a.created_at,
        plan: a.sub?.plan ?? null, status: a.sub?.status ?? null, provider: a.sub?.provider ?? null,
        current_period_end: a.sub?.current_period_end ?? null, cancel_at_period_end: false, billing_interval: "month",
      };
    });
  };
  db.rpcs.replace_scout_picks = () => null;
  db.rpcs.replace_news = () => null;
  h.admin = Object.assign(db, { auth: { admin: { getUserById: vi.fn(async (id: string) => ({ data: { user: { email: ACCOUNTS[id]?.email ?? null } } })) } } });
}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.CRON_SECRET = "cron_secret";
  process.env.HOUSE_USER_ID = HOUSE;
  delete process.env.ADMIN_EMAILS;
  delete process.env.ADVICE_EMAILS;
  Object.values(m).forEach((f) => f.mockReset());
  m.askCheap.mockResolvedValue("");
  m.generateBrief.mockResolvedValue(BRIEF);
  m.notifyUser.mockResolvedValue(1);
  m.sendBriefEmail.mockResolvedValue(true);
  m.sendKillAlertEmail.mockResolvedValue(true);
  m.recordCalls.mockResolvedValue(undefined);
  m.gradeCalls.mockResolvedValue({ graded: 3, finalized: 1 });
  m.gradeForecasts.mockResolvedValue({ graded: 2 });
  seed();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  vi.restoreAllMocks();
});

const run = (route: (r: Request) => Promise<Response>, auth = "Bearer cron_secret") =>
  route(new Request("https://bacon.test/api/cron/x", { headers: { Authorization: auth } }));
const sweptIds = () => m.generateBrief.mock.calls.map((c) => (c[1] as { userId: string }).userId).sort();

describe("GET /api/cron/sweep", () => {
  it("keeps the CRON_SECRET guard", async () => {
    expect((await run(sweep, "Bearer nope")).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await run(sweep, "Bearer undefined")).status).toBe(401);
    expect(m.generateBrief).not.toHaveBeenCalled();
  });

  it("sweeps only entitled accounts with a footprint — plus the house account, always", async () => {
    const body = await (await run(sweep)).json();
    expect(sweptIds()).toEqual([PRO, HOUSE].sort());
    expect(body).toMatchObject({ ok: true, swept: 2, unentitled: 1, skipped: 1, raced: 1, failed: 0, briefs: 2, via: "rpc" });
    // One RPC resolved every due account's plan.
    expect(db.rpcCalls.filter((c) => c.name === "cron_accounts")).toHaveLength(1);
  });

  it("claims each swept account by advancing last_sweep_at", async () => {
    await run(sweep);
    const at = (id: string) => db.rows("settings").find((r) => r.user_id === id)?.last_sweep_at;
    expect(at(PRO)).toBeTruthy();
    expect(at(HOUSE)).toBeTruthy();
    expect(at(FREE)).toBeNull(); // free accounts aren't claimed — nothing ran for them
  });

  it("delivers the brief by email and push only where the plan includes it", async () => {
    const body = await (await run(sweep)).json();
    expect(body).toMatchObject({ emailed: 1, pushed: 1 });
    expect(m.sendBriefEmail).toHaveBeenCalledTimes(1);
    expect(m.sendBriefEmail.mock.calls[0][0]).toBe("pro@x.test");
    expect(m.notifyUser).toHaveBeenCalledTimes(1);
    expect(m.notifyUser).toHaveBeenCalledWith(PRO, { title: "Your brief is ready", body: "Cameco (CCJ) and 1 more idea in today's brief.", path: "/", kind: "brief" });
  });

  it("respects the email opt-in and the push switch", async () => {
    const pro = db.rows("settings").find((r) => r.user_id === PRO)!;
    pro.brief_email_enabled = false;
    pro.push_enabled = false;
    await run(sweep);
    expect(m.sendBriefEmail).not.toHaveBeenCalled();
    expect(m.notifyUser).not.toHaveBeenCalled();
  });

  it("doesn't notify when the brief couldn't be saved to the feed", async () => {
    db.rpcs.replace_scout_picks = () => ({ data: null, error: { message: "boom" } });
    const body = await (await run(sweep)).json();
    expect(body).toMatchObject({ swept: 2, briefs: 0, pushed: 0, emailed: 0 });
    expect(m.notifyUser).not.toHaveBeenCalled();
    expect(m.sendBriefEmail).not.toHaveBeenCalled();
  });

  it("one account's failure doesn't stop the others", async () => {
    m.generateBrief.mockImplementation(async (_b: unknown, meta: { userId: string }) => {
      if (meta.userId === PRO) throw new Error("model down");
      return BRIEF;
    });
    const body = await (await run(sweep)).json();
    // generateBrief failures degrade to "no brief" for that user, not a failed run.
    expect(body).toMatchObject({ ok: true, swept: 2, briefs: 1 });
  });

  it("before the cron_accounts RPC exists, resolves plans per account and still gates", async () => {
    delete db.rpcs.cron_accounts;
    const raced = db.rows("settings").find((r) => r.user_id === RACED)!;
    raced.last_sweep_at = ago(60 * 60_000); // not due; keep this run simple
    db.tables.subscriptions = [{ user_id: PRO, plan: "pro", status: "active", provider: "stripe", current_period_end: ahead(10 * DAY) }];
    db.tables.profiles = ALL.map((id) => ({ id, created_at: ACCOUNTS[id].created_at }));
    const body = await (await run(sweep)).json();
    expect(body.via).toBe("fallback");
    expect(sweptIds()).toEqual([PRO, HOUSE].sort());
  });

  it("returns early when nobody is due", async () => {
    db.tables.settings = [settings(PRO, { last_sweep_at: ago(60_000) }), settings(HOUSE, { last_sweep_at: ago(60_000) })];
    const body = await (await run(sweep)).json();
    expect(body).toEqual({ ok: true, swept: 0 });
    expect(m.generateBrief).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/watch", () => {
  const killText = "@@KILL@@\nticker: CCJ\nwhy: A restart was pulled forward.\n===NOTE===\nChecked public reporting.";
  const brief = (user_id: string, kill_alert: Row | null = null): Row => ({
    id: `b-${user_id}`, user_id, brief_date: "2026-10-10", kill_alert,
    items: [{ name: "Cameco", ticker: "CCJ", thesis: "t", checks: "Confirm: x · Kill: restart pulled forward", verdict: null }],
  });
  beforeEach(() => {
    db.tables.daily_briefs = [brief(PRO), brief(FREE), brief(HOUSE)];
    db.tables.settings = [settings(PRO), settings(FREE), settings(HOUSE)];
    db.tables.billing_events = [
      { id: "evt_old", provider: "stripe", type: "invoice.paid", received_at: ago(120 * DAY) },
      { id: "evt_new", provider: "stripe", type: "invoice.paid", received_at: ago(DAY) },
    ];
    db.tables.user_events = [];
    m.askCheap.mockResolvedValue(killText);
  });

  it("keeps the CRON_SECRET guard", async () => {
    expect((await run(watch, "Bearer nope")).status).toBe(401);
    expect(m.gradeCalls).not.toHaveBeenCalled();
  });

  it("grades every account's calls, even when nobody is watched", async () => {
    db.tables.settings = [];
    const body = await (await run(watch)).json();
    expect(m.gradeCalls).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ ok: true, watched: 0, graded: 3, finalized: 1, forecastsGraded: 2 });
  });

  it("watches only kill_watch plans (and the house), and pushes a new kill to /track-record", async () => {
    const body = await (await run(watch)).json();
    expect(body).toMatchObject({ ok: true, watched: 2, alerts: 2, unentitled: 1, pushed: 1, graded: 3 });
    const routes = m.askCheap.mock.calls.map((c) => (c[5] as { userId: string }).userId).sort();
    expect(routes).toEqual([PRO, HOUSE].sort());
    expect(m.notifyUser).toHaveBeenCalledTimes(1);
    expect(m.notifyUser).toHaveBeenCalledWith(PRO, {
      title: "A kill condition may have triggered", body: "CCJ — re-check the thesis before relying on it.", path: "/track-record", kind: "kill",
    });
    expect(db.rows("daily_briefs").find((b) => b.user_id === PRO)?.kill_alert).toMatchObject({ items: [{ ticker: "CCJ", name: "Cameco" }] });
    expect(m.sendKillAlertEmail).toHaveBeenCalledTimes(1);
    expect(m.sendKillAlertEmail.mock.calls[0][0]).toBe("pro@x.test");
  });

  it("doesn't push the same standing kill again the next morning", async () => {
    db.tables.daily_briefs = [brief(PRO, { at: ago(DAY), items: [{ ticker: "CCJ", name: "Cameco", why: "x" }] })];
    await run(watch);
    expect(m.notifyUser).not.toHaveBeenCalled();
  });

  it("prunes the billing-event ledger past its retention", async () => {
    await run(watch);
    expect(db.rows("billing_events").map((r) => r.id)).toEqual(["evt_new"]);
  });
});
