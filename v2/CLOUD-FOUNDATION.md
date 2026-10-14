# HeliLog V2.2 — Cloud Foundation

**Release:** private, invite-only Supabase account foundation for TEST data only.
**V2 website:** https://helilog-v2-test.onrender.com
**Stable V1.43.2:** https://helilog-pwa.onrender.com (unchanged)

## What V2.2 implements

- Cloud account page accessible from desktop navigation, mobile More menu, and Profile.
- When connected to a test Supabase project, supports invited pilot sign-in, verified account lookup, explicit private profile creation, and sign-out.
- Supabase PostgreSQL migration: five owner-isolated tables with Row Level Security, account identities, source-compatible records, frozen archive pages, original snapshots and correction addenda.
- Login profiles are separate from saved instructor/examiner/pilot profiles.
- Existing V2.1 browser-local flights, endorsements, printable archives, simulator logs and interfaces remain unchanged.
- NO migration, upload or synchronization of local records happens during V2.2.

## Required one-time Supabase setup

1. Connect Supabase to ChatGPT and select/create a *dedicated test project*. Never use an unrelated production database or the V1 site.
2. In Supabase Authentication, disable open self-service registration and keep this project invitation-only.
3. Review and apply the migration file: supabase/migrations/20261014000000_helilog_v22_foundation.sql
4. Validate Row Level Security with TWO fictional accounts plus an unsigned/anonymous client. Confirm each pilot can only see their own records; anonymous users cannot read/write; and signed/archived records cannot be rewritten.
5. Invite your own test email via Supabase Authentication. Do not share your password with ChatGPT or commit credentials to GitHub.
6. Update v2/cloud-config.js with ONLY the public Supabase URL and publishable key, set authEnabled to true, and keep environment as test and inviteOnly as true. NEVER use a service_role key, sb_secret key or database password: a static frontend is publicly visible.
7. Test private login and profile creation from the Cloud account page on the V2 test website. Signing in does not transfer locally saved flights.
8. Invite a second fictional user to verify record isolation before adding more people.

Until this happens the cloud config remains blank and the Cloud account page correctly says **Not connected yet**.

An EU Supabase region near Lithuania, for example Frankfurt, can be considered for this new test project.

## Tables

- public.helilog_accounts: account identity and display name.
- public.helilog_records: aircraft, person, flight, simulator, qualification and endorsement JSON records, with revisions and optional signed sealing.
- public.helilog_print_archives: independent append-only flight and endorsement batch snapshots.
- public.helilog_archive_entries: archived original snapshots and links to owner and batch.
- public.helilog_archive_addenda: append-only signed correction records linked to an original.

All five tables use Row Level Security and owner checks. Anonymous table privileges are revoked. Signed endorsements and archived records are protected against changes; original page batches and addenda are append-only.

## Limitations / Safety

This is a **schema and account foundation**, not a finished cloud logbook. Creating an account does not synchronize a single flight. Safe atomic cloud archiving, migration of existing records, multi-device conflict handling, authenticated signatories, cloud backup/restore and offline sync still require implementation and security tests. Captured signature images do not establish identity or EASA/TKA acceptance.

No genuine flight records should be entered until all those protections are verified.

## Tests

From repository root using Node 18+:

    node --test v2/*.test.cjs

Next target: V2.3 — explicit, conflict-safe flight and endorsement synchronization, without automatically replacing existing test data.
