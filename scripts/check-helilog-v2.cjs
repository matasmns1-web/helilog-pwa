#!/usr/bin/env node
/* One-command, read-only V2 test and release readiness check.
 * Production deployment remains a separate, explicitly approved operation.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Keep these categories explicit so no flight, print, archive, or security
// regression silently disappears from the deployment checks.
const GROUPS = Object.freeze([
  {
    name: 'Build integrity and test inventory',
    quick: true,
    files: [
      'scripts/v2-build.test.cjs',
      'scripts/check-helilog-v2.test.cjs',
    ],
  },
  {
    name: 'Core flights, printed records and domain behavior',
    quick: true,
    files: [
      'v2/domain.test.cjs',
      'v2/endorsement-bridge.test.cjs',
      'v2/flights.test.cjs',
      'v2/print.test.cjs',
      'v2/storage.test.cjs',
      'v2/ui.smoke.test.cjs',
      'v2/v223-quick-flight.test.cjs',
    ],
  },
  {
    name: 'Accounts, cloud synchronization and offline protection',
    files: [
      'v2/auth-sync.test.cjs',
      'v2/cloud-cache-coherence.test.cjs',
      'v2/profile-conflict.test.cjs',
      'v2/v24-sync.test.cjs',
      'v2/v25-profile-pic.test.cjs',
      'v2/v26-login-ui.test.cjs',
      'v2/v27-cloud-ui.test.cjs',
      'v2/v27-offline-conflicts.test.cjs',
    ],
  },
  {
    name: 'Archive integrity, corrections and backup recovery',
    files: [
      'v2/v28-integrity-recovery.test.cjs',
      'v2/v281-archive-readiness.test.cjs',
      'v2/v282-corrections.test.cjs',
      'v2/v283-correction-confirmation.test.cjs',
      'v2/v284-stranded-corrections.test.cjs',
      'v2/v29-backup-recovery.test.cjs',
      'v2/v210-backup-health.test.cjs',
    ],
  },
  {
    name: 'Latest interface, account safety and flight calculations',
    files: [
      'v2/v211-interface-layout.test.cjs',
      'v2/v212-account-recovery.test.cjs',
      'v2/v213-private-account-safety.test.cjs',
      'v2/v215-invitation-acceptance.test.cjs',
      'v2/v217-manual-accounts.test.cjs',
      'v2/v218-night-calculation.test.cjs',
      'v2/v219-aerodromes-utc.test.cjs',
      'v2/v220-dark-cockpit.test.cjs',
      'v2/v220-sync-pill.test.cjs',
      'v2/v224-universal-forms.test.cjs',
    ],
  },
  {
    name: 'Production separation and release safety',
    files: [
      'supabase/production/bootstrap.test.cjs',
      'scripts/production-release.test.cjs',
    ],
  },
]);

// Obsolete fixtures remain visible here until modernized. Every other V2 test
// must be in GROUPS; the inventory test detects new unclassified test files.
const LEGACY_FIXTURES = Object.freeze({
  'v2/app-web-archive.test.cjs': 'V2.11 UI expectations and pre-account archive fixture',
  'v2/cloud-foundation.test.cjs': 'pre-recovery browser mocks and superseded auth defaults',
  'v2/full-interface.test.cjs': 'old VM browser mocks before URLSearchParams and new account boot',
});

function main(args = process.argv.slice(2)) {
  if (args.length > 1 || (args.length === 1 && !['--quick', '--list'].includes(args[0]))) {
    throw new Error('Usage: node scripts/check-helilog-v2.cjs [--quick | --list]');
  }
  const quick = args[0] === '--quick';
  const groups = GROUPS.filter(group => !quick || group.quick);
  if (args[0] === '--list') {
    for (const group of GROUPS) {
      process.stdout.write(`${group.name}: ${group.files.join(', ')}\n`);
    }
    for (const [file, reason] of Object.entries(LEGACY_FIXTURES)) {
      process.stdout.write(`Legacy fixture (not a release gate): ${file} — ${reason}\n`);
    }
    return;
  }

  process.stdout.write(`HeliLog V2 ${quick ? 'quick development' : 'FULL release-readiness'} check\n`);
  // A stale generated page must fail instead of being silently regenerated.
  const buildCheck = spawnSync(process.execPath, ['scripts/build-helilog-v2.cjs', '--check'], {
    cwd: ROOT, stdio: 'inherit',
  });
  if (buildCheck.error) throw buildCheck.error;
  if (buildCheck.status !== 0) throw new Error('Generated application is stale; test deployment blocked.');

  for (const group of groups) {
    process.stdout.write(`\n===== ${group.name} =====\n`);
    // Avoid the node:test child-runner dependency so the check also runs in
    // restricted developer sandboxes; CI supports the same Node 22 flag.
    const result = spawnSync(process.execPath, ['--test', '--test-isolation=none', ...group.files], {
      cwd: ROOT, stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Release check failed: ${group.name}`);
  }

  process.stdout.write(`\nPASS: ${quick ? 'quick development' : 'full release-readiness'} checks.\n`);
  if (quick) process.stdout.write('Run without --quick before updating the test branch.\n');
  else process.stdout.write('Ready for human-reviewed deployment to the TEST environment only.\n');
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error('BLOCKED: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { GROUPS, LEGACY_FIXTURES };
