'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const css=read('source/base.css'),source=read('source/app/06-flights-and-night.js');
test('one-hand Quick layout uses spare viewport height rather than hardcoded shift',()=>{
 assert.match(css,/main:has\(#flightForm\.quick-entry-active\) \{\s*display:flex;\s*flex-direction:column;\s*min-height:100dvh;/);
 assert.match(css,/main:has\(#flightForm\.quick-entry-active\) \.top \{\s*margin-top:auto;/);
 assert.match(css,/padding:calc\(6px \+ env\(safe-area-inset-top\)\) 9px calc\(88px \+ env\(safe-area-inset-bottom\)\)/);
 assert.doesNotMatch(css,/main:has\(#flightForm\.quick-entry-active\)\s*\{[^}]*\btransform\s*:/);
 assert.doesNotMatch(css,/main:has\(#flightForm\.quick-entry-active\)\s*\{[^}]*\boverflow\s*:\s*hidden/);
});
test('keyboard mode cancels bottom anchoring, keeps form scrollable and Save usable',()=>{
 assert.match(css,/body\.keyboard-open main:has\(#flightForm\.quick-entry-active\) \{min-height:0;\}/);
 assert.match(css,/body\.keyboard-open main:has\(#flightForm\.quick-entry-active\) \.top \{margin-top:0;\}/);
 assert.match(css,/body\.keyboard-open #flightForm\.quick-entry-active \.actions \{position:static;\}/);
 assert.match(css,/#flightForm\.quick-entry-active \.actions \{\s*position:sticky;/);
 assert.match(css,/bottom:calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
});
test('Quick/Full, PIC, night calculations, optional fields and save path are retained',()=>{
 for(const part of ["function setFlightEntryMode(mode)","function add(editId=null,quick=false)",
   "function updateQuickPICVisibility()","function toggleQuickEntryExtras()",
   "function v218UpdateNight()","function saveFlight()","id=\"saveFlightBtn\""])
   assert.ok(source.includes(part),part);
 assert.match(source,/if\(!editing\)setFlightEntryMode\(quick\?'quick':'full'\)/);
 const worker=read('service-worker.js');
 assert.match(worker,/helilog-v2-31-1-one-hand-reach-1/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.31\.1'/);
 assert.match(read('source/index.template.html'),/HeliLog V2\.31\.1 — Compact Quick Flight · Test/);
});
