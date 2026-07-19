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
