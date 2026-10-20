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
