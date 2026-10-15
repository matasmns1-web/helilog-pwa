-- HeliLog V2.8.2 TEST ONLY: sync unconfirmed flight-correction proposals.
-- The original archived record and signed addendum remain separate and immutable.
begin;

alter table public.helilog_records drop constraint if exists helilog_records_kind_check;
alter table public.helilog_records add constraint helilog_records_kind_check
 check (kind in ('aircraft','person','flight','simulator','qualification','endorsement','settings','correction_proposal'));

-- No two unconfirmed proposals may target the same archived flight.
create unique index if not exists helilog_unique_pending_flight_correction
 on public.helilog_records (owner_id,(payload->>'flightId'))
 where kind='correction_proposal';

create or replace function public.helilog_validate_correction_proposal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind <> 'correction_proposal' then return new; end if;
 if pg_catalog.jsonb_typeof(new.payload)<>'object'
    or new.record_id is distinct from new.payload->>'id'
    or length(coalesce(new.payload->>'flightId',''))=0
    or length(pg_catalog.btrim(coalesce(new.payload->>'reason','')))=0
    or length(coalesce(new.payload->>'sourceBatch',''))=0
    or coalesce(new.payload->>'confirmedAt','')<>''
    or pg_catalog.jsonb_typeof(new.payload->'before')<>'object'
    or pg_catalog.jsonb_typeof(new.payload->'after')<>'object'
    or new.payload->'before'->>'id' is distinct from new.payload->>'flightId'
    or new.payload->'after'->>'id' is distinct from new.payload->>'flightId' then
   raise exception 'Incomplete or invalid archived-flight correction proposal';
 end if;
 if TG_OP='UPDATE' then
   if old.payload->>'flightId' is distinct from new.payload->>'flightId'
      or old.payload->>'sourceBatch' is distinct from new.payload->>'sourceBatch' then
     raise exception 'Correction proposal source identity is immutable';
   end if;
 end if;
 if not exists(
    select 1 from public.helilog_archive_entries e
     join public.helilog_print_archives b
       on b.id=e.archive_id and b.owner_id=e.owner_id
     where e.owner_id=new.owner_id and e.record_kind='flight'
       and e.record_id=new.payload->>'flightId'
       and b.payload->>'id'=new.payload->>'sourceBatch'
   ) then
   raise exception 'A correction proposal must reference an existing archived flight';
 end if;
 if exists(
   select 1 from public.helilog_archive_addenda a
   where a.owner_id=new.owner_id and a.record_kind='flight'
     and a.signature_metadata->>'id'=new.record_id
 ) then raise exception 'This correction was already confirmed and cannot be resubmitted';
 end if;
 return new;
end;
$$;
drop trigger if exists helilog_correction_proposal_guard on public.helilog_records;
create trigger helilog_correction_proposal_guard
 before insert or update on public.helilog_records
 for each row execute function public.helilog_validate_correction_proposal();

-- Atomic completion: the existing owner-verified archive RPC inserts the
-- immutable addendum, then this trigger retires ONLY its matching draft.
-- Other clients pull the archived addendum and no longer see the draft.
create or replace function public.helilog_retire_confirmed_correction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.record_kind='flight' and new.signature_metadata ? 'id' then
   delete from public.helilog_records
   where owner_id=new.owner_id and kind='correction_proposal'
     and record_id=new.signature_metadata->>'id'
     and payload->>'flightId'=new.record_id;
 end if;
 return new;
end;
$$;
drop trigger if exists helilog_archive_retires_correction_proposal on public.helilog_archive_addenda;
create trigger helilog_archive_retires_correction_proposal
 after insert on public.helilog_archive_addenda
 for each row execute function public.helilog_retire_confirmed_correction();

commit;
