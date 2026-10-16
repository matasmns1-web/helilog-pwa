-- HeliLog V2.9 TEST — private, daily database snapshots and guarded recovery.
-- These are within the same Supabase project; they are NOT independent off-provider backups.
begin;

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.helilog_backup_snapshots(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 source text not null check(source in ('daily','manual','pre_restore')),
 content jsonb not null,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$')
);
create index if not exists helilog_backup_owner_recent on public.helilog_backup_snapshots(owner_id,created_at desc);
alter table public.helilog_backup_snapshots enable row level security;
revoke all on table public.helilog_backup_snapshots from anon,authenticated;
grant select on table public.helilog_backup_snapshots to authenticated;
drop policy if exists "Pilot reads own backup snapshots" on public.helilog_backup_snapshots;
create policy "Pilot reads own backup snapshots" on public.helilog_backup_snapshots
 for select to authenticated using (owner_id=(select auth.uid()));

-- Helper reads precisely the four synchronized cloud data sets and account metadata.
-- Every copy is consistent within the same MVCC statement; no archive mutation occurs.
create or replace function public.helilog_backup_document(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select pg_catalog.jsonb_build_object(
 'schema',1,
 'account',(select pg_catalog.to_jsonb(a)-'user_id' from public.helilog_accounts a where a.user_id=p_owner),
 'records',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)-'owner_id'
     order by r.kind,r.record_id) from public.helilog_records r where r.owner_id=p_owner),'[]'::jsonb),
 'archives',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a)-'owner_id'
     order by a.id) from public.helilog_print_archives a where a.owner_id=p_owner),'[]'::jsonb),
 'frozen',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e)-'owner_id'
     order by e.archive_id,e.record_kind,e.record_id) from public.helilog_archive_entries e where e.owner_id=p_owner),'[]'::jsonb),
 'addenda',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a)-'owner_id'
     order by a.id) from public.helilog_archive_addenda a where a.owner_id=p_owner),'[]'::jsonb)
);
$$;
revoke all on function public.helilog_backup_document(uuid) from public,anon,authenticated;

create or replace function public.helilog_backup_hash(p_data jsonb)
returns text language sql immutable security definer set search_path='' as $$
 select pg_catalog.encode(public.digest(pg_catalog.convert_to(p_data::text,'UTF8'),'sha256'),'hex');
$$;
revoke all on function public.helilog_backup_hash(jsonb) from public,anon,authenticated;

create or replace function public.helilog_capture_backup(p_owner uuid,p_source text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_data jsonb;v_id uuid;
begin
 if p_source not in ('daily','manual','pre_restore') then raise exception 'Invalid backup source';end if;
 if not exists(select 1 from public.helilog_accounts a where a.user_id=p_owner) then
   raise exception 'Account does not exist';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':backup',25));
 v_data=public.helilog_backup_document(p_owner);
 insert into public.helilog_backup_snapshots(owner_id,source,content,sha256)
 values(p_owner,p_source,v_data,public.helilog_backup_hash(v_data)) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.helilog_capture_backup(uuid,text) from public,anon,authenticated;

create or replace function public.helilog_create_backup_now()
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());
begin
 if v_owner is null then raise exception 'Sign in to create a backup';end if;
 return public.helilog_capture_backup(v_owner,'manual');
end;
$$;
revoke all on function public.helilog_create_backup_now() from public,anon;
grant execute on function public.helilog_create_backup_now() to authenticated;

create or replace function public.helilog_daily_cloud_backups()
returns integer language plpgsql security definer set search_path='' as $$
declare row record; v_total integer:=0;
begin
 -- Scheduled job executes as the postgres service role. This function is not
 -- callable by app accounts, so account isolation is enforced by the wrapper.
 for row in select a.user_id from public.helilog_accounts a loop
   perform public.helilog_capture_backup(row.user_id,'daily');
   v_total:=v_total+1;
 end loop;
 return v_total;
end;
$$;
revoke all on function public.helilog_daily_cloud_backups() from public,anon,authenticated;

