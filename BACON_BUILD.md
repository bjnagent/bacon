# Bacon — Build & Scaffolding Spec

> Handoff document for the coding agent. **Phase 1 (you, the agent): scaffold the repo, wire the infrastructure, deploy a working skeleton, push to GitHub.** Phase 2 (continued in Claude Code): port the full feature set from the reference artifact. Do **not** attempt the full feature port in Phase 1 — get a real, deployed, authenticated skeleton with a working Anthropic call and the database in place, then stop.

---

## 0. What Bacon is (one paragraph)

Bacon is a multi-asset **investment research tool**. Core idea: *one asset, six independent professional lenses* — Fundamental, Technical, Factor, Macro/Regulatory, Smart-money/Signals, and Risk — and conviction comes from **convergence** across lenses, never a single indicator. It scouts the public record for timely ideas, tracks how each name's story evolves, surfaces business news as signals, lets the user discuss anything in a contextual chat, sizes positions, and links out to real charts. It is a **research and thinking tool, not an advisor**.

The visual identity is "Daylight Instrument": warm bone/graph-paper canvas, near-black ink, a single safety-orange accent, and the six lens hues used as channel colors. The logo is a wavy bacon rasher whose six stripes are the six lenses.

---

## 1. NON-NEGOTIABLE CONSTRAINTS (carry these into every prompt, route, and component)

These are the product's whole reason for existing. Violating them breaks the product.

1. **No fabricated market data.** Bacon must **never invent prices, quotes, price targets, levels, or specific figures.** All AI features run on **live web search** of the public record and stay **qualitative**. The only real-time numeric data allowed is from a real provider (TradingView widgets / links). Faking data is the exact failure mode Bacon exists to avoid.
2. **Not financial advice.** Never "buy/sell," never guarantee outcomes. The job is to surface what each lens looks at, steelman both sides, name what would confirm/break a thesis, and flag what to verify. Every surface carries a "verify yourself · not financial advice" framing.
3. **News copyright.** Headlines are **paraphrased in Bacon's own words and attributed to the outlet** (e.g., "via CNBC") with a "verify at source" line. **Never reproduce an outlet's exact headline or article text.**
4. **TradingView attribution.** Wherever TradingView charts/widgets are used, keep the required visible attribution link to `https://www.tradingview.com`. (Free tier requires it.)
5. **Secrets are server-only.** The Anthropic API key and Supabase service-role key **never** reach the browser. All Anthropic calls go through server routes.

---

## 2. Reference implementation (source of truth)

The existing app is a **single-file React artifact** that already implements every feature, prompt, parser, and the full design system. **Commit it into the repo at `/reference/bacon-artifact.jsx`** before starting. Phase 2 ports from it. Key things to mine from it:

- **`const CSS` template string** → becomes `app/globals.css` (preserve verbatim; it *is* the design system). All class names are `pr-*`.
- **Prompt builders**: `analysisPrompt`, `debatePrompt`, `scoutPrompt`, `trackingUpdatePrompt`, `newsPrompt`, `chatSystemPrompt`, plus `deriveContext` / `chatStarters`.
- **Parsers**: `parseBriefing`, `parseDebate`, `parseScout`, `parseTrackingUpdate`, `parseNews` (delimited `===SECTION===` / `@@PICK@@` / `@@ITEM@@` formats).
- **Domain constants**: `LENSES` (6 lenses w/ hues), `STANCES`, `ASSET_CLASSES`, `FRAMEWORKS`.
- **Components**: `RadarView` (Scout + Tracking home), `NewsView`, `AnalyzeView` (six-lens cockpit + Bull/Bear), `FrameworksView`, `SizerView`, `ChatPanel`, `BaconMark`, `TVLink`, `ConvictionRadar` (SVG gauge), plus the command-line console and boot screen.
- **Persisted state** to migrate from `window.storage` → Supabase: watchlist, themes, scout cadence (`scoutEvery` minutes), last sweep time (`scoutAt`).

Two behaviors change in the real app (and are *upgrades* enabled by self-hosting):
- `window.storage` → **Supabase Postgres** (per-user, RLS).
- In-browser Anthropic calls with no key → **server routes** with a real key.
- Tab-only auto-sweep → **real background scheduler** (Vercel Cron) that scouts + refreshes news on a cadence even when the tab is closed, persisting results.
- TradingView deep-links only → **embedded TradingView widgets** are now possible (CSP no longer blocks them).

