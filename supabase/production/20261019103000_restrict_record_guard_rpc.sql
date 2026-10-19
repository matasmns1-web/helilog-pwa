-- HeliLog production-only least-privilege hardening.
-- Trigger functions execute via their registered triggers; they are never client RPCs.
-- No application records or backup snapshots are modified.
begin;
revoke execute on function public.helilog_guard_record_change()
  from public, anon, authenticated;
commit;
