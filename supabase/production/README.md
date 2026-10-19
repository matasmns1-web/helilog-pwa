# HeliLog Production — Database bootstrap

Target: Supabase **HeliLog Production**, project `xvmzvoldlajvnfxonrvn` (`eu-central-1`). This is an independent database. Never run these commands on the test database `cabfifnsxpaalgsyicbo`.

Apply the following **seven existing tested migrations in order**, then the two production-only permission/scheduler overlays:

1. `supabase/migrations/20261014000000_helilog_v22_foundation.sql`
2. `supabase/migrations/20261015000000_v24_complete_sync.sql`
3. `supabase/migrations/20261015010000_v282_correction_proposals.sql`
4. `supabase/migrations/20261016030000_v29_cloud_backups.sql`
5. `supabase/migrations/20261016040000_v29_restore_guard.sql`
6. `supabase/migrations/20261016050000_v210_backup_health_retention.sql`
7. `supabase/migrations/20261019090000_v212_trigger_execution_hardening.sql`
8. `supabase/production/20261019093000_production_backup_scheduler.sql`
9. `supabase/production/20261019103000_restrict_record_guard_rpc.sql`

The production overlay safely replaces the old *test-named* 03:00 UTC cron job with `helilog-production-daily-snapshots` and updates `helilog_backup_health()` to monitor that new job. The final overlay revokes unnecessary API EXECUTE grants on the legacy record-guard trigger function without disabling the trigger itself. This is not an independent/off-provider backup. Retention remains preview-only and no records are deleted.

## Verification gates

- Exactly six HeliLog private tables under `public`, with RLS enabled on all six.
- No auth users, account profiles, flight records, printed archives, signed addenda, or snapshots should be copied from test.
- Anonymous users must not read any private HeliLog tables, and they must not execute trigger functions or privileged authenticated RPCs.
- Authenticated accounts should only be able to access their own records. Verify in two fictional production users **before** using real data.
- Production cron job scheduled at 03:00 UTC, with the test-named job absent; health query references production job.
- Supabase security advisor should be reviewed. The seven authenticated `SECURITY DEFINER` RPCs are intentional owner-scoped app functionality, but still require security review; leaked-password protection, disabled by default, must be enabled manually in Auth if available.
- Public signup disabled, email templates, recovery redirect, SMTP, rate limits, and site URL configured and tested in Production Auth.
- Production PWA release packaging, preview testing, and final V1-to-V2 cutover require **separate approval**. Do not change `main` or either Render service during database initialization.

No user data is imported by any migration. The production Supabase project has a distinct owner identity namespace, and the TEST app remains linked to its test Supabase project.
