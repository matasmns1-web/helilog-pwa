'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { assemble, APP_PARTS } = require('./build-helilog-v2.cjs');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'v2', 'source');
const generated = path.join(root, 'v2', 'index.html');

test('the Render entrypoint is reproducibly generated from the maintained sources', () => {
  assert.deepEqual(Buffer.from(assemble(), 'utf8'), fs.readFileSync(generated));
  assert.doesNotMatch(assemble(), /\{\{HELILOG_(?:BASE_CSS|INLINE_JS)\}\}/);
});

test('feature source order and single-script browser semantics are preserved', () => {
  assert.ok(APP_PARTS.length >= 14);
  assert.ok(APP_PARTS.includes('13-help-guide.js'), 'guide source must be part of the build');
  assert.ok(APP_PARTS.indexOf('13-help-guide.js') < APP_PARTS.indexOf('13-routing-and-boot.js'));

  const script = APP_PARTS.map(name => fs.readFileSync(path.join(source, 'app', name), 'utf8')).join('');
  const rendered = assemble();
  const inline = rendered.match(/<script>\n([\s\S]*?)<\/script><\/body><\/html>\n?$/);
  assert.ok(inline, 'one classic inline browser entrypoint is present');
  assert.equal(inline[1], script);
  assert.match(script, /^const LIVE_KEY=/);
  assert.match(script, /v23Boot\(\);/);
  assert.doesNotThrow(() => new vm.Script(script, { filename: 'v2/index.html' }));
});

test('print and database services still use separately versioned classic assets', () => {
  const html = assemble();
  for (const filename of ['print.js', 'domain.js', 'cloud-foundation.js', 'archive-integrity.js']) {
    assert.match(html, new RegExp(`<script src="\\./${filename.replaceAll('.', '\\.')}[^\"]*"`));
  }
  assert.match(html, /<link rel="stylesheet" href="\.\/dark-cockpit\.css/);
});
