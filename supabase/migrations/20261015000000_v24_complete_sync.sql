-- HeliLog V2.4 TEST migration. Existing V2.3 aircraft/flight records are retained.
-- New signed endorsement records become sealed by the database, not by UI flags.
begin;

alter table public.helilog_records drop constraint if exists helilog_records_kind_check;
alter table public.helilog_records add constraint helilog_records_kind_check
 check (kind in ('aircraft','person','flight','simulator','qualification','endorsement','settings'));

-- An endorsement becomes sealed as soon as a signed PNG is committed.
-- Make that state non-reversible, including through direct REST writes.
create or replace function public.helilog_guard_record_change()
returns trigger language plpgsql set search_path = '' as $$
declare has_signature boolean;
begin
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
drop trigger if exists helilog_record_guard on public.helilog_records;
create trigger helilog_record_guard before insert or update or delete
 on public.helilog_records for each row
 execute function public.helilog_guard_record_change();

-- RLS insert must permit the server-side trigger to set sealed_at.
drop policy if exists "Pilot creates own unsigned records" on public.helilog_records;
create policy "Pilot creates own records" on public.helilog_records
 for insert to authenticated with check ((select auth.uid())=owner_id);

-- Freeze print artifacts by allowing archive rows to be created only in a
-- single server-side transaction after validation and user confirmation.
revoke insert on public.helilog_print_archives,
 public.helilog_archive_entries, public.helilog_archive_addenda from authenticated;

create or replace function public.helilog_confirm_print_batch(
 p_kind text,p_batch jsonb,p_record_ids text[])
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_owner uuid := (select auth.uid());
 v_id uuid := gen_random_uuid();
 v_first integer;
 v_count integer;
 v_next integer;
 v_record text;
 v_payload jsonb;
 v_sealed timestamptz;
 v_type text;
begin
 if v_owner is null then raise exception 'Authentication required';end if;
 if p_kind not in ('flight','endorsement') or
   jsonb_typeof(p_batch)<>'object' or
   cardinality(p_record_ids)<1 or cardinality(p_record_ids)>300 then
  raise exception 'Invalid archive batch';
 end if;
 v_first=(p_batch->>'firstPage')::integer;
 v_count=(p_batch->>'pageCount')::integer;
 if v_first is null or v_first<1 or v_count is null or v_count<1 or v_count>1000 then
  raise exception 'Invalid page numbering';
 end if;
 if p_kind='endorsement' and (p_batch->>'kind') is distinct from p_kind then
  raise exception 'Endorsement print type does not match batch';
 end if;
 if p_kind='flight' and coalesce(p_batch->>'kind','flight')<>'flight' then
  raise exception 'Flight print type does not match batch';
 end if;
 if p_kind='flight' and
    (select pg_catalog.array_agg(v order by ordinality)
      from pg_catalog.jsonb_array_elements_text(p_batch->'flightIds')
        with ordinality as t(v,ordinality)) is distinct from p_record_ids then
  raise exception 'Printed flight IDs differ from committed record IDs';
 end if;
 if p_kind='endorsement' and
    (select pg_catalog.array_agg(item->>'endorsementId' order by ordinality)
      from pg_catalog.jsonb_array_elements(p_batch->'items')
        with ordinality as t(item,ordinality)) is distinct from p_record_ids then
  raise exception 'Printed endorsement IDs differ from committed record IDs';
 end if;
  if array_position(p_record_ids,null) is not null or
    (select count(*) from unnest(p_record_ids) v) <>
      (select count(distinct v) from unnest(p_record_ids) v) then
  raise exception 'Duplicate or missing archive records';
 end if;

 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||p_kind,42));
 select coalesce(max(first_page+page_count),-1) into v_next
  from public.helilog_print_archives where owner_id=v_owner and kind=p_kind;
 if v_next<>-1 and v_first<>v_next then
  raise exception 'Archive pages must continue from page %',v_next;
 end if;

 -- Check all supplied original records while taking locks against edits.
 foreach v_record in array p_record_ids loop
  select payload,sealed_at into v_payload,v_sealed
  from public.helilog_records
  where owner_id=v_owner and kind=p_kind and record_id=v_record
  for update;
  if not found then raise exception 'Original record missing: %',v_record; end if;
  if p_kind='endorsement' and v_sealed is null then
   raise exception 'An endorsement must be signed before archiving';
  end if;
  -- Freeze the actual approved endorsement text/signature, not a different
  -- client-crafted image or wording.
  if p_kind='endorsement' and not exists(
     select 1 from pg_catalog.jsonb_array_elements(p_batch->'items') item
      where item->>'endorsementId'=v_record
        and item->'snapshot'->>'title'=v_payload->>'title'
        and item->'snapshot'->>'text'=v_payload->>'text'
        and item->'snapshot'->'signature'->>'data'=v_payload->>'signatureData'
        and item->'snapshot'->>'signatoryPersonId'=v_payload->>'signatoryPersonId'
  ) then
   raise exception 'Printed endorsement snapshot does not match signed original';
  end if;
  if exists(select 1 from public.helilog_archive_entries
   where owner_id=v_owner and record_kind=p_kind and record_id=v_record) then
   raise exception 'Record was already archived: %',v_record;
  end if;
 end loop;

 insert into public.helilog_print_archives
  (id,owner_id,kind,first_page,page_count,payload,confirmed_at)
 values(v_id,v_owner,p_kind,v_first,v_count,p_batch,now());

 foreach v_record in array p_record_ids loop
  insert into public.helilog_archive_entries
    (owner_id,archive_id,record_kind,record_id,snapshot)
   select v_owner,v_id,p_kind,v_record,r.payload
   from public.helilog_records r
   where r.owner_id=v_owner and r.kind=p_kind and r.record_id=v_record;
 end loop;
 return v_id;
