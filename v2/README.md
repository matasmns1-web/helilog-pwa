# HeliLog V2 — Development

**Current version: V2.10 — Backup monitoring, non-destructive retention planning and isolated recovery drill (built on V2.9).** Authenticated pilots can now explicitly enable sync of profiles, qualifications, medical details, signed endorsements and previous totals, while V2.3 aircraft/flight synchronization continues. Cloud-confirmed paper archives are web-only. Start with [V2.4-TEST-GUIDE.md](V2.4-TEST-GUIDE.md) before activating your devices; old browser data is not imported automatically. This is test-only, not a compliant production release.

**Prior release: V2.1.** The complete V1.43.2 interface is restored with V2 endorsement print archiving; installed-app signing is separate from web-only print/archive management. See [FULL-V1-INTERFACE.md](FULL-V1-INTERFACE.md) for parity scope, testing instructions and data safety.

**Earlier modular prototype:** [alpha.html](alpha.html) remains available with its own test data.

## V2.10 — Backup reliability and isolated recovery (TEST)

- **Profile → Cloud backup & recovery:** adds on-demand backup health monitoring (latest snapshot, checksum, age, scheduler enabled/disabled, scheduled job failure indicators) and an account-scoped retention-policy preview.
- The retention policy proposes retaining 90 latest daily snapshots plus 12 months of monthly anchors and all manual/pre-restore snapshots. **No snapshot deletion is enabled in V2.10**; that requires independently tested off-provider recovery.
- Adds a **passphrase-authenticated, isolated recovery drill** for V2.9 encrypted exports. It reconstructs a complete snapshot in temporary browser memory, checks frozen originals against cloud records, batch references and signed corrections, then compares SHA-256 fingerprints. It never writes to the active device workspace or Supabase.
- Maintains V2.9 daily private snapshots, user-encrypted downloads and transactional missing-only unsigned record restoration. Full external encrypted recovery to a lost/new Supabase project remains a *future supervised recovery procedure*, not a V2.10 capability.
- Migration: `supabase/migrations/20261016050000_v210_backup_health_retention.sql`. New tests: `v2/v210-backup-health.test.cjs`.
- The TEST project is not approved for real operational logbook records or EASA-compliant signed record retention.

## V2.9 — Backup & Recovery Improvements (TEST)

- Installs private **daily 03:00 UTC server-side account snapshots** using Supabase pg_cron and pgcrypto SHA-256. The snapshot includes account metadata, every synchronized record, original printed archive batches, frozen entries and signed corrections. It is read-only to app clients and protected by per-account RLS.
- Adds **Backup now** and snapshot history under **Profile → Cloud backup & recovery**, allowing manual snapshots between scheduled backups.
- Adds AES-256-GCM encrypted JSON downloads with PBKDF2-SHA256 (310,000 iterations and random salt/nonce); encryption and decryption occur entirely inside the browser. Passphrases are not stored or sent to Supabase. The encrypted file can be inspected without modifying records.
- Adds an authenticated, revision-fingerprint checked **read-only restore preview** and transactional recovery of **missing unsigned records only**, with explicit typed confirmation and a separate pre-restore database snapshot. No current records or signed/archived items are overwritten. Retired correction proposals are never resurrected.
- The scheduled copies remain in the **same Supabase test database**, so they are **not independent provider-level disaster recovery**. Encrypted exports become independent only after the pilot securely saves them off-device. Restoring external encrypted exports directly to an empty or lost Supabase project is **not enabled**; that needs a separate controlled migration procedure.
- No database administration secrets were embedded in web/PWA assets. V1 production remains unchanged. Do not use real health, licence, signature or flight records in this test system.
- Migration files: `20261016030000_v29_cloud_backups.sql` and `20261016040000_v29_restore_guard.sql`.
- Acceptance instructions: [V2.9-TEST-GUIDE.md](V2.9-TEST-GUIDE.md).

## V2.8.4 — Recover a prematurely confirmed local correction safely

