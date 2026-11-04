-- 0033_feedback_notes — the "note from Pierre" card for engaged free players.
--
-- One row per action: a sent note (message set) or a "Not now" / close
-- (dismissed_at set, message null). A card that was shown and ignored writes
-- nothing, so it can show again after the next run.
--
-- Reads: owner-only RLS. Writes: none from the client. api/note.ts (service
-- role) is the sole writer: it checks eligibility first, and takes
-- contact_email from the session (never from the body), only when the player
-- ticked "happy to chat".

create table public.feedback_notes (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  message       text check (char_length(message) between 1 and 1000),
  wants_chat    boolean not null default false,
  contact_email text check (char_length(contact_email) <= 320),
  app_context   jsonb not null default '{}'::jsonb
                check (pg_column_size(app_context) <= 2000),
  created_at    timestamptz not null default now(),
  dismissed_at  timestamptz,
  -- A row is either a sent note or a dismiss, never both or neither.
  check ((message is null) <> (dismissed_at is null)),
  -- An email is stored only when the player ticked the chat box.
  check (contact_email is null or wants_chat)
);

create index feedback_notes_user_idx on public.feedback_notes (user_id);

alter table public.feedback_notes enable row level security;

create policy feedback_notes_select_own on public.feedback_notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Supabase default privileges grant ALL to anon/authenticated (0023's lesson).
revoke all on public.feedback_notes from anon, authenticated;
grant select on public.feedback_notes to authenticated;
grant all on public.feedback_notes to service_role;

comment on table public.feedback_notes is
  'Note-from-Pierre card: one row per send or "Not now". Owner reads; sole writer api/note.ts (service role). contact_email only when wants_chat.';

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
  ), notes as (
    select count(*) filter (where message is not null)      as sent,
           count(*) filter (where dismissed_at is not null) as dismissed,
           max(dismissed_at)                                as last_dismiss
    from public.feedback_notes where user_id = p_user
  )
  select act.days >= p_min_days and act.runs >= p_min_runs
     and notes.sent = 0 and notes.dismissed < 2
     and (notes.last_dismiss is null or notes.last_dismiss <= now() - interval '3 days')
     and not exists (select 1 from public.entitlements e
                     where e.user_id = p_user and e.has_access)
  from act, notes
$$;

revoke execute on function public.note_eligible(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.note_eligible(uuid, integer, integer) to service_role;
