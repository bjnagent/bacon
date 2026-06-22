# Bacon — Investment Research Tool

> **Status:** Phase 1 complete + Phase 2 **Analyze**, **Radar**, and **Background Sweep** (auto-scout) slices live. See [Phase 2 TODO](#phase-2-todo).

Multi-asset investment research through six independent professional lenses — Fundamental, Technical, Factor, Macro/Regulatory, Smart Money/Signals, and Risk. Conviction comes from **convergence** across lenses, never a single indicator.

**Visual identity:** "Daylight Instrument" — warm bone/graph-paper canvas, near-black ink, safety-orange accent, six lens hues as channel colours.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Styling | Custom CSS design system (`pr-*` classes), ported **verbatim** from the reference artifact into `app/globals.css` |
| Auth + DB | Supabase (Postgres, Auth, RLS) via `@supabase/ssr` |
| AI | Anthropic Messages API + `web_search` server tool, **server-side only** (`@anthropic-ai/sdk`) |
| Icons | `lucide-react` |
| Charts | TradingView deep-links now (`TVLink`); embedded widgets in a later slice |
| Hosting | Vercel (+ Vercel Cron, wired in a later slice) |

## What works today

- **Auth:** Supabase magic-link login → session → protected app shell. Session refresh + route protection in `proxy.ts` (Next 16's renamed middleware).
- **Shell:** the full "Bacon look" — left rail nav, status bar, six-lens spectrum, bacon-rasher logo.
- **Radar (Phase 2 slice, home view):** a Scout + Tracking dashboard. **Tracking** lists your names with qualitative monitoring updates (`/api/track-update`) and editable thesis / conviction / note — all persisted to `watchlist`. **Scout** runs `/api/scout` on your saved `themes` to surface timely candidates; track a pick or jump straight into its lenses.
- **Analyze (Phase 2 slice):** run any asset through the six-lens cockpit. Calls `/api/analyze` → live web search → parsed briefing with per-lens stances, a convergence gauge, summary + bottom line. **Bull vs Bear** runs `/api/debate`. **Save to radar** persists to `watchlist`.
- **Background Sweep (auto-scout):** a daily Vercel Cron (`/api/cron/sweep`) that, per user who's enabled it, surfaces a **"fresh finds"** feed — **today's real top movers** (via a market-data provider, the one place real numbers are allowed) enriched with a qualitative "why it's moving / verify" read, plus theme-scout matches — and refreshes tracked names. Toggle it on the Radar; new finds are waiting when you return. No fabricated prices: the % move is attributed to the provider, the rest is grounded by web search.
- **Macro backdrop (real data):** the Radar home opens with a strip of live macro indicators — Fed funds, 10Y/2Y, the 10Y–2Y curve, CPI YoY, unemployment, VIX — from **FRED** (`/api/macro`, cached). The same snapshot is fed into the Analyze **Macro lens** so it reasons against real rates/inflation, not guesses. Real numbers, attributed; neutral direction arrows (no buy/sell signal).
- **Health:** `/api/health` probes Anthropic server-side and returns `{ ok, model }`.
- **News / Frameworks / Sizer:** present as placeholders in the shell; ported in later slices.

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url> bacon
cd bacon
npm install
```

### 2. Create Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Note your **Project Ref** (Settings → API).
3. Run the schema: open the SQL editor and paste the contents of [`supabase/schema.sql`](supabase/schema.sql). This creates all tables, enables RLS, and adds a trigger that auto-creates `profiles` + `settings` on signup.
4. Enable **Email** auth under Authentication → Providers.

### 3. Configure environment

```bash
cp .env.example .env.local
# Fill in all values — see .env.example for descriptions
```

Required:

```bash
# Anthropic (server-only)
ANTHROPIC_API_KEY=sk-ant-...
BACON_MODEL=claude-sonnet-4-6          # current Sonnet; matches the artifact

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # SERVER ONLY — never expose

# Market data — real movers for the background sweep (free key at
# alphavantage.co/support). Optional: without it the sweep still runs the
# qualitative theme scout.
MARKET_DATA_API_KEY=...

# Macro backdrop — FRED (free key at fredaccount.stlouisfed.org/apikeys).
# Optional: the macro strip hides itself if unset.
FRED_API_KEY=...

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # set to the Vercel URL in prod
CRON_SECRET=<random>                   # openssl rand -hex 32; protects /api/cron/*
```

> **Never commit `.env.local`.** It's in `.gitignore`.

### 4. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000` → redirects to magic-link login → sends email → click link → authenticated home. Go to **Analyze**, enter a ticker (e.g. `NVDA`), and run.

## Project layout

```
app/
├─ page.tsx              ← auth check → renders <AppShell/>
├─ login/page.tsx        ← magic-link auth (server client + server action)
├─ layout.tsx            ← root layout
├─ globals.css           ← design system (verbatim port) + base reset + login styles
└─ api/
   ├─ health/route.ts        ← Anthropic probe
   ├─ analyze/route.ts       ← six-lens briefing  (auth → prompt → ask → parse)
   ├─ debate/route.ts        ← bull-vs-bear debate
   ├─ scout/route.ts         ← theme-based idea scout
   ├─ track-update/route.ts  ← per-name monitoring update (persists to watchlist)
   ├─ themes/route.ts        ← scout themes CRUD
   ├─ watchlist/route.ts     ← list + add tracked names (RLS-scoped)
   ├─ watchlist/[id]/route.ts← edit (thesis/conviction/note) + delete
   └─ auth/                  ← Supabase auth callback + signout

components/
├─ AppShell.tsx          ← rail nav + status bar + view switching (client)
├─ RadarView.tsx         ← Scout + Tracking dashboard (client)
├─ AnalyzeView.tsx       ← six-lens cockpit + Bull/Bear (client)
├─ ConvictionRadar.tsx   ← SVG convergence gauge
├─ BaconMark.tsx · Spectrum.tsx · TVLink.tsx

lib/
├─ anthropic.ts          ← server-side Anthropic wrapper + web_search (lazy client)
├─ prompts.ts            ← prompt builders (ported verbatim from the artifact)
├─ parsers.ts            ← response parsers (ported verbatim, typed)
├─ lenses.ts             ← LENSES, STANCES, ASSET_CLASSES, FRAMEWORKS + helpers
├─ types.ts              ← shared DB row shapes (WatchRow, ThemeRow)
└─ supabase/             ← client / server / admin (service-role) clients

proxy.ts                 ← session refresh + route protection (was middleware.ts)
reference/bacon-artifact.jsx  ← the single-file source-of-truth app (Phase 2 ports from this)
scripts/build-globals.mjs     ← one-shot: regenerates globals.css from the artifact's CSS
supabase/schema.sql      ← full schema + RLS + signup trigger
vercel.json              ← cron schedule (route lands in a later slice)
```

> `app/globals.css` is generated from the artifact's `const CSS` by `node scripts/build-globals.mjs` (font `@import` hoisted, base reset + login styles appended). Don't hand-edit the ported block.

## Non-negotiable constraints

1. **No fabricated data.** Bacon never invents prices, quotes, or figures. All AI features run on live web search of the public record and stay qualitative.
2. **Not financial advice.** Never "buy/sell," never guarantee outcomes.
3. **News copyright.** Headlines are paraphrased and attributed to the outlet. Never reproduce exact headlines.
4. **TradingView attribution.** Chart links/widgets always carry visible attribution to `https://www.tradingview.com`.
5. **Server-only secrets.** `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` never reach the browser — all AI calls go through `app/api/*`.

## Phase 2 TODO

Feature port from [`reference/bacon-artifact.jsx`](reference/bacon-artifact.jsx) (now committed). Suggested order:

- [x] `lib/lenses.ts`, `lib/prompts.ts`, `lib/parsers.ts` — constants + prompt builders + parsers, ported verbatim
- [x] **Analyze** — six-lens cockpit + convergence gauge + Bull/Bear (`/api/analyze`, `/api/debate`, `AnalyzeView`) + save-to-watchlist
- [x] **Radar** — watchlist CRUD + per-name tracking updates + Scout with persisted themes (`/api/watchlist`, `/api/track-update`, `/api/scout`, `/api/themes`, `RadarView`).
- [x] **Background sweeps** — daily `/api/cron/sweep` (service-role): real top movers (`lib/market.ts`) + theme scout → `scout_picks` "fresh finds" feed, plus tracked-name refresh; per-user opt-in via `settings`. Auto-sweep toggle on the Radar.
- [ ] **News** — paraphrase + attribute (`/api/news`, `news_items`, `NewsView`)
- [ ] **Discuss** — streaming chat (`/api/chat`, `chat_messages`, `ChatPanel`)
- [ ] **Sizer + Frameworks** — mostly static ports (`FRAMEWORKS` data already in `lib/lenses.ts`)
- [ ] **TradingView widgets** — embed Advanced Chart + Mini Symbol; keep attribution; keep `TVLink` fallback
- [x] **Real data layer** — Alpha Vantage movers (`lib/market.ts`) + FRED macro (`lib/macro.ts`, `/api/macro`, `MacroBackdrop`). _Next connectors (own code, public APIs):_ World Bank / IMF macro, sector movers, crypto movers.
- [ ] **News** auto-refresh into the sweep (paraphrased headlines → `news_items`)
- [ ] **Command line + boot screen** — nice-to-have, port last

Full spec: [`BACON_BUILD.md`](BACON_BUILD.md).

## Deploy

```bash
# 1. Push to GitHub.
# 2. vercel.com → New Project → Import the repo.
# 3. Add every variable from .env.example in Vercel project settings
#    (set NEXT_PUBLIC_SITE_URL to the Vercel URL).
# 4. In Supabase Auth → URL Configuration, add the Vercel URL +
#    <vercel-url>/api/auth/callback as a redirect URL.
# 5. Deploy. Verify: login works, the shell renders, /api/health returns ok,
#    and Analyze returns a briefing.
```

## Background sweep — operating it

1. **Re-run `supabase/schema.sql`** once (it's idempotent) to add the new
   `scout_picks` columns (`change_pct`, `data_source`, `kind`).
2. In Vercel, set **`MARKET_DATA_API_KEY`** (Alpha Vantage free key) and
   **`CRON_SECRET`**. Vercel automatically sends `CRON_SECRET` as a Bearer token
   to cron routes; the route rejects anything else.
3. `vercel.json` schedules `/api/cron/sweep` daily (`0 13 * * *`) — allowed on the
   Hobby plan. Sub-daily needs Vercel Pro.
4. On the **Radar**, flip **Auto-sweep daily** on (writes `scout_interval_minutes`
   to your `settings`). The cron only touches users who've opted in.

Test it without waiting for the schedule:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/sweep
# → {"ok":true,"swept":N}; then reload the Radar to see "fresh finds".
```

> Honesty rule intact: the % move is real (from the provider, labelled "via
> &lt;provider&gt;"); the model only adds qualitative "why / verify" context via web
> search and never invents figures.
