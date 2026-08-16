-- Bacon: Supabase schema
-- Run this in the Supabase SQL editor after creating the project.
-- All tables are per-user with RLS.

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

-- background-sweep extras (idempotent; safe to re-run on an existing project)
alter table scout_picks add column if not exists change_pct text;   -- real % move, via provider
alter table scout_picks add column if not exists data_source text;  -- e.g. "Alpha Vantage"
alter table scout_picks add column if not exists kind text default 'theme';  -- theme | mover
-- opinionated bacon: explicit call per opportunity
alter table scout_picks add column if not exists action text;  -- Buy | Accumulate | Watch — why
alter table scout_picks add column if not exists target text;  -- 12-mo estimate (est.)

-- cached news items
create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  headline text, source text, why text,
  symbol text, asset_class text, signal text, recency text,
  created_at timestamptz default now()
);

-- daily opportunity briefs — the cockpit's track record (one row per user per day)
create table if not exists daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null default (now() at time zone 'utc')::date,
  intro text,
  caveat text,
  items jsonb not null default '[]'::jsonb,   -- [{name,ticker,cls,horizon,thesis,signals,checks,outcome,verdict}]
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, brief_date)
);

-- morning-brief email opt-in
alter table settings add column if not exists brief_email_enabled boolean default false;

-- tracked voices: comma-separated public commentators the sweep checks
alter table settings add column if not exists voices text default '';

-- kill-condition watcher opt-in (the cron re-checks each brief's kill triggers)
alter table settings add column if not exists watch_enabled boolean default false;

-- scoreboard: last-priced $10K ROI totals per brief, so the all-time record
-- aggregates without re-pricing. kill_alert: what the watcher flagged.
alter table daily_briefs add column if not exists roi jsonb;
alter table daily_briefs add column if not exists kill_alert jsonb;

-- market-wide signal cache (one row per day): the expensive external fetches
-- (Alpha Vantage, FRED, SEC EDGAR) shared across users + Sweep-now, so they
-- run once/day instead of per request. Not per-user; read-only to clients,
-- written by the service role (cron / server admin).
create table if not exists market_snapshots (
  snap_date date primary key default (now() at time zone 'utc')::date,
  bundle jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table market_snapshots enable row level security;
drop policy if exists "read snapshots" on market_snapshots;
create policy "read snapshots" on market_snapshots for select using ((select auth.role()) = 'authenticated');

-- shared price cache: one row per ticker with its full daily-close history, so a
-- ticker is fetched at most once/UTC-day across all users (immutable history
-- means past flag dates never need re-fetching). Read-only to clients; written
-- by the service role. Lets ROI pricing stop depending on a provider's tier.
create table if not exists ticker_series (
  ticker text primary key,
  bars jsonb not null default '[]'::jsonb,
  fetched_at timestamptz default now()
);
alter table ticker_series enable row level security;
drop policy if exists "read ticker_series" on ticker_series;
create policy "read ticker_series" on ticker_series for select using ((select auth.role()) = 'authenticated');

-- property tracker (SG + AU): shared index cache + per-user portfolio + outlooks
create table if not exists property_series (
  series_key text primary key,
  bars jsonb not null default '[]'::jsonb,
  fetched_at timestamptz default now()
);
alter table property_series enable row level security;
drop policy if exists "read property_series" on property_series;
create policy "read property_series" on property_series for select using ((select auth.role()) = 'authenticated');

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  market_key text not null,
  purchase_price numeric not null,
  purchase_date date not null,
  notes text default '',
  created_at timestamptz default now()
);
alter table properties enable row level security;
drop policy if exists "own properties" on properties;
create policy "own properties" on properties for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists property_outlooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market_key text not null,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (user_id, market_key)
);
alter table property_outlooks enable row level security;
drop policy if exists "own property_outlooks" on property_outlooks;
create policy "own property_outlooks" on property_outlooks for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

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
alter table daily_briefs  enable row level security;

