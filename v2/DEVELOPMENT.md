# HeliLog V2 — development and maintenance

The V2.21 maintenance groundwork divides the large V2.20 application source into feature-specific files. This is a **source-only** change: `index.html` remains byte-for-byte identical to the tested V2.20 entrypoint, and the browser, offline service worker, logbook records, and print/archive code behave as before.

## Edit the source, build the static output

- `source/index.template.html` — HTML structure and links to runtime assets.
- `source/base.css` — base layout and print-independent CSS. The Dark Cockpit theme remains in `dark-cockpit.css`.
- `source/app/00-startup.js` through `13-routing-and-boot.js` — app state and UI features, ordered by the build manifest in `scripts/build-helilog-v2.cjs`.
- `index.html` — **generated deployment artifact**. Do not edit it directly.
- Existing standalone assets (`print.js`, `cloud-*.js`, `auth-gate.js`, etc.) stay separately maintained.

The browser still receives a single classic, inline script, with its globals and function-hoisting behavior intact. These source chunks are deliberately **not** independent ES modules. When changing cross-feature APIs, check their call sites and preserve existing global names unless doing a separately tested refactor.

From the repository root:

```sh
node scripts/build-helilog-v2.cjs
node scripts/build-helilog-v2.cjs --check
node scripts/check-helilog-v2.cjs --quick
node scripts/check-helilog-v2.cjs
```

The build and checks use only built-in Node.js modules; no package installation is needed. `--quick` checks the generated build, core flight logic and print output while developing. **The default full check is required before deploying to test**; it runs the flight, account, cloud, offline, archive, backup, and production-safety suites. The staging GitHub Actions workflow uses this same command and can also be run manually via **Run workflow**. After a source edit, regenerate and commit **both** the source and its matching `index.html`.

`node scripts/check-helilog-v2.cjs --list` displays all included suites and three older VM-based tests still awaiting modernization. New `v2/*.test.cjs` files must be classified in the test runner; CI rejects unclassified tests. Those legacy suites refer to superseded UI/browser mocks and are not reliable release gates until updated.

## Release guardrails

1. Edit on a feature branch, regenerate the static entrypoint, and run `node scripts/check-helilog-v2.cjs` (all checks must pass). CI repeats this verification when changes reach `v2/development` or a PR targets it.
2. Deploy to the **test Render service only**, confirm the live deploy matches the test commit, and manually verify mobile, offline navigation, account sync, flights, archives, endorsements, and export/print where relevant.
3. **Do not automatically promote to production.** After user approval, prepare a separate production candidate with the existing production release gate. Keep the test and production Supabase projects separated, and take an appropriate backup first.
4. Changes to printed logbook formats, existing data migration, or archive integrity require dedicated review and tests. The current maintenance work makes no runtime or print-layout changes.

GitHub CI reports test status; it is not yet wired as an enforced Render deployment gate. In particular, Render's own automatic deploy settings can run independently of GitHub Actions. The human release check and verification of the deployed commit remain mandatory until a dedicated gated delivery workflow is introduced.

V2.21 is a maintenance milestone; the visible V2.20 version label and cache revision are intentionally unchanged because the generated app code has not changed.

## V2.23 — Quick Flight Entry (test only)

- The mobile **Flight** tab and dashboard **Quick flight** action open `#quickadd`. `#add` is the unchanged full entry route.
- Both routes render the **same Add Flight form** in `source/app/06-flights-and-night.js`. `setFlightEntryMode()` only hides or reveals optional fields via CSS; switching does not rebuild the form or erase inputs.
- Quick Entry still shows date, aircraft, departure/arrival places, UTC times, duration, PIC function/name, day/night take-offs, night/IFR time, cross-country and remarks. Full details expose pilot configuration, engine information, independent landings, instructor time and specialised operations.
- The most recently flown aircraft is preselected if it still exists, but route, times, operation counts and pilot function are **not** guessed. The form shows explicit defaults for fields hidden in Quick Entry.
- Both modes use `saveFlight()` with identical validation, automated night-time calculation, duplicate detection, archive guards and cloud synchronization. All existing-flight edits and signed correction workflows stay in the full view.
- `v2/v223-quick-flight.test.cjs` checks navigation, shared form fields, mode toggling without data loss, full editing and save-path safety. This update does not change `print.js`, stored record shape, Supabase schema or production resources.
- Bumping the PWA cache to `helilog-v2-23-quick-flight-1` prompts installed test apps to refresh. The production candidate packager now derives the release version from verified staging HTML, manifest and cache labels while retaining explicit approval, separate origin and publishable-key guards.

