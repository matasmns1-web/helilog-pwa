# HeliLog V2 — Development Foundation

**Status:** V2.0 alpha groundwork, not released. The production website remains V1.43.2.

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

## Not yet implemented

This domain is not yet wired into a V2 end-user screen. No PDF/print renderer, cloud account, remote database, iPad sync, or flight-record replacement is present yet. The storage revision mechanism is a development safeguard, not an atomic distributed transaction. The page layout identifier endorsement-sheet-v1 and three endorsements per page are provisional.

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

Tests cover signed-record immutability, archive numbering and stale-preview rejection, signed amendments, JSON round-trip, modification detection, storage isolation, malformed data and revision conflicts.
