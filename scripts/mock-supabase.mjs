#!/usr/bin/env node
// A stand-in for Supabase (Auth + PostgREST + RPC) with fixture data, so the
// signed-in app can be run, screenshotted and click-tested locally without a
// real project, keys, or touching production.
//
//   node scripts/mock-supabase.mjs            # listens on :54321
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=mock npm run dev
//
// Then sign in by setting the cookie printed at startup (scripts/shoot.mjs does
// this for you). Fixtures are DEV DATA ONLY — illustrative, not market facts.
//
// Flags (env):
//   MOCK_PLAN=free|pro|desk|trial (default trial)  — what my_plan_state returns
//   MOCK_EMPTY=1                                    — a brand-new account (no rows)

import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_PORT || 54321);
const PLAN = process.env.MOCK_PLAN || "trial";
const EMPTY = process.env.MOCK_EMPTY === "1";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const EMAIL = "demo@bacon.test";
const now = Date.now();
const iso = (msAgo = 0) => new Date(now - msAgo).toISOString();
const day = 86_400_000;
const hr = 3_600_000;

const user = {
  id: USER_ID, aud: "authenticated", role: "authenticated", email: EMAIL,
  email_confirmed_at: iso(30 * day), app_metadata: { provider: "email" }, user_metadata: {},
  created_at: iso(PLAN === "trial" ? 2 * day : 60 * day), updated_at: iso(),
};

function b64url(s) { return Buffer.from(s).toString("base64url"); }
function jwt(payload) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", "mock-secret").update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}
const exp = Math.floor(now / 1000) + 30 * 24 * 3600;
const accessToken = jwt({ sub: USER_ID, email: EMAIL, role: "authenticated", aud: "authenticated", exp, iat: Math.floor(now / 1000) });
const session = { access_token: accessToken, token_type: "bearer", expires_in: 30 * 24 * 3600, expires_at: exp, refresh_token: "mock-refresh", user };

// ---------------------------------------------------------------- fixtures
const id = () => crypto.randomUUID();
const opp = (name, symbol, cls, horizon, action, target, why, signals, check) => ({
  id: id(), user_id: USER_ID, kind: "opportunity", name, symbol, asset_class: cls, why, now_catalyst: signals,
  check_text: check, action, target, change_pct: null, data_source: horizon, created_at: iso(5 * hr),
});

