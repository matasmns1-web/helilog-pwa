'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { GROUPS, LEGACY_FIXTURES } = require('./check-helilog-v2.cjs');

const root = path.resolve(__dirname, '..');

test('every V2 regression file is either a release gate or an explicitly listed legacy fixture', () => {
  const included = GROUPS.flatMap(group => group.files);
  assert.equal(new Set(included).size, included.length, 'duplicate test file in release check');
  for (const file of included) assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
  const actual = fs.readdirSync(path.join(root, 'v2'))
    .filter(file => file.endsWith('.test.cjs')).map(file => `v2/${file}`);
  const classified = included.filter(file => file.startsWith('v2/')).concat(Object.keys(LEGACY_FIXTURES));
  assert.deepEqual(classified.sort(), actual.sort(), 'a V2 test is missing from the release inventory');
  for (const reason of Object.values(LEGACY_FIXTURES)) assert.ok(reason.length > 15);
});

test('quick checks protect source integrity and print/flight behavior', () => {
  const quick = GROUPS.filter(group => group.quick).flatMap(group => group.files);
  for (const required of ['scripts/v2-build.test.cjs', 'v2/domain.test.cjs',
    'v2/flights.test.cjs', 'v2/print.test.cjs', 'v2/ui.smoke.test.cjs']) {
    assert.ok(quick.includes(required), required);
  }
});

test('full checks include cloud, archives, new features and production isolation', () => {
  const full = GROUPS.flatMap(group => group.files);
  for (const required of ['v2/auth-sync.test.cjs', 'v2/v28-integrity-recovery.test.cjs',
    'v2/v29-backup-recovery.test.cjs', 'v2/v219-aerodromes-utc.test.cjs',
    'supabase/production/bootstrap.test.cjs', 'scripts/production-release.test.cjs']) {
    assert.ok(full.includes(required), required);
  }
  assert.equal(GROUPS.at(-1).name, 'Production separation and release safety');
});
