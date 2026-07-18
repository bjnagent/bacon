# Bacon — Deep Code Review

**Scope:** Next.js 16 (App Router, Turbopack) on Vercel · Supabase (Postgres, Auth, RLS) · Anthropic + Gemini + Grok, live `web_search`.
**Method:** Read every route, lib, and component; ran `npm audit`, `tsc --noEmit`, and the Vitest suite; queried the live production Supabase project (`knqvvowsasydaxjlxbgd`, "bacon", ap‑southeast‑1) for advisors, RLS state, and row counts. Findings cite `file:line`; confidence is marked **Confirmed** (read/verified) or **Likely/Speculative** where inferred.

**Health baseline (verified):** `tsc` clean · `vitest` 92/92 pass · secrets server‑only (no `NEXT_PUBLIC_*` leak, none in git history) · no `dangerouslySetInnerHTML` · all queries parameterized via `supabase-js`. This is a well‑built early‑stage app; the findings below are about scale, cost, and one genuinely serious database‑exposure issue that is not in the repo but is in Bacon's production database.

---

## 1. Executive summary — top 5 risks

1. **A second app's admin data is world‑readable through Bacon's own anon key (P0).** Bacon's production Supabase project also hosts an unrelated app's tables/functions (`sona_profiles`, `sona_usage`, `sona_admin_users()`, `sona_admin_totals()`, …). Five `SECURITY DEFINER` functions are executable by the `anon` and `authenticated` roles via `/rest/v1/rpc/*`, and `sona_admin_users()` returns **every sona user's email, role, monthly spend, and limit**. Because Bacon ships `NEXT_PUBLIC_SUPABASE_ANON_KEY` to every browser, anyone who opens Bacon can call those RPCs against the same PostgREST endpoint. This is not Bacon's code, but it is Bacon's database and Bacon's shipped key — so it is Bacon's blast radius. Fix today.
2. **No rate limiting or usage quota on any AI route (P1, cost/abuse).** `/api/analyze`, `/api/brief`, `/api/chat`, `/api/debate`, `/api/scout`, `/api/redteam`, `/api/chain`, `/api/personas` each fan out to Anthropic **with `web_search` (up to 6 searches)** on a single authenticated request, with no per‑user ceiling. One signed‑in user (signups are instant, no email confirmation) can loop these and run up an unbounded Anthropic + search bill. Ironically the sibling `sona_*` tables are exactly a spend‑metering layer — Bacon has none.
3. **The calibration loop — the product's headline "self‑grading" honesty feature — is effectively dormant (P1, correctness).** The `calls` table has **0 rows** in production despite 5 stored briefs, because the nightly cron (`sweepUser`) never calls `recordCalls`; only the manual `/api/brief` POST does. So the accountability engine only learns from hand‑triggered sweeps, and for the auto‑sweep users it advertises, it records nothing.
4. **Non‑atomic delete‑then‑insert wipes user feeds on partial failure (P1, data loss window).** News, scout picks, and the daily brief are refreshed with `delete(...)` followed by a separate `insert(...)` (`app/api/news/route.ts:44‑54`, `app/api/brief/route.ts:88‑90`, `app/api/cron/sweep/route.ts:150‑156`). `supabase-js` can't wrap these in a transaction, so an insert failure or a function timeout between the two statements leaves the user with an empty feed.
5. **RLS and hot‑path indexes aren't tuned for scale (P1/P2, performance).** Every RLS policy re‑evaluates `auth.uid()` per row (18 policies flagged), and six per‑user tables (`watchlist`, `themes`, `scout_picks`, `news_items`, `chat_messages`, `properties`) have **no index on `user_id`** — the exact column every RLS‑filtered query filters on. Fine at 2 users; a full‑table scan per query at 10k.

**Single highest‑leverage fix:** Lock down the shared Supabase project (revoke `EXECUTE` on the `sona_*` `SECURITY DEFINER` functions from `anon`/`authenticated`, add policies or move that app to its own project). It's the only issue here that exposes real user PII to the public internet right now, and it's a ~15‑minute change.

---

## 2. Findings table