const T = EMPTY ? {} : {
  scout_picks: [
    { id: id(), user_id: USER_ID, kind: "brief-intro", name: "", symbol: "", asset_class: "", why: "Rates eased overnight and the curve steepened for a third session, while semis led a narrow tape. Three setups line up across more than one independent signal; two names on your watchlist moved on news worth a look.", now_catalyst: "", check_text: "Research, not advice — every idea below names the condition that would end it.", action: null, target: null, change_pct: null, data_source: null, created_at: iso(5 * hr) },
    opp("Taiwan Semiconductor", "TSM", "Equity / Stock", "3–6 months", "Accumulate — capacity sold out into 2027", "est. +14% (base case)", "Advanced-node capacity remains the bottleneck for AI accelerators; pricing power is showing up in gross margin guidance rather than volume alone.", "Insider-quiet but 13F adds from three large funds; sector rotation into semis for a 4th week; FX tailwind as TWD weakens.", "Confirm: next monthly revenue print holds >30% YoY · Kill: a guide-down on advanced-node utilisation"),
    opp("Cameco", "CCJ", "Equity / Stock", "6–12 months", "Buy — contract cycle turning", "est. +18% (base case)", "Utilities are re-contracting at higher term prices while restart timelines slip; the supply response is years out.", "Term price up for a 5th month (via industry reports); insider cluster buy at a peer; policy support in two jurisdictions.", "Confirm: term contracting volume keeps rising · Kill: a major mine restart pulled forward"),
    opp("iShares 20+ Year Treasury", "TLT", "ETF / Fund", "1–3 months", "Watch — duration bid if CPI cools", "est. +6% if 10Y retraces", "Curve steepening with cooling services inflation would favour duration; positioning is still short.", "10Y–2Y curve steepened 3 sessions running (FRED); prediction markets price a cut by Q1 at 64%.", "Confirm: core services CPI below consensus · Kill: 10Y closes above its recent high"),
    opp("Copper", "HG", "Commodity", "3–6 months", "Accumulate — inventories drawing", "est. +9%", "Exchange inventories are drawing while grid capex guidance keeps rising; the physical market looks tighter than futures imply.", "LME + COMEX stocks down 4 weeks; China credit impulse turning; miners outperforming the metal.", "Confirm: inventories keep falling · Kill: a China property stimulus disappointment"),
    opp("Palantir", "PLTR", "Equity / Stock", "1–3 months", "Avoid — crowded into earnings", "est. −8% (bear case)", "Expectations into the print look stretched relative to commercial growth; crowding is at an extreme.", "Community pulse: hot (crowded); options skew rich; insiders selling under plans.", "Confirm: commercial growth decelerates · Kill: a large federal award re-rates the guide"),
  ],
  watchlist: [
    { id: id(), user_id: USER_ID, symbol: "NVDA", asset_class: "Equity / Stock", lean: "constructive", lean_reason: "Supply-constrained demand; data-centre guide intact.", update_text: "Hyperscaler capex commentary stayed firm this week; no change to the thesis.", watch_text: "Gross-margin trajectory on the next print.", thesis: "AI accelerator leader with a multi-year backlog.", conviction: 4, note: "", status: "ok", last_scan_at: iso(6 * hr), created_at: iso(40 * day) },
    { id: id(), user_id: USER_ID, symbol: "MSFT", asset_class: "Equity / Stock", lean: "mixed", lean_reason: "Cloud growth steady; capex intensity rising.", update_text: "Azure growth held; investors focused on capex payback.", watch_text: "Capex guide vs. AI revenue disclosure.", thesis: "", conviction: 3, note: "", status: "ok", last_scan_at: iso(6 * hr), created_at: iso(38 * day) },
    { id: id(), user_id: USER_ID, symbol: "CCJ", asset_class: "Equity / Stock", lean: "constructive", lean_reason: "Term contracting accelerating.", update_text: "Term price ticked up again per industry reports.", watch_text: "Restart timelines at peers.", thesis: "Uranium contract cycle.", conviction: 4, note: "", status: "ok", last_scan_at: iso(6 * hr), created_at: iso(12 * day) },
    { id: id(), user_id: USER_ID, symbol: "BTC", asset_class: "Crypto", lean: "cautious", lean_reason: "Momentum fading; ETF flows mixed.", update_text: "Net ETF flows turned negative for the week.", watch_text: "Flows and funding rates.", thesis: "", conviction: 2, note: "", status: "ok", last_scan_at: iso(6 * hr), created_at: iso(9 * day) },
    { id: id(), user_id: USER_ID, symbol: "EUR/USD", asset_class: "FX / Currency pair", lean: "mixed", lean_reason: "Rate differentials narrowing slowly.", update_text: "ECB speakers leaned dovish.", watch_text: "Eurozone CPI flash.", thesis: "", conviction: 3, note: "", status: "pending", last_scan_at: null, created_at: iso(2 * day) },
  ],
  news_items: [
    { id: id(), user_id: USER_ID, headline: "Chipmaker lifts its capacity outlook as AI orders stay strong", source: "Reuters", why: "Signals continued pricing power at the leading edge.", symbol: "TSM", asset_class: "Equity / Stock", signal: "constructive", recency: "2h", created_at: iso(2 * hr) },
    { id: id(), user_id: USER_ID, headline: "Treasury yields slip as inflation expectations ease", source: "Bloomberg", why: "Supports duration and long-dated growth names.", symbol: "TLT", asset_class: "ETF / Fund", signal: "constructive", recency: "4h", created_at: iso(4 * hr) },
    { id: id(), user_id: USER_ID, headline: "Utilities sign longer uranium supply contracts at higher prices", source: "Financial Times", why: "Term-price strength is the core of the producer thesis.", symbol: "CCJ", asset_class: "Equity / Stock", signal: "constructive", recency: "6h", created_at: iso(6 * hr) },
    { id: id(), user_id: USER_ID, headline: "Software group's guidance disappoints on slower commercial deals", source: "CNBC", why: "Watch for read-across to crowded AI software names.", symbol: "PLTR", asset_class: "Equity / Stock", signal: "cautious", recency: "8h", created_at: iso(8 * hr) },
    { id: id(), user_id: USER_ID, headline: "Copper stockpiles fall for a fourth week at major exchanges", source: "Reuters", why: "Physical tightness can lead futures.", symbol: "HG", asset_class: "Commodity", signal: "constructive", recency: "10h", created_at: iso(10 * hr) },
  ],
  themes: [
    { id: id(), user_id: USER_ID, label: "AI infrastructure", created_at: iso(30 * day) },
    { id: id(), user_id: USER_ID, label: "Uranium & nuclear", created_at: iso(30 * day) },
    { id: id(), user_id: USER_ID, label: "Semiconductors", created_at: iso(20 * day) },
  ],
  settings: [
    { user_id: USER_ID, scout_interval_minutes: 1440, last_sweep_at: iso(5 * hr), news_source: "All", news_focus: "", brief_email_enabled: true, watch_enabled: true, voices: "", push_enabled: true, timezone: "Asia/Singapore", onboarded_at: iso(30 * day), updated_at: iso(day) },
  ],
  calls: [
    ...[
      ["NVDA", "Buy", 21.4, 6.1, true], ["CCJ", "Accumulate", 12.8, 4.9, true], ["XOM", "Buy", -3.2, 2.2, false],
      ["TLT", "Watch", 1.1, 0.8, true], ["AMD", "Buy", 9.7, 5.5, true], ["INTC", "Avoid", -11.3, 3.0, true],
      ["BA", "Buy", -6.4, 1.9, false], ["GLD", "Accumulate", 5.2, 2.4, true], ["TSLA", "Avoid", 14.0, 4.1, false],
      ["META", "Buy", 7.9, 3.3, true],
    ].map(([instrument, action, actual, bench, hit], i) => ({
      id: id(), user_id: USER_ID, source: "brief", instrument, action, conviction: 3 + (i % 2), target_text: "est. +10%",
      target_base: 10, target_kind: "pct", horizon_date: iso(-(30 - i) * day).slice(0, 10), crowded: i % 3 === 0 ? "hot" : "quiet",
      created_at: iso((45 + i * 3) * day), call_date: iso((45 + i * 3) * day).slice(0, 10), actual_pct: actual, bench_pct: bench,
      direction_hit: hit, target_err_pct: Math.abs(actual - 10), graded_at: iso((14 + i) * day),
    })),
    ...["TSM", "CCJ", "HG"].map((instrument, i) => ({
      id: id(), user_id: USER_ID, source: "brief", instrument, action: "Accumulate", conviction: 3, target_text: "est. +12%",
      target_base: 12, target_kind: "pct", horizon_date: iso(-90 * day).slice(0, 10), crowded: "quiet",
      created_at: iso((5 + i) * day), call_date: iso((5 + i) * day).slice(0, 10), actual_pct: null, bench_pct: null,
      direction_hit: null, target_err_pct: null, graded_at: null,
    })),
  ],
  daily_briefs: [1, 2, 3, 4, 5].map((d) => ({
    id: id(), user_id: USER_ID, brief_date: iso(d * day).slice(0, 10), intro: "The desk's read for the day.", caveat: null,
    items: [{ name: "Example Co", ticker: ["NVDA", "AMD", "CCJ", "GLD", "META"][d - 1], cls: "Equity / Stock", horizon: "1–3 months", thesis: "Illustrative thesis.", signals: "Two signals agreed.", checks: "Confirm / kill lines." }],
    reviewed_at: null, roi: null, kill_alert: null, created_at: iso(d * day),
  })),
  analyses: [],
  chat_messages: [],
  properties: [],
  property_outlooks: [],
  subscriptions: [],
  feature_usage: [],
  device_tokens: [],
};