end;
$$;
revoke all on function public.helilog_confirm_print_batch(text,jsonb,text[]) from public,anon;
grant execute on function public.helilog_confirm_print_batch(text,jsonb,text[]) to authenticated;

create unique index if not exists helilog_print_batches_owner_print_id
 on public.helilog_print_archives(owner_id,kind,(payload->>'id'));
create unique index if not exists helilog_print_addenda_owner_print_id
 on public.helilog_archive_addenda(owner_id,record_kind,(signature_metadata->>'id'));

-- Confirm printed correction addenda without editing frozen originals.
create or replace function public.helilog_confirm_print_addendum(
 p_kind text,p_record_id text,p_addendum jsonb)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_owner uuid:=(select auth.uid()); v_id uuid:=gen_random_uuid();
 v_timestamp timestamptz;
begin
 if v_owner is null then raise exception 'Authentication required';end if;
 if p_kind not in ('flight','endorsement') or
  jsonb_typeof(p_addendum)<>'object' then raise exception 'Invalid addendum';end if;
 if not exists(select 1 from public.helilog_archive_entries
  where owner_id=v_owner and record_kind=p_kind and record_id=p_record_id) then
  raise exception 'Archived original does not exist';
 end if;
 if length(trim(coalesce(p_addendum->>'reason','')))=0 then
  raise exception 'Correction reason is required';
 end if;
 if p_kind='endorsement' and
   coalesce(p_addendum->'after'->'signature'->>'data','')='' then
  raise exception 'Signed correction PNG missing';
 end if;
 v_timestamp=(p_addendum->>'confirmedAt')::timestamptz;
 if v_timestamp is null then raise exception 'Correction must be confirmed';end if;
 insert into public.helilog_archive_addenda
  (id,owner_id,record_kind,record_id,reason,before_snapshot,after_snapshot,signature_metadata,signed_at)
 values(v_id,v_owner,p_kind,p_record_id,p_addendum->>'reason',
  coalesce(p_addendum->'before','{}'::jsonb),
  coalesce(p_addendum->'after','{}'::jsonb),
  p_addendum,(coalesce(p_addendum->>'signedAt',p_addendum->>'confirmedAt'))::timestamptz);
 return v_id;
end;
$$;
revoke all on function public.helilog_confirm_print_addendum(text,text,jsonb) from public,anon;
grant execute on function public.helilog_confirm_print_addendum(text,text,jsonb) to authenticated;

commit;
