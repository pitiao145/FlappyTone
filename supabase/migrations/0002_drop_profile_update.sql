-- 0002_drop_profile_update — remove the profile UPDATE policy added in 0001.
--
-- Supabase's security advisor flagged `prof_update` under
-- `auth_allow_anonymous_sign_ins`: it let an anonymous user change their own
-- profile row. That is not wrong so much as premature — in Phase 1 a display
-- name is generated for the player and cannot be edited (choosing your own name
-- is a Pro feature), so nothing in the app ever issues this update. A write
-- path that exists but is never used is only an attack surface.
--
-- Insert stays: a player still creates their own row once when they join the
-- board. Phase 2 restores update for permanent (non-anonymous) accounts, gated
-- on `auth.jwt() ->> 'is_anonymous'` so the advisor stays clear.

drop policy if exists prof_update on public.profiles;
