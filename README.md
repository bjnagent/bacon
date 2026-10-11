# Bacon

**Your overnight research desk.** Every night Bacon reads the market's real
signals — movers, sector rotation, macro, filings, headlines, prediction-market
odds, the crowd — and hands you a short, ranked brief of the ideas where
independent signals agree. Each idea states the condition that would confirm it
and the one that would kill it. Any asset can be deep-dived through eight
professional lenses, and every call Bacon files is graded against real prices and
the S&P 500 — in public.

Web app (Next.js on Vercel) + iOS app (Capacitor shell with native push, haptics
and in-app purchase). Research, not investment advice.

## The product

| Tab | What it does |
|---|---|
| **Today** | The morning brief (personal on Pro/Desk, the shared house brief on Free), macro strip, idea cards with live/delayed quotes, confirm/kill lines, a data check on unsourced figures. **Headlines**: paraphrased, attributed news with lean filters. |
| **Watchlist** | Names Bacon re-reads every night (lean, latest update, what to watch, your thesis/conviction), fresh finds from your themes, and the SG/AU **property** tracker. |
| **Analyze** | Eight-lens deep dive on any stock, ETF, FX pair, crypto or commodity, with a convergence verdict; Bull vs Bear, investor takes, red team, chain map. Saved history; a shared 6-hour cache makes popular names free. |
| **Track record** | Hit rate, alpha vs SPY, $10K-per-call chart, calibration memo, every call (wins, misses, open), brief history with kill alerts. |
| **Account** | Plan & usage, alerts (daily brief, kill watch, email, push), voices, appearance, security, legal, sign out, delete account. |

Plus: ⌘K search, a context-aware chat sheet, onboarding, and public pages —
`/welcome`, `/pricing`, `/record` (the house scorecard), `/legal/*`.

## Plans

Defined once in [`lib/plans.ts`](lib/plans.ts) — the pricing page, paywall,
server gate and cost model all read it.

| | Free | Pro | Desk |
|---|---|---|---|
| Price | $0 | $19.99/mo · $179.99/yr | $49.99/mo · $449.99/yr |
| Brief | Shared house brief | Personal, nightly | Personal, nightly |
| Deep dives / pressure tests / chat per month | 3 / – / 10 | 25 / 15 / 80 | 80 / 50 / 250 |

Every new account gets a 7-day Pro trial with no card (capped allowances).
Allowances are metered atomically in Postgres and refunded when work fails.
The unit economics behind every number — measured from the production cost
ledger — are in [`docs/pricing-and-unit-economics.md`](docs/pricing-and-unit-economics.md).

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Own design system: tokens + primitives in `app/globals.css`, React kit in `components/ui`, CSS Modules per feature. See [`docs/design-system.md`](docs/design-system.md). |
| Data | Supabase (Postgres + Auth + RLS). Schema in [`supabase/schema.sql`](supabase/schema.sql). |
| AI | Anthropic (Sonnet for user-facing work, Haiku for bulk), Gemini as the cheap tier for background refreshes, Grok for community pulse — all server-side, every call metered to `ai_events`. |
| Real data | Alpha Vantage / Stooq / Yahoo (prices), FRED (macro, commodities, FX), SEC EDGAR (fundamentals, insider filings), Polymarket (odds), data.gov.sg / ABS / BIS (property). |
| Billing | Stripe (web) and the App Store via RevenueCat (iOS), one `subscriptions` table. |
| iOS | Capacitor 8 shell loading the deployed app; APNs push, StoreKit, universal links. See [`docs/ios.md`](docs/ios.md). |
| Hosting | Vercel, functions pinned to `sin1` (next to the Supabase database), daily crons. |

### How the app is put together

- **One shell, real URLs.** `app/(app)/layout.tsx` renders `components/app/AppShell`,
  which owns every signed-in screen. Each screen has a URL (`/`, `/news`,
  `/watchlist`, `/property`, `/analyze/NVDA`, `/track-record`, `/account`) for
  deep links from email, push and sharing; navigation uses the History API and
  visited screens stay mounted, so switching is instant and nothing refetches.
- **One API contract.** Routes use `lib/api.ts` (`requireUser` with local JWT
  verification, `readJson`, `fail`) and answer errors as `{ error, code }`.
  Paid work goes through `gate()` in `lib/entitlements.ts`; a `402
  upgrade_required` opens the paywall automatically on the client
  (`lib/client/api.ts`).
- **Honesty is mechanical.** The model never supplies a current price or figure:
  real data is fetched, labelled with its source and staleness, and gaps are
  stated to the model out loud. `lib/verify.ts` flags unsourced figures in front
  of the user.

## Setup

```bash
npm install
cp .env.example .env.local   # every variable is documented in the file
npm run dev
```

1. **Supabase.** Create a project, then run [`supabase/schema.sql`](supabase/schema.sql)
   in the SQL editor (idempotent — re-run it after every pull that changes it).
   For an existing deployment moving to paid plans, also run
   [`supabase/migrations/2026-10-founding-members.sql`](supabase/migrations/2026-10-founding-members.sql)
   **once** (90 days of Pro for every existing account).