| ID | Sev | Area | File:lines | Problem | Trigger / scenario | Fix summary | Effort |
|----|-----|------|-----------|---------|--------------------|-------------|--------|
| S1 | **P0** | Data protection | (DB, not repo) `supabase/schema.sql` is clean; issue is other objects in same project | `sona_admin_*` / `sona_ensure_profile` / `sona_precheck` are `SECURITY DEFINER` and executable by `anon`+`authenticated`; `sona_profiles`/`sona_usage` have RLS on but **zero policies** | Any browser with Bacon's public anon key POSTs `/rest/v1/rpc/sona_admin_users` → dumps all sona users' emails/spend | Revoke EXECUTE from anon/authenticated; add policies or move sona to its own project | 15 min |
| S2 | **P1** | Abuse / cost | all `/api/*` AI routes | No rate limit / quota on web‑search AI endpoints | Signed‑in user loops `/api/analyze` → unbounded Anthropic + search spend | Per‑user token bucket (Upstash/Postgres); daily call cap | 0.5–1 d |
| C1 | **P1** | Correctness | `app/api/cron/sweep/route.ts:112‑158` | Nightly brief never records calibration `calls` | Auto‑sweep users; `calls` table empty in prod | Call `recordCalls` in `sweepUser` after brief parse | 1–2 h |
| C2 | **P1** | Correctness | `app/api/brief/route.ts:92‑99` | `recordCalls` re‑runs on every manual sweep; no dedup/unique | User clicks "Re‑sweep now" 3× → 3× duplicate calls, biases calibration memo | Upsert on `(user_id, source, instrument, horizon_date)` or delete‑same‑day first | 2 h |
| R1 | **P1** | Reliability | `app/api/news/route.ts:44‑54`; `brief/route.ts:88‑90`; `cron/sweep/route.ts:150‑156` | delete‑then‑insert not atomic | Insert fails or fn times out after delete → feed empties | Move to a Postgres RPC doing delete+insert in one tx | 3–4 h |
| P1 | **P1** | Postgres perf | RLS policies (all tables) | `auth.uid()` re‑evaluated per row (18 policies) | Large result sets scan slower at scale | `(select auth.uid())` in every policy | 30 min |
| P2 | **P1** | Postgres perf | `watchlist,themes,scout_picks,news_items,chat_messages,properties` | FK `user_id` unindexed; RLS filters on it | Seq scan per user query at scale | `create index … on <t>(user_id)` | 20 min |
| S3 | **P2** | Info disclosure | `app/api/health/route.ts:9‑33` | Public (no auth) endpoint returns provider‑config map + pings Anthropic | Anyone GETs `/api/health` → learns infra, burns a tiny Anthropic call | Gate behind auth or `CRON_SECRET`; drop `providers` from public body | 30 min |
| S4 | **P2** | Auth | `app/login/page.tsx:38`, `app/api/account/password/route.ts:14` | Password min length 6; leaked‑password protection disabled (Supabase advisor) | Weak/breached passwords accepted | Raise to 8–10; enable HaveIBeenPwned check in Supabase | 20 min |
| SC1 | **P2** | Scale | `app/api/cron/sweep/route.ts:52‑57` | Users swept **sequentially**, each ~10 AI calls, under one 300s budget | At many opted‑in users, later users silently skipped past the timeout | Batch users with bounded concurrency; or queue | 0.5 d |
| PERF1 | **P2** | Caching | `lib/market.ts:38`, `lib/macro.ts:69`, `lib/commodities.ts:202`, `lib/insider.ts:101` | Module‑level caches are per‑instance on serverless | N cold instances each fetch → Alpha Vantage 25/day budget still blown | Rely on DB snapshot for all market‑wide fetches, not just movers | 0.5 d |
| C3 | **P2** | Correctness | `lib/calls.ts:236‑243` | All calls benchmarked vs SPY, incl. SG/AU property & FX calls | Property "alpha" measured against US equities | Bench property vs its own index, FX vs DXY (or omit bench) | 3 h |
| C4 | **P3** | Correctness / TZ | `app/api/brief/route.ts:89`, `schema.sql:77` | `brief_date` keyed to UTC midnight | SG/AU users' "today" flips at 8am SGT/10am AEST | Key brief date to the user's TZ, or document | 2 h |
| REL1 | **P2** | Observability | everywhere (`catch {}`) | Errors swallowed; no Sentry/structured logs/correlation IDs | Silent empty brief → no signal to debug | Add error tracking + a request id | 0.5 d |
| CFG1 | **P2** | Config | many routes `export const maxDuration = 300` | 300s needs Vercel Pro/Fluid; Hobby caps ~60s | On Hobby, long streams cut at 60s | Confirm plan; lower budgets where possible | 15 min |
| SEC5 | **P2** | Hardening | `next.config.ts:6‑24` | No Content‑Security‑Policy | Reduces XSS defense‑in‑depth (low surface today) | Add CSP allowing self + TradingView + Google Fonts | 3 h |
| DEP1 | **P2** | Dependencies | `package.json` | `npm audit`: 1 critical/1 high/5 moderate — **all dev‑only** (vitest/vite/esbuild) or next→postcss | Not runtime‑exploitable; but `audit fix --force` would downgrade Next to 9 | Bump vitest to ^2.1.9+ patch / 3.x; **do not** `--force` | 1 h |
| Q1 | **P3** | Query shape | `app/api/watchlist/route.ts:9`, `scout/route.ts:16`, `news/route.ts:14` | Unbounded `select … order` (no `.limit`) | Bounded today by delete‑replace, but grows for watchlist | Add `.limit()` + cursor when lists can grow | 1 h |
| Q2 | **P3** | Query shape | `settings` reads use `select("*")` | Over‑fetch (`app/api/settings/route.ts:10`, `brief/route.ts:60`, `cron/sweep/route.ts:29`) | Minor bytes; couples to schema | Select needed columns | 30 min |
| M1 | **P3** | Docs/consistency | `components/AnalyzeView.tsx:155` vs `README.md`, `app/welcome/page.tsx` | "**eight** lenses" in UI, "**six**" in README/brand, 7 named on welcome; `LENSES` has 8 | User‑visible inconsistency | Pick the real number (8) and reconcile copy | 30 min |
| M2 | **P3** | Maintainability | `app/api/*` | Auth + JSON‑parse + validate boilerplate duplicated in ~20 routes | Drift risk | Extract `withUser(handler)` wrapper + zod schemas | 0.5 d |