function planState() {
  if (PLAN === "trial") return { subscription: null, created_at: user.created_at, usage: { analysis: 1, chat: 4 } };
  if (PLAN === "free") return { subscription: null, created_at: iso(60 * day), usage: { analysis: 2, chat: 9 } };
  return {
    subscription: { plan: PLAN, status: "active", provider: "stripe", current_period_end: iso(-20 * day), cancel_at_period_end: false, billing_interval: "year" },
    created_at: iso(60 * day), usage: { analysis: 7, deep: 3, chat: 22, sweep: 2, update: 5 },
  };
}

const RPC = {
  my_plan_state: () => planState(),
  consume_feature: () => 9,
  bump_ai_usage: () => true,
  replace_scout_picks: () => null,
  replace_news: () => null,
};

// ---------------------------------------------------------------- server
function send(res, status, body, headers = {}) {
  const data = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", ...headers });
  res.end(data);
}

function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (v.startsWith("eq.")) out = out.filter((r) => !(k in r) || String(r[k]) === v.slice(3));
    else if (v.startsWith("in.(")) {
      const set = new Set(v.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, "")));
      out = out.filter((r) => !(k in r) || set.has(String(r[k])));
    } else if (v === "is.null") out = out.filter((r) => !(k in r) || r[k] == null);
    else if (v === "not.is.null") out = out.filter((r) => !(k in r) || r[k] != null);
  }
  const limit = params.get("limit");
  return limit ? out.slice(0, Number(limit)) : out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
  if (req.method === "OPTIONS") return send(res, 204);

  // ---- auth
  if (url.pathname === "/auth/v1/user") return send(res, 200, user);
  if (url.pathname === "/auth/v1/token") return send(res, 200, session);
  if (url.pathname === "/auth/v1/logout") return send(res, 204);
  if (url.pathname.startsWith("/auth/v1/")) return send(res, 200, {});

  // ---- rpc
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  if (rpc) {
    const fn = RPC[rpc[1]];
    return send(res, 200, fn ? fn(body) : null);
  }

  // ---- tables
  const tm = url.pathname.match(/^\/rest\/v1\/([a-z_]+)/);
  if (tm) {
    const table = tm[1];
    const rows = (T[table] ??= []);
    const single = /vnd\.pgrst\.object/.test(req.headers.accept || "");
    if (req.method === "GET" || req.method === "HEAD") {
      const out = filterRows(rows, url.searchParams);
      if (single) return out.length ? send(res, 200, out[0]) : send(res, 406, { code: "PGRST116", message: "no rows", details: "", hint: null });
      return send(res, 200, out, { "Content-Range": `0-${Math.max(out.length - 1, 0)}/${out.length}` });
    }
    if (req.method === "POST") {
      const list = (Array.isArray(body) ? body : [body]).filter(Boolean).map((r) => ({ id: id(), created_at: iso(), ...r }));
      rows.push(...list);
      return send(res, 201, single ? list[0] : list);
    }
    if (req.method === "PATCH") {
      const hit = filterRows(rows, url.searchParams);
      hit.forEach((r) => Object.assign(r, body));
      return send(res, 200, single ? hit[0] ?? null : hit);
    }
    if (req.method === "DELETE") {
      const hit = new Set(filterRows(rows, url.searchParams));
      T[table] = rows.filter((r) => !hit.has(r));
      return send(res, 200, single ? null : [...hit]);
    }
  }
  send(res, 404, { message: "mock: not found", path: url.pathname });
});

server.listen(PORT, () => {
  const cookie = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  console.log(`mock supabase on http://localhost:${PORT} (plan=${PLAN}${EMPTY ? ", empty" : ""})`);
  console.log(`cookie: sb-localhost-auth-token=${cookie}`);
});

export { session };
