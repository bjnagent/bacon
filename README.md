# Bacon — Investment Research Tool

> **Phase 1 scaffold complete.** See [Phase 2 TODO](#phase-2-todo) for feature port.

Multi-asset investment research through six independent professional lenses — Fundamental, Technical, Factor, Macro/Regulatory, Smart Money/Signals, and Risk. Conviction comes from **convergence** across lenses, never a single indicator.

**Visual identity:** "Daylight Instrument" — warm bone/graph-paper canvas, near-black ink, safety-orange accent, six lens hues as channel colours.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Custom CSS design system (`pr-*` classes, ported from artifact) |
| Auth + DB | Supabase (Postgres, Auth, RLS) |
| AI | Anthropic Messages API, server-side only (`@anthropic-ai/sdk`) |
| Charts | TradingView embed widgets (Phase 2) |
| Hosting | Vercel + Vercel Cron |

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url> bacon
cd bacon
npm install
```

### 2. Create Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Note your **Project Ref** (in project Settings → API).
3. Run the schema in the SQL editor:

   ```sql
   -- paste contents of supabase/schema.sql
   ```

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
BACON_MODEL=claude-sonnet-4-20250514   # verify current ID at console.anthropic.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # SERVER ONLY — never expose

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=<random>                   # openssl rand -hex 32
```

> **Never commit `.env.local`.** It's in `.gitignore`.

### 4. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000` → redirects to magic-link login → sends email → click link → authenticated home.

## Supabase Schema

All tables use Row Level Security (RLS) — each user only sees their own rows. The `service_role` key is used **only** by the cron job and never exposed to the browser.

| Table | Purpose |
|---|---|
| `profiles` | 1 row per auth user |
| `settings` | Scout cadence, news prefs |
| `watchlist` | Tracked symbols with thesis, conviction, lean |
| `themes` | Scout themes |
| `scout_picks` | Cached scout results |
| `news_items` | Cached news items |
| `chat_messages` | Chat history (per conversation) |

## Architecture

```
app/
├─ page.tsx            ← authenticated home (nav shell)
├─ login/page.tsx      ← magic-link auth
├─ layout.tsx          ← root layout
├─ globals.css         ← design system (pr-* classes)
└─ api/
   ├─ health/route.ts  ← health check + Anthropic probe
   ├─ auth/           ← Supabase auth callback + signout
   └─ cron/sweep/     ← background scout + news (Phase 2)

lib/
├─ anthropic.ts        ← server-side Anthropic wrapper + web_search
├─ prompts.ts          ← prompt builders (port from artifact)
├─ parsers.ts         ← response parsers (port from artifact)
├─ lenses.ts           ← LENSES, STANCES, ASSET_CLASSES, FRAMEWORKS
└─ supabase/
   ├─ client.ts       ← browser client (@supabase/ssr)
   ├─ server.ts        ← server client (cookies, for API routes)
   └─ admin.ts        ← service-role client (cron only)

middleware.ts          ← session refresh + route protection
vercel.json            ← cron schedule
supabase/schema.sql    ← full schema + RLS
```

## Non-negotiable constraints

1. **No fabricated data.** Bacon never invents prices, quotes, or figures. All AI features run on live web search of the public record and stay qualitative.
2. **Not financial advice.** Never "buy/sell," never guarantee outcomes.
3. **News copyright.** Headlines are paraphrased and attributed to the outlet. Never reproduce exact headlines.
4. **TradingView attribution.** Charts always carry visible attribution to `https://www.tradingview.com`.
5. **Server-only secrets.** `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` never reach the browser.

## Phase 2 TODO

Feature port from `/reference/bacon-artifact.jsx`.

> ⚠️ **The reference artifact has not yet been committed.** Before starting Phase 2, copy your single-file React artifact into `reference/bacon-artifact.jsx` and commit it.

Suggested order:

- [ ] `lib/lenses.ts`, `lib/prompts.ts`, `lib/parsers.ts` — copy constants + prompt builders + parsers verbatim
- [ ] **Analyze** — six-lens cockpit + Bull/Bear + convergence gauge (`/api/analyze`, `/api/debate`, `AnalyzeView`)
- [ ] **Radar** — watchlist CRUD + Scout (`/api/scout`, `scout_picks`, `RadarView`)
- [ ] **News** — paraphrase + attribute (`/api/news`, `NewsView`)
- [ ] **Discuss** — streaming chat (`/api/chat`, `ChatPanel`)
- [ ] **Sizer + Frameworks** — mostly static ports
- [ ] **TradingView widgets** — embed Advanced Chart + Mini Symbol; keep attribution
- [ ] **Background sweeps** — `/api/cron/sweep` + `vercel.json`; real auto-scout with tab closed

Full spec: [BACON BUILD.md](./BACON%20BUILD.md)

## Deploy

```bash
# Push to GitHub first
git push origin main

# Then connect to Vercel:
# 1. vercel.com → New Project → Import from GitHub
# 2. Select the repo
# 3. Add all environment variables from .env.example in Vercel project settings
# 4. Deploy
```
