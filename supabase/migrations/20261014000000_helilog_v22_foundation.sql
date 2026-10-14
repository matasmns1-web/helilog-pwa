-- HeliLog V2.2 — PRIVATE, INVITE-ONLY CLOUD FOUNDATION
-- Target: a new dedicated Supabase TEST project. NOT production or V1.
-- Apply with Supabase migrations/SQL editor only after reviewing the target project.
-- No existing HeliLog browser records are migrated by this script.
-- Disable public sign-ups in Supabase Auth settings and invite/create the first test user manually.

begin;

create extension if not exists pgcrypto;

-- Pilot login accounts use auth.users identities. A saved pilot/endorser
-- profile is *not* automatically an authenticated user.
create table if not exists public.helilog_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  preferred_date_format text not null default 'dd-mm-yyyy'
    check (preferred_date_format = 'dd-mm-yyyy'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- V2.2 deliberately stores source-compatible JSON payloads so no V1-shaped
-- attributes are lost. A later version will validate/normalize each record
-- type and introduce transactional synchronization; do not auto-upload yet.
create table if not exists public.helilog_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('aircraft','person','flight','simulator','qualification','endorsement')),
  record_id text not null check (char_length(record_id) between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision >= 1),
  -- Signed endorsements become immutable; sealing does not certify identity.
  sealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id,kind,record_id),
  constraint seal_only_endorsements check (sealed_at is null or kind = 'endorsement')
);
create index if not exists helilog_records_owner_kind
 on public.helilog_records(owner_id,kind);

-- Frozen, individually numbered page batches. Never UPDATE or DELETE these.
create table if not exists public.helilog_print_archives (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('flight','endorsement')),
  first_page integer not null check (first_page >= 1),
  page_count integer not null check (page_count between 1 and 1000),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  confirmed_at timestamptz not null default now(),
  unique(owner_id,id),
  unique(owner_id,kind,first_page)
);
create index if not exists helilog_archives_by_owner
 on public.helilog_print_archives(owner_id,kind,first_page);

-- Link each frozen snapshot to its signed original. Composite foreign keys
-- enforce that the archived record and archived batch belong to SAME pilot.
create table if not exists public.helilog_archive_entries (
  owner_id uuid not null,
  archive_id uuid not null,
  record_kind text not null check (record_kind in ('flight','endorsement')),
  record_id text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  archived_at timestamptz not null default now(),
  primary key(owner_id,record_kind,record_id),
  foreign key(owner_id,archive_id)
   references public.helilog_print_archives(owner_id,id) on delete restrict,
  foreign key(owner_id,record_kind,record_id)
   references public.helilog_records(owner_id,kind,record_id) on update restrict on delete restrict
);
create index if not exists helilog_archive_entries_batch
 on public.helilog_archive_entries(owner_id,archive_id);

-- Corrections are separate immutable additions, never edits of an original.
create table if not exists public.helilog_archive_addenda (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  record_kind text not null check (record_kind in ('flight','endorsement')),
  record_id text not null,
  reason text not null check (char_length(trim(reason)) between 1 and 2000),
  before_snapshot jsonb not null check (jsonb_typeof(before_snapshot) = 'object'),
  after_snapshot jsonb not null check (jsonb_typeof(after_snapshot) = 'object'),
  signature_metadata jsonb not null check (jsonb_typeof(signature_metadata) = 'object'),
  signed_at timestamptz not null,
  confirmed_at timestamptz not null default now(),
  foreign key(owner_id,record_kind,record_id)
   references public.helilog_archive_entries(owner_id,record_kind,record_id)
   on update restrict on delete restrict
);
create index if not exists helilog_addenda_owner
 on public.helilog_archive_addenda(owner_id,record_kind,record_id);

-- Row security protects tenant isolation even if a caller guesses record IDs.
alter table public.helilog_accounts enable row level security;
alter table public.helilog_records enable row level security;
alter table public.helilog_print_archives enable row level security;
alter table public.helilog_archive_entries enable row level security;
alter table public.helilog_archive_addenda enable row level security;

