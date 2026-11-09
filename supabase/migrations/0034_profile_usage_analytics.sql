-- 0034_profile_usage_analytics — the "Usage analytics" switch follows the
-- account (brief 35).
--
-- `usage_analytics`: false = the player turned analytics off; the client then
-- sends no PostHog event at all, on any device signed in to this account.
-- `usage_analytics_at`: when the player last changed it (client clock).
--
-- The client writes both itself (Settings toggle, and the sync that carries a
-- browser's old "off" to the account), so both get the same explicit column
-- grants as marketing_consent in 0031 (raw-SQL migrations need them: the
-- table-level INSERT/UPDATE was revoked there). RLS is unchanged: prof_update
-- is `auth.uid() = id`, so a player can only change their own row.
--
-- Rollback:
--   revoke insert (usage_analytics, usage_analytics_at) on public.profiles from authenticated;
--   revoke update (usage_analytics, usage_analytics_at) on public.profiles from authenticated;
--   alter table public.profiles drop column usage_analytics_at, drop column usage_analytics;

alter table public.profiles
  add column if not exists usage_analytics boolean not null default true,
  add column if not exists usage_analytics_at timestamptz;

grant insert (usage_analytics, usage_analytics_at) on public.profiles to authenticated;
grant update (usage_analytics, usage_analytics_at) on public.profiles to authenticated;

comment on column public.profiles.usage_analytics is
  'Usage analytics switch (brief 35). false = no PostHog events from this account on any device. Client-written by the owner.';
comment on column public.profiles.usage_analytics_at is
  'When the owner last changed usage_analytics (client clock).';
