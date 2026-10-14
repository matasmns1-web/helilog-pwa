# HeliLog V2 — Complete V1.43.2 Interface Preview

**Status:** V2 alpha interface parity candidate; awaiting desktop/iPad testing.
**Testing URL after deployment:** https://helilog-v2-test.onrender.com
**Stable V1:** https://helilog-pwa.onrender.com remains unchanged.

## Why the V1.43.2 interface has been restored

The early modular V2 prototypes reduced the functionality and usability of the mature V1 user interface. Instead of slowly reimplementing every screen, V2's starting interface is an intentionally restored copy of the complete V1.43.2 HTML/CSS/JavaScript application, with a V2 endorsement archive integrated. This is a transitional **interface parity baseline**, not a claim that the whole application is already modularised.

## Preserved V1 workflows

- Dashboard with date-range summary, quick actions, recent flights, aircraft time, endorsement summaries and date reminders.
- Add Flight, editing, role/commander logic, 24-hour time picker and manual entry, overnight flights, IFR/Night/instructor time, cross-country and configurable day/night takeoffs and landings.
- Simulator / synthetic training device entries kept separately from flying.
- Specialised helicopter operations with hours and ICAO type breakdowns.
- Detailed Totals including Total/PIC/Co-pilot/Dual, SE/ME, single/multi pilot, SPIC/PICUS, Night, IFR, simulator, landings/takeoffs, aircraft type and specialised operations.
- Search, flight filters, filtered Night/IFR totals, aircraft/pilot records and flight details.
- Profile, medical/licence/rating dates, endorsement editor and captured signatures.
- CSV import/export, printable flight logbook, JSON Full Backup/Restore and Data Integrity Check.
- Signed flight paper archive with original reprints and correction addenda.
- Test Mode with fictional data, installed PWA support, responsive iPad/mobile interface and desktop sidebar.

## New V2 endorsement paper archive

Open **Print Archive → Endorsement print archive — V2**.

- A4 portrait signed endorsement sheets with independently numbered pages.
- Manual print preview + explicit confirmation to archive and lock the original.
- Original reprinting from the exact saved signed batch.
- Direct editing, deletion or re-signing of signed endorsements is blocked.
- Corrections are separately signed before/after print addenda linked to the original page, which remains unchanged.
- Confirmed endorsement batches and amendments are included with full flight data in V2's JSON backup, under the endorsementV2Archive property.
- Restore validation checks endorsement archive integrity; damaged originals are rejected.
- Captured signatures are prototypes, not identity-verified or approved electronic signatures.

## Test-data isolation and the earlier V2 alpha

The new V2 landing page uses three new browser keys:
- helilog_v2_complete_test_data
- helilog_v2_complete_test_sandbox
- helilog_v2_complete_test_mode

The previous modular V2 Alpha still works at **/alpha.html**, using its original separate helilog_v2_dev_workspace key. Records from the two test workspaces are **not automatically migrated or displayed together**. Neither workspace deletes the other's records. The stable V1.43.2 site is on another Render origin and remains unchanged.

## Before cloud integration

The full-interface baseline still uses a **V1-shaped, browser-local** data structure; cloud accounts and synchronization have not been implemented. Cloud work requires a validated migration to the V2 server model, including flights, simulator sessions, signatures, endorsements, signed paper archives and corrections. The V2 modular domain work remains in the repository and can be reused during this process.

Do not use the test site for real flight records yet. All existing test data is fictional and disposable.

## Verification

Run in the repository root (Node.js 18+):

    node --test v2/*.test.cjs

The new full-interface tests verify screen parity, PWA files and endorsement archive integration. The bridge tests verify original snapshot preservation, correction signing, reprint matching and tamper detection. Existing V2 domain, storage, print and older UI tests remain.

**Manual acceptance:** Desktop and iPad Dashboard, Add Flight, flight filters, Totals, simulator entry, specialised operations, flight print archive (A4 landscape), endorsement pages (A4 portrait), signed correction and JSON backup/restore. EASA/TKA legal acceptance is not claimed.
