-- ONE-OFF. Run once, by hand, right after the v1 billing block in schema.sql.
--
-- Every account that exists before paid plans launch keeps Pro for 90 days as a
-- founding member. Without this, the release would silently turn off the daily
-- brief for the people who have been using it — the worst possible first
-- impression of a paywall.
--
-- Deliberately NOT in schema.sql: that file is re-run on every migration, and
-- re-running this would hand every later signup 90 free days.
insert into subscriptions (user_id, plan, status, provider, current_period_end)
select id, 'pro', 'active', 'manual', now() + interval '90 days'
from auth.users
on conflict (user_id) do nothing;
