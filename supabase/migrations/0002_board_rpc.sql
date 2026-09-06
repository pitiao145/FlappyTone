-- 0002_board_rpc — render the whole leaderboard card in one round trip.
--
-- Reading the board used to take four sequential requests: the top rows, a
-- count of the field, the player's own score, and a count of the scores above
-- it. Each was a tiny indexed lookup, but four round trips to draw one card is
-- three more than the data needs — and the last two could not even start until
-- the first two came back.
--
-- `rank()` does the work the two count queries were imitating, over the same
-- index the old queries used (week_id, best_score desc).
--
-- The player's own rank comes from `auth.uid()` inside the function rather than
-- a parameter, so a caller can only ever ask "where am I", never "where is
-- that person". `security invoker` (the default) keeps the existing RLS
-- policies in force; this function widens nothing.

create function public.board(p_week text, p_limit int default 50)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with ranked as (
    select
      s.user_id,
      p.display_name,
      s.best_score,
      rank() over (order by s.best_score desc) as position
    from public.leaderboard_scores s
    join public.profiles p on p.id = s.user_id
    where s.week_id = p_week
  )
  select json_build_object(
    'rows', coalesce(
      (
        select json_agg(
          json_build_object(
            'user_id', r.user_id,
            'display_name', r.display_name,
            'best_score', r.best_score
          )
          order by r.position
        )
        from (select * from ranked order by position limit p_limit) r
      ),
      '[]'::json
    ),
    'total', (select count(*) from ranked),
    'my_rank', (select r.position from ranked r where r.user_id = auth.uid())
  );
$$;

-- Bounded so a caller cannot ask for the entire table in one request.
alter function public.board(text, int) set statement_timeout = '5s';

grant execute on function public.board(text, int) to anon, authenticated;
