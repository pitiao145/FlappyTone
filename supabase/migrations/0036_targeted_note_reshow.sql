-- 0036_targeted_note_reshow — a claimed targeted note comes back until it
-- is answered (code review of brief 36).
--
-- 0035 claimed the note at `check` time, before the client rendered it. A
-- tab closed between the check and the card, or a render that failed, used
-- the note up for good ("shown once in total"). Now `note_claim_targeted`
-- first returns a note this account already claimed that is still open (not
-- answered, shown in the last 7 days, account still targeted: the same
-- conditions as `note_answer_targeted`). Only when there is none does it
-- claim a new one. Other accounts still never see a note once one account
-- has claimed it.
--
-- Same signature, so the generated types do not change, and CREATE OR
-- REPLACE keeps 0035's grants (service_role only).
--
-- Rollback: re-run 0035's `note_claim_targeted` definition (language sql).

create or replace function public.note_claim_targeted(p_user uuid)
returns table (id uuid, peek text, body text, question text)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  -- Already claimed by this account and still open: show it again.
  return query
    select n.id, n.peek, n.body, n.question
      from public.pierre_notes n
     where n.shown_to = p_user
       and n.answered_at is null
       and n.shown_at > now() - interval '7 days'
       and exists (select 1 from public.pierre_note_targets t
                    where t.note_id = n.id and t.user_id = p_user)
     order by n.shown_at desc
     limit 1;
  if found then
    return;
  end if;

  -- Otherwise claim the oldest unshown note that targets p_user (as 0035).
  return query
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
    returning n.id, n.peek, n.body, n.question;
end
$$;

comment on function public.note_claim_targeted(uuid) is
  'Targeted note for p_user: the one this account claimed and has not answered (7 days), else claims the oldest unshown one. Service role only (api/note.ts).';
