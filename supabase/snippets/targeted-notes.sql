-- Targeted notes from Pierre: copy-paste queries for the Supabase SQL editor.
-- Not a migration (nothing here runs on deploy). Tables and functions:
-- supabase/migrations/0035_targeted_notes.sql. How it works:
-- docs/ARCHITECTURE.md, "Note from Pierre".
--
-- Rules:
-- - Pick who gets a note from Supabase data only, never from PostHog.
-- - No offer, discount or upgrade wording. One question.
-- - One note = one person. List all of that person's accounts: the note is
--   shown once in total across them. For two people, make two notes.
-- - Limits: peek 120, body 400, question 200 characters.
-- - The normal (generic) note is separate and keeps working on its own.

-- 1. Create a note. Accounts: emails or user ids, mixed. Nothing is created
--    if one is not found. Returns the note id. (In SQL, write ' as ''.)
select public.create_targeted_note(
  'my label, only I see it',
  'Short line on the small card (max 120)',
  'The longer text on the open card (max 400).',
  'The one question? (max 200)',
  array['player@example.com']
);

-- 2. All notes and where they are.
select n.created_at::date, n.label,
       case when n.answered_at is not null then 'answered'
            when n.shown_at is not null then 'shown, waiting'
            else 'not shown yet' end as state,
       n.shown_at, n.answered_at,
       (select string_agg(u.email, ', ') from public.pierre_note_targets t
          join auth.users u on u.id = t.user_id where t.note_id = n.id) as targets,
       n.id
from public.pierre_notes n
order by n.created_at desc;

-- 3. Replies to targeted notes (newest first).
select f.created_at, n.label, f.message, f.wants_chat, f.contact_email, f.tier
from public.feedback f
join public.pierre_notes n on n.id = f.note_id
order by f.created_at desc;

-- 4. Withdraw a note that was not shown yet (its targets go with it).
delete from public.pierre_notes
where id = '<NOTE_ID>' and shown_at is null;