-- policy template: each user sees only their rows.
-- Postgres has no "create policy if not exists", so drop-then-create keeps this
-- script idempotent (safe to re-run).
drop policy if exists "own profile"  on profiles;
drop policy if exists "own settings" on settings;
drop policy if exists "own watch"    on watchlist;
drop policy if exists "own themes"   on themes;
drop policy if exists "own picks"    on scout_picks;
drop policy if exists "own news"     on news_items;
drop policy if exists "own chat"     on chat_messages;
drop policy if exists "own briefs"   on daily_briefs;

-- auth.uid() is wrapped in a scalar subselect so Postgres evaluates it ONCE per
-- statement instead of once per row (the auth_rls_initplan lint) — a real win on
-- any multi-row scan. Semantics are identical.
create policy "own profile"   on profiles      for all using ((select auth.uid()) = id)       with check ((select auth.uid()) = id);
create policy "own settings"  on settings      for all using ((select auth.uid()) = user_id)  with check ((select auth.uid()) = user_id);
create policy "own watch"     on watchlist     for all using ((select auth.uid()) = user_id)  with check ((select auth.uid()) = user_id);
create policy "own themes"    on themes        for all using ((select auth.uid()) = user_id)  with check ((select auth.uid()) = user_id);
create policy "own picks"     on scout_picks   for all using ((select auth.uid()) = user_id)  with check ((select auth.uid()) = user_id);
create policy "own news"      on news_items    for all using ((select auth.uid()) = user_id)  with check ((select auth.uid()) = user_id);
create policy "own chat"      on chat_messages for all using ((select auth.uid()) = user_id)  with check ((select auth.uid()) = user_id);
create policy "own briefs"    on daily_briefs   for all using ((select auth.uid()) = user_id)  with check ((select auth.uid()) = user_id);

-- Covering indexes for the per-user foreign keys. Every RLS-filtered query
-- carries a `user_id = auth.uid()` predicate, so without these each read is a
-- sequential scan. Composite where the list query also orders/filters.
create index if not exists watchlist_user          on watchlist(user_id);
create index if not exists themes_user             on themes(user_id);
create index if not exists scout_picks_user_kind   on scout_picks(user_id, kind);
create index if not exists news_items_user_created  on news_items(user_id, created_at desc);
create index if not exists chat_messages_conv       on chat_messages(conversation_id, created_at);
create index if not exists chat_messages_user_created on chat_messages(user_id, created_at desc);
create index if not exists properties_user          on properties(user_id);

-- auto-create profile + settings on signup.
-- security definer hardening: pinned search_path (schema-shadowing) and no
-- PostgREST RPC access — only the auth trigger may execute it.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- calibration loop: every explicit call, stamped with context (incl. community
-- crowding), graded later vs real prices + SPY; aggregates feed the prompts.
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  instrument text not null,
  action text not null,
  conviction int,
  target_text text,
  target_base numeric,
  target_kind text,
  horizon_date date not null,
  crowded text,
  created_at timestamptz default now(),
  actual_pct numeric,
  bench_pct numeric,
  direction_hit boolean,
  target_err_pct numeric,
  graded_at timestamptz
);
create index if not exists calls_user_created on calls (user_id, created_at desc);
-- Idempotency for repeat sweeps: a natural key so re-recording the same call on
-- the same UTC day upserts instead of piling up duplicate rows (which would
-- inflate the calibration cohorts). Backfilled from created_at for existing rows.
alter table calls add column if not exists call_date date;
update calls set call_date = (created_at at time zone 'utc')::date where call_date is null;
alter table calls alter column call_date set default (now() at time zone 'utc')::date;
create unique index if not exists calls_dedup on calls (user_id, source, instrument, call_date);
alter table calls enable row level security;
drop policy if exists "own calls" on calls;
create policy "own calls" on calls for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Per-user daily AI usage meter — backs the rate-limit gate (lib/quota.ts) that
-- caps expensive web-search AI calls so one account can't run up an unbounded
-- Anthropic/search bill. Written via bump_ai_usage(); the app fails OPEN if this
-- object is missing, so shipping the code before this migration is safe.
create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table ai_usage enable row level security;
drop policy if exists "own usage" on ai_usage;
create policy "own usage" on ai_usage for select using ((select auth.uid()) = user_id);