---

## 3. P0 / P1 detail with patches

### S1 (P0) — Another app's admin data is reachable through Bacon's anon key

**Evidence (live advisors + `pg_proc`):**
- `sona_profiles`, `sona_usage`: RLS **enabled, 0 policies** (verified: `select relrowsecurity, count(policies)` → `sona_*` = 0 policies; every Bacon table = 1). RLS‑enabled‑no‑policy means the service role still reads them, but the exposure below is the functions.
- Five `SECURITY DEFINER` functions owned by a privileged role and **granted to `anon`/`authenticated`**, callable at `/rest/v1/rpc/<name>`:
  - `sona_admin_users()` → `user_id, email, role, monthly_limit, disabled, calls, spend, mtd_spend, last_active` for **all** users.
  - `sona_admin_totals()`, `sona_admin_daily(int)` → aggregate spend/counts.
  - `sona_precheck(uuid)`, `sona_ensure_profile(uuid,text)` → per‑user limit lookup / profile upsert.

**Failure scenario (Confirmed):** Bacon serves `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` to every browser (required for the browser client, `lib/supabase/client.ts`). Those same credentials authorize PostgREST RPC calls. A visitor opens dev‑tools and runs:

```js
fetch(`${SUPABASE_URL}/rest/v1/rpc/sona_admin_users`, {
  method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`,
  "Content-Type": "application/json" }, body: "{}"
}).then(r => r.json()) // → every sona user's email + spend
```

**Root cause:** Two apps share one Supabase project; the sibling app exposed admin RPCs to public roles. Bacon inherits the exposure because it publishes the anon key.

**Fix (run in the Supabase SQL editor — these are for the sona objects, not Bacon's schema):**
```sql
revoke execute on function public.sona_admin_users()            from anon, authenticated;
revoke execute on function public.sona_admin_totals()           from anon, authenticated;
revoke execute on function public.sona_admin_daily(integer)     from anon, authenticated;
revoke execute on function public.sona_precheck(uuid)           from anon, authenticated;
revoke execute on function public.sona_ensure_profile(uuid,text) from anon, authenticated;
-- and give the RLS-enabled sona tables real policies, or move sona to its own project:
-- (best practice: one Supabase project per app so anon-key blast radius is isolated)
```
**Verification:** re‑run the security advisor; the `anon_security_definer_function_executable` warnings should clear. Then confirm the anon RPC call above returns `401/403`.

> Note for Bacon specifically: Bacon's *own* 14 tables are correctly locked (RLS on + one `auth.uid() = user_id` policy each — see §5). This finding is about project hygiene, but it is real and live.

---

### S2 (P1) — No rate limiting / usage quota on AI routes

**Evidence:** Every AI route follows the same shape — `getUser()` gate, then `ask(...)`/`askStream(...)` with `web_search` (`maxSearches` 3–6). Examples: `app/api/analyze/route.ts:58‑66` (1700 tokens, 6 searches), `app/api/brief/route.ts:83` (1800 tokens, 6 searches), `app/api/chat/route.ts:63`. There is no counter, no per‑user budget, no `sona_precheck`‑style gate anywhere in Bacon.

**Failure scenario (Confirmed):** signups are instant with no email confirmation (`app/login/page.tsx:43‑47`, "signed straight in" path). A single account can fire `/api/analyze` in a loop; each call is a multi‑search Anthropic request. Cost scales linearly with a `while(true)`; there is no backpressure. This is both a cost‑DoS and a way to exhaust the shared Alpha Vantage/FRED budgets.

**Fix (minimal, Postgres‑backed so no new infra):**
```sql
-- one row per user per UTC day
create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table ai_usage enable row level security;
create policy "own usage" on ai_usage for select using ((select auth.uid()) = user_id);