## V2.24 — Universal Forms (test only)

- Removes Lithuania-specific registration, authority and aerodrome examples and Cabri/Guimbal-specific suggestions from **Add Aircraft**, **Endorsements**, **Profile/Qualifications**, **Aerodrome Settings**, **Brought-forward Totals**, and **Simulator Session** entry.
- Field labels and neutral guidance remain; edit values, required-field validation and all saved records are unaffected. Existing demonstration flights and downloadable import examples are intentionally unchanged.
- `v2/v224-universal-forms.test.cjs` keeps new user-entry placeholders neutral. V2.24 has a distinct test PWA cache so installed devices can refresh; no new data migration, print-layout change or production deployment is included.

## V2.25 — Print Preview Cleanup (test only)

- Removes an internal source-code comment that was inadvertently included as visible text in the printed flight-row HTML. Browsers moved the stray text above the table, repeating it once per printed flight.
- Both **Export logbook → Print / Save as PDF** and **Print archive** use the same corrected print generator. Existing stored `picName` values, sealed archive records, paper page formats (including legacy 26-column batches), totals, and signatures remain unchanged.
- `v2/v225-print-cleanup.test.cjs` renders both export and archive HTML to verify the comment is absent, new rows retain 27 cells, legacy rows retain 26 cells, saved PIC names remain unchanged, and rendering does not mutate flight data.
- The V2.25 test PWA cache is distinct from production. No Supabase schema changes or production deployment.
- The unified regression runner now selects compatible test flags for both Node 22 (GitHub Actions) and Node 24 (local tooling), repairing a pre-existing staging CI configuration failure.

## V2.26 — Help & User Guide (test only)

- The sidebar and mobile More menu include **Help & User Guide**. The guide works within the existing signed-in app, with no new account permissions or backend tables.
- All instructions and What's new entries live in `source/app/13-help-guide.js`. Add or revise topic objects there when releasing new features, and add a new changelog entry for each relevant release.
- The guide includes first-time setup, Quick Flight, pilot profiles, UTC/night calculation, totals, PDF/print archive, endorsements, cloud sync, backups and account settings.
- Its task descriptions are searchable and available offline through the generated page. Visual styling is isolated in screen-only `guide.css`, cached by the service worker. The printed logbook remains unchanged.
- Run `node scripts/check-helilog-v2.cjs` before staging releases; `v226-help-guide.test.cjs` checks navigation, essential guide content and offline availability.

## V2.27 — Reusable pilot signatures (test environment)

- Save/replace/remove a consented pilot signature via the Pilots page. The profile stores a bounded PNG data URL and capture/consent timestamps. These data can appear in account sync and backups and should be protected as sensitive personal information.
- Existing endorsements remain unchanged; new signing requires the actual signer's explicit approval per endorsement and separately snapshots the signature, method, name, licence and timestamp.
- Stored-signature use also requires a separate confirmation dialogue. No auto-signing, no electronic identity verification and no qualified-signature claim.
- Test with `v2/v227-pilot-signatures.test.cjs`; no production, database schema, print-layout or old archive changes.

## V2.28 — safer cloud onboarding and on-device conflict review

