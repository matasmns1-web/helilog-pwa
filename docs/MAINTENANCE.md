# HeliLog — Developer & Maintenance Guide

**Baseline:** HeliLog V1.43.2 (14 October 2026)  
**Source repository:** https://github.com/matasmns1-web/helilog-pwa  
**Production website:** https://helilog-pwa.onrender.com  
**Hosting dashboard:** https://dashboard.render.com/static/srv-db6b6lnlot8c739i6kl0  
**Companion checklist:** [Release and recovery checklist](RELEASE-CHECKLIST.md)

> **Important:** HeliLog is an EASA-oriented prototype, **not** an EASA/TKA-certified logbook, signature system, compliance determination, or authoritative interpretation of flight-time regulations. Check acceptance of printed records, PIC/SPIC/PICUS credit, signatures, recency and archive corrections with the relevant authority. This document describes how this specific code works; it is not regulatory approval.

## If the original developer or AI assistant becomes unavailable

You do **not** need the original developer to operate this application. The repository contains the application source. Render serves it as a static website. However, **the repository and Render do NOT hold users' flight records**: records live in each device/browser's local storage.

First actions:

1. **Keep access** to the GitHub repository, Render account, and domain/hosting account if one is added later. Set up account recovery and two-factor authentication.
2. **Download a copy of the repository**, ideally both a Git clone (full history) and a ZIP kept offline. Save the current live commit ID as well.
3. **Download a HeliLog Full Backup (JSON)** from the main logbook: Profile → Backup & restore → Download backup. Check that the file exists, is readable and is stored somewhere other than that device. This backup is **separate from** the GitHub source.
4. **Preserve signed paper pages and correction addenda**. A JSON backup cannot substitute for a manually signed paper original.
5. Do not delete the browser profile, clear site data, uninstall the only PWA holding records, or change storage keys before verifying a Full Backup.

A new developer can read this guide, clone the repository, run the static site, test changes, and deploy it independently of ChatGPT.

## 1. System at a glance

| Component | Current implementation |
|---|---|
| Client/UI | Single-page HTML/CSS/vanilla JavaScript app in `index.html` |
| Backend / API / authentication | None in V1 |
| Main flight-data database | The current browser's `localStorage`, **not** Render or GitHub |
| Test Mode data | Different `localStorage` key on the same browser origin |
| Source control | GitHub repository, default branch `main` |
| Hosting | Render **Static Site**, connected to GitHub |
| Build process | No bundler or package installation required |
| PWA | `manifest.webmanifest` plus `service-worker.js`; icons in repository root |
| Printing | Browser-generated A4 PDF/print markup, with a manually confirmed print archive |
| Backup/restore | HeliLog JSON Full Backup, checksum metadata (SHA-256) on modern backups; CSV import/export for flight data |

High-level data flow:

    Browser (index.html, JavaScript)
        ├─ Main Logbook → localStorage["helilog_v111"]
        └─ Test Mode    → localStorage["helilog_v142_sandbox"]
                           ↑ mode selector: localStorage["helilog_v142_mode"]
        ↓
    In-browser totals, filtering, flight/simulator editing,
    print previews, confirmed print archive, correction addenda,
    integrity check, CSV, JSON Full Backup
        ↓
    Render serves static source files; it does not store flight records.

The two modes **share the same application code**. They isolate *record storage*, not bugs in that code. A bad release can affect both modes. Test new releases on an isolated preview origin or branch whenever feasible; Test Mode is an additional check, not a substitute for a separate deployment.

## 2. Repository layout

These are the files in the V1.43 repository root:

| Path | Purpose |
|---|---|
| `index.html` | Nearly all application UI, state handling, domain logic, styles, importing, printing and backup code |
| `service-worker.js` | Offline shell caching and cache-version lifecycle |
| `manifest.webmanifest` | PWA name, start URL, icons and display mode |
| `icon-192.png`, `icon-512.png` | App icons |
| `apple-touch-icon.png` | Apple Home Screen icon |
| `README.md` | Project entry point and quick start |
| `docs/MAINTENANCE.md` | This in-depth handover guide |
| `docs/RELEASE-CHECKLIST.md` | Repeatable testing, deployment and disaster recovery procedures |