-- Minimal privileges: anonymous browser visitors have zero database access.
revoke all on table public.helilog_accounts,
 public.helilog_records,public.helilog_print_archives,
 public.helilog_archive_entries,public.helilog_archive_addenda
 from anon,authenticated;
grant select,insert,update on public.helilog_accounts to authenticated;
grant select,insert,update,delete on public.helilog_records to authenticated;
grant select,insert on public.helilog_print_archives to authenticated;
grant select,insert on public.helilog_archive_entries to authenticated;
grant select,insert on public.helilog_archive_addenda to authenticated;

create policy "Pilot reads own account" on public.helilog_accounts for select to authenticated
 using ((select auth.uid()) = user_id);
create policy "Pilot creates own account" on public.helilog_accounts for insert to authenticated
 with check ((select auth.uid()) = user_id);
create policy "Pilot updates own account" on public.helilog_accounts for update to authenticated
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Pilot reads own records" on public.helilog_records for select to authenticated
 using ((select auth.uid()) = owner_id);
create policy "Pilot creates own unsigned records" on public.helilog_records for insert to authenticated
 with check ((select auth.uid()) = owner_id and sealed_at is null);
create policy "Pilot edits own unsigned records" on public.helilog_records for update to authenticated
 using ((select auth.uid()) = owner_id and sealed_at is null)
 with check ((select auth.uid()) = owner_id);
create policy "Pilot deletes own unsigned records" on public.helilog_records for delete to authenticated
 using ((select auth.uid()) = owner_id and sealed_at is null);

create policy "Pilot reads own archives" on public.helilog_print_archives for select to authenticated
 using ((select auth.uid()) = owner_id);
create policy "Pilot creates own archives" on public.helilog_print_archives for insert to authenticated
 with check ((select auth.uid()) = owner_id);

create policy "Pilot reads own frozen entries" on public.helilog_archive_entries for select to authenticated
 using ((select auth.uid()) = owner_id);
create policy "Pilot creates own frozen entries" on public.helilog_archive_entries for insert to authenticated
 with check ((select auth.uid()) = owner_id);

create policy "Pilot reads own signed addenda" on public.helilog_archive_addenda for select to authenticated
 using ((select auth.uid()) = owner_id);
create policy "Pilot creates own signed addenda" on public.helilog_archive_addenda for insert to authenticated
 with check ((select auth.uid()) = owner_id);

-- Prevent rewriting record identity, downgrading a revision or modifying a
-- flight/endorsement after it was included in an archived paper batch.
create or replace function public.helilog_guard_record_change()
returns trigger language plpgsql set search_path = '' as $$
begin
 if (TG_OP = 'UPDATE') then
  if old.owner_id is distinct from new.owner_id
   or old.kind is distinct from new.kind or old.record_id is distinct from new.record_id then
   raise exception 'Record ownership and identity are immutable';
  end if;
  if new.revision <> old.revision + 1 then
   raise exception 'Record revision must advance by exactly one';
  end if;
  if old.sealed_at is not null then
   raise exception 'Signed endorsement cannot be changed';
  end if;
  new.updated_at := now();
 end if;
 if exists (
   select 1 from public.helilog_archive_entries ae
    where ae.owner_id = old.owner_id and ae.record_kind = old.kind and ae.record_id = old.record_id
 ) then
  raise exception 'Archived record cannot be changed or deleted; use an addendum';
 end if;
 return case when TG_OP = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists helilog_record_guard on public.helilog_records;
create trigger helilog_record_guard before update or delete on public.helilog_records
 for each row execute function public.helilog_guard_record_change();

-- Archive snapshots and corrections are append-only even for the owner.
-- Do not grant UPDATE or DELETE or expose privileged RPC methods.
-- FULL INTEGRITY / TRANSACTIONAL BATCH WRITES ARE NOT YET IMPLEMENTED.
-- Stage V2.2 is *schema and account foundation only*. Future syncing must
-- create batch + entries atomically and verify snapshot/signature consistency.

commit;