- An account has one shared cloud source, rather than a primary/secondary choice on every device. A genuinely new device cache automatically adopts existing extended records after an account sign-in; used devices require explicit confirmation before replacing local extended records, with a pre-activation local backup.
- First device must confirm uploading its existing pilot records to initialize full synchronization. No automatic upload when the cloud already contains extended data.
- Account downloads must apply `settings:siteLocations` as well as pilot, previous totals, records, and qualifications.
- Local unqueued aerodrome settings differences are converted to manual reviewable conflicts. Signatures, signed endorsements, archives and other protected settings cannot be force-merged.
- The cloud pill shows setup incomplete when only aircraft and flights synchronize; conflict review is clearly labelled per-device. Preserved pre-extension snapshot can be downloaded in Cloud account.
- Production and test remain separate. No schema migrations or printed logbook changes.

## V2.28.1 — fix iPhone sync bubble review

- The cloud status bubble now opens the relevant on-device conflict review rather than only routing to the Cloud account heading. With one eligible conflict, it opens the read-only comparison directly; otherwise it focuses an accessible issue list.
- The conflict panel is displayed immediately below the Cloud account heading, with exact pending count and error explanation. For unresolved protected records no automatic overwrite options are offered.
- Signature image data is not printed as base64 in comparisons. No changes to archives, flight records, Supabase schema, or production.

## V2.28.2 — iPhone unqueued pilot-profile conflict recovery

- When an existing local `person` record differs from the last verified cloud snapshot without a pending queue operation, mark a *blocked, device-local* review item and durably persist it. Do not upload or replace either record automatically.
- The normal preview compares local and cloud copies; explicit resolution requires a local recovery snapshot and a fresh cloud revision check. Previously signed endorsement snapshots and print archives remain unchanged.
- The comparison indicates whether the saved profile signatures match without displaying their raw base64 data. This solves `person:p_owner` showing conflict with zero pending changes.
- All new behavior is test-only; no production schema, account records or print format modifications.

## V2.28.3 — safe iPhone totals review and preserved-record inspection

- The previously unqueued local `settings:broughtForward` difference now becomes a blocked on-device conflict with a visible comparison. Choosing which totals to retain requires fresh cloud revision verification and a verified device-local backup. No automatic upload or overwrite occurs.
- Cloud account can inspect the pre-extension device safety snapshot, showing which pilot profiles and endorsements are missing from the current device and which existing IDs differ. The inspection hides signature image data, makes no changes, and allows the existing JSON recovery download.
- Missing pilots and signed endorsements are **not yet automatically restored**. Check the preserved snapshot and reconcile account records before implementing an explicit selective restore.
- This fix is test-only. It does not change the production database schema, printed logbook, flight archive or signed-endorsement records.

## V2.28.4 — selective iPhone recovery and cloud status correction

- Recover a stale unqueued opening-totals conflict **without choosing** only when the current device, queued copy, and cloud copy are exactly equal. This is a verified metadata repair and does not upload or change totals.
- The **Check sign-in connection** button reports authentication status and the independent record-sync state; it no longer falsely claims every logbook is unsynchronized.
- **Preview safe restoration** scans the pre-extension safety copy for people/endorsements missing from both the account cache and current cloud; collision and dangling-reference checks block dangerous merges.
- After explicit confirmation, **Restore these missing records** writes a verified, private full-workspace safety snapshot; only the inspected missing pilots and signed endorsements are added with their original images and timestamps. Existing cloud records, opened totals, archived documents and owner profiles remain unchanged. Pending sync is revision-protected; a changed cloud or device requires a fresh preview.
- Test-only release; no schema, production, print layout or archive modification.


## V2.29 — pre-archive flight review and first-time guide

