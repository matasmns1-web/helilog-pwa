# HeliLog — Release, Test & Emergency Recovery Checklist

**Baseline:** V1.43 · 13 October 2026  
**Detailed handover:** [Developer & Maintenance Guide](MAINTENANCE.md)  
**Repository:** https://github.com/matasmns1-web/helilog-pwa  
**Live:** https://helilog-pwa.onrender.com

> Always distinguish **source-code recovery** from **flight-record recovery**. GitHub stores code; live records are stored in the user's browser and require separate JSON Full Backups.

## A. Before every risky change or public release

- [ ] Identify GitHub `main` commit and the currently **Live** Render deployment SHA.
- [ ] Download a **MAIN HeliLog Full Backup JSON**. Verify it is a readable file saved outside the current device. Do not commit it to GitHub (the repository is public).
- [ ] Preserve other recent backups and signed paper logbook batches / addenda.
- [ ] Create a feature/bugfix branch; edit there before merging. For riskier data changes, use a **separate preview origin** so broken JS cannot run against live browser storage.
- [ ] Write down what changed, which functions are affected, and whether existing stored records need a migration.
- [ ] Confirm that the change does not rename `helilog_v111`, `helilog_v142_sandbox` or `helilog_v142_mode`.
- [ ] Confirm that confirmed archive batches and correction addenda remain readable and immutable.

## B. Developer smoke test

- [ ] Start the repository with `python -m http.server 8000` (or Windows `py -m http.server 8000`) and open http://localhost:8000.
- [ ] Page and all main views load without Console errors.
- [ ] Test a fresh `main` / production-shaped *empty* dataset locally or in an isolated preview host (do **not** reset a real main logbook).
- [ ] Main/Test switch and return work correctly; user data keys do not cross-contaminate.
- [ ] The test banner is visible; fictional data is clearly labelled in print output.
- [ ] Create a normal helicopter flight; enter 24-hour times, DD-MM-YYYY date, route, ICAO type, pilot function, take-offs/landings, Night/IFR, Cross-country and remarks.
- [ ] Invalid dates/times and durations greater than the flight are rejected; the form remains editable.
- [ ] Tick/untick Instructor time and specialised operations; verify numeric minutes and totals.
- [ ] Edit the unarchived flight and check the result; delete a test flight; check the duplicate warning.
- [ ] Enter a separate FNPT/FTD/FFS simulator session and verify `stdMin` is excluded from actual helicopter flight/PIC totals.
- [ ] Confirm reported Total, PIC, Co-pilot, Dual, Instructor, Night, IFR and ICAO breakdowns have no double counting.
- [ ] Test Logbook filters and CSV import/export on fictional data.
- [ ] Run **Profile → Data integrity check** and review every error.
- [ ] Confirm licence/medical/ratings dates display **DD-MM-YYYY** but store ISO `YYYY-MM-DD`.

## C. Paper archive / correction regression

Use disposable **Test Mode** records (or a separate preview origin), **never real signed pages**.

- [ ] Generate 48 fictional records; verify 46 helicopter flights, 2 simulator sessions and 4 A4 pages at 14 rows/page.
- [ ] Preview page numbering, A4 landscape, 12 mm margins, 26-column paper layout, simulator blank flight columns, totals, and unused-row hatching.
- [ ] Confirm first batch only after pretending to print/check/sign **test** pages; verify the batch is frozen and archived entries cannot be silently edited/deleted.
- [ ] Confirm successive batch page numbers and brought-forward hours are continuous.
- [ ] Propose an archived flight correction (example 1:00 → 1:30): reason required, original snapshot unchanged, pending revision does not change totals.
- [ ] Preview the separate correction addendum; confirm printed/signed in Test Mode; verify the electronic flight reflects +0:30.
- [ ] Confirm new archive batches carry the correction adjustment **once**. Reprint the earlier batch and verify its original flight time and totals are unchanged.
- [ ] Correct an archived simulator session (example 2:15 → 3:00) and verify a +0:45 STD adjustment with no flight-time increase.
- [ ] Reprint a confirmed correction addendum; verify text and before/after values remain unchanged.
- [ ] Verify pending unsigned addenda block the confirmation of another paper batch.
- [ ] Run the integrity checker again and investigate all errors, including batch continuity and correction ledger problems.

## D. Full Backup / restore verification

- [ ] Download a **TEST** Full Backup (JSON) and confirm it includes `format: "helilog-full-backup"`, `backupSchema: 2`, `environment: "test"`, SHA-256 checksum and complete state.
- [ ] On *disposable sandbox data only*, edit a test record, restore the backup, and compare flight counts, totals, simulator durations, print snapshots and corrections.
- [ ] Test that a wrongly targeted production-labelled backup is **rejected** in Test Mode; don't test by risking live production data.
- [ ] Verify that restoring requires a safety-backup download and confirmation.
- [ ] Test recovery on a separate browser/origin; remember data **does not sync** automatically.
- [ ] Keep backups private; they can contain flight and medical information, personal names and signatures.
- [ ] Avoid using the destructive **Initialize empty MAIN logbook** button in any routine release test.