-- Atomic increment + limit check. SECURITY DEFINER with a pinned empty
-- search_path (schema-shadowing safe); only signed-in callers may execute it.
create or replace function public.bump_ai_usage(p_limit int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.ai_usage (user_id, calls) values (auth.uid(), 1)
    on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
    returning calls into n;
  return n <= p_limit;
end;
$$;
revoke execute on function public.bump_ai_usage(int) from public, anon;
grant  execute on function public.bump_ai_usage(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Optimization-audit follow-ups (speed / accuracy / reliability).

-- A8: prevent duplicate tracked names / themes from a check-then-insert race.
-- Dedupe any existing dups first (keep the earliest) so the unique index builds.
delete from watchlist w using watchlist w2
  where w.user_id = w2.user_id and w.symbol = w2.symbol and w.created_at > w2.created_at;
create unique index if not exists watchlist_user_symbol on watchlist (user_id, symbol);
delete from themes t using themes t2
  where t.user_id = t2.user_id and lower(t.label) = lower(t2.label) and t.created_at > t2.created_at;
create unique index if not exists themes_user_label on themes (user_id, lower(label));

-- S6: a single-column index so the warm-prices global "recent briefs" scan can
-- order by brief_date without a full sort (the composite unique can't serve it).
create index if not exists daily_briefs_date on daily_briefs (brief_date desc);

-- S3: shared, DB-backed fundamentals cache (mirrors ticker_series) so a ticker's
-- SEC facts are fetched at most once/TTL across all instances instead of every
-- cold serverless instance re-downloading the CIK map + 9 concept calls.
create table if not exists ticker_fundamentals (
  ticker text primary key,
  facts jsonb,
  fetched_at timestamptz default now()
);
alter table ticker_fundamentals enable row level security;
drop policy if exists "read ticker_fundamentals" on ticker_fundamentals;
create policy "read ticker_fundamentals" on ticker_fundamentals for select using ((select auth.role()) = 'authenticated');

-- R1: atomic feed replacement. delete-then-insert as two round-trips can wipe a
-- user's feed if the insert fails after the delete commits. These do both in one
-- transaction. SECURITY DEFINER + pinned search_path; a caller may only replace
-- their OWN rows (p_user = auth.uid()) unless it's the service role (the cron).
create or replace function public.replace_scout_picks(p_user uuid, p_kinds text[], p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is distinct from auth.uid() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;
  delete from public.scout_picks where user_id = p_user and kind = any(p_kinds);
  insert into public.scout_picks (user_id, name, symbol, asset_class, why, now_catalyst, check_text, action, target, change_pct, data_source, kind)
  select p_user, x.name, x.symbol, x.asset_class, x.why, x.now_catalyst, x.check_text, x.action, x.target, x.change_pct, x.data_source, x.kind
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    name text, symbol text, asset_class text, why text, now_catalyst text, check_text text,
    action text, target text, change_pct text, data_source text, kind text);
end $$;
revoke execute on function public.replace_scout_picks(uuid, text[], jsonb) from public, anon;
grant  execute on function public.replace_scout_picks(uuid, text[], jsonb) to authenticated, service_role;

create or replace function public.replace_news(p_user uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is distinct from auth.uid() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;
  delete from public.news_items where user_id = p_user;
  insert into public.news_items (user_id, headline, source, why, symbol, asset_class, signal, recency)
  select p_user, x.headline, x.source, x.why, x.symbol, x.asset_class, x.signal, x.recency
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    headline text, source text, why text, symbol text, asset_class text, signal text, recency text);
end $$;
revoke execute on function public.replace_news(uuid, jsonb) from public, anon;
grant  execute on function public.replace_news(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- AI metering: one row per model call, with REAL token counts reported by the
-- provider and the cost computed at write time (so historical spend doesn't
-- shift when prices change). Powers the admin console. ai_usage above stays as
-- the cheap per-day counter the quota gate reads; this is the detailed ledger.
create table if not exists ai_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,  -- null = system/cron
  route text not null,            -- analyze | brief | chat | sweep | ...
  provider text not null,         -- anthropic | gemini | xai
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  web_searches int not null default 0,     -- server-tool searches (billed per search)
  cost_usd numeric(12,6) not null default 0,
  priced boolean not null default true,   -- false = no rate card for this model
  ms int,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ai_events_created on ai_events (created_at desc);
create index if not exists ai_events_user_created on ai_events (user_id, created_at desc);
create index if not exists ai_events_route_created on ai_events (route, created_at desc);
alter table ai_events enable row level security;
-- Users may read their OWN usage; the admin console reads cross-user via the
-- service role behind an app-level admin gate (lib/admin.ts), so no broad
-- read policy is granted here.
drop policy if exists "own ai_events" on ai_events;
create policy "own ai_events" on ai_events for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Behaviour ledger: which parts of the product each account actually uses.
--
-- ai_events above answers "what did we spend"; this answers "what did they
-- open". The two are deliberately separate — most of the product costs nothing
-- to look at, so a view of Radar or the track record leaves no trace in the
-- cost ledger at all. Without this table the console can only see the AI
-- surface, and every free feature looks unused.
--
-- Written by the browser through the user's OWN session (app/api/track), so
-- RLS is what pins each row to its sender; the route never trusts a user_id
-- from the body. Append-only by policy: insert and select, no update or
-- delete, so a client cannot rewrite its own history.
create table if not exists user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,        -- view | action
  name text not null,        -- today | radar | news | analyze | discuss | ...
  detail text,               -- optional subject, e.g. the ticker analyzed
  created_at timestamptz not null default now()
);
-- The admin rollups scan a time window across ALL users (feature popularity,
-- per-user event counts), with no user or name predicate to lead with — so
-- created_at needs an index of its own. `ai_events` carries the same one for
-- the same reason; without it both scans fall back to a seq scan of the
-- highest-volume table in the schema.
create index if not exists user_events_created on user_events (created_at desc);
create index if not exists user_events_user_created on user_events (user_id, created_at desc);
create index if not exists user_events_name_created on user_events (name, created_at desc);
alter table user_events enable row level security;
drop policy if exists "own user_events read"   on user_events;
drop policy if exists "own user_events insert" on user_events;
create policy "own user_events read"   on user_events for select using ((select auth.uid()) = user_id);
create policy "own user_events insert" on user_events for insert with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Admin console aggregates (operator-only)
--
-- These read ACROSS users, so they are deliberately unreachable from the
-- browser: EXECUTE is granted only to service_role. The only caller is the
-- server-side admin API, behind the ADMIN_EMAILS gate in lib/admin.ts.
--
-- Two independent reasons a leak can't happen here, because one is not enough:
--
--   1. They are SECURITY INVOKER, so the caller's own privileges apply. Even if
--      EXECUTE were somehow reachable, `authenticated` has no SELECT on
--      auth.users and RLS on ai_events limits it to its own rows.
--   2. EXECUTE is revoked from anon and authenticated BY NAME. Revoking from
--      `public` alone is NOT sufficient on Supabase: default privileges grant
--      the API roles explicitly, and a named grant survives a revoke from the
--      public pseudo-role — the function stays live on /rest/v1/rpc/.
-- ---------------------------------------------------------------------------

-- `ai_events` is a ledger that starts the day it ships. Reading only from it
-- made the console report "no data" on a product with weeks of history: the
-- quota meter (`ai_usage`) and the content tables had been recording all along.
-- The overview therefore returns TWO things — metered spend, and an `activity`
-- block covering everything that predates metering — plus `meteringSince`, so
-- "we weren't measuring yet" is never rendered as "nothing happened".
create or replace function admin_usage_overview(p_days int default 30)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with ev as (
    select * from ai_events
    where created_at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
  ),
  uev as (
    select * from user_events
    where created_at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
  )
  select jsonb_build_object(
    'days', greatest(1, least(365, coalesce(p_days, 30))),
    -- null until the first metered call. The console keys its "metering starts
    -- here" note off this rather than off a zero total.
    'meteringSince', (select min(created_at) from ai_events),
    'totals', (select jsonb_build_object(
        'calls', count(*),
        'input', coalesce(sum(input_tokens), 0),
        'output', coalesce(sum(output_tokens), 0),
        'cacheRead', coalesce(sum(cache_read_tokens), 0),
        'cacheWrite', coalesce(sum(cache_write_tokens), 0),
        'searches', coalesce(sum(web_searches), 0),
        'cost', coalesce(sum(cost_usd), 0),
        'errors', count(*) filter (where not ok),
        'unpriced', count(*) filter (where not priced),
        'users', count(distinct user_id),
        'p50ms', coalesce(percentile_disc(0.5) within group (order by ms) filter (where ms is not null), 0),
        'p95ms', coalesce(percentile_disc(0.95) within group (order by ms) filter (where ms is not null), 0)
      ) from ev),
    -- Everything that predates the ledger. Call counts come from the quota
    -- meter, which has no token or cost detail — hence a separate block rather
    -- than faked-up ai_events rows.
    'activity', jsonb_build_object(
      'since', (select to_char(min(day), 'YYYY-MM-DD') from ai_usage),
      'aiCalls', coalesce((select sum(calls) from ai_usage), 0),
      'activeUsers', coalesce((select count(distinct user_id) from ai_usage), 0),
      'byDay', (select coalesce(jsonb_agg(x order by x->>'day'), '[]'::jsonb) from (
          select jsonb_build_object(
            'day', to_char(day, 'YYYY-MM-DD'),
            'calls', sum(calls),
            'users', count(distinct user_id)
          ) as x
          from ai_usage group by day
        ) u),
      'briefs',    (select count(*) from daily_briefs),
      'callsFiled',(select count(*) from calls),
      'picks',     (select count(*) from scout_picks),
      'news',      (select count(*) from news_items),
      'chats',     (select count(*) from chat_messages),
      'watchlist', (select count(*) from watchlist),
      'themes',    (select count(*) from themes),
      'outlooks',  (select count(*) from property_outlooks)
    ),
    'daily', (select coalesce(jsonb_agg(x order by x->>'day'), '[]'::jsonb) from (
        select jsonb_build_object(
          'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'calls', count(*),
          'tokens', coalesce(sum(input_tokens + output_tokens), 0),
          'cost', coalesce(sum(cost_usd), 0),
          'users', count(distinct user_id),
          'errors', count(*) filter (where not ok)
        ) as x
        from ev group by date_trunc('day', created_at)
      ) d),
    'byRoute', (select coalesce(jsonb_agg(x order by (x->>'cost')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'route', route,
          'calls', count(*),
          'tokens', coalesce(sum(input_tokens + output_tokens), 0),
          'searches', coalesce(sum(web_searches), 0),
          'cost', coalesce(sum(cost_usd), 0),
          'errors', count(*) filter (where not ok),
          'avgMs', coalesce(round(avg(ms) filter (where ms is not null)), 0)
        ) as x
        from ev group by route
      ) r),
    'byModel', (select coalesce(jsonb_agg(x order by (x->>'cost')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'provider', provider, 'model', model,
          'calls', count(*),
          'input', coalesce(sum(input_tokens), 0),
          'output', coalesce(sum(output_tokens), 0),
          'cost', coalesce(sum(cost_usd), 0),
          'priced', bool_and(priced)
        ) as x
        from ev group by provider, model
      ) m),
    -- Feature popularity. Ranked by REACH (distinct users) rather than raw
    -- hits: one account leaving a tab open all day shouldn't outrank a feature
    -- half the userbase opens once. Both numbers are returned so the console
    -- can show depth alongside reach.
    'byFeature', (select coalesce(jsonb_agg(x order by (x->>'users')::int desc, (x->>'hits')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'name', name,
          'kind', min(kind),
          'hits', count(*),
          'users', count(distinct user_id),
          'lastAt', max(created_at)
        ) as x
        from uev group by name
      ) f),
    -- Top subjects across all accounts — which NAMES people analyze and
    -- discuss, which is the question that motivates the ledger.
    'topSubjects', (select coalesce(jsonb_agg(x order by (x->>'hits')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'detail', detail,
          'hits', count(*),
          'users', count(distinct user_id)
        ) as x
        from uev where detail is not null and detail <> ''
        group by detail
        order by count(*) desc, count(distinct user_id) desc
        limit 25
      ) ts)
  );
$$;

-- Per-user behaviour. `auth.users` supplies identity/signup; the aggregates come
-- from the metering ledger, the quota meter and the user's own content tables.
-- Which NAMES and THEMES each account follows are returned as arrays, not just
-- counts — "what is this account into" is the question the console exists for,
-- and it is a lifetime question, not a 30-day one.
create or replace function admin_user_activity(p_days int default 30, p_limit int default 100)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with bounds as (
    select now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30)))) as since
  ),
  usage as (
    select e.user_id,
           count(*) as calls,
           coalesce(sum(e.input_tokens + e.output_tokens), 0) as tokens,
           coalesce(sum(e.cost_usd), 0) as cost,
           coalesce(sum(e.web_searches), 0) as searches,
           count(*) filter (where not e.ok) as errors,
           max(e.created_at) as last_call,
           count(distinct e.route) as routes
    from ai_events e, bounds b
    where e.user_id is not null and e.created_at >= b.since
    group by e.user_id
  ),
  route_counts as (
    select e.user_id, e.route, count(*) as n
    from ai_events e, bounds b
    where e.user_id is not null and e.created_at >= b.since
    group by e.user_id, e.route
  ),
  top_route as (
    select distinct on (user_id) user_id, route
    from route_counts
    order by user_id, n desc, route
  ),
  -- Behaviour, from the free surface. Distinct-day count is the engagement
  -- number that matters: 40 events on one day is a trial, 40 across 12 days is
  -- a habit, and a single total can't tell those apart.
  behaviour as (
    select e.user_id,
           count(*) as events,
           count(distinct date_trunc('day', e.created_at)) as active_days,
           max(e.created_at) as last_event
    from user_events e, bounds b
    where e.created_at >= b.since
    group by e.user_id
  ),
  feature_counts as (
    select e.user_id, e.name, count(*) as n
    from user_events e, bounds b
    where e.created_at >= b.since
    group by e.user_id, e.name
  ),
  top_feature as (
    select distinct on (user_id) user_id, name
    from feature_counts
    order by user_id, n desc, name
  ),
  -- Per-user totals as grouped CTEs joined once, rather than a correlated
  -- subquery per field per row. The previous shape ran ~13 of them for every
  -- user returned — about 2,600 subqueries at the console's 200-row limit,
  -- with the lifetime-calls lookup executed twice (once for output, once for
  -- the ORDER BY). Output is byte-identical; each CTE below reproduces its
  -- subquery exactly, including the details that are easy to lose:
  --   * `chats` counts only role='user', but lastSeen wants the newest message
  --     of ANY role — hence separate columns off one scan of chat_messages.
  --   * users with no rows are absent from these CTEs, so every count needs a
  --     coalesce on the left join to match count(*)'s 0.
  --   * greatest() ignores NULLs in Postgres, so the missing-row case still
  --     behaves as it did with the subqueries.
  meter as (
    select a.user_id,
           sum(a.calls) as lifetime_calls,
           max(a.calls) filter (where a.day = current_date) as used_today
    from ai_usage a group by a.user_id
  ),
  wl as (
    select w.user_id, count(*) as n,
           jsonb_agg(w.symbol order by w.created_at) as symbols,
           max(w.created_at) as last_at
    from watchlist w group by w.user_id
  ),
  th as (
    select t.user_id, count(*) as n, jsonb_agg(t.label order by t.created_at) as labels
    from themes t group by t.user_id
  ),
  br as (
    select d.user_id, count(*) as n, max(d.created_at) as last_at
    from daily_briefs d group by d.user_id
  ),
  cl as (select c.user_id, count(*) as n from calls c group by c.user_id),
  cm as (
    select m.user_id,
           count(*) filter (where m.role = 'user') as n,
           max(m.created_at) as last_at
    from chat_messages m group by m.user_id
  )
  select coalesce(jsonb_agg(row order by (row->>'cost')::numeric desc, (row->>'lifetimeCalls')::int desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'userId', u.id,
      'email', u.email,
      'signedUp', to_char(u.created_at, 'YYYY-MM-DD'),
      'lastSignIn', to_char(u.last_sign_in_at, 'YYYY-MM-DD'),
      'calls', coalesce(g.calls, 0),
      'tokens', coalesce(g.tokens, 0),
      'cost', coalesce(g.cost, 0),
      'searches', coalesce(g.searches, 0),
      'errors', coalesce(g.errors, 0),
      'routes', coalesce(g.routes, 0),
      'topRoute', tr.route,
      'lastCall', g.last_call,
      -- Behaviour on the free surface, which the cost ledger cannot see.
      'events', coalesce(bh.events, 0),
      'activeDays', coalesce(bh.active_days, 0),
      'topFeature', tf.name,
      'lastEvent', bh.last_event,
      -- Lifetime AI calls from the quota meter: the only per-user history that
      -- predates the ledger, and the reason a user with cost=0 isn't inactive.
      'lifetimeCalls', coalesce(mt.lifetime_calls, 0),
      'usedToday', coalesce(mt.used_today, 0),
      'watchlist', coalesce(wl.n, 0),
      'themes', coalesce(th.n, 0),
      'briefs', coalesce(br.n, 0),
      'callsFiled', coalesce(cl.n, 0),
      'chats', coalesce(cm.n, 0),
      -- What they actually follow, not just how many.
      'symbols', coalesce(wl.symbols, '[]'::jsonb),
      'themeLabels', coalesce(th.labels, '[]'::jsonb),
      'lastSeen', greatest(u.last_sign_in_at, bh.last_event, cm.last_at, wl.last_at, br.last_at)
    ) as row
    from auth.users u
    left join usage g on g.user_id = u.id
    left join top_route tr on tr.user_id = u.id
    left join behaviour bh on bh.user_id = u.id
    left join top_feature tf on tf.user_id = u.id
    left join meter mt on mt.user_id = u.id
    left join wl on wl.user_id = u.id
    left join th on th.user_id = u.id
    left join br on br.user_id = u.id
    left join cl on cl.user_id = u.id
    left join cm on cm.user_id = u.id
    order by coalesce(g.cost, 0) desc,
             coalesce(mt.lifetime_calls, 0) desc,
             u.created_at desc
    limit greatest(1, least(500, coalesce(p_limit, 100)))
  ) s;
