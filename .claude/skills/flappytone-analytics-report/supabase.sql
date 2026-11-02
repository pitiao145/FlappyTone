-- Account-side truth for the same window. Supabase project vtctkvvxzetbgfsdbpvh (Tokyo).
-- Replace {{START}} / {{END}} with the same UTC bounds as journey.sql (e.g. '2026-11-01 16:00:00+00').
-- Pierre's accounts: ToneMaster (930b42e6-...), BrightKite15 (39b67148-...). Drop them from every count.
select 'new_account' as kind, u.created_at as at, u.id::text as user_id, p.display_name as name,
       'provider ' || coalesce(u.raw_app_meta_data->>'provider', '?') || ', consent ' || coalesce(p.marketing_consent::text, '?') as detail
  from auth.users u left join profiles p on p.id = u.id
 where u.created_at >= {{START}} and u.created_at < {{END}}
union all
select 'runs', max(r.played_at), r.user_id::text, max(p.display_name),
       count(*) || ' runs, best ' || max(r.score) || ', modes ' || string_agg(distinct r.mode, '/') || ', avg tone acc ' || coalesce(round(avg(r.tone_acc)::numeric, 2)::text, '-')
  from run_log r left join profiles p on p.id = r.user_id
 where r.played_at >= {{START}} and r.played_at < {{END}}
 group by r.user_id
union all
select 'leaderboard', l.updated_at, l.user_id::text, p.display_name, l.best_score || ' in ' || l.week_id
  from leaderboard_scores l left join profiles p on p.id = l.user_id
 where l.updated_at >= {{START}} and l.updated_at < {{END}}
union all
select 'entitlement', e.updated_at, e.user_id::text, p.display_name, 'has_access ' || e.has_access || ' via ' || coalesce(e.source, '?')
  from entitlements e left join profiles p on p.id = e.user_id
 where e.updated_at >= {{START}} and e.updated_at < {{END}}
union all
select 'feedback', f.created_at, f.user_id::text, p.display_name,
       'rating ' || coalesce(f.rating::text, '-') || ' on ' || coalesce(f.screen, '?') || ' (' || coalesce(f.tier, '?') || '): ' || left(coalesce(f.message, ''), 160)
  from feedback f left join profiles p on p.id = f.user_id
 where f.created_at >= {{START}} and f.created_at < {{END}}
order by 2