- Detects the V2.8.2 failure where a locally marked signed correction is absent from immutable cloud addenda, but the **identical unconfirmed proposal** remains in the same authenticated account's cloud records.
- Before repair, validates the original signed cloud flight archive, every other protected archive entry, cloud proposal ID and exact contents (excluding the mistakenly set `confirmedAt`), confirmed addendum absence and this browser's clean sync status. Rechecks cloud confirmation and account identity.
- Saves a separate verified browser-local safety snapshot of the entire pre-recovery workspace. If backup storage or any verification fails, does not modify the correction.
- When all guards pass, restores ONLY that erroneous local correction to **Pending** from the cloud proposal. No original archived flight or cloud record is rewritten; the user can then follow the V2.8.3 web-only addendum confirmation.
- If the cloud proposal is absent, different, already signed or otherwise inconsistent, keep the blocker visible. Do not clear storage or force a cloud overwrite.
- The Cloud Account screen shows a recovery notice when the safe repair succeeds. Includes 12 targeted recovery regressions. No schema changes or V1 production edits.

## V2.8.3 — Confirm the signed addendum in cloud before marking the local draft

- Fixes the V2.8.2 correction confirmation race where the web marked its correction `confirmedAt` too early, causing the cloud archive refresh to reject an otherwise valid pending proposal with an "Unsynchronized flight correction" warning.
- Build a separate signed addendum for the owner-verified cloud RPC; leave the local proposal **pending** until the cloud acknowledges the signed correction, then save and verify the confirmed local copy.
- Perform a clean cloud archive refresh before confirmation to clear the obsolete temporary error from a previous attempt (without ignoring real archive integrity problems).
- Preserve both original archived flights and pending proposals if RPC or archive verification fails. If cloud confirmation succeeds but local device persistence fails, explicitly warn the user **not to confirm again** and to recover the signed copy by syncing.
- Prevent double confirmation; handle already imported signed copies even when PostgreSQL JSONB reorders object keys.
- No Supabase schema changes or V1 production changes. Use the `v283-correction-confirmation.test.cjs` regression suite with fictional records.

## V2.8.2 — Mobile correction proposals and cloud synchronization

- Archived flights remain read-only, but the installed iPhone/iPad app can now open the edit form to **Propose correction** with a required reason.
- Pending correction proposals are a separate `correction_proposal` record kind in the private, revision-checked cloud sync; offline drafts persist locally and upload on reconnect.
- The web browser receives pending proposals, where existing **Print / sign / Confirm correction addendum** remains authoritative. The signed addendum stays in the protected immutable archive, while an account-scoped database trigger retires the matching pending proposal atomically.
- A second device can later download the confirmed addendum without retaining duplicate pending corrections. Concurrent proposals for the same archived flight are rejected and preserved for manual recovery.
- Database migration: `supabase/migrations/20261015010000_v282_correction_proposals.sql` for dedicated TEST Supabase project only.
- All V1 production code and prior signed records remain unchanged. Use fictional records for testing.

## V2.8.1 — Web archive readiness hotfix

- Fixes an overly broad archive readiness message that could block a web browser that was already synchronized during a background archive refresh. Confirmation now waits for that refresh instead of treating it as a failure.
- Archiving depends **only on the active web browser's verified account, its own pending edits and conflicts, and cloud archive integrity**. Other devices may be offline or stale and will receive archived status when they next synchronize.
- Specific blockers now explain whether the current browser is offline, pending, conflicted, has an account mismatch or has a genuine archive discrepancy. A genuine discrepancy still blocks confirmation until safely resolved.
- Preserve archive refresh errors across repeated same-account initialization rather than temporarily hiding problems. Discard stale refresh results after switching accounts or signing out.
- Keeps owner-verified archive RPCs, immutable originals, and V2.8 verification of cloud records. No schema change, signed archive rewrite, or V1 production update.
- Follow the archived record check from [V2.8-TEST-GUIDE.md](V2.8-TEST-GUIDE.md) to confirm the web-only print flow using fictional flights.

## V2.8 — Archive integrity, backups and recovery

