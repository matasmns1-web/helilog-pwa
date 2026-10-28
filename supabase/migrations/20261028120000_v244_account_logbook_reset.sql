-- HeliLog V2.44 - TEST ONLY. Installing does not delete any records.
begin;
alter table public.helilog_accounts
 add column if not exists reset_generation bigint not null default 0,
 add column if not exists last_logbook_reset_at timestamptz;
-- Reject old clients' unfenced direct writes.
revoke insert,update,delete on public.helilog_records from authenticated;
create schema if not exists helilog_private;
revoke all on schema helilog_private from public,anon,authenticated;
create function helilog_private.assert_generation(p_owner uuid,p_generation bigint)
returns void language plpgsql security definer set search_path='' as $$
declare g bigint;
begin
 if p_owner is null or p_owner is distinct from (select auth.uid()) then raise exception 'Sign in to your account';end if;
 select reset_generation into g from public.helilog_accounts where user_id=p_owner for update;
 if not found or p_generation is null or g<>p_generation then
  raise exception 'Logbook reset generation changed. Acknowledge the reset before syncing this device';
 end if;
end;$$;
revoke all on function helilog_private.assert_generation(uuid,bigint) from public,anon,authenticated;
create function public.helilog_sync_mutation(
 p_action text,p_kind text,p_record_id text,p_payload jsonb,p_base_revision bigint,p_reset_generation bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_revision bigint;
begin
 perform helilog_private.assert_generation(v_owner,p_reset_generation);
 if p_action not in ('put','delete') or p_kind not in
 ('aircraft','person','flight','simulator','qualification','endorsement','settings','correction_proposal') or
 p_record_id is null or pg_catalog.char_length(p_record_id) not between 1 and 120 then
  raise exception 'Invalid record mutation';
 end if;
 if p_action='put' and (p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object') then
  raise exception 'Complete record payload required';
 end if;
 if p_base_revision is null then
  if p_action='delete' then return 0;end if;
  insert into public.helilog_records(owner_id,kind,record_id,payload)
   values(v_owner,p_kind,p_record_id,p_payload) returning revision into v_revision;
 elsif p_base_revision>0 then
  if p_action='delete' then
   delete from public.helilog_records where owner_id=v_owner and kind=p_kind and
    record_id=p_record_id and revision=p_base_revision returning revision into v_revision;
  else
   update public.helilog_records set payload=p_payload,revision=p_base_revision+1
    where owner_id=v_owner and kind=p_kind and record_id=p_record_id and revision=p_base_revision
    returning revision into v_revision;
  end if;
  if v_revision is null then
   raise exception 'Cloud record revision changed, review the conflict' using errcode='40001';
  end if;
 else raise exception 'Invalid record revision';end if;
 return v_revision;
end;$$;
revoke all on function public.helilog_sync_mutation(text,text,text,jsonb,bigint,bigint) from public,anon;
grant execute on function public.helilog_sync_mutation(text,text,text,jsonb,bigint,bigint) to authenticated;
-- Allow a sealed record's DELETE only within the verified owner reset transaction.
create or replace function public.helilog_guard_record_change()
returns trigger language plpgsql set search_path = '' as $$
declare has_signature boolean;
begin
 if TG_OP='DELETE' and pg_catalog.current_setting('helilog.reset_owner',true)=old.owner_id::text then return old; end if;
 if TG_OP='DELETE' then
  if old.sealed_at is not null then
   raise exception 'Signed endorsement is immutable';
  end if;
  if exists (select 1 from public.helilog_archive_entries ae
     where ae.owner_id=old.owner_id and ae.record_kind=old.kind and ae.record_id=old.record_id) then
   raise exception 'Archived record cannot be deleted; use an addendum';
  end if;
  return old;
 end if;
 if TG_OP='UPDATE' then
  if old.owner_id is distinct from new.owner_id
    or old.kind is distinct from new.kind or old.record_id is distinct from new.record_id then
   raise exception 'Record ownership and identity are immutable';
  end if;
  if new.revision<>old.revision+1 then
   raise exception 'Record revision must advance by one';
  end if;
  if old.sealed_at is not null then
   raise exception 'Signed endorsement is immutable; use an archived correction';
  end if;
  if exists (select 1 from public.helilog_archive_entries ae
     where ae.owner_id=old.owner_id and ae.record_kind=old.kind and ae.record_id=old.record_id) then
   raise exception 'Archived record cannot be changed; use an addendum';
  end if;
  new.created_at=old.created_at;
 end if;
 has_signature = (new.kind='endorsement' and
  length(trim(coalesce(new.payload->>'signatureData','')))>0);
 if new.kind='endorsement' then
  if has_signature then
   if coalesce(new.payload->>'signedAt','')='' or
      coalesce(new.payload->>'signatoryPersonId','')='' or
      coalesce(new.payload->>'signedName','')='' then
    raise exception 'Signed endorsement is missing signature metadata';
   end if;
   new.sealed_at=coalesce(case when TG_OP='UPDATE' then old.sealed_at else null end,now());
  else
   if new.sealed_at is not null then
    raise exception 'Cannot seal unsigned endorsement';
   end if;
   new.sealed_at=null;
  end if;
 elsif new.sealed_at is not null then
  raise exception 'Only endorsements may be signed';
 end if;
 new.updated_at=now();
 return new;
end;
$$;
-- New wrappers require reset generation, removing access to legacy RPC signatures.
alter function public.helilog_confirm_print_batch(text,jsonb,text[]) rename to helilog_confirm_print_batch_legacy_internal;
alter function public.helilog_confirm_print_addendum(text,text,jsonb) rename to helilog_confirm_print_addendum_legacy_internal;
revoke all on function public.helilog_confirm_print_batch_legacy_internal(text,jsonb,text[]) from public,anon,authenticated;
revoke all on function public.helilog_confirm_print_addendum_legacy_internal(text,text,jsonb) from public,anon,authenticated;
create function public.helilog_confirm_print_batch(p_kind text,p_batch jsonb,p_record_ids text[],p_reset_generation bigint)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform helilog_private.assert_generation((select auth.uid()),p_reset_generation);
 return public.helilog_confirm_print_batch_legacy_internal(p_kind,p_batch,p_record_ids);
end;$$;
create function public.helilog_confirm_print_addendum(p_kind text,p_record_id text,p_addendum jsonb,p_reset_generation bigint)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform helilog_private.assert_generation((select auth.uid()),p_reset_generation);
 return public.helilog_confirm_print_addendum_legacy_internal(p_kind,p_record_id,p_addendum);
end;$$;
revoke all on function public.helilog_confirm_print_batch(text,jsonb,text[],bigint) from public,anon;
revoke all on function public.helilog_confirm_print_addendum(text,text,jsonb,bigint) from public,anon;
grant execute on function public.helilog_confirm_print_batch(text,jsonb,text[],bigint) to authenticated;
grant execute on function public.helilog_confirm_print_addendum(text,text,jsonb,bigint) to authenticated;
-- An all-or-nothing account-owned erasure. Existing Auth identity is retained.
create function public.helilog_reset_logbook(p_expected_generation bigint,p_confirmation text)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_session uuid;v_generation bigint;
begin
 if v_owner is null or p_confirmation is distinct from 'DELETE MY LOGBOOK' then
  raise exception 'Sign-in and exact reset confirmation required';end if;
 begin v_session=(select auth.jwt()->>'session_id')::uuid;
 exception when others then raise exception 'Fresh password authentication required';end;
 if v_session is null or not exists(
  select 1 from auth.sessions s where s.id=v_session and s.user_id=v_owner
    and s.created_at >= pg_catalog.now()-interval '5 minutes'
 ) then raise exception 'Re-enter the account password before resetting';end if;
 select reset_generation into v_generation from public.helilog_accounts
  where user_id=v_owner for update;
 if not found or p_expected_generation is distinct from v_generation then
  raise exception 'Account generation changed, review the reset again';end if;
 perform pg_catalog.set_config('helilog.reset_owner',v_owner::text,true);
 delete from public.helilog_archive_addenda where owner_id=v_owner;
 delete from public.helilog_archive_entries where owner_id=v_owner;
 delete from public.helilog_print_archives where owner_id=v_owner;
 delete from public.helilog_records where owner_id=v_owner;
 delete from public.helilog_backup_snapshots where owner_id=v_owner;
 update public.helilog_accounts set reset_generation=v_generation+1,
  last_logbook_reset_at=pg_catalog.now(),updated_at=pg_catalog.now() where user_id=v_owner;
 perform pg_catalog.set_config('helilog.reset_owner','',true);
 return v_generation+1;
end;$$;
revoke all on function public.helilog_reset_logbook(bigint,text) from public,anon;
grant execute on function public.helilog_reset_logbook(bigint,text) to authenticated;
commit;