$$;

-- Per-user drill-down: the chat transcript, the names and themes followed, and
-- the calls filed. Split from the list above so the table isn't carrying a
-- transcript per row — this loads only when a row is opened.
create or replace function admin_user_detail(p_user uuid, p_limit int default 100)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'userId', p_user,
    'email', (select email from auth.users where id = p_user),
    'chat', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'at', m.created_at,
          'conversation', m.conversation_id,
          'role', m.role,
          -- Truncated: the console is a behaviour view, not an archive, and a
          -- long assistant answer would dominate the payload.
          'text', left(m.content, 2000),
          'truncated', length(m.content) > 2000
        ) as x
        from chat_messages m
        where m.user_id = p_user
        order by m.created_at desc
        limit greatest(1, least(500, coalesce(p_limit, 100)))
      ) c),
    'watchlist', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'at', w.created_at, 'symbol', w.symbol, 'cls', w.asset_class,
          'lean', w.lean, 'conviction', w.conviction, 'thesis', left(coalesce(w.thesis, ''), 400),
          'note', left(coalesce(w.note, ''), 400), 'status', w.status, 'lastScan', w.last_scan_at
        ) as x
        from watchlist w where w.user_id = p_user
      ) w2),
    'themes', (select coalesce(jsonb_agg(x order by x->>'at'), '[]'::jsonb) from (
        select jsonb_build_object('at', t.created_at, 'label', t.label) as x
        from themes t where t.user_id = p_user
      ) t2),
    'calls', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'at', c.created_at, 'instrument', c.instrument, 'action', c.action,
          'source', c.source, 'conviction', c.conviction, 'target', c.target_text,
          'horizon', c.horizon_date, 'actualPct', c.actual_pct, 'benchPct', c.bench_pct,
          'hit', c.direction_hit, 'gradedAt', c.graded_at
        ) as x
        from calls c where c.user_id = p_user
        order by c.created_at desc limit 100
      ) c2),
    'briefs', (select coalesce(jsonb_agg(x order by x->>'day' desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'day', to_char(d.brief_date, 'YYYY-MM-DD'),
          'items', jsonb_array_length(coalesce(d.items, '[]'::jsonb)),
          'reviewed', d.reviewed_at is not null
        ) as x
        from daily_briefs d where d.user_id = p_user
        order by d.brief_date desc limit 60
      ) d2),
    'usage', (select coalesce(jsonb_agg(x order by x->>'day'), '[]'::jsonb) from (
        select jsonb_build_object('day', to_char(a.day, 'YYYY-MM-DD'), 'calls', a.calls) as x
        from ai_usage a where a.user_id = p_user
      ) a2),
    -- The session trail: where this account went, in order. Reading it top to
    -- bottom is the closest the console gets to watching someone use the
    -- product, and it's the only view that shows what they tried and abandoned.
    'events', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'at', e.created_at, 'kind', e.kind, 'name', e.name, 'detail', e.detail
        ) as x
        from user_events e
        where e.user_id = p_user
        order by e.created_at desc
        limit greatest(1, least(1000, coalesce(p_limit, 100) * 5))
      ) e2),
    -- Rolled up, so "opens Radar constantly, never touched Analyze" is one
    -- glance rather than a scroll through the trail above.
    'featureTotals', (select coalesce(jsonb_agg(x order by (x->>'hits')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'name', e.name, 'kind', min(e.kind), 'hits', count(*), 'lastAt', max(e.created_at)
        ) as x
        from user_events e where e.user_id = p_user
        group by e.name
      ) f2)
  );
