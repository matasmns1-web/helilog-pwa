'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const css=read('source/base.css'),source=read('source/app/06-flights-and-night.js');
test('V2.34.1 Quick entry returns to natural top alignment without wasted space',()=>{
 assert.match(css,/main:has\(#flightForm\.quick-entry-active\) \{\s*display:block;/);
 assert.match(css,/main:has\(#flightForm\.quick-entry-active\) \.top \{\s*margin-top:0;/);
 assert.doesNotMatch(css,/main:has\(#flightForm\.quick-entry-active\)\s*\{[^}]*min-height:100dvh/);
 assert.doesNotMatch(css,/main:has\(#flightForm\.quick-entry-active\) \.top\s*\{\s*margin-top:auto/);
 assert.doesNotMatch(css,/main:has\(#flightForm\.quick-entry-active\)\s*\{[^}]*transform:/);
});
test('Quick header stays below translucent mobile status bar and has no blur filter',()=>{
 assert.match(css,/padding:calc\(14px \+ env\(safe-area-inset-top\)\) 9px calc\(88px \+ env\(safe-area-inset-bottom\)\)/);
 assert.match(css,/main:has\(#flightForm\.quick-entry-active\) \.top\s*\{[^}]*-webkit-backdrop-filter:none;\s*backdrop-filter:none;\s*filter:none;/);
 assert.match(css,/#flightForm\.quick-entry-active \.actions \{\s*position:sticky;/);
 assert.match(css,/body\.keyboard-open #flightForm\.quick-entry-active \.actions \{position:static;\}/);
 assert.doesNotMatch(css,/main:has\(#flightForm\.quick-entry-active\)\s*\{[^}]*overflow:hidden/);
});
test('original Quick/Full mode, PIC, night and save path are unchanged',()=>{
 for(const str of ["function setFlightEntryMode(mode)","function add(editId=null,quick=false)",
   "function updateQuickPICVisibility()","function toggleQuickEntryExtras()",
   "function v218UpdateNight()","function saveFlight()","id=\"saveFlightBtn\""])
   assert.ok(source.includes(str),str);
 assert.match(source,/if\(!editing\)setFlightEntryMode\(quick\?'quick':'full'\)/);
 assert.match(read('service-worker.js'),/helilog-v2-49-cloud-conflict-review-1/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.49'/);
 assert.match(read('source/index.template.html'),/HeliLog V2\.49 — Cloud Conflict Review · Test/);
});
