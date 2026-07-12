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
create policy "read snapshots" on market_snapshots for select using (auth.role() = 'authenticated');

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
create policy "read ticker_series" on ticker_series for select using (auth.role() = 'authenticated');

-- property tracker (SG + AU): shared index cache + per-user portfolio + outlooks
create table if not exists property_series (
  series_key text primary key,
  bars jsonb not null default '[]'::jsonb,
  fetched_at timestamptz default now()
);
alter table property_series enable row level security;
drop policy if exists "read property_series" on property_series;
create policy "read property_series" on property_series for select using (auth.role() = 'authenticated');

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
create policy "own properties" on properties for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
create policy "own property_outlooks" on property_outlooks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

create policy "own profile"   on profiles      for all using (auth.uid() = id)       with check (auth.uid() = id);
create policy "own settings"  on settings      for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own watch"     on watchlist     for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own themes"    on themes        for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own picks"     on scout_picks   for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own news"      on news_items    for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own chat"      on chat_messages for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own briefs"    on daily_briefs   for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);

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