There is **no package.json, build tool, server application, SQL database or automated test suite** in the documented V1.43 baseline. The logic is concentrated in a large script block in `index.html` (200+ named functions). Refactoring into modules and adding automated browser tests would make long-term maintenance easier; do it gradually with thorough regression tests.

## 3. Get the application running locally

**Option A — no command line:** GitHub → Code → Download ZIP → extract it. You can inspect `index.html` in VS Code. Opening the file directly (`file://`) works for basic UI testing, but PWA/service-worker capabilities require a secure context.

**Option B — recommended for development:**

    git clone https://github.com/matasmns1-web/helilog-pwa.git
    cd helilog-pwa
    git switch main
    git pull
    python -m http.server 8000

If Windows uses the Python launcher, replace the last line with `py -m http.server 8000`. Open **http://localhost:8000**. Stop the server with Ctrl+C.

You do not need to install npm packages for V1. Editing a file and refreshing the browser is enough for local changes. Open Developer Tools (usually F12) → Console to inspect JavaScript errors, and Application/Storage to examine storage.

**Warning:** `http://localhost:8000`, the Render domain, and any new hosting domain have *separate* browser data. Do not assume real records follow you between them. Also, an installed PWA or separate browser profile may have different storage; test independently.

**Recommended VS Code workflow:** install Git and VS Code, clone the repo, create a branch such as `fix/date-input`, make small changes, check the browser console, use Test Mode, then review and merge the branch to `main`. For significant changes, prefer a separate preview hosting environment rather than testing unproven code against the production URL.

## 4. Render deployment — verified settings

Render service configuration as retrieved on 13 October 2026:

| Setting | Value |
|---|---|
| Service name | `helilog-pwa` |
| Service type | Static Site |
| Repository | `https://github.com/matasmns1-web/helilog-pwa` |
| Branch | `main` |
| Root directory | Repository root / empty |
| Build command | `echo HeliLog static site` |
| Publish path | `.` (repository root) |
| Auto deploy setting | **Enabled**, trigger `commit` |
| Site | https://helilog-pwa.onrender.com |
| Render dashboard | https://dashboard.render.com/static/srv-db6b6lnlot8c739i6kl0 |

**Release steps:** push or merge the intended commit to `main`, then check the Render **Deploys** page for the commit SHA and a **Live** state. Deployments may run automatically; if a commit is not deployed or auto deployment was changed, use Render's manual deploy option for the intended commit. Do not trigger duplicate deployments unnecessarily. Check the actual service settings again if this document becomes old.

**Documentation-only commits can also cause a Render redeploy** because auto deployment watches `main`. Such a deploy republishes the same application source if `index.html` and `service-worker.js` have not changed.

A working site does not prove local data was preserved; use application-level backup and restore checks separately.

## 5. How to release an application update safely

1. **Before code changes:** download a main-logbook Full Backup and verify it is available. Keep a GitHub code copy and identify the currently live commit.
2. Create a separate Git branch. Make a small, understandable change; do not simultaneously rewrite the data model, archive rules and UI.
3. Check console and syntax. Test the requested feature and run the full checklist in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).
4. Update **all applicable visible/app version references** in `index.html` (browser title, app header, backup `appVersion`, informational copy as appropriate).
5. For a code/UI release, bump the `CACHE` identifier in `service-worker.js`, currently `helilog-v1-43-1-shell`. Do **not** rename the storage keys to bump a version.
6. Review the diff to confirm no passwords, personal flight data, JSON backups or copied production localStorage bytes were committed. GitHub is currently a **public** repository.
7. Commit and merge/push to `main`, then verify Render deploy status and commit SHA.
8. Reload the live app; verify the version, create/edit a fictional record in Test Mode, check Totals and Print Archive, and confirm the main dataset is still present.
9. Document meaningful changes and save another Full Backup after important real-world data changes.

**Avoid changing the PWA cache name for documentation-only commits.** A service-worker cache bump is for changed app assets and is not needed when adding documentation.