- A pure, read-only evaluator (prearchive-review.js) checks the exact next print batch for probable duplicates (including previously archived records), incomplete PIC names/links, unusual time entries (UTC midnight rollover is normal), flight-subtime and movement discrepancies, and independent role/engine/pilot-configuration and carried-forward totals.
- Before a new print batch can be previewed or confirmed, the web user opens **Review flights before printing** and explicitly acknowledges the findings. The acknowledgement is transient and tied to the exact JSON of the current archive draft; edits or page selection invalidate it. The printed/archive snapshot remains unchanged and the existing post-print confirmation is still required.
- An advisory is a reason to investigate, not an automatic correction or deletion. Entry links use the existing flight editor; signed records remain protected.
- Help & User Guide explains first-time account setup, multi-device sync, iPhone-specific safety recovery, offline conflicts, authentication vs synchronization checks and new pre-archive review workflow. Cached offline in the test PWA.
- No production changes, database migration, automatic flight edits or changes to signed archive formats.


## V2.30 — compact historical specialised helicopter operations import

- In Settings → Import previous logbook totals / Correct imported totals, the historical operations entry is a compact "Specialised operations…" button. A modal displays all existing HeliLog SPECIAL_OPS categories (VRLL, HESLO 1–4, HEC, NVIS, HHO, offshore, fire, mountain, survey) and accepts whole minutes as H:MM or decimal hours.
- Modal edits are **staged only**: Cancel/Escape discards popup changes, Apply only updates the unsaved form; the main Import totals / Save correction confirmation performs the account write. Existing imported operation values are prefilled, not overwritten by a blank popup.
- Each category is a subset of historical flying time and cannot exceed the previous flight-time total; separate categories may overlap and are not summed to determine flight totals. No fictitious flights are created.
- Historical categories are stored inside the existing revision-checked settings:broughtForward payload as broughtForward.specialOps, with no new database schema, account field or migration. Existing local logbooks with no such record continue working.
- Totals → Specialised helicopter operations shows **Previous**, **Recorded here**, and **Combined** separately, while the number of flights and ICAO type breakdown reflect actual recorded HeliLog flights only.
- Data integrity validates the historical category keys and times; existing signed archives still lock opening balances. Save failures restore the previous local totals before reporting a result.
- This release is test-only. Do not promote to production without the existing production release procedure and explicit approval.


## V2.31 — compact, viewport-friendly Quick Flight entry
- Keep the existing Quick/Full entry form, shared field IDs, UTC and night-time computation, validation, duplicate protection and normal cloud sync. No database changes or saved-flight migrations.
- Quick entry is reflowed into a tightly spaced 2-column grid on phone: date/aircraft, departure/UTC time, arrival/UTC time, duration/function, take-offs, night/IFR. Hide redundant section headings, large help blocks, full diagnostic night explanation and automatic SELF PIC input for PIC/SOLO, but retain the input and its value in the original DOM.
- Cross-country and remarks are collapsed behind an explicit accessible toggle that expands in-place without losing unsaved values. Full details retain original access to all fields.
- A concise visible alert is shown when auto-night cannot be calculated after entering a complete flight; the existing save path blocks unsafe submission. Save is sticky above mobile navigation except when the on-screen keyboard is open. Long forms, warnings and smaller phones can still scroll; no important input is clipped by fixed-height containers.
- Same pilot function-dependent PIC requirement, independent landing-count defaults and offline synchronization are preserved. Test release only.

## V2.31.1 — adaptive one-handed Quick Flight positioning

- Mobile Quick Flight uses the existing blank area below its compact card: flex column with a minimum dynamic viewport height and an auto top margin to bring the form toward the bottom of the usable screen.
- Bottom inset reserves 88px plus the device safe area, keeping Save above the mobile navigation controls. On short displays or when optional details/warnings expand, the auto margin uses only available free space and the form remains scrollable—no fixed position or transform is applied.
- When a mobile typing field has focus, keyboard-open resets the min-height and auto margin to return to natural scroll, while the existing sticky Save action becomes static.
- Pure CSS layout change. All flight values, PIC selection, night calculations, duplicate checks, archive protection and cloud synchronization are unchanged. Release to the test service only; production remains v2.26.

