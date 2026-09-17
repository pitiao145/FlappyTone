-- 0016_board_pro_badge — surface Pro status on leaderboard rows.
--
-- `board`/`board_period` ran `security invoker`, so a join against
-- `entitlements` inside them would only ever see the *caller's own* row —
-- `ent_select_own` (0005) restricts it to `auth.uid() = user_id`, and RLS is
-- enforced per invoking role, not per function. Showing everyone else's Pro
-- badge needs the function itself to read past that, so both are switched to
-- `security definer` (search_path pinned, as every definer function here
-- already is) — the same justification `enforce_rename_entitlement` (0007)
-- used: a definer function that returns one derived boolean is a narrower
-- surface than granting broader table access.

create or replace function public.board(p_week text, p_limit int default 50)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      s.user_id,
      p.display_name,
      s.best_score,
      coalesce(e.has_access, false) as pro,
      rank() over (order by s.best_score desc) as position
    from public.leaderboard_scores s
    join public.profiles p on p.id = s.user_id
    left join public.entitlements e on e.user_id = s.user_id
    where s.week_id = p_week
  )
  select json_build_object(
    'rows', coalesce(
      (
        select json_agg(
          json_build_object(
            'user_id', r.user_id,
            'display_name', r.display_name,
            'best_score', r.best_score,
            'pro', r.pro
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

alter function public.board(text, int) set statement_timeout = '5s';

grant execute on function public.board(text, int) to anon, authenticated;

create or replace function public.board_period(p_period text, p_limit int default 20)
returns json
language sql
stable
security definer
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
           coalesce(e.has_access, false) as pro,
           rank() over (order by sc.best_score desc) as rnk
    from scores sc
    join public.profiles p on p.id = sc.user_id
    left join public.entitlements e on e.user_id = sc.user_id
  )
  select json_build_object(
    'rows', coalesce(
      (select json_agg(json_build_object('user_id', user_id, 'display_name', display_name, 'best_score', best_score, 'pro', pro) order by rnk)
       from ranked where rnk <= least(p_limit, 20)),
      '[]'::json
    ),
    'total', (select count(*) from ranked),
    'my_rank', (select rnk from ranked where user_id = auth.uid())
  );
$$;

grant execute on function public.board_period(text, int) to anon, authenticated;
