/* V2.20 — presentation-only Dark Cockpit release safety checks. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html');
const css=read('dark-cockpit.css');
const sw=read('service-worker.js');
const manifest=JSON.parse(read('manifest.webmanifest'));

test('Dark Cockpit remains visible and the current release is test-only',()=>{
  assert.match(html,/<title>HeliLog V2\.36\.2 — Linked Operator Recency · Test<\/title>/);
  assert.match(html,/class="brand-version">V2\.36\.2 · TEST ENVIRONMENT/);
  assert.match(html,/class="nav-group-label">Flight operations/);
  assert.match(html,/class="nav-group-label">Records &amp; assets/);
  assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.36\.2'/);
  assert.match(manifest.name,/V2\.36\.2 — Linked Operator Recency Test/);
  assert.equal(manifest.background_color,'#090f1b');
});

test('Dark Cockpit stylesheet is screen-only and has responsive navigation and accessible focus',()=>{
  assert.match(html,/<link rel="stylesheet" href="\.\/dark-cockpit\.css\?v=2\.20-cockpit-3" media="screen">/);
  assert.match(css,/^@media screen \{/m);
  assert.match(css,/--cockpit-accent:\s*#43d6c5/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media \(max-width:850px\)/);
  assert.match(css,/\.mobile button\.on/);
  assert.match(css,/\.v23-auth-card/);
  assert.match(css,/#signatureCanvas \{background:#fff/);
  assert.match(html,/field\.style\.background='#f3f4f6'/);
  assert.match(css,/\.field input\[readonly\]:not\(\[type=checkbox\]\)/);
  assert.match(css,/background:#203746 !important/);
  assert.match(css,/\.field input\[type=checkbox\],\.field input\[type=radio\]/);
  assert.match(css,/min-height:18px/);
  assert.doesNotMatch(css,/@media\s+print/);
  assert.doesNotMatch(css,/display:\s*none\s*!important\s*;?\s*\}/);
});

test('Offline shell includes the new stylesheet and retains every prior functional asset',()=>{
  assert.match(sw,/helilog-v2-36-2-linked-operator-recency-1/);
  assert.match(sw,/\.\/dark-cockpit\.css\?v=2\.20-cockpit-3/);
  for(const asset of ['night-calculation','aerodrome-lookup','cloud-config',
    'cloud-foundation','cloud-sync','auth-gate','archive-integrity','cloud-backups']) {
    const ref='./'+asset+'.js?v=2.19-locations-1';
    assert.ok(sw.includes(ref),'Offline shell missing '+ref);
    assert.ok(html.includes(ref),'Index missing '+ref);
  }
  assert.match(sw,/\.\/print\.js/);
  assert.match(html,/function confirmPrintedArchive\(/);
  assert.match(html,/function printCorrectionAddendum\(/);
});