**Rollback:** Use Git's non-destructive `git revert <commit-sha>` on the offending application commit, or the Render dashboard's redeploy/rollback controls if supported. Confirm the correct commit is Live. Never assume **rolling back source code rolls back browser data**—startup migrations may already have altered it. For breaking data changes, restore a verified, separately saved JSON backup only after documenting which records would be lost and making a fresh safety copy of the current state.

## 6. Where the main logic lives in index.html

Search by **function name**, not line number (line numbers change after edits):

| Area | Main functions / entry points |
|---|---|
| Application state | `const LIVE_KEY`, `const SANDBOX_KEY`, `let S`, `save()`, `render()`, `go()` |
| Data compatibility / startup | `ensureV116Data()`, `ensureV121Data()`, `ensureV130Data()`, `ensureV131Data()`, `ensureV136Data()`, `ensureV137Data()` |
| Dashboard | `dashboard()`, `dashboardPeriodFlights()`, `dashboardReminders()` |
| Flight CRUD | `add()`, `saveFlight()`, `flight()`, `editFlight()`, `openDeleteModal()` |
| Simulator sessions | `addSimulator()`, `saveSimulatorSession()`, `simulatorDetails()`, `isSimulatorSession()` |
| Pilot function and totals | `recordedTotals()`, `calcTotals()`, `functionTime()`, `configurationTimes()` |
| Specialised operations | `SPECIAL_OPS`, `collectSpecialOps()`, `specialisedTotals()` |
| European date entry | `europeanDateField()`, `readEuropeanDate()`, `formatDate()`, `parseExternalDate()` |
| Filtering and list | `logbook()`, `getFilteredFlights()`, `compareFlightsOldest()`, `compareFlightsNewest()` |
| CSV import and export | `openImportModal()`, `confirmCSVImport()`, `exportLogbookCSV()` |
| General print export | `exportPrintableLogbook()`, `sumLogbookFields()`, `addExportTotals()` |
| Permanent print archive | `nextArchiveDraft()`, `confirmPrintedArchive()`, `reprintArchiveBatch()`, `printarchive()` |
| Archived corrections | `archiveCorrections()`, `effectiveFlight()`, `effectiveFlights()`, `recordArchiveCorrection()`, `printCorrectionAddendum()`, `confirmCorrectionAddendum()` |
| Record validation | `inspectHeliLogData()`, `showIntegrityCheck()`, `flightFingerprintForRecord()` |
| Backup and restore | `makeFullBackup()`, `downloadFullBackup()`, `handleBackupRestoreFile()`, `restoreCheckedBackup()` |
| Test Mode / clean start | `makeSandboxData()`, `enterTestMode()`, `exitTestMode()`, `resetSandbox()`, `prepareLiveCleanStart()`, `confirmLiveCleanStart()` |
| Aircraft, pilots, profile | `aircraft()`, `pilots()`, `profile()`, `qualificationForm()`, `editMedical()` |

These names describe the V1.43 baseline, not a stable public API. Search actual source before changing implementation.

## 7. Data model and non-negotiable invariants

### Local storage identifiers

    LIVE_KEY    = "helilog_v111"         // MAIN production flight records
    SANDBOX_KEY = "helilog_v142_sandbox" // TEST flight records
    MODE_KEY    = "helilog_v142_mode"    // "test" selects sandbox

`KEY` points to LIVE or SANDBOX according to the mode at page load. **Do not rename or erase `helilog_v111` just to publish a new version.** Doing so would make existing live records appear missing. Do not change `MODE_KEY` or mode selection casually. A clean-start/reset is destructive and must only run after a verified safety backup.

State object `S` includes at least:

- `pilot` — owner identity, licence metadata, medical information;
- `aircraft` — registrations, ICAO designators, engine setup;
- `people` — PIC/instructor/other pilot profiles;
- `flights` — both helicopter flights and dedicated simulator-session entries;
- `qualifications`, `endorsements` — ratings, licences and endorsement/signature records;
- `broughtForward` and `broughtForwardByType` — prior paper-logbook hours;
- `printArchive` — immutable signed batch snapshots, page sequence and an append-only correction ledger.