- Removed the five Dashboard Quick Actions cards and outdated Cloud Account Local logbook protection card without removing the underlying features.
- Added read-only cloud archive audit for pages, frozen originals, archived source rows and correction metadata. Existing verified archive evidence is remembered on the same device with SHA-256 fingerprints; failure blocks new archive confirmations.
- New printed flight batches are compared to their synchronized cloud flight payloads before the owner-verified cloud confirmation call.
- Added a user-triggered **verified cloud recovery package** download and a checksum/account-bound **read-only recovery file checker** under Profile → Backup & restore. Cloud overwrites remain blocked.
- **Not automatic backups:** the user must safely store downloaded, unencrypted JSON outside the device. Fully recoverable encrypted remote backups and transactional restore remain future tasks.
- [V2.8 acceptance and recovery safety guide](V2.8-TEST-GUIDE.md). Fictional test records only; production V1 remains untouched.

## V2.7 — Offline synchronization and manual conflict review

- Signed-in devices continue to save and queue ordinary record edits while offline. Pending operations survive reopening the app after previously signing in online, and upload after reconnect if the verified session is active.
- If two devices edit the same aircraft, flight, saved pilot or qualification while disconnected, changes are **not** silently merged or overwritten. In **Cloud account → Offline edit conflicts**, the user can compare the device and cloud versions, then choose to keep the device copy or use the cloud copy.
- Each explicit resolution requires a verified, device-local full-workspace safety snapshot containing the original queue and both copies. The choice is rejected if the remote revision or local pending version changed since review. Keeping the device copy still uses a revision-checked cloud update.
- Signed endorsements, archived flight/aircraft records, and pilot settings are deliberately excluded from the generic conflict choice. Pilot profile recovery retains its dedicated V2.4 workflow; other protected conflicts require specialist recovery in a later version.
- A local change that was not correctly captured in the sync queue remains blocked rather than uploaded automatically. Offline app unlocking/reopening without a valid session, remote disaster recovery, archive integrity verification and cloud backups are **not** part of V2.7.
- No live V1 production, Supabase schema, cloud archives or real pilot records are modified by this branch. Fictional test data only.

## V2.6 — Login screen and logout placement

- The signed-out page and account-checking screen show **V2.6** rather than the hard-coded V2.3 text.
- Static login content is explicitly non-editable and non-selectable; normal cursor, typing and paste remain available in Email and Password.
- **Log out** appears only on the authenticated **Profile** page, not in every page header or the mobile More menu. Users who have not yet finished account setup can still select **Switch account** on the onboarding screen.
- A fresh PWA cache and asset query version force compatible login/UI assets after an online update. Existing local records and cloud sync settings are unchanged.
- **Release check:** after deploying the staging branch, reload the sign-in page while online and verify it displays `V2.6`; then confirm that Log out appears under Profile only.
- No change to V1 production, Supabase schema or synced record data; V2 test accounts only.

## V2.5 — Pilot names, PIC/SOLO and sign out

- V2.5 initially added **Log out** to the signed-in header and mobile More menu (moved to Profile in V2.6). Unsaved flight-form edits are checked before sign-out.
- The account holder and saved other pilot profiles now use separate **First name** and **Surname** fields. A combined full-name field remains internally for existing synced accounts, pilot references, and logbook exports.
- Older profiles are split only for display as a best-effort fallback; the stored record remains unchanged until the user saves their profile. Check compound first names and surnames on first edit.
- For newly entered **PIC** or **SOLO** flights, the Name of PIC field is **SELF**, with the pilot linked by profile ID. Other roles retain the commander's saved full name.
- Previously archived printed rows retain their original stored PIC wording so archived page reprints cannot change silently. Existing unarchived PIC/SOLO flights display SELF in the logbook UI.
- No schema migration, cloud reset, or changes to V1 production. Fictional test records only.

---

# HeliLog V2 — Development Foundation

**Historical modular prototype:** aircraft profiles, Add Flight and preliminary totals were implemented before the full V1 interface was restored. The stable production website remains V1.43.2.

**Branch:** v2/development

The records currently in the prototype are disposable fictional/test records. There is no genuine logbook history to migrate, but the finished app must protect signed records before anyone starts using it with real flight data.

## Architecture

The pure JavaScript domain module (domain.js) separates records from persistence and the interface. The new schema has:

