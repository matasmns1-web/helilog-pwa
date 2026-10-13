# HeliLog

**Helicopter pilot logbook — V1.43 prototype**

[Open HeliLog](https://helilog-pwa.onrender.com) · [Developer & Maintenance Guide](docs/MAINTENANCE.md) · [Release & Recovery Checklist](docs/RELEASE-CHECKLIST.md)

HeliLog is a browser-based, offline-capable PWA prototype for recording helicopter flight experience, simulator sessions and paper-logbook print archives. It is structured around an EASA-style pilot logbook but **is not a certified or authority-approved logbook or electronic signature system**. Any compliance, crediting or amendment requirements must be confirmed with the competent aviation authority.

## What V1 includes

- Helicopter flight entry and editing, 24-hour times and **DD-MM-YYYY** date display.
- ICAO aircraft designators, PIC/DUAL/Co-pilot roles, Night/IFR, instructor time, take-offs/landings, Cross-country and specialised helicopter operations.
- Dedicated simulator-session entries, kept separate from actual helicopter flight hours.
- Filterable Logbook, career Totals and brought-forward paper-logbook balances.
- CSV import/export, printable A4 landscape logbook pages and a manually confirmed, numbered print archive.
- Append-only correction addenda for already archived records, with original signed pages preserved.
- Profile, ratings/medical validity dates, pilot records, full JSON backups and data-integrity checks.
- **Test Mode:** 48 fictional entries in separate browser storage for safe functional testing.

## Read this before using it for real records

**Your flights are NOT stored on GitHub or Render.** They are stored locally in the browser or installed PWA on the device you use. A code repository backup is **not** a logbook backup.

Open HeliLog in **MAIN** mode → Profile → **Backup & restore → Download backup**. Save the downloaded JSON file securely in more than one place. Preserve original signed paper pages separately. Do not clear site data or uninstall the only installed app containing your records without first verifying a full backup.

The source repository is **public**. Never commit live logbook backups, licence/medical data, personal signatures or credentials to it.

## Start locally (no build step)

    git clone https://github.com/matasmns1-web/helilog-pwa.git
    cd helilog-pwa
    python -m http.server 8000

On Windows you may use `py -m http.server 8000`. Visit **http://localhost:8000**. Localhost has separate browser storage from the production site; test with fictional data.

| File | Purpose |
|---|---|
| `index.html` | Main app UI, CSS and JavaScript |
| `service-worker.js` | PWA/offline cache |
| `manifest.webmanifest` | Installable app metadata |
| `docs/MAINTENANCE.md` | Architecture, data safety, development, deployment, handover and recovery |
| `docs/RELEASE-CHECKLIST.md` | Regression tests, production release steps and emergency recovery playbooks |

## Hosting and future development

Hosted at [helilog-pwa.onrender.com](https://helilog-pwa.onrender.com) as a Render **Static Site** connected to the `main` branch. The site uses a static build command and publish directory `.`, with automatic deployment currently enabled. Check the actual [Render dashboard](https://dashboard.render.com/static/srv-db6b6lnlot8c739i6kl0) for deploy status and the latest commit.

**Maintenance guide for the project owner or a future developer:** [docs/MAINTENANCE.md](docs/MAINTENANCE.md).

V1 is near feature-complete; final verification of the printed format and regulatory assumptions is pending. Cloud synchronisation, automated backups, advanced statistics and regulatory currency/recency tracking are deferred to V2.

---

**A maintenance rule:** do not trade signed archive integrity or real flight data for the convenience of a code/UI change. Create and verify a Full Backup before risky changes.
