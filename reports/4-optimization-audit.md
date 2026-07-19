# Bacon — Optimization Audit (Speed · Accuracy · Reliability)

**Method:** A multi-agent audit — six reviewers swept the subsystems (data layer, AI routes, cron/background, financial correctness, DB access, client/React); **every finding was then adversarially verified against the actual code** by an independent agent instructed to reject it. 36 raw findings → **35 survived verification** (1 rejected). This report dedupes the heavy overlap (the cron delete-then-insert and sequential-loop issues were independently found by 3 reviewers) down to **~24 distinct issues**, re-ranked with a direct read of the code. Severities reflect impact on the opinionated-advisor direction, where a wrong number fed as "ground truth" is worse than a slow one.

> The two agents that would have written this report inside the workflow hit the account's **monthly spend limit**, so the synthesis and completeness-critic passes did not run — this document was assembled by hand from the verified findings. That means there is **no completeness-critic gap list** (see §9).

---

## 1. Executive summary

Bacon is **green on every baseline check** (see §2) and structurally sound — RLS is correct, secrets are server-only, the real-data plumbing degrades gracefully in the common case. The audit found **no P0s**. But there is a clear pattern to the real issues, and it maps exactly onto your three axes:

- **Accuracy — the newest code is the shakiest.** The SEC-fundamentals module I added last is fed to the model as *"REAL FUNDAMENTALS … use THEM, do not substitute,"* yet it has two verified numeric bugs: **dual-class share counts collapse to one class** (market cap for GOOGL/BRK understated ~2×) and **PEG derived from a negative prior year** produces a deceptively tiny, "deeply undervalued" ratio from a one-off turnaround. For an advisor, injecting confidently-wrong numbers is the worst failure mode.
- **Reliability — the background jobs aren't production-grade at scale.** The nightly sweep processes users **strictly sequentially** with no per-user `try/catch`, and rebuilds feeds with **non-atomic delete-then-insert whose insert error is never checked**. Past ~10 opted-in users the run times out and silently drops the same tail every night; one user's DB error aborts everyone; a failed insert wipes a feed with nothing to replace it.
- **Speed — real money and latency leak on the hot paths.** Switching Analyze↔cockpit **unmounts a finished analysis and auto-re-fires a billed web-search stream**; external provider fetches (FRED/Alpha Vantage) **have no timeout** so a hung provider stalls a brief to the platform ceiling; the macro fetch is a serial un-timed await before first byte.

**Top 5 to fix (highest-leverage first):**
1. **Cron sweep resilience** (R1+R2+R3 below) — bounded concurrency + per-user `try/catch` + atomic feed replace + advance `last_sweep_at` before the slow work. This one change de-risks the entire automated product.
2. **Fundamentals accuracy bugs** (A1 dual-class shares, A2 negative-earnings PEG) — they poison the advisor's ground truth.
3. **AppShell keep-alive** (S1) — stop discarding and re-billing a completed analysis.
4. **Provider fetch timeouts** (R4) — bound every external fetch so one slow upstream can't hang a brief.
5. **Empty-snapshot poisoning** (R5) — don't cache an all-empty market bundle for the whole day.

