#!/usr/bin/env node
/* Assemble the checked-in HeliLog V2 static entrypoint from editable source.
 * No bundler, package install, or runtime module loading is required.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'v2', 'source');
const output = path.join(root, 'v2', 'index.html');
const APP_PARTS = Object.freeze([
  '00-startup.js',
  '01-domain-and-navigation.js',
  '02-dashboard-and-logbook.js',
  '03-import-and-integrity.js',
  '04-export-and-print.js',
  '05-archive-and-corrections.js',
  '06-flights-and-night.js',
  '07-aircraft-and-people.js',
  '08-endorsements.js',
  '09-totals.js',
  '10-settings-and-locations.js',
  '11-sandbox-and-backups.js',
  '12-profile-forms.js',
  '13-help-guide.js',
  '13-routing-and-boot.js',
]);

function read(file) {
  return fs.readFileSync(path.join(source, file), 'utf8');
}

function replaceOnce(template, placeholder, value) {
  const index = template.indexOf(placeholder);
  if (index < 0 || template.indexOf(placeholder, index + 1) >= 0) {
    throw new Error(`Expected exactly one ${placeholder} in the V2 template`);
  }
  return template.slice(0, index) + value + template.slice(index + placeholder.length);
}

function assemble() {
  const template = read('index.template.html');
  const css = read('base.css');
  const script = APP_PARTS.map(part => read(path.join('app', part))).join('');
  return replaceOnce(
    replaceOnce(template, '{{HELILOG_BASE_CSS}}', css),
    '{{HELILOG_INLINE_JS}}',
    script,
  );
}

function main() {
  const flag = process.argv[2];
  if (flag && flag !== '--check') {
    throw new Error('Usage: node scripts/build-helilog-v2.cjs [--check]');
  }
  const built = Buffer.from(assemble(), 'utf8');
  if (flag === '--check') {
    if (!fs.existsSync(output) || !fs.readFileSync(output).equals(built)) {
      throw new Error('v2/index.html is out of date. Run: node scripts/build-helilog-v2.cjs');
    }
    process.stdout.write('V2 generated index.html matches all source files (byte-for-byte).\n');
    return;
  }
  fs.writeFileSync(output, built);
  process.stdout.write('Built v2/index.html from source modules.\n');
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { assemble, APP_PARTS };
