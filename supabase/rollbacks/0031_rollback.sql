-- Rollback for 0031_lock_client_stat_writes: restores the pre-0031 client
-- writes, for reverting to a client that max-merges stats (pre brief 05).
-- Not a migration; run through apply_migration only if a revert is needed.
grant select, insert, update on public.tone_accuracy_stats to authenticated;
create policy tone_acc_insert on public.tone_accuracy_stats
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy tone_acc_update on public.tone_accuracy_stats
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
grant insert, update on public.profiles to authenticated, anon;