---

## 3. Target architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | First-class on Vercel; SSR + Route Handlers + Server Actions. Port of an existing React app. |
| Styling | **Port the artifact's `const CSS` → `app/globals.css`** | Preserves the exact "Daylight Instrument" look. Tailwind optional for new layout glue only; the `pr-*` classes are the source of truth. |
| Auth + DB | **Supabase** (Postgres, Auth, RLS) | Use `@supabase/ssr`. Email magic-link or OAuth. Row-Level Security so each user only sees their rows. |
| AI | **Anthropic Messages API** via `@anthropic-ai/sdk`, **server-side only** | Use the `web_search_20250305` server tool (same as the artifact). |
| Charts | **TradingView embed widgets** + deep-links | Now embeddable since self-hosted. Keep attribution. |
| Hosting | **Vercel** | Env vars + **Cron Jobs** for background sweeps. |

**Model:** default to the current Sonnet model string (verify the exact ID in the Anthropic console/docs — e.g. `claude-sonnet-4-5-...`; the artifact used a Sonnet model). Put it in a `BACON_MODEL` env/const so it's swappable. Heavier analysis can optionally use an Opus model.

---

## 4. Repo structure (target)

```
bacon/
├─ app/
│  ├─ layout.tsx
│  ├─ globals.css            # ported from artifact `const CSS`
│  ├─ page.tsx               # main shell (nav + views); Phase 2 fills views
│  ├─ login/page.tsx         # Supabase auth UI
│  ├─ api/
│  │  ├─ health/route.ts     # Phase 1: pings Anthropic, returns ok
│  │  ├─ scout/route.ts      # Phase 2
│  │  ├─ analyze/route.ts    # Phase 2
│  │  ├─ debate/route.ts     # Phase 2
│  │  ├─ news/route.ts       # Phase 2
│  │  ├─ track-update/route.ts # Phase 2
│  │  ├─ chat/route.ts       # Phase 2 (stream)
│  │  └─ cron/sweep/route.ts # Phase 2 (background scout + news)
├─ components/               # Phase 2: RadarView, NewsView, AnalyzeView, etc.
├─ lib/
│  ├─ supabase/
│  │  ├─ client.ts           # browser client (@supabase/ssr)
│  │  ├─ server.ts           # server client (cookies)
│  │  └─ admin.ts            # service-role client (cron only)
│  ├─ anthropic.ts           # server-side Anthropic wrapper + web_search
│  ├─ prompts.ts             # ported prompt builders
│  ├─ parsers.ts             # ported parsers
│  └─ lenses.ts              # LENSES, STANCES, ASSET_CLASSES, FRAMEWORKS
├─ reference/
│  └─ bacon-artifact.jsx     # the single-file reference app (COMMIT THIS)
├─ supabase/
│  └─ schema.sql             # tables + RLS (below)
├─ middleware.ts             # Supabase session refresh
├─ vercel.json               # cron config
├─ .env.example
├─ .env.local                # NOT committed
└─ README.md
```

---

## 5. Environment variables

Create `.env.example` (committed) and `.env.local` (gitignored). Set the same in the Vercel project settings.

```bash
# --- Anthropic (SERVER ONLY) ---
ANTHROPIC_API_KEY=sk-ant-...
BACON_MODEL=claude-sonnet-4-5            # verify latest ID in Anthropic docs

# --- Supabase (public anon is fine to expose; service role is SERVER ONLY) ---
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...         # SERVER ONLY — used by cron/admin

# --- App ---
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # set to the Vercel URL in prod
CRON_SECRET=<random-long-string>             # protects /api/cron/* endpoints
```

`.gitignore` must include `.env*.local`. Never commit real keys.

---

## 6. Supabase schema (`supabase/schema.sql`)

Run in the Supabase SQL editor. All tables are per-user with RLS.