**Single highest-leverage fix:** the **cron sweep** rewrite (#1). It's the beating heart of "the system hunts while you sleep," and today it's the least resilient code in the repo — a scaling cliff, a whole-run abort risk, and a data-loss window all in one ~40-line function.

---

## 2. Ground-truth baseline (all green)

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ PASS, 0 errors (~12s) |
| `eslint` | ✅ PASS, 0 errors / 0 warnings (~11s) |
| `vitest` | ✅ **102 tests**, 14 files, all pass (3.2s) |
| `next build` | ✅ Compiled in 7.5s; 39 routes; 35/35 static pages. *(Turbopack output emits no per-route First-Load-JS column, so no bundle sizes were measurable — worth adding a bundle check to CI.)* |
| `npm audit --omit=dev` | 2 **moderate** only (postcss `<8.5.10` XSS via `next`); fix is a Next→9 downgrade — **do not** `--force`. No prod-exploitable high/critical. |

No files were changed by the audit.

---

## 3. Findings (deduped, ranked)

| ID | Sev | Axis | File:lines | Problem | Fix | Effort |
|----|-----|------|-----------|---------|-----|--------|
| **A1** | P1 | accuracy | `lib/fundamentals.ts:94-100,261-273` | Dual/multi-class share count collapses to one class → market cap & ratios ~½, injected as ground truth | Sum `EntityCommonStockSharesOutstanding` across classes at the latest `end` | S |
| **R1** | P1 | reliability | `cron/sweep/route.ts:140-152`; `brief/route.ts:89-90`; `news/route.ts:44-45` | Non-atomic delete-then-insert; insert `{error}` never checked/swallowed → feed wiped on failure | Atomic replace via RPC, or insert-then-delete-stale; check `error` | M |
| **R2** | P1 | reliability | `cron/sweep/route.ts:51-56` | No per-user `try/catch` → one user's throw aborts the whole run, 500s, rest skipped | Wrap `sweepUser` in try/catch + continue (mirror watch cron) | S |
| **R3** | P1 | speed/rel | `cron/sweep/route.ts:51-56,161` | Users processed sequentially → past ~10 due users the run times out; `last_sweep_at` set only at end so the **same tail is dropped every night** | Bounded-concurrency batches; order by `last_sweep_at` asc; claim/advance before slow work | M |
| **S1** | P1 | speed | `components/AppShell.tsx:198-200` (+`AnalyzeView.tsx:129-136`) | Analyze↔cockpit hard-ternary unmounts finished analysis **and** stale `target.token` auto-re-fires a **billed** `/api/analyze` stream | Keep both views mounted (`display:none`) or lift state; guard auto-run against a consumed token | M |
| **A2** | P1 | accuracy | `lib/fundamentals.ts:102-103,117-120` | `growthPct` uses `Math.abs(prior)`; prior-year loss → huge fake growth → tiny "undervalued" PEG as ground truth | Only compute earnings-growth/PEG when `prior > 0`; else null | S |
| **R4** | P2 | reliability | `lib/macro.ts:49`, `commodities.ts:57`, `market.ts:46,119,245` | External fetches have **no `AbortSignal.timeout`** (unlike insider/fundamentals) → a hung provider stalls the brief to the platform ceiling | Add `AbortSignal.timeout(~4-5s)` to every provider fetch; wrap all sources in `withDeadline` in `fetchMarketWide` | S |
| **R5** | P2 | reliability | `lib/snapshot.ts:30-37,70-72` | All-empty bundle passes the `Array.isArray` check → cached for the whole UTC day → transient outage poisons every user's brief until tomorrow | Treat empty as absent (require `movers.length>0 || macro.length>0`); don't cache an all-empty bundle | S |
| **S2** | P2 | speed | `analyze/route.ts:33-36` | `getMacroSnapshot()` is a **serial, un-timed await before first byte**, not in the deadline-bounded `Promise.all` | Fold into the `Promise.all` with `withDeadline(...,4000,[])` | S |
| **A3** | P2 | accuracy | `lib/calls.ts:46-57` | `parseTargets` tests `%` before `$` → "base $160 (+12%)" stores `pct 12`, discarding the real price target; also drops `M/B` suffix | Prefer `$` price in the base clause; extend regex for magnitude suffixes | S |
| **A4** | P2 | accuracy | `lib/calls.ts:96-100` | `recordCalls` upsert uses `ignoreDuplicates:true` (= DO NOTHING) — **contradicts its comment**; a revised same-day call is silently dropped, so calibration grades the stale call | Drop `ignoreDuplicates` so the latest same-day call wins (default merge) | XS |
| **S3** | P2 | speed | `lib/fundamentals.ts:218-234`; `market.ts:37-38,82,244` | Ticker→CIK map (~1MB) + fund/signal caches are **per-instance**, not DB-shared like prices → every cold instance re-downloads; can blow the 8s deadline and drop the lens | Back the CIK map + assembled facts with a DB cache (like `ticker_series`) | M |
| **S4** | P2 | speed | `lib/market.ts:133-158` | `getDailySeries` won't cache a series that can't reach `since` → every analyze of a recently-IPO'd ticker re-fans-out Stooq→Yahoo on the request path | Cache best-available regardless of `reaches()`; route MAs through `getCachedSeries` | S |
| **R6** | P2 | reliability | `lib/calls.ts:127-162` | `gradeCalls` takes 60/run with **no `ORDER BY`** → with a backlog, arbitrary rows chosen; some calls never finalize → non-deterministic calibration sample | `ORDER BY horizon_date asc, created_at asc`; paginate; exclude interim-graded not-yet-due | M |
| **S5** | P2 | speed | `cron/watch/route.ts:27-80` | Watch cron: `gradeCalls` then **sequential** per-user web-search `ask()` under 300s → tail's kill-conditions never checked | Bounded concurrency; move `gradeCalls` to its own cron | M |
| **S6** | P2 | speed | `cron/warm-prices/route.ts:32,24` | Unbounded full-table scan of **all** watchlists + a global `daily_briefs` order-by with no single-column `brief_date` index | `.limit()`/distinct in SQL; add `daily_briefs(brief_date desc)` index if the global scan stays | S |
| **S7** | P2 | speed | `components/AnalyzeView.tsx:138-148` | Every streamed frame re-runs the unmemoized figure-audit (4 regexes over all 8 lenses) + full grid/radar re-render → jank on phones | `useMemo` `stances`/`lean`/`dataCheck` keyed on `briefing`; memoize the grid | S |
| **R7** | P2 | reliability | `components/AnalyzeView.tsx:119-125` | `save()` omits `invalidate("/api/watchlist")` (the 3 other write-sites have it) → the saved name shows untracked app-wide for up to 30s | Add the `invalidate` call after a successful save | XS |
| **S8** | P3 | speed | `analyze/route.ts:41-42,51` | `withDeadline` abandons but doesn't **cancel** the Grok call → losing the 12s race still pays a full 45s Grok+X-search | Thread an `AbortController` into `communityPulse`/`getFundamentals`; clear the timer on settle | M |
| **R8** | P3 | reliability | `chat/route.ts:57-74` | Chat hand-rolls its stream loop; on mid-stream error it persists the **partial** text as a finished assistant turn (no `ok` guard) | Track `ok` and skip/mark the insert on error (as analyze/brief do) | S |
| **R9** | P3 | reliability | `chat/route.ts:40-50` | Quota counted **before** body validation → an empty `{}`/`[]` request still burns a daily unit | Move `withinQuota()` after the messages-length check | XS |
| **A5** | P3 | accuracy | `lib/calls.ts:31-39` | `expectedDirection` maps bare `stay`→bearish; a bullish "Stay long" is graded as expecting a decline | Match "stay away/out", or drop `stay` from `BEARISH` | XS |
| **A6** | P3 | accuracy | `lib/verify.ts:38` | `ESTIMATE_RE` matches bare `bear`/`bull` → an uncited hard figure in a "bear market" sentence is never flagged | Require `(bear\|bull)\s+case` | XS |
| **A7** | P3 | accuracy | `lib/calls.ts:141-146` | SPY stored as `bench_pct` for **property/FX** calls (SG/AU housing vs S&P 500) — latent today, wrong if surfaced | Gate the SPY fetch on a US-equity source; null for property | S |
| **A8** | P3 | accuracy | `watchlist/route.ts:29-36` | Duplicate check-then-insert race, **no unique constraint** → double-submit creates dup rows (counted twice by the sweep) | Unique index `watchlist(user_id,symbol)` / `themes(user_id,lower(label))`; upsert | S |
| **S9** | P3 | speed | `app/api/watchlist/route.ts:12`, `themes/route.ts:10` | Unbounded list GETs (no `.limit()`) — grow without bound as a user tracks more names | Add `.limit()` + pagination | XS |
| **R10** | P3 | reliability | `lib/clientCache.ts:14-31` | `invalidate()` clears `store` but not `inflight`; a GET in flight during a mutation re-caches stale data for a full TTL | Epoch counter bumped by `invalidate`; skip `store.set` if epoch advanced | S |

*(The 1 verification-rejected finding is omitted.)*

---

## 4. P1 detail with patches

### A1 — Dual-class share count → wrong market cap (fundamentals.ts)
`latestInstant(concepts.shares)` returns a single row, but multi-class filers report `dei:EntityCommonStockSharesOutstanding` **once per share class**, several sharing the same `end`. So GOOGL/BRK get one class's count, and `deriveValuation` computes `marketCap = price × (one class)` — understated ~2× — and hands it to the model as authoritative. **Fix: sum across classes at the latest end.**
```ts
// lib/fundamentals.ts — replace latestInstant(shares) usage for the shares concept
export function sumLatestInstant(points: XbrlPoint[] | undefined): { end: string; val: number } | null {
  if (!Array.isArray(points)) return null;
  const instants = points.filter((p) => Number.isFinite(p.val) && !p.start);
  if (!instants.length) return null;
  const latestEnd = instants.reduce((m, p) => (p.end > m ? p.end : m), instants[0].end);
  // Sum every class reported at that date (dual/multi-class cover-page counts).
  const val = instants.filter((p) => p.end === latestEnd).reduce((s, p) => s + p.val, 0);
  return { end: latestEnd, val };
}
// in assembleFundamentals: const shares = sumLatestInstant(concepts.shares);
```
*(Add a fixture test: two class rows at the same `end` → summed.)*

### A2 — PEG from a negative prior year (fundamentals.ts)
`growthPct` divides by `Math.abs(prior)`, so a loss→profit swing yields a huge fake growth and a tiny "undervalued" PEG. **Fix: growth is only meaningful off a positive base.**
```ts
// lib/fundamentals.ts
const growthPct = (latest: number | null, prior: number | null): number | null =>
  latest != null && prior != null && prior > 0 ? ((latest - prior) / prior) * 100 : null;
```
This makes `earningsGrowthPct` null on a turnaround, so `deriveValuation` correctly falls back to revenue growth (or omits PEG) instead of printing `PEG 0.13`.

### R1 — Non-atomic delete-then-insert wipes feeds
Three sites (`cron/sweep` scout_picks+news, `brief` POST, `news` POST) do `delete()` then a separate `insert()` with the `{error}` unchecked. A failed insert after a committed delete leaves the feed empty and silent. **Fix: an atomic replace RPC** (one per table), e.g.:
```sql
create or replace function public.replace_scout_picks(p_user uuid, p_kinds text[], p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.scout_picks where user_id = p_user and kind = any(p_kinds);
  insert into public.scout_picks
    select * from jsonb_populate_recordset(null::public.scout_picks, p_rows);
end $$;
```
Interim (no migration): check the insert `error` and, on failure, **don't** leave the table empty (skip the delete, or re-insert the prior batch). At minimum stop swallowing the error in `streamRoute.ts` `onDone`.

### R2 — One user aborts the whole sweep
```ts
// app/api/cron/sweep/route.ts — inside the due loop
for (const u of due) {
  try { await sweepUser(admin, u.user_id, moverPicks, u.news_source, u.news_focus, mw, !!u.brief_email_enabled, splitVoices(u.voices)); swept++; }
  catch (err) { console.error("sweepUser failed", u.user_id, err); /* continue */ }
}
```

### R3 — Sequential loop drops the same tail nightly
Combine with R2. Order due users oldest-first and process with bounded concurrency; advance `last_sweep_at` *before* the slow AI work so a mid-loop timeout doesn't strand the same users forever:
```ts
const due = (users ?? [])
  .filter(isDue)
  .sort((a, b) => (a.last_sweep_at ?? "") < (b.last_sweep_at ?? "") ? -1 : 1); // oldest served first
const POOL = 3;
for (let i = 0; i < due.length; i += POOL) {
  await Promise.all(due.slice(i, i + POOL).map((u) =>
    sweepUser(...).catch((e) => console.error("sweepUser failed", u.user_id, e))));
}
```
For real scale this wants a queue (QStash/Inngest) so wall-clock is per-user, not the sum — but the pool + ordering removes the "same tail every night" cliff immediately.

### S1 — Analyze re-mount discards + re-bills a completed analysis
`AppShell.tsx:198` renders `place === "discover" ? <DiscoverView/> : <AnalyzeView/>` — a hard ternary. Toggling `place` unmounts the finished briefing (and its Bull/Bear/Red-team/etc. sub-results), and the stale `target.token` in `AppShell` makes `AnalyzeView`'s auto-run effect re-fire a **billed** `/api/analyze` stream on remount. **Fix: keep both mounted** (the exact `display:none` keep-alive `DiscoverView` already uses for its tabs):
```tsx
<div className="pr-canvas">
  <div style={{ display: place === "discover" ? "block" : "none" }}>
    <DiscoverView tab={discoverTab} setTab={setDiscoverTab} onAnalyze={openAnalyze} onDiscuss={openChat} />
  </div>
  <div style={{ display: place === "analyze" ? "block" : "none" }}>
    <AnalyzeView target={analyzeTarget} onDiscuss={openChat} quickSyms={watchlistSyms} />
  </div>
</div>
```

---

## 5. Speed section (concrete wins)

- **Stop the double-bill (S1)** — the single biggest *cost* leak: a completed analysis re-runs a full web-search stream on a simple tab toggle.
- **Bound external fetches (R4) + fold macro into the parallel fan-out (S2)** — today a cold analyze awaits macro serially with no timeout before first byte; both together cut worst-case first-byte from "up to 240s" to the existing 8-12s deadline envelope.
- **Share the fundamentals/CIK caches in Postgres (S3)** and **cache best-available series (S4)** — removes a ~1MB re-download and repeated Stooq/Yahoo fan-outs from the request path under scale-out.
- **Memoize the stream render (S7)** — stops hundreds of full 8-panel + regex-audit re-renders across a 20-40s stream.
- **Bound the cron reads (S6)** and **parallelize `gradeCalls` pricing (S8-adjacent)** — keep the background jobs off full-table scans and serial round-trips.
- **DB indexes already shipped** (the PR #27 migration) cover the per-user hot paths; the one gap is a single-column `daily_briefs(brief_date desc)` for the global warm-prices scan (S6).

## 6. Accuracy section

The advisor's credibility rests here, and the newest module is the weakest:
- **A1/A2** inject wrong "ground-truth" numbers (market cap ~½ on dual-class; fake-tiny PEG on turnarounds) — fix before leaning on the fundamentals lens.
- **A3/A4** corrupt the calibration loop's own data: the target parser grades against the wrong basis, and `ignoreDuplicates` drops the *updated* same-day call so grading scores a stale one. Since calibration is your honesty moat, these matter more than their P2/P3 label suggests.
- **A5/A6/A7/A8** are smaller correctness leaks (direction grading of "stay", the bear/bull-market false-negative in the fabrication gate, SPY-vs-property benchmark, duplicate watchlist rows).

## 7. Reliability section

- **R1/R2/R3** make the automated sweep production-unsafe at modest scale — the highest-priority cluster.
- **R4/R5** are graceful-degradation gaps: an un-timed fetch hangs a brief; an empty snapshot poisons a whole day.
- **R6** makes calibration grading non-deterministic under backlog.
- **R7/R8/R9/R10** are client/route hygiene (stale cache after save, truncated chat persisted as complete, quota metered on invalid requests, in-flight cache repopulation).

## 8. Quick wins (<30 min each, safe)

`A4` (drop `ignoreDuplicates`), `R7` (add one `invalidate`), `R9` (reorder quota check), `A5`/`A6` (regex tweaks), `S9` (add `.limit()`), `A2` (one-line growth guard), `R2` (wrap in try/catch). Each is a small, isolated, test-backable change.

---

## 9. Verdict & sequencing

**Is Bacon fast/accurate/reliable enough for the opinionated-advisor direction? Not yet — but the gap is a focused, ~1-week list, not a rewrite.** The foundation is green (tsc/lint/102 tests/build), RLS/security are sound, and there are no P0s. The blockers are concentrated:

1. **Reliability first (R1-R3):** make the sweep resilient — bounded concurrency, per-user isolation, atomic feed replace, advance `last_sweep_at` early. Without this the "hunts while you sleep" promise breaks the moment you have real users.
2. **Accuracy second (A1-A4):** an advisor that prints a ~½ market cap or a fake PEG as "SEC-filed ground truth" is worse than one that says "limited data." Fix the fundamentals math and the calibration-data corruption.
3. **Speed third (S1, R4, S2):** stop the Analyze double-bill and bound the provider fetches.
4. Then the P3 tail as hygiene.

**Caveat on completeness:** because the critic pass didn't run (spend limit), this audit is thorough on the six reviewed subsystems but has **not** been cross-checked for blind spots — untested critical paths (auth flow, the RLS boundary, the quota gate), concurrency/cold-start behavior, and `vercel.json` cron cadence vs `maxDuration` are worth a dedicated follow-up look.
