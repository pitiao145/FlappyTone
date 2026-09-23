-- 0023_feedback_revoke_defaults — make 0022's "insert-only" true at the grant
-- layer, not just the policy layer.
--
-- Supabase's default privileges on `public` grant ALL on every new table to
-- `anon` and `authenticated`. 0022's GRANT INSERT added nothing on top of that,
-- so the table was only insert-only because RLS has no select/update/delete
-- policy. Revoke everything and grant back INSERT alone, so a future policy
-- added by mistake cannot open reads on its own.

revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to anon, authenticated;
