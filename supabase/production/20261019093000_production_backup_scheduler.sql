-- HeliLog production-only overlay. Run AFTER V2.12 trigger hardening migration.
-- Keep the shared, tested account-scoped schema; rename the production cron job
-- and direct its read-only backup health checks to the production job.
-- Does not access HeliLog Test, copy user data, or delete cloud snapshots.
begin;

do $job$
begin
 if exists(select 1 from cron.job where jobname='helilog-v29-daily-test-snapshots') then
  perform cron.unschedule('helilog-v29-daily-test-snapshots');
 end if;
end
$job$;

select cron.schedule('helilog-production-daily-snapshots','0 3 * * *',
 $$select public.helilog_daily_cloud_backups();$$);

create or replace function public.helilog_backup_health()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_owner uuid:=(select auth.uid());
 v_snapshot public.helilog_backup_snapshots%rowtype;
 v_run_status text;v_run_time timestamptz;
 v_schedule_active boolean:=false;
 v_failed_runs integer:=0;
 v_count integer:=0;v_age_hours numeric;v_verified boolean:=false;
 v_status text;
begin
 if v_owner is null then raise exception 'Authentication required';end if;
 if not exists(select 1 from public.helilog_accounts where user_id=v_owner)
  then raise exception 'Account not found';end if;
 select * into v_snapshot from public.helilog_backup_snapshots
   where owner_id=v_owner order by created_at desc,id desc limit 1;
 select count(*) into v_count from public.helilog_backup_snapshots where owner_id=v_owner;
 select coalesce(bool_or(active),false) into v_schedule_active
   from cron.job where jobname='helilog-production-daily-snapshots';
 select d.status,d.end_time into v_run_status,v_run_time
   from cron.job_run_details d join cron.job j on j.jobid=d.jobid
   where j.jobname='helilog-production-daily-snapshots'
   order by d.start_time desc limit 1;
 select count(*) into v_failed_runs
   from cron.job_run_details d join cron.job j on j.jobid=d.jobid
   where j.jobname='helilog-production-daily-snapshots'
     and d.start_time>now()-interval '7 days'
     and d.status='failed';
 if v_snapshot.id is not null then
   v_verified=(public.helilog_backup_hash(v_snapshot.content)=v_snapshot.sha256);
   v_age_hours=round((extract(epoch from(now()-v_snapshot.created_at))/3600)::numeric,1);
 end if;
 v_status=case
   when not v_schedule_active then 'scheduler_disabled'
   when v_snapshot.id is null then 'no_backup'
   when not v_verified then 'checksum_mismatch'
   when v_failed_runs>0 then 'scheduled_job_failure'
   when v_age_hours>36 then 'stale_backup'
   else 'healthy' end;
 return pg_catalog.jsonb_build_object(
  'status',v_status,'scheduleActive',v_schedule_active,'scheduleUTC','03:00',
  'snapshotCount',v_count,'lastBackupId',v_snapshot.id,
  'lastBackupAt',v_snapshot.created_at,'lastBackupSource',v_snapshot.source,
  'ageHours',v_age_hours,'checksumVerified',v_verified,
  'lastJobStatus',v_run_status,'lastJobFinishedAt',v_run_time,
  'failedJobRuns7d',v_failed_runs,
  'checkedAt',now(),
  'warning','Snapshots are held in the SAME Supabase project. Save an independent encrypted copy.');
end;
$$;
-- Preserve the previously defined authenticated-only EXECUTE grants:
-- CREATE OR REPLACE FUNCTION does not reset existing ACLs.
commit;
