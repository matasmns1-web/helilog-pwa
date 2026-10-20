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
