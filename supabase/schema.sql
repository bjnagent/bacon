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
create policy "own profile"   on profiles      for all using (auth.uid() = id)       with check (auth.uid() = id);
create policy "own settings"  on settings      for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own watch"     on watchlist     for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own themes"    on themes        for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
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
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