**Dates:** internal `YYYY-MM-DD` ISO date strings; visible/editable user dates in `DD-MM-YYYY`. **Times:** 24-hour clock; durations/totals are stored as **integer minutes**, shown to pilots as `H:MM`. Preserve these units; never treat `1:30` as 1.30 decimal hours.

**Aircraft:** record ICAO aircraft type designators (e.g. `G2CA` for Cabri G2), not just a marketing model name. Single-/multi-engine and single-/multi-pilot are **independent** concepts; see `engineCode()` and `configurationTimes()`. Since V1.43.1, the paper print uses **four configuration cells**: SE ✓, ME ✓, Single-pilot hours, Multi-pilot hours. The aircraft sets the engine checkmark automatically; the flight's pilot configuration determines which hour cell is filled. Totals separately show SE/ME and Single-/Multi-pilot time. Earlier paper opening balances may not fully identify engine type for previously recorded multi-pilot hours; do not invent missing split.

**Pilot functions:** current headline PIC calculation includes PIC, SOLO, SPIC and PICUS. Co-pilot and Dual are separately reported. This is an *implemented convention*, not independently validated regulatory credit. Keep SPIC and PICUS traceability. Instructor, Night, IFR and specialised operations are breakdowns within total flight time; do not add them to total again.

**Simulators:** a simulator session uses `entryType: "simulator"`, positive `stdMin`, and `mins: 0`. Its device classification and qualifications are stored separately. Synthetic time must not increase helicopter flight/PIC totals. Legacy embedded synthetic fields on old flight records can still exist; do not silently discard them.

**Validation:** `inspectHeliLogData()` checks IDs, dates, time ranges, duplicate indicators, archive continuity and correction chaining. Do not ignore integrity-check errors to force an import or restore.

### Print archive — extremely sensitive

**Print-layout compatibility:** New V1.43.1 paper batches store `paperLayoutVersion: 2` and print 27 columns, including SE/ME checkmark cells and separate Single-/Multi-pilot hours. Batches confirmed before this change have no version marker and are reprinted with the legacy 26-column layout. Never retroactively change the layout of signed batches. New-layout totals store `engineSE`, `engineME`, `single`, `multi` independently; legacy `spSE`/`spME` fields are retained for archival continuity. Since V1.43.2, new print previews and batches omit the redundant engine/pilot breakdown line below the table. New confirmed batches store `paperFooterVersion: 2`; older V1.43.1 batches lacking that marker still reprint with their original summary footer. This setting affects presentation only, not flight/total data.

Confirmed paper batches are persisted in `S.printArchive.batches` with copied flight data, aircraft/pilot snapshots, opening/closing totals, page numbers and record IDs. They are intended to be frozen. `LOGBOOK_ROWS_PER_PAGE = 14`; printing uses **A4 landscape with 12 mm margins**. A batch is confirmed only after manual printing/checking/signing; the software cannot prove that a printer printed a page.

Do **not** directly edit, renumber, delete or regenerate old signed batch snapshots to make totals match a correction. Archived flights are protected from ordinary editing and deleting.

Since V1.43, correction entries are held in `S.printArchive.corrections`, storing original and revised versions, reason, batch/page/row reference and confirmation timestamp. **Only confirmed corrections** are overlaid through `effectiveFlight()` / `effectiveFlights()` for electronic totals. Signed originals remain unchanged. The next archive batch carries documented differential adjustments through `correctionsApplied` and `openingCorrectionsDelta`; each confirmed addendum must be applied **once**, never double-counted. Pending addenda block confirmation of a new paper batch. Print the separate A4 correction addendum and retain it with the signed book.

**Regulatory caveat:** this is a traceable *prototype workflow*, not evidence that TKA/EASA accepts this particular correction method.

## 8. Test Mode and the live logbook

Test Mode is selected from the app UI. On first entry, it creates **48 fictional entries** (46 helicopter flights + two simulator sessions). It includes different aircraft, functions, IFR/Night/instructor/specialised time and enough rows for four paper pages.

