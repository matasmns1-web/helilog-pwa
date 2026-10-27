'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const src=read('source/app/06-flights-and-night.js');
const css=read('source/base.css');
const guide=read('source/app/13-help-guide.js');
test('compact mobile Quick form keeps paired fields, UTC controls and visible primary action',()=>{
 assert.match(src,/class="formgrid quick-flight-identification"/);
 assert.match(src,/class="formgrid quick-flight-function"/);
 assert.match(src,/class="formgrid quick-flight-movements"/);
 assert.match(src,/class="formgrid quick-flight-conditions"/);
 assert.match(src,/europeanDateField\('date','',true\)/);
 for(const field of ['aid','dep','off','arr','on','mins','role','toDay','toNight','nightMin','ifrMin'])
  assert.match(src,new RegExp('id="'+field+'"'),field);
 assert.match(src,/id="saveFlightBtn"[^>]*onclick="saveFlight\(\)"/);
 assert.match(css,/#flightForm\.quick-entry-active \.formgrid\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/main:has\(#flightForm\.quick-entry-active\) \.top h1/);
 assert.match(css,/bottom:calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
 assert.match(css,/body\.keyboard-open #flightForm\.quick-entry-active \.actions \{position:static;\}/);
});
test('quick hides instructions but preserves core validation errors and unavailable night warning',()=>{
 assert.match(css,/#flightForm\.quick-entry-active \.quick-entry-hint/);
 assert.match(css,/#flightForm\.quick-entry-active #nightCalcStatus/);
 assert.match(css,/#flightForm\.quick-entry-active \.quick-entry-night-note:not\(\[hidden\]\)/);
 assert.match(src,/updateQuickNightNotice\(outcome\)/);
 assert.match(src,/updateQuickNightNotice\(\{ok:true\}\)/);
 assert.match(src,/if\(!nightPreview\.ok\) return showFormError/);
 assert.doesNotMatch(css,/#flightForm\.quick-entry-active \.errorbox\s*\{\s*display:none/);
 assert.doesNotMatch(css,/#flightForm\.quick-entry-active \.field-error\s*\{\s*display:none/);
});
test('routine PIC or SOLO hides only the redundant automatic SELF field',()=>{
 assert.match(src,/function updateQuickPICVisibility\(\)/);
 assert.match(src,/form\.classList\.toggle\('quick-pic-self',\['PIC','SOLO'\]\.includes\(role\)\)/);
 assert.match(css,/#flightForm\.quick-entry-active\.quick-pic-self \.quick-pic-field \{display:none!important;\}/);
 assert.match(src,/function roleChanged\(\)/);
 assert.match(src,/field\.value='SELF'/);
 assert.match(src,/updateQuickPICVisibility\(\);/);
});
test('optional cross-country and remarks can expand without removing their form fields',()=>{
 assert.match(src,/id="quickExtraToggle"[^>]*aria-expanded="false"[^>]*aria-controls="quickExtraFields quickRemarks"/);
 assert.match(src,/id="quickExtraFields" class="checkbox-row quick-entry-optional"/);
 assert.match(src,/id="quickRemarks" class="field quick-entry-optional"/);
 assert.match(src,/function toggleQuickEntryExtras\(\)/);
 assert.match(css,/#flightForm\.quick-entry-active:not\(\.quick-entry-extra-open\) \.quick-entry-optional \{display:none!important;\}/);
 assert.match(css,/#flightForm\.quick-entry-active\.quick-entry-extra-open \.quick-entry-optional \{display:flex;\}/);
 assert.match(src,/let dayLandingOverridden=existing/);
 assert.match(src,/const specialOps=collectSpecialOps\(m\)/);
 assert.match(src,/const signature=flightFingerprintForRecord\(f\)/);
});
test('full flight entry and editing are unaffected by the quick-only selectors',()=>{
 assert.match(css,/#flightForm\.quick-entry-active \.section-title/);
 assert.match(src,/if\(!editing\)setFlightEntryMode\(quick\?'quick':'full'\)/);
 assert.match(src,/if\(!form \|\| editingFlightId\)return/);
 assert.match(css,/#flightForm \.quick-entry-extras-switch \{display:none;\}/);
 assert.match(src,/saveFlight\(\)/);
});
test('Help Guide explains compact and full entry limitations without promising all screen sizes',()=>{
 for(const word of ['V2.34.1','compact Quick Flight','Small screens','Save stays above','Cross-country & remarks'])
  assert.ok(guide.includes(word),word);
});
test('PWA is versioned for Quick Flight update and production remains gated',()=>{
 const html=read('source/index.template.html'),worker=read('service-worker.js');
 assert.match(html,/HeliLog V2\.40 — Operator Recency Cloud Sync · Test/);
 assert.match(worker,/helilog-v2-40-evidence-1/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.40'/);
});