## E. Deploy and verify

- [ ] Change version labels in `index.html` for actual app releases (currently V1.43); for asset/code changes, bump `const CACHE` in `service-worker.js` (currently `helilog-v1-43-shell`).
- [ ] Review Git diff: no unintentional changes to storage keys, migrations, confirmed batches, paper calculations or service-worker scope.
- [ ] Merge/commit to `main`. Render's current setting is **autoDeploy: yes, commit trigger**; monitor its Deploys page. If settings change, use the manual Deploy action as appropriate.
- [ ] Confirm the deployed **commit SHA** and **Live** status; smoke-test https://helilog-pwa.onrender.com.
- [ ] Reload desktop and installed iOS PWA; verify the expected version and no stale service-worker assets.
- [ ] In **Test Mode**, check Logbook, Totals, Print Archive and backup interactions.
- [ ] Check the **MAIN** mode still shows the same original records and signed archive history.
- [ ] Record release date, commit ID, change summary, smoke-test result and location of offline recovery materials.

**Docs-only update:** it may trigger a Render rebuild/redeploy because GitHub `main` is watched. Do not bump the app or PWA cache solely for documentation.

## F. Emergency playbooks

### 1. HeliLog opens, but the data looks wrong or missing

1. **Stop using the app**: do not import, reset, clear site data or uninstall.
2. Check that the **MAIN** logbook is selected, not Test Mode.
3. Verify the exact browser/browser profile and `https://helilog-pwa.onrender.com` origin.
4. Check **Profile → Data integrity check** without changing records.
5. If needed, use DevTools → Application/Storage → Local Storage to inspect `helilog_v111`; **preserve a private copy** of raw bytes before attempting repairs.
6. Locate your last verified Full Backup, compare dates/counts, and decide whether a restore is appropriate.
7. Do not restore older data blindly: doing so could overwrite newer valid flights or signed corrections.

### 2. A release breaks the interface

1. Note failing URL, time, version, Render deploy ID/commit, steps to reproduce and any Console errors.
2. Preserve a Full Backup if the app can still export it. If the app is unusable, preserve raw browser storage without editing it.
3. Revert the offending Git change or redeploy the previous known-good commit, checking Render's actual deploy result.
4. Refresh carefully. **Do not “clear all site data” to fix the cache**, as it may delete `localStorage` records.
5. If a data migration ran, a code rollback alone may not undo it; treat the JSON backup and original localStorage value as recovery assets.
6. Replicate the failure on a disposable test origin before retrying the fix.

### 3. Render is down or the URL no longer exists

1. Clone or download GitHub source to a computer; keep the old domain/browser profile intact if possible.
2. Host static files on another HTTPS static web host; publish the repository root (no backend or database required).
3. Check `index.html`, `service-worker.js`, `manifest.webmanifest` and icons are served.
4. Visit the **new domain**, restore the last valid Full Backup via the app and run integrity/totals/print checks.
5. A new domain has different browser storage. Signed paper originals are still separate physical records.

### 4. GitHub is unavailable

1. Retrieve the offline repository ZIP or clone. A ZIP preserves the source snapshot; a clone with `.git` preserves history.
2. Upload it to a new Git provider or static host; verify the last application commit and build settings.
3. Keep the original browser records or JSON backup separate. Hosting source does not recreate records.

### 5. Computer or iPhone is lost

1. Install or open HeliLog from a new trusted browser and restore the last saved **MAIN** Full Backup.
2. Without a prior JSON backup, other device with intact data, or recoverable browser profile, the GitHub source alone cannot reconstruct the flight log.
3. Recreate any flights added after the backup **only using verified independent sources**, maintaining traceable entries and any paper-logbook correction requirements.

## G. Immediate escalation issues

Stop making record-changing updates and enlist a developer if:

- Confirmed archive snapshots, page numbers, corrections or opening/closing totals become inconsistent.
- Browser data cannot be parsed or exported safely, or quota/write verification fails.
- Restores show checksum failures or incomplete data.
- You cannot confidently identify the source of a timestamp/duration discrepancy.
- A change appears to mix Test Mode and Main records.
- A legal/regulatory question is being answered solely by the prototype rather than a qualified authority.

**Never publish production JSON backups, personal pilot data or credentials in this public GitHub repository.**

---

This is a **human-run verification checklist**, not an automated test suite. If the project grows beyond V1, write automated tests for date arithmetic, storage migrations, totals, correction ledger invariants, import/export and PWA lifecycle before making high-risk changes.