-- Immutable archive provenance must match any archived entries in a candidate backup.
-- Additional newer cloud archives are permitted and never rolled back.
create or replace function public.helilog_restore_preview(p_snapshot uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid:=(select auth.uid());
 v_backup public.helilog_backup_snapshots%rowtype;
 v_doc jsonb;v_current jsonb;v_item jsonb;
 v_missing integer:=0;v_changed integer:=0;v_signed_block integer:=0;v_archive_diff integer:=0;
 v_kind text;v_key text;v_existing jsonb;v_source_signed boolean;
begin
 if v_owner is null then raise exception 'Authentication required';end if;
 select * into v_backup from public.helilog_backup_snapshots
 where id=p_snapshot and owner_id=v_owner;
 if not found then raise exception 'Backup not found in this account';end if;
 if public.helilog_backup_hash(v_backup.content)<>v_backup.sha256 then
    raise exception 'Backup integrity checksum mismatch';end if;
 v_doc=v_backup.content;
 if v_doc->>'schema'<>'1' then raise exception 'Unsupported backup schema';end if;
 -- Validate the frozen archive provenance exactly. No removal, mutation or
 -- recreation of signed/archived history is attempted by this recovery.
 for v_item in select value from pg_catalog.jsonb_array_elements(v_doc->'archives') loop
  if not exists(select 1 from public.helilog_print_archives a where a.owner_id=v_owner
    and a.id=(v_item->>'id')::uuid and (pg_catalog.to_jsonb(a)-'owner_id')=v_item) then
   v_archive_diff:=v_archive_diff+1;
  end if;
 end loop;
 for v_item in select value from pg_catalog.jsonb_array_elements(v_doc->'frozen') loop
  if not exists(select 1 from public.helilog_archive_entries e where e.owner_id=v_owner
    and e.archive_id=(v_item->>'archive_id')::uuid
    and e.record_kind=v_item->>'record_kind' and e.record_id=v_item->>'record_id'
    and (pg_catalog.to_jsonb(e)-'owner_id')=v_item) then v_archive_diff:=v_archive_diff+1;end if;
 end loop;
 for v_item in select value from pg_catalog.jsonb_array_elements(v_doc->'addenda') loop
  if not exists(select 1 from public.helilog_archive_addenda a where a.owner_id=v_owner
    and a.id=(v_item->>'id')::uuid and (pg_catalog.to_jsonb(a)-'owner_id')=v_item) then
   v_archive_diff:=v_archive_diff+1;
  end if;
 end loop;
 for v_item in select value from pg_catalog.jsonb_array_elements(v_doc->'records') loop
   v_kind=v_item->>'kind';v_key=v_item->>'record_id';
   v_source_signed=coalesce(v_item->>'sealed_at','')<>'' and v_item->>'sealed_at'<>'null';
   select pg_catalog.to_jsonb(r)-'owner_id' into v_existing
     from public.helilog_records r
     where r.owner_id=v_owner and r.kind=v_kind and r.record_id=v_key;
   if v_source_signed or exists(
     select 1 from public.helilog_archive_entries e where e.owner_id=v_owner
       and e.record_kind=v_kind and e.record_id=v_key
   ) then
     if v_existing is distinct from v_item then v_signed_block:=v_signed_block+1;end if;
   elsif v_existing is null then
     v_missing:=v_missing+1;
   elsif v_existing->'payload' is distinct from v_item->'payload' then
     v_changed:=v_changed+1;
   end if;
 end loop;
 v_current=public.helilog_backup_document(v_owner);
 return pg_catalog.jsonb_build_object(
   'id',p_snapshot,'source',v_backup.source,'createdAt',v_backup.created_at,
   'snapshotHash',v_backup.sha256,'currentHash',public.helilog_backup_hash(v_current),
   'missingUnsigned',v_missing,'differentExisting',v_changed,
   'protectedMismatch',v_archive_diff+v_signed_block,
   'restorable',(v_archive_diff+v_signed_block=0 and v_changed=0),
   'note','Only missing unsigned cloud records can be restored. Existing records and immutable archives are never overwritten.');
end;
$$;
revoke all on function public.helilog_restore_preview(uuid) from public,anon;
grant execute on function public.helilog_restore_preview(uuid) to authenticated;

create or replace function public.helilog_restore_missing_records(
 p_snapshot uuid,p_expected_current_hash text,p_confirmation text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_preview jsonb;v_data jsonb;v_item jsonb;v_restored int:=0;v_undo uuid;
begin
 if v_owner is null then raise exception 'Authentication required';end if;
 if p_confirmation<>'RESTORE MISSING RECORDS' then raise exception 'Explicit recovery confirmation required';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':restore',29));
 v_preview=public.helilog_restore_preview(p_snapshot);
 if not (v_preview->>'restorable')::boolean then raise exception 'Archive or mutable-record differences require manual review';end if;
 if v_preview->>'currentHash' is distinct from p_expected_current_hash then
   raise exception 'Cloud records changed since restore preview. Preview again.';end if;
 if (v_preview->>'missingUnsigned')::int=0 then
  return pg_catalog.jsonb_build_object('restored',0,'backupBeforeRestore',null);
 end if;
 -- This recovery snapshot is in the SAME database, not external redundancy.
 v_undo=public.helilog_capture_backup(v_owner,'pre_restore');
 select content into v_data from public.helilog_backup_snapshots
  where id=p_snapshot and owner_id=v_owner;
 for v_item in select value from pg_catalog.jsonb_array_elements(v_data->'records') loop
   if coalesce(v_item->>'sealed_at','')<>'' and v_item->>'sealed_at'<>'null' then continue;end if;
   if exists(select 1 from public.helilog_archive_entries e where e.owner_id=v_owner
      and e.record_kind=v_item->>'kind' and e.record_id=v_item->>'record_id') then continue;end if;
   if not exists(select 1 from public.helilog_records r where r.owner_id=v_owner
      and r.kind=v_item->>'kind' and r.record_id=v_item->>'record_id') then
      insert into public.helilog_records(owner_id,kind,record_id,payload,revision)
      values(v_owner,v_item->>'kind',v_item->>'record_id',v_item->'payload',1);
      v_restored:=v_restored+1;
   end if;
 end loop;
 return pg_catalog.jsonb_build_object('restored',v_restored,'backupBeforeRestore',v_undo);
end;
$$;
revoke all on function public.helilog_restore_missing_records(uuid,text,text) from public,anon;
grant execute on function public.helilog_restore_missing_records(uuid,text,text) to authenticated;

-- Daily 03:00 UTC database-held snapshots; no user session or browser required.
select cron.schedule('helilog-v29-daily-test-snapshots','0 3 * * *',
 $$select public.helilog_daily_cloud_backups();$$);

commit;