| Collection | Purpose |
| --- | --- |
| meta | Workspace ID, environment, revision, timestamps |
| people / aircraft | Reference data for signatories and aircraft |
| flights | Planned flight and simulator model (not implemented yet) |
| endorsements | Original draft and signed endorsement records |
| archives.flights | Planned printed flight archive |
| archives.endorsements | Frozen print batches with their own numbered pages |
| amendments.flights | Planned signed flight correction addenda |
| amendments.endorsements | Signed before/after corrections linked to archived originals |

## First milestone implemented

- Create an isolated V2 workspace and add instructor/examiner profiles.
- Create and edit unsigned endorsements.
- Explicitly sign an endorsement, capturing a PNG signature and a snapshot of signer name/licence.
- Prevent ordinary editing or re-signing once an endorsement is signed.
- Prepare paper endorsement archive drafts containing exact signed snapshots.
- Manually confirm print batches; reject stale previews, duplicate archiving, and unsigned entries.
- Number endorsement pages independently of flight-logbook pages.
- Amend an archived endorsement using a reason, before/after snapshots and a new signature, leaving the original archived page intact.
- Validate archive continuity and detect changes to archived original records.
- Store V2 development data with isolated key: helilog_v2_dev_workspace. Never read, overwrite, or remove the V1 storage keys.
- Refuse stale writes and malformed JSON without silently wiping saved data.

## Standalone V2 development interface

The V2 sandbox has a separate responsive entry point at **v2/index.html**, connected to domain.js, storage.js, print.js and app.js. It supports:

- Creating saved pilot/endorser profiles and unsigned endorsement drafts.
- Reviewing and signing drafts with mouse, touch or stylus. Signing freezes the original endorsement.
- Selecting multiple signed records and opening an **A4 portrait paper endorsement page** print preview with numbered pages, batch ID, full wording and captured signature.
- A separate **manual confirmation** after preview, printing/review and explicit confirmation checkbox. Just opening a preview never marks a batch as printed.
- Reprinting confirmed archived pages using their exact saved snapshots.
- Creating a correction with a reason; obtaining a fresh signature; printing a separate A4 before/after addendum; confirming it as a separate record while the original page remains frozen.
- Downloading a JSON development backup and deliberately resetting **only** the V2 sandbox.

To try it on a local development computer, check out the development branch, start a local web server in the repository root, then visit the V2 page:

    git checkout v2/development
    python -m http.server 8000
    # Open http://localhost:8000/v2/

**Do not open the local HTML as a file:** browser storage and popup behavior may differ. All entries in V2 at this stage must be fictional.

## Aircraft and Add Flight (Alpha 2)

The standalone V2 testing interface now supports:

- **Aircraft:** Save, edit and remove aircraft profiles (registration, manufacturer, model/variant, ICAO type designator and SE/ME classification). An aircraft already referenced by a flight cannot be deleted.
- **Pilot profiles:** Existing pilot/endorser profiles can be marked as **Account Holder** (one at a time). PIC and SOLO flights automatically use that profile for Name of PIC. SPIC, PICUS, DUAL and CO-PILOT require selecting a separate saved commander.
- **Add Flight:** DD-MM-YYYY date entry; departure/arrival airports; 24-hour departure/arrival entry as HHmm or HH:mm; additional hour/minute dropdown time picker; overnight durations; integer-minute IFR, Night and Instructor categories; cross-country marker; remarks; day/night takeoffs and landings, with takeoff-to-landing automatic mirroring unless manually changed.
- **Independent configuration:** Flight engine class SE/ME comes from the aircraft; single/multi pilot operation is a separate field.
- **Flights:** List saved test flights, edit them and remove them while they are unarchived.
- **Preliminary totals:** Total, PIC, Co-pilot, Dual, SPIC, PICUS, SE/ME, single/multi pilot, cross-country, Night, IFR, Instructor and landings/takeoffs. PIC includes PIC/SOLO/SPIC/PICUS by the prototype convention (not a regulatory determination).
- **Historical snapshots:** Each flight keeps registration, ICAO type and engine class at the time of entry. Changing an aircraft profile cannot retroactively change an existing flight's engine-class totals.
- **Validation:** Reject malformed times, identical start/end times, impossible dates, excessive Night/IFR/Instructor time, missing aircraft/commander and invalid nonnegative counts. The Add Flight page keeps its fields visible on validation errors.