- `enterTestMode()` switches to separate storage and reloads.
- `resetSandbox(true)` rebuilds the fictional dataset; `resetSandbox(false)` clears it. These also clear any **test** archive history.
- `exitTestMode()` returns to production storage.
- `prepareLiveCleanStart()` / `confirmLiveCleanStart()` are separate **destructive live reset** controls requiring safety-backup and typed confirmation; do not use them casually.
- The same code operates in both modes. Verify that you see the Test Mode banner before experimenting.

Test Mode is a convenient product-testing sandbox, **not** a security boundary or independent software version. Do not use a real logbook backup as test data on the production domain unless you fully understand the restore environment and consequences. V1.42+ backups include an `environment` label, and restore is designed to reject files labelled for the other environment.

## 9. Full Backup, CSV and recovery

### Regular Full Backups

In **Main Logbook** mode: Profile → Backup & restore → **Download backup**. Save the resulting `.json` file in at least two independently accessible places (for example an encrypted/cloud folder and an offline drive). Verify it actually downloaded. A sensible minimum is after each significant logging/import/archive session, plus regular periodic copies.

Modern Full Backups contain:

    {
      "app": "HeliLog",
      "format": "helilog-full-backup",
      "backupSchema": 2,
      "appVersion": "1.43",
      "environment": "production",
      "exportedAt": "...",
      "integrity": { "algorithm": "SHA-256", "sha256": "..." },
      "data": { "...": "..." }
    }

The checksum detects accidental or malicious file alteration **but is not a cryptographic signature of the pilot's identity**. Older checksum-free HeliLog backups may be supported, with less integrity assurance.

**Restoring:** select the JSON file under Profile → Backup & restore. The app checks data structure and any SHA-256 metadata, then requires downloading a safety backup of the current state and an explicit confirmation. A restore **replaces all data in that mode on that browser origin**. Re-run Data Integrity Check, Totals, and Print Archive afterward. Keep both the previous and restored copies until verified.

**CSV** is for exchange/import of flight records and does not replace a Full Backup: it does not carry the full qualifications, signed print snapshots, complete correction history, settings and all metadata.

### Emergency recovery when the site is inaccessible

1. Keep the browser and local site data untouched. On a surviving browser, advanced users can inspect Developer Tools → Application/Storage → Local Storage → `https://helilog-pwa.onrender.com` and preserve the **exact** `helilog_v111` value in a private, secure copy. **Do not edit that value or paste it into random websites.**
2. On another device, try to use the latest verified HeliLog Full Backup JSON. If there is no JSON backup and the browser profile/data is lost, the repository cannot reconstruct the missing flights.
3. Restore the static website from the GitHub repository or your offline code ZIP to a secure HTTPS host; visit its new URL.
4. **Because it is a different origin, the new site starts with separate browser storage.** Restore the saved JSON through the new site's normal backup UI, and validate totals and signed archive history before abandoning the original host.
5. Preserve the original backup, signed pages and source commit ID for audit and future recovery.

Never assume a PWA offline cache is a reliable archive of user data. CacheStorage stores app files, not a backed-up logbook database.

## 10. Troubleshooting and known limitations

| Symptom | First checks |
|---|---|
| Render URL is unavailable | Render service events/deploy status; compare deployed commit to GitHub `main`; try last known-good deployment or clone to alternate hosting |
| Blank page / JS error | Browser DevTools Console and Network; verify `index.html` loads without syntax errors; compare last working commit |
| Old UI persists after deployment | Hard refresh, check service-worker cache version and deployed commit; do not use “Clear all site data” indiscriminately because this can remove real records |
| Flights seem to have disappeared | Check Main vs Test Mode, the exact browser/profile/origin, and correct `localStorage` key; do **not** reset or overwrite anything; preserve stored data first |
| Save fails | Storage quota/private-mode limitations; preserve a Full Backup; see `save()` and Console; avoid repeated changes until storage is stable |
| Totals are wrong | Check minutes vs decimal hours, PIC/DUAL function, single/multi-pilot config, brought-forward balances, confirmed correction overlays and Data Integrity Check |
| Print pages do not match | Confirm print scope, archive batch, 14 rows/page, A4 landscape/12 mm, device restrictions, original snapshots and correction addenda |
| Restore fails | Check whether the file is a real Full Backup, whether it matches Main/Test environment, checksum errors, invalid records, and that a safety backup was created |
| iPhone/iPad installed PWA issue | Test on installed device *and* Safari; do not remove the only installed app holding records without first exporting a Full Backup |
| Duplicate flight after import | Check fingerprint logic (`flightFingerprintForRecord()`) and compare against both original and confirmed corrected entries |