$$;

-- Most recent calls, for the live activity tail.
create or replace function admin_recent_events(p_limit int default 60)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select coalesce(jsonb_agg(row order by row->>'at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'at', e.created_at, 'email', u.email, 'route', e.route,
      'provider', e.provider, 'model', e.model,
      'tokens', e.input_tokens + e.output_tokens,
      'searches', e.web_searches,
      'cost', e.cost_usd, 'ms', e.ms, 'ok', e.ok
    ) as row
    from ai_events e
    left join auth.users u on u.id = e.user_id
    order by e.created_at desc
    limit greatest(1, least(200, coalesce(p_limit, 60)))
  ) s;
$$;

-- anon/authenticated are named explicitly — see the note above; revoking from
-- `public` alone leaves these callable over PostgREST.
revoke all on function admin_usage_overview(int) from public, anon, authenticated;
revoke all on function admin_user_activity(int, int) from public, anon, authenticated;
revoke all on function admin_user_detail(uuid, int) from public, anon, authenticated;
revoke all on function admin_recent_events(int) from public, anon, authenticated;
grant execute on function admin_usage_overview(int) to service_role;
grant execute on function admin_user_activity(int, int) to service_role;
grant execute on function admin_user_detail(uuid, int) to service_role;
grant execute on function admin_recent_events(int) to service_role;
