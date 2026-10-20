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
node --test scripts/v2-build.test.cjs
```

The build uses only built-in Node.js modules; no package installation is needed. `--check` fails if the committed `v2/index.html` is stale, and runs in staging CI alongside the existing regression suite. After a source edit, regenerate and commit **both** the source and its matching `index.html`.

## Release guardrails

1. Work on the test/development branch; verify the build and all maintained V2 tests.
2. Deploy to the **test Render service only**, and verify mobile, offline navigation, account sync, flights, archives, endorsements, and export/print as relevant.
3. Only after test approval, prepare a separate production candidate with the existing production release gate. Keep the test and production Supabase projects separated.
4. Changes to printed logbook formats, existing data migration, or archive integrity are **out of scope** for this source reorganization and require dedicated review and tests.

V2.21 is a maintenance milestone; the visible V2.20 version label and cache revision are intentionally unchanged because the generated app code has not changed.
