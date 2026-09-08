-- 0007_accounts_public — free accounts become real, and renaming becomes the
-- part of them that is actually paid for.
--
-- Phase 2 of the tiers spec splits what used to be one thing. An account is no
-- longer the Pro tier: signing up is the guest→free gate (saved progress, a
-- real board row), and Pro is depth, content and customization on top. So the
-- rename gate can no longer be "has an account".
--
-- It cannot be an RLS policy either. `prof_update` has to stay open to free
-- accounts, because the stats sync writes best_score/total_runs/streak_* through
-- that same policy, and Postgres RLS is per-row, not per-column — a policy
-- cannot say "you may write these columns but not that one". `WITH CHECK` sees
-- only the new row, so it cannot even tell whether display_name changed.
--
-- A BEFORE UPDATE trigger can see both rows, so that is where the gate goes.

alter table public.profiles
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz;

create or replace function public.enforce_rename_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name
     and not exists (
       select 1 from public.entitlements e
       where e.user_id = old.id and e.has_access
     )
  then
    raise exception 'renaming needs Pro' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_rename_entitlement on public.profiles;

create trigger profiles_rename_entitlement
  before update on public.profiles
  for each row execute function public.enforce_rename_entitlement();
