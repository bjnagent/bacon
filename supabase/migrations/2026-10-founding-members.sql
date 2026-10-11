-- ONE-OFF. Run once, by hand, right after the v1 billing block in schema.sql.
-- (Applied to production 2026-10-11.)
--
-- Every account that has actually USED Bacon before paid plans launch keeps
-- Pro for 90 days as a founding member. Without this, the release would
-- silently turn off the daily brief for the people who have been using it —
-- the worst possible first impression of a paywall.
--
-- "Used Bacon", not "exists in auth.users": this auth schema is shared with
-- another app, so a row there (or even in profiles, which the signup trigger
-- creates for every account) does not mean the person ever opened Bacon.
--
-- Deliberately NOT in schema.sql: that file is re-run on every migration, and
-- re-running this would hand every later signup 90 free days.
insert into public.subscriptions (user_id, plan, status, provider, current_period_end)
select u.id, 'pro', 'active', 'manual', now() + interval '90 days'
from auth.users u
where u.id in (
  select user_id from public.watchlist     union select user_id from public.themes
  union select user_id from public.scout_picks  union select user_id from public.daily_briefs
  union select user_id from public.chat_messages union select user_id from public.calls
  union select user_id from public.user_events  union select user_id from public.properties
  union select user_id from public.news_items
  union select user_id from public.ai_events where user_id is not null
)
on conflict (user_id) do nothing;
