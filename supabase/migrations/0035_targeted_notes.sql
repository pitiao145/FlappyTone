-- 0035_targeted_notes — a note from Pierre for accounts he picks (brief 36).
--
-- Pierre writes one note (peek, body, question) and targets one or more
-- accounts, by hand, with SQL. The note is shown ONCE in total: the first
-- check on any targeted account claims it (shown_at, shown_to), and no other
-- account, nor the same one, sees it again. A reply is a `feedback` row
-- (source 'note', note_id set); a reply, "Not now" or × sets answered_at.
-- Targeted and generic notes are separate: a targeted note never changes
-- whether the account gets the generic one, and the reverse (Pierre,
-- 2026-11-09). The client says which card it answers ('kind'); the server
-- routes on that, never on a note id from the client.
--
-- Pierre adds a note with one call (create_targeted_note, below);
-- ready-made queries: supabase/snippets/targeted-notes.sql.
--
-- Sole reader and writer: api/note.ts (service role). Both tables are
-- server-only: RLS on, no policies, nothing granted to anon/authenticated.

create table public.pierre_notes (
  id          uuid primary key default gen_random_uuid(),
  label       text check (char_length(label) <= 120),           -- Pierre's own name for it, never shown
  peek        text not null check (char_length(peek) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 400),
  question    text not null check (char_length(question) between 1 and 200),
  created_at  timestamptz not null default now(),
  shown_at    timestamptz,
  shown_to    uuid,
  answered_at timestamptz,
  constraint pierre_notes_shown_pair check ((shown_at is null) = (shown_to is null)),
  constraint pierre_notes_answered_after_shown check (answered_at is null or shown_at is not null)
);

create table public.pierre_note_targets (
  note_id uuid not null references public.pierre_notes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (note_id, user_id)
);
create index pierre_note_targets_user_idx on public.pierre_note_targets (user_id);

alter table public.pierre_notes enable row level security;
alter table public.pierre_note_targets enable row level security;
-- No client policy at all: nobody but the service role reads or writes them.
revoke all on public.pierre_notes from anon, authenticated;
revoke all on public.pierre_note_targets from anon, authenticated;
grant all on public.pierre_notes to service_role;
grant all on public.pierre_note_targets to service_role;

-- feedback: which targeted note a reply answers. Not in 0033's client insert
-- grant, so only api/note.ts (service role) writes it.
alter table public.feedback
  add column note_id uuid references public.pierre_notes (id) on delete set null;
create index feedback_note_id_idx on public.feedback (note_id) where note_id is not null;

-- Claim the oldest unshown note that targets p_user: at most one row. Atomic:
-- two accounts checking at the same moment cannot both claim it (row lock,
-- and the second skips the locked row, then re-checks shown_at).
create function public.note_claim_targeted(p_user uuid)
returns table (id uuid, peek text, body text, question text)
language sql security invoker set search_path = '' as $$
  update public.pierre_notes n
     set shown_at = now(), shown_to = p_user
   where n.shown_at is null
     and n.id = (
       select n2.id
         from public.pierre_notes n2
         join public.pierre_note_targets t on t.note_id = n2.id
        where t.user_id = p_user and n2.shown_at is null
        order by n2.created_at, n2.id
        limit 1
        for update of n2 skip locked)
  returning n.id, n.peek, n.body, n.question
$$;

