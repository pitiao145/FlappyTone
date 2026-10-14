-- 0031_lock_client_stat_writes — clients stop writing stats (brief 05).
--
-- APPLY ONLY AFTER the brief-05 client and api/runlog.ts are deployed and
-- verified: the old client max-merges through exactly the grants removed
-- here, so an old tab will then fail its (harmless) push. Rollback:
-- supabase/rollbacks/0031_rollback.sql.
--
-- tone_accuracy_stats: no client write at all; record_run()/adopt_guest()
-- (service role) are the only writers.
drop policy tone_acc_insert on public.tone_accuracy_stats;
drop policy tone_acc_update on public.tone_accuracy_stats;
revoke insert, update on public.tone_accuracy_stats from authenticated;

-- profiles: a column-level REVOKE does nothing while the table-level grant
-- stands (checked live: authenticated holds table-level INSERT/UPDATE). So
-- revoke the table-level privilege and grant back only the columns a client
-- legitimately writes: the row itself (joinBoard / ensure), the name (gated
-- by enforce_rename_entitlement()), visibility and marketing consent.
revoke insert, update on public.profiles from authenticated, anon;
grant insert (id, display_name, is_public, marketing_consent, marketing_consent_at)
  on public.profiles to authenticated;
grant update (display_name, is_public, marketing_consent, marketing_consent_at)
  on public.profiles to authenticated;

comment on table public.tone_accuracy_stats is
  'Per-player tone accuracy (spec A), per single tone ("1".."4") or combo ("3-2"). Server-written only since 0031: record_run()/adopt_guest() via api/runlog.ts add to it.';
