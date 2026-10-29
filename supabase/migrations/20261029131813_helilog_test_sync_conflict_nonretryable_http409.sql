-- Applied to HeliLog TEST on 2026-10-29 via Supabase migration
-- 20261029131813_helilog_test_sync_conflict_nonretryable_http409.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely even for logical sync
-- conflicts. PT409 expresses a normal, non-retryable HTTP 409 Conflict.
-- Preserve function signature, owner, SECURITY DEFINER, restricted
-- search_path and existing execution grants. No rows are modified.
DO $heli$
DECLARE
  original_sql text;
  new_sql text;
  old_code text := 'errcode=''40001''';
  new_code text := 'errcode=''PT409''';
BEGIN
  SELECT pg_get_functiondef('public.helilog_sync_mutation(text,text,text,jsonb,bigint,bigint)'::regprocedure)
  INTO original_sql;
  IF original_sql IS NULL THEN
    RAISE EXCEPTION 'HeliLog sync function missing; no change made';
  END IF;
  IF (length(original_sql)-length(replace(original_sql,old_code,''))) <> length(old_code) THEN
    RAISE EXCEPTION 'Expected exactly one legacy retryable error; no change made';
  END IF;
  new_sql:=replace(original_sql,old_code,new_code);
  EXECUTE new_sql;
END $heli$;