The existing V2 storage key and schema continue unchanged, so your previously saved endorsement test records and archives should remain available in the same browser. As before, all data on the V2 test site is **local to the current browser/device**, not synchronized.

The flight printing/archiving and simulator entry workflows are **not yet** in the V2 interface; use V1 for comparison only.

## V1-style interface restoration (Alpha 3)

Based on direct user testing, the first V2 visual layout was less usable than V1.43.2. The **V1.43.2 interface is the reference design for V2**, rather than the original generic alpha layout.

- Restored the familiar dark fixed desktop sidebar (Dashboard, Logbook, Totals, Aircraft, Pilots, Endorsements, Print archive, Test settings).
- Restored a compact bottom navigation for phones and iPad-sized viewports, with **Home / Logbook / Add flight / Totals / More**.
- Dashboard now shows the V1-style **Flight-time overview** with time-range selectors, the four headline totals and Night/IFR metrics; quick actions, recent flights, upcoming dates placeholder, recent endorsements and aircraft time.
- Totals now has the four V1 headline cards (**Total / PIC / Co-pilot / Dual**) and familiar panels for **SE/ME**, **single/multi-pilot**, **additional breakdown**, **simulator**, **takeoffs and landings**, **by ICAO type** and **specialised helicopter operations**. Unsupported V2 sections are clearly labelled, rather than presenting invented values.
- Logbook uses a compact table and working search, aircraft, pilot-function, cross-country, Night and IFR filters, with **filtered total plus Night/IFR time when filtered**.
- Aircraft uses a card grid with ICAO designators, SE/ME and recorded time.
- Add Flight has a compact popup 24-hour HH/MM picker, while typed HHmm / HH:mm remains supported.

**No V1 source files, live site, storage keys, or existing V2 endorsement archives were changed** by the redesign. This is a UI alignment milestone, not yet a complete V1 feature port. Test the desktop and iPad/mobile layouts for readability and form behavior.

## Not yet implemented

V2 is deployed to a separate staging URL at https://helilog-v2-test.onrender.com, and basic V2 flight entry and totals are available, but V1 functional parity is not yet reached. There is no cloud database, secure account, remote backup service, iPad sync or cross-device conflict-resolution service. The storage revision mechanism is a development safeguard, not an atomic distributed transaction. The page layout identifier endorsement-sheet-v1 and **three endorsements per page** are provisional; visually inspect print previews to ensure longer wording fits the paper before confirming any archive. Signature images are **not** an identity-verification mechanism.

**A captured signature image alone does not establish endorser identity or EASA/TKA acceptance.** A paper endorsement may still require a handwritten signature. Printed-batch confirmation must always be a separate explicit user action after reviewing/printing.

## Development workflow

1. Draft endorsement: edit freely until the endorser signs.
2. Signed endorsement: original is frozen.
3. Preview: create the snapshot and proposed page numbering.
4. Print, check, physically sign as required; then manually confirm archive.
5. Reprint the exact archived original when requested.
6. Correction: create a reasoned, separately signed and printed addendum. Never overwrite original snapshots.

## Planned milestones

- **V2.0:** Modular architecture, models, development UI, tests and isolated sandbox.
- **V2.1:** Printable endorsement sheets, archiving controls and correction addenda.
- **V2.2:** Secure accounts, cloud storage and offline synchronization.
- **V2.3:** Advanced flight/aircraft experience statistics.
- **V2.4:** Licence/rating/medical expiry and verified currency rules.
- **V2.5:** Data recovery, performance, iPad/offline testing and production readiness.

Before real usage, all prototype data must be wiped deliberately and production safeguards tested. V1.43.2 remains the stable rollback reference until V2 is complete.

## Test command

From the repository root, with Node.js 18 or later:

    node --test v2/*.test.cjs

Tests cover signed-record immutability, archive numbering and stale-preview rejection, signed amendments, printable A4 markup and correction printing, JSON round-trip, storage isolation, malformed data, revision conflicts, 24-hour and overnight flight time, PIC role logic, aircraft snapshots and preliminary totals, with simulated browser workflow regressions.
