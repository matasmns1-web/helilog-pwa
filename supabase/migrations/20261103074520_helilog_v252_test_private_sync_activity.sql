-- HeliLog V2.52 TEST ONLY — applied to HeliLog Test Supabase
-- Migration: 20261103074520_helilog_v252_test_private_sync_activity
-- Only allowlisted status metadata, not raw errors, pilot identities or flights.
create table public.helilog_sync_activity (
 event_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 recorded_at timestamptz not null,
 received_at timestamptz not null default now(),
 state text not null check (state in ('synced','pending','conflict','error','offline','reset_required')),
 event_type text not null check (event_type in ('sync_ok','changes_pending','conflict_detected','sync_error','offline','reset_review_required','sync_recovered')),
 pending_count integer not null default 0 check (pending_count between 0 and 9999),
 conflict_count integer not null default 0 check (conflict_count between 0 and 9999),
 device_kind text not null check (device_kind in ('iPad','iPhone','Android','Desktop','Other'))
);
comment on table public.helilog_sync_activity is
 'TEST-only HeliLog account-scoped metadata, with no free-text error fields or flight data; 30-day retention.';
create index helilog_sync_activity_account_time_idx
 on public.helilog_sync_activity (owner_id,recorded_at desc);
create index helilog_sync_activity_retention_idx
 on public.helilog_sync_activity (received_at);
alter table public.helilog_sync_activity enable row level security;
revoke all on table public.helilog_sync_activity from public, anon, authenticated;
grant select on table public.helilog_sync_activity to authenticated;
grant insert (event_id,owner_id,recorded_at,state,event_type,pending_count,conflict_count,device_kind)
 on table public.helilog_sync_activity to authenticated;
create policy helilog_sync_activity_owner_read
 on public.helilog_sync_activity for select to authenticated
 using ((select auth.uid()) = owner_id);
create policy helilog_sync_activity_owner_insert
 on public.helilog_sync_activity for insert to authenticated
 with check ((select auth.uid()) = owner_id);
select cron.schedule(
 'helilog-v252-test-sync-activity-retention',
 '20 3 * * *',
 $$delete from public.helilog_sync_activity where received_at < now() - interval '30 days'$$
);