# HeliLog V2.3 — Login and first cloud synchronization

**TEST ONLY — fictional flights.** V2.3 is a pilot-facing release for the separate
https://helilog-v2-test.onrender.com Render service. Stable V1 is unchanged.

## What changed

1. HeliLog now opens on a full-screen Supabase **email/password login**. There is
   no public registration option. Previously invited/created accounts work with
   their existing Supabase password. An existing session is verified on launch.
2. A verified account with a cloud profile opens a **separate per-account local
   logbook cache**, keyed by the authenticated Supabase UUID.
3. New cloud workspaces start empty. **All older V2.2 local test records remain
   stored under the original V2.2 keys** and are NEVER silently imported or
   uploaded. A reviewed migration/import workflow will come later.
4. Aircraft and flights saved in the cloud workspace are queued locally, sent
   to Supabase and fetched on other devices logged into the same account.
   Browser/app status indicates Synced, Pending, Offline, Error or Conflict.
5. Incoming cloud changes are checked against the last confirmed local server
   copy. Revisions are updated conditionally. On conflict, the local version
   remains and the server record is not overwritten automatically.
6. The app checks for updates on returning to the page, reconnecting, every
   ~30 seconds while visible, or manually from **Cloud account**.
7. On sign-out, the private logbook disappears from the screen and in-memory
   account data is cleared, but pending changes and the per-account device
   cache remain available after the user signs in again.

## Crucial limitations

- **Only aircraft and the flights collection sync in V2.3.** Simulator entries
  stored within flights are included, but pilot profiles, qualifications,
  signature images, endorsements, bringing-forward paper totals, print
  archives and correction history are NOT cloud synchronized.
- To avoid creating misleading paper histories, archive confirmation and
  correction-printing are temporarily unavailable in signed-in cloud
  workspaces. The historic V2.2 local archives are not deleted.
- Whole-logbook backup restore / clean-start functions are paused in the
  cloud workspace because they can overwrite synced records. Exporting a full
  local safety JSON backup still works.
- Offline edits save locally and queue; **offline login/unlocking is not yet
  supported**. A pre-verified online login is needed to enter a workspace.
- Conflicting changes are preserved and flagged, but manual conflict resolution
  UI is not available yet. Do NOT clear browser storage or reimport a backup
  to try to fix an unresolved conflict.
- Cloud session tokens are handled by Supabase Auth; device caches themselves
  are not additionally encrypted. This is not yet a validated production
  system, legally certified e-signature workflow or EASA-approved logbook.
- Data isolated by Supabase Row Level Security, but real pilot personal data
  must NOT be entered until security testing, backups and restore recovery
  are completed.

## Suggested acceptance test

1. Open V2.3 in your desktop browser. Sign into your existing private account;
   you should see an empty account-specific cloud logbook.
2. Add a **fictional aircraft**, e.g. ICAO G2CA, registration TEST-001.
3. Add a **fictional flight** using that aircraft. Confirm the banner says
   "Cloud synced" after connectivity is restored.
4. Open the installed V2.3 PWA on your iPad. Sign into the SAME account and wait
   for the first pull. Confirm both fictional records appear, with matching
   flight minutes and totals. An installed app may require closing and reopening
   to update the PWA service worker.
5. Edit that fictional flight on one device and revisit the other (or wait for
   the polling interval). Verify the updated record is downloaded.
6. Disconnect one device *after signing in*, make an edit, and verify **Pending /
   Offline** status; restore its network connection and verify the upload.
7. For a conflict test, edit the same flight on both devices while one is
   disconnected. The app must display a conflict warning, not silently replace
   either version. Do not use this conflict test if you do not want to keep a
   manual-resolution case for the next release.
8. Sign out and verify the private logbook is no longer visible. Sign back in
   and confirm the account's cached data and cloud records are recovered.

## Engineering architecture

Files:
- v2/cloud-foundation.js — V2.2 verified Supabase Auth
- v2/auth-gate.js — V2.3 login-first UI, session gate and account-scoped cache
- v2/cloud-sync.js — V2.3 revision-checked queued aircraft/flight transport
- v2/cloud-view.js — account/sync state and manual refresh
- supabase/migrations/20261014000000_helilog_v22_foundation.sql —
  already-applied database RLS, immutable archive foundations

Run unit tests using Node 18+:

    node --test v2/*.test.cjs

Further work for V2.4: reliable offline authenticated access, explicit conflict
resolution, IndexedDB storage, broader record synchronization, proper sync
transactions, security and recovery tests. Later stages add signed endorsement
and immutable print-archive synchronization.