## V2.31.2 — return Quick Flight to top and clear iOS heading

- Revert the prior one-handed bottom anchoring of V2.31.1 after real iPhone feedback. Quick Flight again begins at the top of the screen, with the same compact two-column layout and original Save behavior.
- Give the header 14px plus the iOS safe-area inset of top spacing, to keep page heading and cloud status out of translucent native status-bar overlap. Explicitly disable filter/backdrop-filter for the Quick Flight heading only.
- Keep keyboard-aware static Save action, natural scrolling and all flight validation unchanged. Test-only patch, production untouched.

## V2.31.3 — pre-archive review return navigation

- On browser Print archive → Pre-archive flight review, View entry / View related entry now remember the exact selected draft, which review warning was opened and the current acknowledgement checkbox state.
- When opened from this review, flight detail or simulator session detail shows **← Back to review**, rather than only ← Logbook. Returning restores the same issue card and the checked acknowledgement only when the entire draft is still byte-for-byte identical; otherwise it remains unchecked and requires a fresh review.
- Regular logbook flight details continue to use the Logbook button. Navigation state is transient and never saved, synchronized or treated as an archive approval. Actual print and archive confirmation retain the existing exact-draft safety checks.
- No changes to flight entries, totals, signatures, printing, archived records or the cloud schema. Test-only patch, production unchanged.

## V2.31.4 — compact Quick Flight stays fixed until keyboard interaction

- In the installed phone app, Quick Flight is pinned in its existing top position (no one-handed bottom alignment). It prevents Safari/iOS elastic page dragging only when every essential form control fits above the fixed mobile navigation bar.
- A temporary root CSS class freezes page scroll, including on Safari PWA versions where overflow:hidden alone does not stop touch rubber-banding. No user settings are persisted.
- The existing keyboard-open detection immediately releases the lock on focus and restores natural scrolling; closing the keyboard restores the top alignment/lock only if the form still fits. Smaller displays, expanded optional fields, validation banners, and asynchronous night calculation warnings unlock scroll automatically when they exceed available height.
- Layout is recalculated on changes to Quick/Full mode, advanced fields, night warnings, page navigation and viewport/keyboard size; a ResizeObserver watches form/heading height changes.
- No database changes, flight validation changes, imported totals changes, cloud sync changes or signed archive changes. TEST-only release.

## V2.32 — encrypted off-provider recovery readiness (first safe increment)

- Preserve V2.9 private scheduled Supabase snapshots and AES-256-GCM/PBKDF2-310k encrypted downloads. In-provider database snapshots are NOT independent disaster-recovery copies.
- New offline-backup-check.js provides a read-only signed-out file verification workflow on the Sign in screen. Works without a Supabase session/network when app files are locally cached. Reads the existing encrypted-cloud-snapshot v1 format.
- User chooses an encrypted file and passphrase. WebCrypto AES-GCM authenticates it, the V2.10 in-memory drill checks records, frozen signed archives and addenda, and displays SHA-256 fingerprints and age without names or signatures. Wrong passphrase or invalid file fails closed.
- No selected file, passphrase or decrypted content is uploaded, saved to localStorage or restored into an account. No database migration or schema changes.
- This verifies that one user-selected file can be reconstructed. The pilot must separately save a copy outside the Supabase provider/device and compare checksums. Neither automatic offsite storage nor complete provider recovery is implemented yet.
- Keep test-only until signed-out and network-off testing on iPhone and desktop confirms behavior.

## V2.32.2 — distinguish backup formats in the signed-in UI

- Signed-in Settings → Backup & Recovery now presents three clearly identified formats instead of one ambiguous Restore box: encrypted cloud snapshots (V2.9+), unencrypted verified cloud recovery packages (V2.8), and a separate local-workspace backup. The local-only restore control is available only outside a cloud account.
- The encrypted snapshot verifier, previously accessible from Sign in only, is now also accessible while signed in. It reuses the V2.32 no-cloud, in-memory verification handler and never persists a passphrase or modifies active data.
- The V2.8 inspector recognizes an encrypted-cloud-snapshot or helilog-full-backup JSON and provides format-specific guidance instead of the generic unsupported backup error. Existing V2.8 SHA-256 verification remains read-only.
- There are no database/Supabase migrations, new cloud permissions, automatic restores, or changed production records. Test deployment only; production remains v2.31.4.