V1 limitations worth remembering:

- **No cloud accounts or automatic synchronisation**; data is bound to each browser/site origin.
- No automatic server-side backups, shared login or multi-user database.
- No EASA/TKA compliance certification or final regulatory acceptance of paper layout, PIC credit, revalidation/recency or correction addenda.
- Expiry dates are recorded; advanced currency/recency eligibility logic is deferred.
- Advanced statistics and cloud synchronisation are deferred to V2.
- The test-mode and main-mode data are separate but **share the same deployed JavaScript**.

## 11. Moving away from Render, GitHub, or the original developer

**If Render disappears but GitHub remains:** connect a new static-site provider (for example Cloudflare Pages or Netlify) to the repository or upload the source files. Configure the output/publish directory to the repository root; there is no build pipeline to recreate. Enable HTTPS, confirm `index.html`, manifest, service worker and icons load, then restore saved flight data from Full Backup in the new browser origin.

**If GitHub disappears but an offline ZIP/clone exists:** upload the preserved source to another Git provider or static web host. A clone includes history if its `.git` directory was retained; a ZIP normally contains only the snapshot. Run the app locally and recover website hosting as above.

**If the original developer or ChatGPT disappears:** any competent JavaScript/web developer can take over. Give them this repository, this guide, the current Render configuration, a description of the bug, and **an anonymised test backup**—never send personal flight/medical records unless genuinely necessary and transferred securely.

**If everything except an offline source archive and JSON backup disappears:** the app can still be rehosted; the backup can restore records (subject to compatibility). If the source survives but there is no backup or intact original browser profile, source control alone cannot recover real flight data.

## 12. Handover checklist for a future maintainer

- [ ] Confirm GitHub/Render ownership, 2FA and recovery methods; **do not store credentials or tokens in this public repo**.
- [ ] Clone and run the app on localhost; identify the current live commit.
- [ ] Understand that browser `localStorage` contains private pilot records; inspect only anonymised test records during routine development.
- [ ] Make and verify a safety backup before any migration, restore, reset, or code change that may alter stored records.
- [ ] Run the [release checklist](RELEASE-CHECKLIST.md) and verify Main/Test isolation.
- [ ] Never silently alter confirmed paper archive snapshots or correction history.
- [ ] Respect 24-hour time, `DD-MM-YYYY` display, ISO storage, integer-minute durations, ICAO aircraft designators and simulator isolation.
- [ ] Recheck Render settings and deployed commit. Test the installed PWA separately.
- [ ] Keep a changelog/release note in commits or docs and preserve the signed paper originals.
- [ ] Verify any regulatory claims with competent authorities instead of assuming the prototype is approved.

## 13. Planned work (intentionally deferred)

**V1 finalisation:** user feedback from a practising helicopter pilot, paper layout/regulatory review, bug fixing, full end-to-end browser/PWA and backup/restore testing, release candidate freeze. No major new features are currently planned for V1.

**V2 candidates:** secure accounts and cloud synchronisation, server-side backup, advanced experience statistics, expiry notifications and validated recency/currency rules, stronger audit trails/signatures and maintainable modular architecture. These are ideas, **not** implemented V1 functions or promises of regulatory approval.

---

**Maintenance rule of thumb:** **Never sacrifice flight-data integrity to make a UI update easier.** Source code can be rolled back using Git; user records and manually signed pages often cannot.