create or replace function public.bump_ai_usage(p_limit int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.ai_usage(user_id, calls) values (auth.uid(), 1)
    on conflict (user_id, day) do update set calls = ai_usage.calls + 1
    returning calls into n;
  return n <= p_limit;
end $$;
revoke execute on function public.bump_ai_usage(int) from anon;
```
```ts
// lib/quota.ts — call at the top of each AI route, after getUser()
export async function withinQuota(sb: SupabaseClient, dailyLimit = 100) {
  const { data } = await sb.rpc("bump_ai_usage", { p_limit: dailyLimit });
  return data === true;
}
// in the route:
if (!(await withinQuota(sb))) return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
```
For burst protection add an IP/user token bucket at the edge (Upstash Ratelimit) later; the daily cap is the high‑value first move.

---

### C1 (P1) — Nightly cron never records calibration calls

**Evidence:** `app/api/brief/route.ts:92‑99` records calls after a manual sweep. `app/api/cron/sweep/route.ts:112‑158` (`sweepUser`) generates and stores the brief (`briefToRows`, `daily_briefs` upsert) but **never calls `recordCalls`**. Production shows `calls = 0` with `daily_briefs = 5` — the loop has never fired for auto‑swept users.

**Impact:** `getCalibrationMemo` (injected into `/api/analyze`, `/api/brief`, property outlook prompts) returns `""` forever for anyone who relies on the automated sweep, so the advertised "measured from your own graded past calls" never engages. The whole calibration subsystem (`gradeCalls` in the watch cron, the Record‑tab calibration profile) has nothing to grade.

**Fix — mirror the interactive path inside `sweepUser`, right after the brief is parsed:**
```ts
// app/api/cron/sweep/route.ts, inside sweepUser after `briefRows = briefToRows(userId, brief);`
import { recordCalls, horizonToDays } from "@/lib/calls";
import { cleanTicker } from "@/lib/market";
const crowding = mw.pulse?.crowding ?? {};
await recordCalls(admin, userId, brief.items.filter((o) => o.action).map((o) => ({
  source: "brief" as const,
  instrument: o.ticker && o.ticker !== "—" ? o.ticker : o.name,
  action: o.action, targetText: o.target,
  horizonDays: horizonToDays(o.horizon),
  crowded: crowding[cleanTicker(o.ticker) ?? ""] ?? null,
})));
```
This composes with the C2 fix below (so the daily cron doesn't itself double‑insert on a day the user also manually swept).

---

### C2 (P1) — Duplicate calibration calls on repeat sweeps

**Evidence:** `recordCalls` (`lib/calls.ts:181‑196`) does a plain `insert`. `/api/brief` POST calls it on every request. `scout_picks` and `daily_briefs` are replaced/upserted per sweep, but `calls` accumulates. Two "Re‑sweep now" clicks on the same day → two full sets of rows for the same ideas.

**Failure scenario (Confirmed by reading):** the calibration memo aggregates over `calls`; duplicates inflate cohort sizes and skew hit‑rate/target‑bias — the very numbers fed back into prompts as "your calibration." Garbage‑in on the honesty loop.

**Fix — make same‑day re‑records idempotent.** Add a natural key and upsert:
```sql
alter table calls add column if not exists call_date date not null default (now() at time zone 'utc')::date;
create unique index if not exists calls_dedup on calls (user_id, source, instrument, call_date);
```
```ts
// lib/calls.ts recordCalls(): replace `.insert(rows)` with:
await sb.from("calls").upsert(rows, { onConflict: "user_id,source,instrument,call_date", ignoreDuplicates: true });
```
(Include `call_date` in the mapped rows.) Now re‑sweeps overwrite rather than multiply.

---

### R1 (P1) — Non‑atomic delete‑then‑insert can empty a feed

**Evidence:** three places do `delete` then a separate `insert`:
- `app/api/news/route.ts:47‑54` — `delete().eq("user_id")` then `insert(items)`.
- `app/api/brief/route.ts:88‑90` — `delete().in("kind", [...])` then `insert(rows)`.
- `app/api/cron/sweep/route.ts:150‑156` — `delete().eq("user_id")` then `insert([...])`.

**Failure scenario (Confirmed):** if the `insert` throws (transient PostgREST error, payload issue) or the serverless function is killed between the two awaits (the brief route streams for 20–40s first, so the writes happen late — closest to the timeout), the old rows are gone and the new ones never land. The user opens the app to an empty News/Today feed until the next sweep.

**Fix — do it in one statement via an RPC (atomic):**
```sql
create or replace function public.replace_news(p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.news_items where user_id = auth.uid();
  insert into public.news_items (user_id, headline, source, why, symbol, asset_class, signal, recency)
  select auth.uid(), x.headline, x.source, x.why, x.symbol, x.asset_class, x.signal, x.recency
  from jsonb_to_recordset(p_items) as x(headline text, source text, why text, symbol text, asset_class text, signal text, recency text);
end $$;
revoke execute on function public.replace_news(jsonb) from anon;
```
```ts
await sb.rpc("replace_news", { p_items: result.items.map(n => ({ headline:n.head, source:n.source, why:n.why, symbol:n.ticker, asset_class:n.cls, signal:n.signal, recency:n.when })) });
```
Same pattern for `scout_picks`. As a lighter interim step, at least **insert before delete‑old** (insert new rows, then delete rows older than this batch's timestamp) so a failure leaves the old feed intact.

---

## 4. Performance section

### Indexes (exact statements)

The RLS predicate on every per‑user table is `user_id = auth.uid()`, so **every** query carries a `user_id` filter. Six of those tables have no covering index (confirmed via the performance advisor `unindexed_foreign_keys`). Add:

```sql
create index if not exists watchlist_user      on watchlist(user_id);
create index if not exists themes_user          on themes(user_id);
create index if not exists scout_picks_user_kind on scout_picks(user_id, kind);      -- GETs filter user_id + kind
create index if not exists news_items_user_created on news_items(user_id, created_at desc); -- list is ordered by created_at
create index if not exists chat_messages_conv   on chat_messages(conversation_id, created_at); -- GET resumes by conversation
create index if not exists chat_messages_user_created on chat_messages(user_id, created_at desc);
create index if not exists properties_user       on properties(user_id);
```
`daily_briefs` is already covered by its `unique (user_id, brief_date)`; `calls` has `calls_user_created`. Expected impact: the Today/News/Radar loads currently do a seq scan filtered by RLS; with ~2 users that's instant, but each is O(table). These turn them into index range scans — the difference between fine and unusable at 10k+ users × dozens of picks each.

### RLS init‑plan (18 policies)

Every policy uses bare `auth.uid()`, which Postgres re‑evaluates **per row** (advisor `auth_rls_initplan`). Wrap in a scalar subquery so it's evaluated once per statement. Regenerate the policy block in `supabase/schema.sql`:

```sql
-- was: using (auth.uid() = user_id) with check (auth.uid() = user_id)
create policy "own watch" on watchlist for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- …repeat for profiles/settings/themes/scout_picks/news_items/chat_messages/daily_briefs/
--    properties/property_outlooks/calls, and the read-only snapshot/series policies
--    (use (select auth.role()) = 'authenticated').
```
Measurable via `explain analyze` on `select * from news_items` as an authenticated user before/after — the per‑row `InitPlan` re‑eval disappears.

### Request waterfalls & fan‑out (good, with two nits)

- **Well done:** `fetchMarketWide` (`lib/snapshot.ts:566`) parallelizes movers/sectors/macro/commodities/insiders with `Promise.all` and a per‑source deadline; the brief route parallelizes the six user‑scoped reads (`app/api/brief/route.ts:56‑63`); the sweep decouples synthesis from the news fetch. Client caching (`lib/clientCache.ts`) dedupes in‑flight GETs and TTL‑caches — the Today view batches its three loads in one `Promise.all` (`components/TodayView.tsx:37`).
- **Nit PERF1:** market‑wide caches in `lib/market.ts`/`macro.ts`/`commodities.ts`/`insider.ts` are module‑level `let` — per serverless instance. The DB‑backed `market_snapshots`/`ticker_series` handle the biggest fetches, but sectors, macro, and the movers *signal* cache still fan out per cold instance. Route **all** market‑wide reads through `readMarketWide`/`market_snapshots` so the 25‑req/day Alpha Vantage tier is truly shared.
- **Nit SC1:** `cron/sweep` iterates users with `await sweepUser(...)` **sequentially** (`route.ts:52‑57`) despite the "fired concurrently per user" comment (concurrency is *within* a user, not across). Each user does ~10 web‑search AI calls; past ~a few dozen opted‑in users the 300s budget is gone and the tail is skipped silently. Batch with bounded concurrency (e.g. `p-limit(3)`), or move to a queue.

### Rendering / React (client)

- **Strong patterns already:** streamed briefings parsed at most once per animation frame (`components/AnalyzeView.tsx:55‑58`, `TodayView.tsx` `generate`); tabs lazy‑mounted then kept alive via `display:none` so switching doesn't refetch (`components/DiscoverView.tsx:392`); `Intl` timezone resolved once outside the 1 Hz clock (`AppShell.tsx:24`); `useCallback` on handlers.
- **Minor:** the six/eight lens `<TradingViewChart>` injects a third‑party script per analysis; fine, but ensure it's torn down on asset change (it remounts on `analyzed` — verify no duplicate script tags accumulate across many runs). Speculative; worth a devtools check.

---

## 5. Data protection section — per‑table RLS verdict

Verified against the live DB (`relrowsecurity` + policy count) and `supabase/schema.sql`. **Every Bacon table: RLS ON with a correct, restrictive policy.** No `USING (true)`. Cross‑user access is not possible on Bacon's own tables.

| Table | RLS | Policy | Verdict |
|-------|-----|--------|---------|
| `profiles` | ✅ | `auth.uid() = id` (all) | **PASS** |
| `settings` | ✅ | `auth.uid() = user_id` (all) | **PASS** |
| `watchlist` | ✅ | `auth.uid() = user_id` (all) | **PASS** (add index P2) |
| `themes` | ✅ | `auth.uid() = user_id` (all) | **PASS** (add index P2) |
| `scout_picks` | ✅ | `auth.uid() = user_id` (all) | **PASS** (add index P2) |
| `news_items` | ✅ | `auth.uid() = user_id` (all) | **PASS** (add index P2) |
| `chat_messages` | ✅ | `auth.uid() = user_id` (all) | **PASS** (add index P2) |
| `daily_briefs` | ✅ | `auth.uid() = user_id` (all) | **PASS** |
| `calls` | ✅ | `auth.uid() = user_id` (all) | **PASS** |
| `properties` | ✅ | `auth.uid() = user_id` (all) | **PASS** (add index P2) |
| `property_outlooks` | ✅ | `auth.uid() = user_id` (all) | **PASS** |
| `market_snapshots` | ✅ | `auth.role() = 'authenticated'` (select) | **PASS** — read‑only shared cache; writes via service role only |
| `ticker_series` | ✅ | `auth.role() = 'authenticated'` (select) | **PASS** — same |
| `property_series` | ✅ | `auth.role() = 'authenticated'` (select) | **PASS** — same |
| `sona_profiles` | ✅ | **none** | **FAIL (not Bacon's)** — see S1 |
| `sona_usage` | ✅ | **none** | **FAIL (not Bacon's)** — see S1 |

Other data‑protection checks:
- **Service‑role key:** used only in `lib/supabase/admin.ts` (cron/admin) and referenced as a boolean in `/api/health`. Never in a client component or `NEXT_PUBLIC_*`. **PASS.**
- **Anthropic key:** only in `lib/anthropic.ts`, lazily constructed, server‑only. **PASS.**
- **Secrets in git history:** none (`git grep` over all revs for `sk-ant`/JWT prefixes → clean; only `.env.example` with placeholders). **PASS.**
- **Input validation:** every route hand‑validates (`String(...).slice(...)`, numeric clamps, `mapClass`, date regex on property). No string‑built SQL; all through `supabase-js`. **PASS** — recommend zod for the JSON bodies to centralize (M2).
- **Authorization:** every mutating route independently calls `getUser()` and 401s; RLS is the second layer. `proxy.ts` intentionally skips `/api/*` for latency, which is safe *because* each route re‑checks — **except `/api/health`, which never checks** (S3). **PASS with one gap.**
- **CSRF:** state‑changing routes are JSON `POST/PATCH/DELETE` reading from the Supabase cookie session; SameSite cookies + JSON content‑type give reasonable protection, but there's no explicit anti‑CSRF token. Low risk; note for the payments phase.
- **Redirects:** auth callback redirects to a relative `next` path (`app/api/auth/callback/route.ts:9`) — no open‑redirect (uses `origin` + relative path). **PASS.**
- **Storage:** no Supabase Storage buckets in use. N/A.

---

## 6. Quick wins (<30 min each, safe)

1. **S1 revokes** — paste the `revoke execute` block; clears a live PII exposure. *(highest value)*
2. **P1 RLS `(select auth.uid())`** — regenerate the policy block in `schema.sql`, re‑run it (idempotent).
3. **P2 indexes** — paste the seven `create index` statements.
4. **S3** — add a `getUser()` (or `CRON_SECRET`) check to `/api/health` and delete the `providers` object from the public response body.
5. **S4** — bump password minimum to 8 in `app/login/page.tsx:38` and `app/api/account/password/route.ts:14`; toggle Supabase → Auth → "leaked password protection" on.
6. **M1** — change `AnalyzeView.tsx:155` to "eight lenses" (or reconcile everything to six) so the hero matches the `LENSES` array.
7. **CFG1** — confirm the Vercel plan supports `maxDuration = 300`; if on Hobby, the analyze/brief streams silently cap at 60s.
8. **DEP1** — `npm i -D vitest@^2.1.9` (patch) to clear the dev‑tool CVEs; **do not** run `npm audit fix --force` (it proposes `next@9`, a catastrophic downgrade).

---

## 7. 90‑day hardening roadmap

**Week 1 — stop the bleeding (security + correctness):**
- S1 revokes + isolate/policy the `sona_*` objects (ideally split into its own Supabase project).
- RLS `(select auth.uid())` rewrite + the seven indexes (P1/P2).
- S3 health lockdown; S4 password policy.
- C1: wire `recordCalls` into the nightly cron so calibration actually runs.

**Weeks 2–4 — cost, integrity, resilience:**
- S2: per‑user daily AI quota (Postgres RPC above) + a burst limiter; this is a prerequisite for opening signups wider or launching.
- C2: idempotent `recordCalls` (dedup index).
- R1: convert the three delete‑then‑insert flows to atomic RPCs.
- REL1: add Sentry (or equivalent) + a correlation id per request; stop swallowing errors silently in the cron paths — count and log them.

**Weeks 5–8 — scale & observability:**
- SC1: bounded‑concurrency (or queued) sweep so the cron scales past a few dozen opted‑in users.
- PERF1: route all market‑wide fetches through the DB snapshot; verify Alpha Vantage/FRED budgets hold under concurrent cold starts.
- C3: benchmark property/FX calls against the right index instead of SPY.
- Add integration tests for the money‑adjacent and auth flows (see below) and a security scan (S1‑class RPC exposure, secret scan) to CI.

**Weeks 9–13 — pre‑monetization hardening:**
- CI currently runs lint + test + build (`.github/workflows/ci.yml`) — add `npm audit --omit=dev` (fail on high+), typecheck as a distinct gate, and a Supabase advisor check.
- When the paid tier lands: Stripe webhook signature verification + idempotency on the event id, server‑side entitlement checks (never trust client plan state), and explicit CSRF tokens on billing mutations. **None of this exists yet** — there is no payments code in the repo, so treat the entire billing surface as greenfield to build securely rather than retrofit.
- CSP (SEC5) and a documented runbook for the cron/secret rotation.

**Testing gaps worth closing (P1 if you monetize):** the suite (92 tests) covers parsers, financial math, and pure helpers well, but there are **no tests for the auth flow, the RLS boundary (user A cannot read user B), the quota gate, or the delete‑then‑insert replace flows** — exactly the paths whose failure is a P0. Add a Supabase‑local integration test that signs in as two users and asserts isolation.