## V2.32.2 — Remove legacy V2.8 backup controls (test only)

- The Backup & Restore page now offers the full JSON backup and the read-only AES-256-GCM encrypted cloud-snapshot checker; the legacy V2.8 unencrypted recovery-package download and inspect buttons are hidden from the user interface.
- Existing archive-integrity audits, historical V2.8 data compatibility functions, encrypted snapshot downloads and offline verification (including the sign-in screen) remain unchanged. Signed-in cloud accounts still cannot use local full-backup restore to overwrite cloud records.
- The Help & Guide, staged regression assertions, app version, and service-worker cache were updated together. No Supabase migrations, storage mutations, or production changes. Independent offsite storage and end-to-end isolated disaster restoration are still future tasks.

## V2.33 — FCL.060 recent-experience Phase 1 (TEST)

- A dedicated Recency page (desktop navigation/mobile More) and short dashboard card show rolling 90-calendar-day pilot-flying evidence separately for each helicopter ICAO type and pilot configuration, without automatic cross-type credit.
- Only explicitly checked complete take-off, approach and landing PF sequences entered under Full Flight Entry → More details count. Night sequences also contribute to the general 3-sequence requirement. Unverified historic movements and simulator time remain excluded.
- Outputs say "Documented" / "Not established", NEVER issue an operational authorisation. IR night alternative, approved FFS credits, 120-day CAT supervised extension, multiple-type credit, licence/operator conditions and specialised recency require independent assessment.
- No schema changes, silent backfill, write to signed archives or production migration. Test-only; V2.31.4 production remains unchanged.

## V2.33.2 — Pick dashboard Recency indicators (TEST)

- Recency page provides per-ICAO-type, pilot-configuration and passenger/night checkboxes for what appears on the dashboard. Selection defaults to empty: no unwanted card.
- Choices persist per cloud-account identity **on the current device** via a dedicated localStorage view-only key. Local and test sandbox modes use distinct keys. This is not yet synchronized between devices.
- No aircraft/flight/archive data is modified. Hidden indicators remain fully available in Recency. Invalid/stale dashboard keys are excluded.
- Recency calculations are unchanged and remain conservative estimates, not legal certification.

## V2.33.1 — Automatically estimated recency (TEST)

- Single-pilot PIC/SOLO history is evaluated read-only using min(day take-offs, day landings) and min(night take-offs, night landings). This **estimates** complete PF movement sequences; an approach itself is not separately attested by logbook movement counts, so it must not be presented as certified legal currency.
- No duplicate sequence entry for those flights; an opt-out allows an exceptional unsigned flight to be excluded. DUAL/SPIC/PICUS/co-pilot and multi-pilot flights still require explicit PF evidence for credit.
- Show only ICAO type/pilot-configuration pairs with logged flight history, and only show night PIC recency for a type/configuration with recorded night operations (even if the last night flight is older than 90 days).
- Rename "Passenger / CAT" to "Passenger-carrying" to avoid misclassifying private/training flights as CAT; FCL.060 applies to carrying passengers or CAT but qualifying prior flights need not themselves be CAT.
- No data backfill, migration, or archive mutation; unchanged production V2.31.4. Full regression suite must pass before staging deploy.

## V2.33.3 — Clear rolling recency (TEST)

- Show compact checkbox selectors on Recency instead of duplicating the full details.
- Show status (requirement documented / threshold met as estimate / below recorded threshold), not an ever-increasing 8/3 headline; counts remain contextual evidence only.
- If a recorded threshold is met, show the projected date on which it would first fall below the minimum **if there are no further qualifying flights**. Window is the preceding rolling 90 days, not a new fixed 90-day validity certificate.
- Preserve each account's existing dashboard selections and all original flights, archives, recency calculation and protected records.