-- Answer the targeted note this account was shown (in the last 7 days, not
-- answered yet, account still targeted). p_message null = "Not now" or ×:
-- only answered_at. Otherwise also one feedback row with note_id, tier from
-- entitlements. Atomic: answered_at is set in the same statement that finds
-- the note, so a second send finds nothing. False = no open targeted note.
create function public.note_answer_targeted(
  p_user uuid,
  p_message text,
  p_wants_chat boolean,
  p_contact_email text,
  p_user_agent text,
  p_context jsonb
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_note uuid;
begin
  update public.pierre_notes n
     set answered_at = now()
   where n.id = (
       select n2.id
         from public.pierre_notes n2
        where n2.shown_to = p_user
          and n2.answered_at is null
          and n2.shown_at > now() - interval '7 days'
          and exists (select 1 from public.pierre_note_targets t
                       where t.note_id = n2.id and t.user_id = p_user)
        order by n2.shown_at desc
        limit 1
        for update)
     and n.answered_at is null
  returning n.id into v_note;

  if v_note is null then
    return false;
  end if;

  if p_message is not null then
    insert into public.feedback
      (user_id, source, note_id, message, wants_chat, contact_email, screen, tier, user_agent, app_context)
    values
      (p_user, 'note', v_note, p_message, p_wants_chat,
       case when p_wants_chat then p_contact_email end,
       'play',
       case when exists (select 1 from public.entitlements e
                          where e.user_id = p_user and e.has_access)
            then 'pro' else 'free' end,
       p_user_agent, p_context);
  end if;
  return true;
end
$$;

-- The generic note: "never sent" now counts only generic replies
-- (note_id is null), so answering a targeted note does not use up the
-- generic one. Everything else unchanged from 0033.
create or replace function public.note_eligible(p_user uuid, p_min_days integer, p_min_runs integer)
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
                       where f.user_id = p_user and f.source = 'note' and f.note_id is null)
       and not exists (select 1 from public.entitlements e
                       where e.user_id = p_user and e.has_access)
    from public.profiles p, act
    where p.id = p_user
  ), false)
$$;

-- Pierre's one call to create a note (SQL editor, runs as postgres):
--   select public.create_targeted_note('label', 'peek', 'body', 'question?',
--                                      array['player@example.com']);
-- p_accounts: emails or user ids, mixed. All must be one person's accounts:
-- the note is shown once in total across them. For two different people,
-- call it twice. Fails (and creates nothing) if any account is not found or
-- a text is too long. Returns the note id.
create function public.create_targeted_note(
  p_label text,
  p_peek text,
  p_body text,
  p_question text,
  p_accounts text[]
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_note uuid;
  v_item text;
  v_user uuid;
begin
  if p_accounts is null or cardinality(p_accounts) = 0 then
    raise exception 'create_targeted_note: give at least one email or user id';
  end if;

  insert into public.pierre_notes (label, peek, body, question)
  values (p_label, p_peek, p_body, p_question)
  returning id into v_note;

  foreach v_item in array p_accounts loop
    v_item := btrim(v_item);
    if v_item ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select u.id into v_user from auth.users u where u.id = v_item::uuid;
    else
      select u.id into v_user from auth.users u where lower(u.email) = lower(v_item);
    end if;
    if v_user is null then
      raise exception 'create_targeted_note: no account for %', v_item;
    end if;
    insert into public.pierre_note_targets (note_id, user_id)
    values (v_note, v_user)
    on conflict do nothing;
  end loop;

  return v_note;
end
$$;

revoke execute on function public.create_targeted_note(text, text, text, text, text[]) from public, anon, authenticated;
revoke execute on function public.note_claim_targeted(uuid) from public, anon, authenticated;
revoke execute on function public.note_answer_targeted(uuid, text, boolean, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.note_eligible(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.note_claim_targeted(uuid) to service_role;
grant execute on function public.note_answer_targeted(uuid, text, boolean, text, text, jsonb) to service_role;
grant execute on function public.note_eligible(uuid, integer, integer) to service_role;

comment on table public.pierre_notes is
  'Targeted notes from Pierre (inserted by hand). Shown once across all targets. Read/written only by api/note.ts.';
comment on table public.pierre_note_targets is
  'Which accounts a pierre_notes row may be shown to. Inserted by hand; read only by api/note.ts.';
comment on column public.feedback.note_id is
  'Note rows only: the pierre_notes row this reply answers (null = the generic note). Written only by api/note.ts.';
