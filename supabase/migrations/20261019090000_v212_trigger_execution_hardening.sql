-- HeliLog V2.12 TEST ONLY: trigger routines must never be directly callable as RPC.
-- These functions are invoked by table triggers and require no EXECUTE grant to API roles.
-- Existing owner-checking user-facing archive/backup RPCs remain callable as before.
begin;
revoke execute on function public.helilog_validate_correction_proposal()
 from public, anon, authenticated;
revoke execute on function public.helilog_retire_confirmed_correction()
 from public, anon, authenticated;
commit;
