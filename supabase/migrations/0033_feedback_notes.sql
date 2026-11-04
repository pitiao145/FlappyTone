-- 0033_feedback_notes — the "note from Pierre" card for engaged free players.
-- Applied 2026-11-04.
--
-- A sent note is a row in the existing `feedback` table (source 'note'), so
-- every reply is read in one place. "Not now" is a count and a time on the
-- player's `profiles` row (a dismiss has no message, and feedback.message is
-- required). A card that was shown and ignored writes nothing.
--
-- Sole writer of notes and dismisses: api/note.ts (service role). It checks
-- eligibility first, and takes contact_email from the session (never from the
-- body), only when the player ticked "happy to chat".

-- feedback: the note's columns. Defaults keep every widget row as it was.
alter table public.feedback
  add column source text not null default 'widget' check (source in ('widget', 'note')),
  add column wants_chat boolean not null default false,
  add column contact_email text check (char_length(contact_email) <= 320),
  add column app_context jsonb check (pg_column_size(app_context) <= 2000),
  add constraint feedback_email_only_for_chat check (contact_email is null or wants_chat);

create index feedback_note_user_idx on public.feedback (user_id) where source = 'note';

-- The browser still inserts widget feedback, but only into the old columns, so
-- it cannot write a 'note' row or an email (0023 left a table-level INSERT).
-- user_id and created_at come from their defaults, which need no grant.
revoke insert on public.feedback from anon, authenticated;
grant insert (message, rating, screen, tier, user_agent) on public.feedback to anon, authenticated;

-- profiles: "Not now" state. Not in 0031's client column grants, so
-- server-written only.
alter table public.profiles
  add column note_dismissals smallint not null default 0,
  add column note_last_dismissed_at timestamptz;

-- Should this account see the card now? Free accounts only (no Pro access).
-- Activity comes from counted_runs (server-written, one row per user per
-- local day): at least p_min_days play days and p_min_runs counted runs in
-- the last 14 days. Show rules: never sent, fewer than 2 dismisses, and the
-- last dismiss 3+ days ago (so "Not now" reshows once).
create function public.note_eligible(p_user uuid, p_min_days integer, p_min_runs integer)
returns boolean language sql stable security invoker set search_path = '' as $$
  with act as (
    select count(*) as days, coalesce(sum(count), 0) as runs
    from public.counted_runs
    where user_id = p_user and day >= current_date - 13
  )
  select coalesce((
    select act.days >= p_min_days and act.runs >= p_min_runs
       and p.note_dismissals < 2
       and (p.note_last_dismissed_at is null or p.note_last_dismissed_at <= now() - interval '3 days')
       and not exists (select 1 from public.feedback f
                       where f.user_id = p_user and f.source = 'note')
       and not exists (select 1 from public.entitlements e
                       where e.user_id = p_user and e.has_access)
    from public.profiles p, act
    where p.id = p_user
  ), false)
$$;

-- One "Not now": adds to the count, atomically.
create function public.note_dismiss(p_user uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.profiles
     set note_dismissals = note_dismissals + 1,
         note_last_dismissed_at = now()
   where id = p_user
$$;

revoke execute on function public.note_eligible(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.note_dismiss(uuid) from public, anon, authenticated;
grant execute on function public.note_eligible(uuid, integer, integer) to service_role;
grant execute on function public.note_dismiss(uuid) to service_role;

comment on column public.feedback.source is
  'widget = the in-app Feedback tab (client insert); note = the note-from-Pierre card (api/note.ts only).';
comment on column public.feedback.contact_email is
  'Note rows only: the account email, stored only when wants_chat.';
