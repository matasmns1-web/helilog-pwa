-- HeliLog V2.10 TEST — non-destructive backup health and retention planning.
-- Never delete cloud records, archive history, snapshots or signed addenda.
begin;

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
   from cron.job where jobname='helilog-v29-daily-test-snapshots';
 select d.status,d.end_time into v_run_status,v_run_time
   from cron.job_run_details d join cron.job j on j.jobid=d.jobid
   where j.jobname='helilog-v29-daily-test-snapshots'
   order by d.start_time desc limit 1;
 select count(*) into v_failed_runs
   from cron.job_run_details d join cron.job j on j.jobid=d.jobid
   where j.jobname='helilog-v29-daily-test-snapshots'
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
revoke all on function public.helilog_backup_health() from public,anon;
grant execute on function public.helilog_backup_health() to authenticated;

-- Retention is currently DRY-RUN ONLY: preserve all existing snapshots until
-- external recovery is independently validated. Suggested future policy:
-- keep the latest 90 daily snapshots AND the latest monthly daily snapshot
-- for 12 months; preserve all manual and pre_restore snapshots indefinitely.
create or replace function public.helilog_backup_retention_preview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_total int;v_daily int;v_manual int;v_undo int;v_eligible int;
begin
 if v_owner is null then raise exception 'Authentication required';end if;
 if not exists(select 1 from public.helilog_accounts where user_id=v_owner)
   then raise exception 'Account not found';end if;
 select count(*),count(*) filter(where source='daily'),
   count(*) filter(where source='manual'),
   count(*) filter(where source='pre_restore')
 into v_total,v_daily,v_manual,v_undo
 from public.helilog_backup_snapshots where owner_id=v_owner;
 with numbered as (
  select s.id,s.created_at,s.source,
     row_number()over(order by s.created_at desc,s.id desc) as newest_rank,
     row_number()over(partition by date_trunc('month',s.created_at)
       order by s.created_at desc,s.id desc) as month_rank
  from public.helilog_backup_snapshots s
  where s.owner_id=v_owner and s.source='daily'
 )
 select count(*) into v_eligible from numbered
 where newest_rank>90
   and created_at<now()-interval '90 days'
   and not(month_rank=1 and created_at>=now()-interval '12 months');
 return pg_catalog.jsonb_build_object(
   'total',v_total,'daily',v_daily,'manual',v_manual,
   'preRestore',v_undo,'eligibleForFuturePruning',v_eligible,
   'mode','preview_only',
   'recentDailyToKeep',90,'monthlyAnchorMonths',12,
   'protected','All manual/pre_restore snapshots and every currently stored snapshot',
   'explanation','No snapshots will be deleted automatically in V2.10. Verify external independent recovery before enabling retention deletion.');
end;
$$;
revoke all on function public.helilog_backup_retention_preview() from public,anon;
grant execute on function public.helilog_backup_retention_preview() to authenticated;

commit;