```sql
-- profiles (1 row per auth user)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- per-user settings (scout scheduler + news prefs)
create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  scout_interval_minutes int default 0,     -- 0 = off; 15/30/60/240
  last_sweep_at timestamptz,
  news_source text default 'All',
  news_focus text default '',
  updated_at timestamptz default now()
);

-- tracked watchlist
create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  asset_class text default 'Equity / Stock',
  lean text,                 -- constructive | mixed | cautious | limited-data
  lean_reason text,
  update_text text,
  watch_text text,
  thesis text default '',
  conviction int default 3,
  note text default '',
  status text default 'pending',  -- pending | ok | error
  last_scan_at timestamptz,
  created_at timestamptz default now()
);

-- scout themes
create table if not exists themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  created_at timestamptz default now()
);

-- cached scout picks (so cron can populate)
create table if not exists scout_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text, symbol text, asset_class text,
  why text, now_catalyst text, check_text text,
  created_at timestamptz default now()
);

-- cached news items
create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  headline text, source text, why text,
  symbol text, asset_class text, signal text, recency text,
  created_at timestamptz default now()
);

-- discuss chat history
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null,        -- user | assistant
  content text not null,
  context jsonb,
  created_at timestamptz default now()
);

-- RLS
alter table profiles      enable row level security;
alter table settings      enable row level security;
alter table watchlist     enable row level security;
alter table themes        enable row level security;
alter table scout_picks   enable row level security;
alter table news_items    enable row level security;
alter table chat_messages enable row level security;

-- policy template: each user sees only their rows
create policy "own profile"  on profiles      for all using (auth.uid() = id)       with check (auth.uid() = id);
create policy "own settings" on settings      for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own watch"    on watchlist     for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own themes"   on themes        for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own picks"    on scout_picks   for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own news"     on news_items    for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own chat"     on chat_messages for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);

-- auto-create profile + settings on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

> Note: the **cron** job writes on behalf of users using the **service-role** client (bypasses RLS). Keep that key server-only and only used in `app/api/cron/*`.

---

## 7. Anthropic server wrapper (`lib/anthropic.ts`) — pattern

Mirror the artifact's `callClaude` / `chatClaude`, but server-side with the SDK and the web-search server tool. Return the concatenated text blocks; parsers run on that string.

```ts
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = process.env.BACON_MODEL ?? "claude-sonnet-4-5";

export async function ask(system: string, messages: {role:"user"|"assistant";content:string}[], useSearch = true, maxTokens = 1100) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    ...(useSearch ? { tools: [{ type: "web_search_20250305", name: "web_search" }] } : {}),
  });
  return res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
}
```

Each feature route (`/api/scout`, `/api/analyze`, etc.) = get Supabase session → build prompt (from `lib/prompts.ts`) → `ask(...)` → parse (from `lib/parsers.ts`) → return JSON and/or persist. `/api/chat` should **stream** (use `anthropic.messages.stream`) for a good UX.

---

## 8. TradingView (Phase 2)

Now self-hosted, so embed widgets are allowed. Use the **Advanced Chart** widget on the analysis view and a **Mini Symbol** / **Symbol Overview** widget on cards. Embed via a small client component that injects the official script (`https://s3.tradingview.com/...`), or a maintained React wrapper. **Keep the attribution link.** The artifact's `TVLink` (deep-links to `tradingview.com/symbols/<SYM>/`) stays as a lightweight fallback.

---

## 9. Vercel Cron (Phase 2) — `vercel.json`

Background sweep that scouts + refreshes news per user on their cadence, even with the tab closed. Protect the endpoint with `CRON_SECRET` (check header `Authorization: Bearer ${CRON_SECRET}`).

```json
{
  "crons": [
    { "path": "/api/cron/sweep", "schedule": "0 * * * *" }
  ]
}
```

`/api/cron/sweep` logic: load users whose `settings.scout_interval_minutes > 0` and where `now - last_sweep_at >= interval`; for each, run scout + news prompts, upsert into `scout_picks` / `news_items`, set `last_sweep_at = now`. Use the **service-role** client. (Mind Vercel plan cron-frequency limits; hourly is a safe default and the app can still honor finer per-user cadences by checking due-ness inside the job.)

---

## 10. ✅ Phase 1 — scaffolding checklist (DO THIS NOW, then stop)

The goal is a **real, deployed, authenticated skeleton** that proves the infra works. No feature port yet.

1. **Init**: `npx create-next-app@latest bacon` (TypeScript, App Router, ESLint). Add deps: `@anthropic-ai/sdk @supabase/supabase-js @supabase/ssr`.
2. **Commit reference**: drop the provided single-file app at `/reference/bacon-artifact.jsx`.
3. **Design system**: paste the artifact's `const CSS` contents into `app/globals.css`. Build a minimal **shell** (left nav rail + top bar) using the existing `pr-*` classes so the skeleton looks like Bacon, not a blank Next app. Stub the five views (Radar/News/Analyze/Frameworks/Sizer) as empty placeholders — Phase 2 fills them.
4. **Supabase**: create the project, run `supabase/schema.sql`, enable Auth (email magic-link is fine). Wire `lib/supabase/{client,server,admin}.ts` with `@supabase/ssr` and `middleware.ts` for session refresh. Build `app/login/page.tsx` and protect `app/page.tsx` (redirect to login if no session).
5. **Anthropic health check**: implement `app/api/health/route.ts` that calls `ask("You are a health check.", [{role:"user",content:"reply OK"}], false, 16)` and returns `{ ok: true, model }`. Confirm it works locally with the real key. This proves server-side AI calls work.
6. **Env**: create `.env.example`; set real values in `.env.local` and in Vercel. Confirm `.env*.local` is gitignored.
7. **Deploy**: connect the repo to Vercel, set env vars, deploy. Verify: login works, the shell renders with the Bacon look, `/api/health` returns ok in production.
8. **Push to GitHub** and write a `README.md` that documents: stack, env vars, how to run locally (`npm run dev`), how to apply the schema, and a **"Phase 2 TODO"** section linking to this spec.

### Phase 1 acceptance criteria
- [ ] Repo on GitHub, deploys cleanly on Vercel.
- [ ] Supabase auth works (sign in → session → protected home).
- [ ] Schema applied; a new signup auto-creates `profiles` + `settings` rows; RLS on.
- [ ] `/api/health` calls Anthropic successfully in production (key server-side only).
- [ ] `app/globals.css` carries the ported design system; the shell renders in the Bacon look.
- [ ] No secrets committed. `.env.example` present; README explains setup.

---

## 11. Phase 2 — for Claude Code (after it's on GitHub)

Port from `/reference/bacon-artifact.jsx`, one slice at a time, persisting to Supabase. Suggested order:

1. **`lib/lenses.ts`, `lib/prompts.ts`, `lib/parsers.ts`** — copy the constants, prompt builders, and parsers verbatim from the artifact.
2. **Analyze** (`/api/analyze`, `/api/debate` + `AnalyzeView`) — six-lens cockpit, convergence gauge, Bull/Bear. Easiest first slice; no persistence needed beyond "save to watchlist."
3. **Radar** — Tracking (CRUD against `watchlist`) + Scout (`/api/scout` → `scout_picks`, themes in `themes`). Replace `window.storage` reads/writes with Supabase queries. Move the cadence/last-sweep into `settings`.
4. **News** (`/api/news` → `news_items` + `NewsView`) — paraphrase + attribute (keep copyright rule).
5. **Discuss** (`/api/chat` streaming + `ChatPanel`) — context-aware; persist to `chat_messages`.
6. **Sizer** + **Frameworks** — mostly static; straight port.
7. **TradingView widgets** — embed Advanced Chart + Mini Symbol; keep attribution; keep `TVLink` fallback.
8. **Background sweeps** — `/api/cron/sweep` + `vercel.json`; this is the real "auto-scout/news with tab closed" upgrade.
9. **Command line + boot screen** — port last (nice-to-have).

Throughout Phase 2, re-assert the Section 1 constraints in every prompt and every rendered surface.

---

## 12. Guardrails for the building agent

- **Never** call Anthropic from a client component. All AI in `app/api/*`.
- **Never** expose `ANTHROPIC_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to `NEXT_PUBLIC_*` or the browser bundle.
- Keep **RLS on**; only the cron job uses the service-role client.
- Keep the **honesty + copyright + attribution** rules from Section 1 — they're the product.
- Don't invent the Anthropic model ID — verify the current one in the Anthropic docs/console and set `BACON_MODEL`.
- Commit early, commit small, so Phase 2 in Claude Code has clean history to build on.
