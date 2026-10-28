# HeliLog — Pilot logbook private beta

**Stable production version: V2.42**, published from the repository root at [helilog-pwa.onrender.com](https://helilog-pwa.onrender.com). Each pilot account uses the separate **HeliLog Production** Supabase project; no test accounts or records are migrated automatically.

Development and testing continue separately on branch `v2/development` at [helilog-v2-test.onrender.com](https://helilog-v2-test.onrender.com), connected to the TEST Supabase project.

**V2.42 production update (28 October 2026):** Includes previously tested recency dashboards, operator-specific recency, simulator/check/training evidence, automatic FFS evidence matching, safe account synchronization, refined simulator forms, and the cleaner Help & Guide plus automatic pre-archive checks for clean batches. No production database migration or existing record conversion. Production and TEST Supabase projects remain separate. Existing logbooks, confirmed paper archives, and the printed-page format are preserved.

**Important:** This is a private beta, not an independently EASA-approved electronic pilot logbook. Pilots should keep their authoritative logbooks and separate encrypted backups.

- **Existing V1 browser-local records** have not been deleted. Access the historical V1.43.2 interface via [legacy/v1.43.2/index.html](https://helilog-pwa.onrender.com/legacy/v1.43.2/index.html) on the **same website origin** to inspect/export earlier browser-local logbook data. Avoid entering new flights into legacy V1.
- Source rollback: Git branch `archive/v1.43.2` (original main SHA `72aad71e103044d35a71315dd8341c72aa7b05ac`).
- Staging V2 source and regressions remain under [v2/](v2/); versioned production static assets are maintained at repository root, with a separate PWA cache and backend configuration.
- Manual friends-only accounts: see [v2/V2.17-FRIENDS-BETA.md](v2/V2.17-FRIENDS-BETA.md) and use **Production Authentication → Users** to create unique accounts.
- No custom SMTP yet. Password reset/invitation emails may be unavailable to outside friends; securely distribute unique initial credentials, and use fictional data during beta.
- Security: owner RLS and private signed archives, recovery snapshots. The 7 authorized privileged RPCs still need a full independent review; do not claim complete security validation.

Do not paste database secrets or Supabase service-role keys into this repository. The committed `sb_publishable_` key in the browser client is intended to be public.
