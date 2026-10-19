-- V2.9 TEST safeguard: never resurrect retired flight-correction proposals.
-- A signed addendum's absence from an old snapshot does not permit rollback.
begin;
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
   -- Pending correction drafts are ephemeral and MUST NOT be recreated by an
   -- old backup after the web has confirmed and retired its addendum.
   if v_kind='correction_proposal' then continue;end if;
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
   'note','Only missing unsigned records can be restored. Correction proposals, sealed endorsements, existing records and archives never change.');
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
 if not (v_preview->>'restorable')::boolean then
   raise exception 'Archived, sealed or existing record differences require manual review';end if;
 if v_preview->>'currentHash' is distinct from p_expected_current_hash then
   raise exception 'Cloud records changed since preview; preview again';end if;
 if (v_preview->>'missingUnsigned')::int=0 then
  return pg_catalog.jsonb_build_object('restored',0,'backupBeforeRestore',null);
 end if;
 v_undo=public.helilog_capture_backup(v_owner,'pre_restore');
 select content into v_data from public.helilog_backup_snapshots
 where id=p_snapshot and owner_id=v_owner;
 for v_item in select value from pg_catalog.jsonb_array_elements(v_data->'records') loop
   -- Pending proposals are retired transactionally when signed addenda are
   -- confirmed, and must never be resurrected by a historical backup.
   if v_item->>'kind'='correction_proposal' then continue;end if;
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
commit;
