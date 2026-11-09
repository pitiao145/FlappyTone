-- 0034_profile_usage_analytics — the "Usage analytics" switch follows the
-- account (brief 35), and the consent columns stop being public.
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
-- Private consent columns. `prof_read` is `using (true)` (the board shows
-- names), and anon/authenticated held table-level SELECT, so anyone with the
-- anon key could read every player's marketing consent. RLS cannot hide
-- columns, so the table-level SELECT is replaced by a column list without
-- the four consent columns. The owner reads their own switch through
-- `my_usage_analytics()` (security definer, own row only). Nothing else
-- reads these columns from a client: board()/board_period() are security
-- definer, record_run/adopt_guest/note_* run as service_role only, and
-- every client select names its columns.
--
-- A column added to profiles later is NOT readable by clients until it is
-- added to the grant below.
--
-- Rollback:
--   drop function public.my_usage_analytics();
--   grant select on public.profiles to anon, authenticated;
--   revoke insert (usage_analytics, usage_analytics_at) on public.profiles from authenticated;
--   revoke update (usage_analytics, usage_analytics_at) on public.profiles from authenticated;
--   alter table public.profiles drop column usage_analytics_at, drop column usage_analytics;

alter table public.profiles
  add column if not exists usage_analytics boolean not null default true,
  add column if not exists usage_analytics_at timestamptz;

grant insert (usage_analytics, usage_analytics_at) on public.profiles to authenticated;
grant update (usage_analytics, usage_analytics_at) on public.profiles to authenticated;

revoke select on public.profiles from anon, authenticated;
grant select (
  id, display_name, is_public, created_at, best_score, total_runs, total_gates,
  streak_current, streak_best, synced_at, streak_last_day, words_played,
  note_dismissals, note_last_dismissed_at
) on public.profiles to anon, authenticated;

-- The signed-in player's own switch; null when they have no row yet.
create or replace function public.my_usage_analytics()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p.usage_analytics from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.my_usage_analytics() from public, anon;
grant execute on function public.my_usage_analytics() to authenticated;

comment on column public.profiles.usage_analytics is
  'Usage analytics switch (brief 35). false = no PostHog events from this account on any device. Client-written by the owner; not client-readable (my_usage_analytics()).';
comment on column public.profiles.usage_analytics_at is
  'When the owner last changed usage_analytics (client clock).';
comment on function public.my_usage_analytics() is
  'The calling player''s own usage_analytics (brief 35). Security definer because clients have no SELECT on the consent columns.';