## V2.33.4 — Compact recency cards (TEST)

- Dashboard displays pinned recency as a short status list beside Upcoming dates, rather than a full-width nested card. If nothing is selected, no recency card is shown.
- Recency page displays one compact All recencies list with expandable details, avoiding repeating full cards for each aircraft configuration and operation.
- Keep the colour distinctions (confirmed / auto-estimated / not met), account/device-scoped dashboard selection, 90-day movement arithmetic, and private/signed flight history unchanged.
- No database migrations, automatic recency backfill or production deployment.

## V2.33.5 — Clearer Recency names (TEST)

- Bold the **Passenger-carrying** and **Night PIC** recency labels in both the compact dashboard rows and the expandable Recency list, plus the dashboard-selection labels. Dates and status descriptions remain normal weight.
- Presentation-only. Keeps recorded counts, rolling FCL.060 evidence, current selection preferences, account isolation, flights, signed archive and production unaffected.

## V2.33.6 — Group Recency by aircraft type (TEST)

- Dashboard shows one heading per ICAO helicopter type; under it, labels are **Passenger-carrying** and **Night PIC** rather than repeating the single-/multi-pilot configuration.
- Recency page groups both dashboard-selector checkboxes and full expandable Recency entries under matching type headings.
- Where a type has both single-/multi-pilot evidence for the same recency kind, a small crew-configuration qualifier is retained to distinguish separate legally relevant calculations. All stored preference keys remain unchanged.
- Display-only. No automatic writes/backfills, no changes to the FCL.060 90-day calculation, cloud or signed archive histories, or production.

## V2.34 — Specialised operations Phase 2 (TEST)

- Keep the historical `flight.specialOps` operation-minute format untouched; add optional `flight.specialOpsCycles` keyed by operation code with integer `{day,night}` counts for specialised cycles or offshore complete sequences. Missing means unrecorded, not zero evidence.
- Full Flight Entry presents operation time next to day/night cycle counts. HHO cycles require transitions to/from hover; offshore entries require complete offshore take-off/departure/approach/landing sequences. NVIS uses one flight per selected flight, not cycles. Validation rejects negative/fractional/out-of-range cycle counts and night cycles without night flight time.
- 90-day read-only NVIS, HHO day/night, offshore day/night counters, by type/crew configuration, on Recency page and optional dashboard selections. Missing historic cycle data is uncredited. No automatic claim of regulatory currency, no grouping of HHO and HEC credits, and no automatic HESLO/HEC/SPO operator-specific certification yet.
- Backward-compatible with old flights, no database changes, no archive/backfill mutations, production unchanged.

## V2.34.1 — offshore landings, specialised recency credit and totals (TEST)

- OFFSHORE remains stored in the backward-compatible `specialOpsCycles.OFFSHORE.{day,night}` shape, but its compact fields are now **Day landings / Night landings** at qualifying offshore locations (platforms, helidecks, vessels). Entries must represent qualifying take-off, departure, approach, landing sequences under SPA.HOFO.170. Ordinary landing counts are NOT automatically credited.
- NVIS (flights) and HHO (hoist cycles) recency calculation aggregates SP/MP configurations **within the same ICAO type**. Offshore and passenger-carrying requirements remain separated by single- and multi-pilot intended operation. Existing per-device dashboard preferences for NVIS/HHO are read through an alias to the combined indicator; old records remain unchanged.
- Specialised Totals adds counted cycles/offshore landings (Day, Night) and NVIS flights alongside existing time columns, plus per-type counts; previous-logbook hours never invent cycle counts. Archived flights, signatures, original schema, cloud and production untouched.

## V2.35 — Phase 3A advanced recency foundation (TEST)