2. **Auth.** Enable Email. Add `<SITE>/api/auth/callback**` to the redirect
   allow-list. Point the email templates at the confirm route:
   `{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=<signup|recovery|email>`.
3. **Keys.** At minimum `ANTHROPIC_API_KEY`, the Supabase URL/anon/service-role
   keys, `NEXT_PUBLIC_SITE_URL` and `CRON_SECRET`. Market-data, FRED, Gemini,
   xAI, Resend, Stripe, RevenueCat and APNs keys each switch on their feature
   and degrade gracefully when absent.
4. **Billing.** Stripe: products/prices for Pro and Desk (monthly + yearly),
   customer portal, and a webhook to `/api/billing/webhook`. App Store: the four
   subscription products, RevenueCat entitlements `pro` / `desk`, and a
   RevenueCat webhook to `/api/billing/revenuecat`. Exact event lists and
   variables are in `.env.example` → Billing.
5. **iOS.** Everything native lives in `ios/` and is built on a Mac — follow
   [`docs/ios.md`](docs/ios.md).

### Developing without a Supabase project

```bash
node scripts/mock-supabase.mjs        # fixture-backed Auth + PostgREST on :54321
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=mock npm run dev
node scripts/shoot.mjs shots / /watchlist /analyze   # signed-in screenshots (VIEWPORT, THEME, FULL)
```

`MOCK_PLAN=free|pro|desk|trial` and `MOCK_EMPTY=1` switch the account the mock
serves. Fixtures are illustrative dev data, not market facts.

### Checks

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

CI runs the same on every push and pull request.

## Background jobs (`vercel.json`)

| Cron | When (UTC) | What |
|---|---|---|
| `/api/cron/warm-prices` | 11:00 | Caches the day's market snapshot and price series once for everyone. |
| `/api/cron/sweep` | 13:00 | Builds the nightly brief for accounts whose plan includes it (Pro, Desk, trial) **plus the house account**; refreshes their news and tracked names; sends the email / push. Bounded concurrency, per-user isolation, atomic claim. |
| `/api/cron/watch` | 22:00 | Grades every account's calls (whatever the plan); re-checks kill conditions for plans with the kill watch and pushes alerts. |

All require `Authorization: Bearer $CRON_SECRET` (Vercel sends it).

## The house record (public `/record`)

Every user's track record is their own — `calls` is RLS-scoped per account, only
grades 30 days after a call is filed, and needs eight graded calls in a cohort
before the calibration memo says anything. So the product's strongest claim —
*it grades its own calls* — is invisible to a new user for a month and to a
prospect forever.

The **house account** fixes that: one designated account sweeps daily through
exactly the same code path as everyone else, its brief is the one Free members
read, and its graded calls are published at `/record` with no login.

1. Create a dedicated account (not your personal one — its calls become public).
2. Sign in as it once.
3. Copy its `auth.users.id` into **`HOUSE_USER_ID`**. The sweep always runs it,
   and `/api/cron/watch` grades its calls with everyone else's.

What the page shows, and why it's structured this way:

- **Every priced call, wins and misses.** There is no outcome filter, so a
  flattering subset can't be selected — by accident or otherwise.
- **Open calls are labelled open.** A call is priced at 30 days but only settles
  when its horizon lands; hiding the in-flight ones would let the record be timed.
- **Alpha is computed on the benchmarked subset only**, both sides — averaging
  Bacon over every priced call and SPY over the subset with a benchmark would
  flatter whichever had the better sample.
- **Live calls never appear.** Pricing lags a call by 30 days, so the public page
  can't front-run the paying product.

Unset `HOUSE_USER_ID` and `/record` reports that the record isn't live yet. It
never falls back to another account.

## Non-negotiable constraints

1. **No fabricated data.** Bacon never invents prices, quotes or figures. Current
   facts come from real providers (labelled with source and staleness) or live
   search; forward numbers are labelled estimates.
2. **Research, not advice.** Plans sell research. The directive "advice mode"
   (entry / stop / size) is an operator allowlist (`ADVICE_EMAILS`) and is not
   for sale — it would need regulatory licensing.
3. **News copyright.** Headlines are paraphrased in Bacon's words and attributed.
4. **TradingView attribution** wherever its charts or links appear.
5. **Secrets stay server-side.** AI, service-role, billing and APNs keys never
   reach the browser; neither do the system prompts.

## Docs

- [`docs/design-system.md`](docs/design-system.md) — the UI contract
- [`docs/pricing-and-unit-economics.md`](docs/pricing-and-unit-economics.md) — plans, costs, margins
- [`docs/ios.md`](docs/ios.md) — the iOS app, App Store Connect, RevenueCat, review checklist
- `reports/` — the earlier code, design, GTM, optimisation and positioning reviews
