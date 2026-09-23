-- 0022_feedback — the in-app feedback form's inbox.
--
-- Insert-only from the browser, for guests (`anon`) and accounts alike. There
-- is no select policy and no select grant: nobody reads this table through the
-- API. Pierre reads it in the dashboard / SQL editor, as the table owner.
--
-- `user_id` is never sent by the client. It defaults to `auth.uid()` (null for
-- a signed-out guest), and the policy pins it there, so a submission cannot be
-- filed under someone else's account.
--
-- The CHECKs are the spam bounds: anyone holding the publishable key can
-- insert, so each row stays small. If spam ever shows up, move the write to an
-- `api/feedback.ts` function with a rate limit and drop the anon grant.

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  message text not null check (char_length(message) between 1 and 2000),
  rating smallint check (rating between 1 and 5),
  screen text check (char_length(screen) <= 40),
  tier text check (tier in ('guest', 'free', 'pro')),
  user_agent text check (char_length(user_agent) <= 400)
);

alter table public.feedback enable row level security;

drop policy if exists feedback_insert on public.feedback;

create policy feedback_insert on public.feedback
  for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));

grant insert on public.feedback to anon, authenticated;
grant all on public.feedback to service_role;
