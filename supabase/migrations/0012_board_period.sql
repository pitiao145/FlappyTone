-- Week/month/all-time leaderboard windows. "Week" matches the ISO week_id
-- column (same boundary as the weekly `board()` RPC) so it empties out at the
-- start of each new week, same as the old weekly board. "Month" has no
-- equivalent column, so it's a rolling 30-day window off `updated_at` (when a
-- weekly best was last raised) — the table has no per-run timestamp.
create index if not exists lb_updated_at on public.leaderboard_scores (updated_at desc);

create function public.board_period(p_period text, p_limit int default 20)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with scores as (
    select s.user_id, max(s.best_score) as best_score
    from public.leaderboard_scores s
    where case p_period
      when 'week' then s.week_id = to_char(now(), 'IYYY-"W"IW')
      when 'month' then s.updated_at >= now() - interval '30 days'
      else true
    end
    group by s.user_id
  ),
  ranked as (
    select sc.user_id, sc.best_score, p.display_name,
           rank() over (order by sc.best_score desc) as rnk
    from scores sc
    join public.profiles p on p.id = sc.user_id
  )
  select json_build_object(
    'rows', coalesce(
      (select json_agg(json_build_object('user_id', user_id, 'display_name', display_name, 'best_score', best_score) order by rnk)
       from ranked where rnk <= least(p_limit, 20)),
      '[]'::json
    ),
    'total', (select count(*) from ranked),
    'my_rank', (select rnk from ranked where user_id = auth.uid())
  );
$$;

grant execute on function public.board_period(text, int) to anon, authenticated;