- Display **Met** in both places formerly showing **Estimated met**; preserve the internal estimated-vs-confirmed source and the expanded caution that approaches are not independently verified. A recency badge is not legal authorization.
- Add a pure, in-memory advanced-recency module supporting custom operator rule sets and pilot-reviewed credit-event schemas. Explicitly configure aircraft type, crew configuration, unit, threshold, rolling window and permitted sources (flight/FFS/check/training). Pilot-reviewed records require evidence references. Wrong-owner, expired/future, malformed, duplicate, draft and unsupported-source events are not counted.
- These results are **custom operator tracking only**, not EASA recency certification. FCL.060 and SPA calculators, signed archives, logs, sync and Supabase schemas are unchanged.
- No rule editor, event persistence, file attachments, notifications or automatic credit integration in this first increment. Follow-up increments will implement these with account isolation and audit controls. Production remains v2.31.4.

## V2.36 — Phase 3B: custom operator-rule editor (TEST)

- Add account-scoped browser-local operator profiles (up to 20) and rule lists (up to 50 per profile): create, rename, activate, deactivate, delete; create/edit/delete rules with aircraft type, pilot configuration, measurement unit, positive integer threshold, sliding window and eligible flight/FFS/check/training sources.
- Browse these profiles under Recency or Settings; active operator is separately selected and no EASA defaults are ever overwritten or displayed as operator approvals.
- Save to a dedicated `helilog_operator_profiles_v1:<owner>` browser-localStorage key; test sandbox, local workspace and cloud users separated. Never overwrite corrupt or wrong-account storage. No cloud sync, database change, migration, backfill, signed record modification or automatic simulator/check credit. Device-local rules are not part of cloud backups.
- Phase 3C will add independently stored reviewed credit events and evidence. A configured rule is not itself a proof of currency or privilege.

## V2.36.1 — Operator editor feedback (TEST)
Add Rule opens and focuses the form; validation messages appear inline without clearing inputs. Source and EASA calculations unchanged; production unchanged.

## V2.36.2 — Phase 3B extension: linked operator activity (TEST)
- Move custom rule access exclusively to Recency; remove duplicate Settings card.
- Add required explicit monitored activity source to rule editor, derived measure, and display count/threshold details in Recency and rule list. HESLO1–4, HHO and other operational cycles use `flight.specialOpsCycles[code]` only with `flight.specialOps[code]` present; offshore uses its separately recorded landings, NVIS uses flagged flights, and all-flights uses ordinary flight records. Type/config/rolling date filters apply; no inferred missing counts, simulators, duplicate flight IDs or unlinked rule auto-credit.
- Pre-existing V2.36.1 rules stay saved and **unlinked** until source explicitly selected; no storage migration or cloud writes. These are self-recorded operator-specific tracking figures, not legal EASA credits or operator-approved status.
- Flight data remains read-only; account-scoped operator profiles remain device-local; FFS/check/training evidence phase is not yet implemented.

## V2.37 — operator recency format and night-flight monitoring (TEST)

- Merge active operator rules into the same expandable **All recencies** list and **Show on dashboard** controls as EASA recency, visibly separated by the type-group heading “Operator: NAME” and each operation's “Operator ·” prefix. Preserve regular EASA indicators unchanged.
- Dashboard selections use the same per-account/local-device preference storage; new keys include operator profile and rule IDs and are never selected by default. Deactivating or switching operator excludes inactive operator rules from display.
- Add a Night flights monitor (`flights:night`) counting distinct, non-simulator flight entries with validated positive `nightMin` not exceeding `mins`. Count 1 per qualifying flight, not movements or night minutes. Aircraft ICAO, SP/MP config, and rolling period are applied exactly as for other operator counters.
- **Recorded night time is not independent Night VFR evidence.** Existing entries do not explicitly identify VFR flight rules; confirm VFR with operator evidence. No EASA certification, Supabase database migration, logbook/print/archive writes, or production deployment.
