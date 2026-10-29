/* V2.24 — neutral form guidance for pilots regardless of country or aircraft. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'source/app',name),'utf8');
const aircraft=source('07-aircraft-and-people.js');
const endorsements=source('08-endorsements.js');
const profile=source('12-profile-forms.js');
const settings=source('10-settings-and-locations.js');
const totals=source('09-totals.js');
const flights=source('06-flights-and-night.js');

test('new aircraft fields have no country, manufacturer or model-specific suggestions',()=>{
  for(const id of ['reg','icao','man','model','variant']){
    const input=aircraft.match(new RegExp('<input id="'+id+'"[^>]+>'))?.[0];
    assert.ok(input,'Missing '+id+' field');
    assert.doesNotMatch(input,/placeholder=/,'Specific example remains in '+id);
    assert.match(input,/value="\$\{existing\?htmlEscape\(existing\./,'Editing must retain actual aircraft data');
    if(id!=='variant')assert.match(input,/ required /);
  }
  assert.match(aircraft,/Variant \(optional\)/);
  assert.match(aircraft,/id="engine"/);
});

test('endorsement hints are neutral; saved endorsement fields remain editable',()=>{
  assert.match(endorsements,/id="endorseTitle" required value="\$\{htmlEscape\(e\.title\|\|''\)\}" placeholder="Short description of the endorsement"/);
  assert.doesNotMatch(endorsements,/placeholder="[^"]*(?:Cabri|Guimbal|LY-|TKA)/i);
  assert.match(endorsements,/id="endorseText" required/);
  assert.match(endorsements,/id="endorseSigner" required/);
});

test('other editable pages avoid local authority and aircraft-specific placeholders',()=>{
  assert.match(profile,/id="ownAuthority" value="\$\{htmlEscape\(S\.pilot\.authority\|\|''\)\}"/);
  assert.match(profile,/id="qualName" required[^>]+placeholder="Qualification or rating name"/);
  assert.match(settings,/id="v219SiteCode"[^>]+placeholder="ICAO code or custom site ID"/);
  assert.match(totals,/class="bf-type-icao[^>]+placeholder="ICAO designator"/);
  assert.match(flights,/id="simAircraftType"[^>]+placeholder="ICAO type designator"/);
  assert.doesNotMatch(flights,/id="simDevice"/);
  for(const markup of [profile,settings,totals,flights]){
    assert.doesNotMatch(markup,/placeholder="[^"]*(?:LY-ABC|EYVI|G2CA|Cabri|Guimbal|TKA|B747-400)[^"]*"/i);
  }
});

test('test-only PWA release labels and offline cache are aligned',()=>{
  const root=__dirname;
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
  assert.match(html,/HeliLog V2\.47 — Archived Aircraft & Pilots · Test/);
  assert.equal(manifest.name,'HeliLog V2.47 — Archived Aircraft & Pilots Test');
  assert.match(worker,/helilog-v2-47-inactive-assets-1/);
  assert.match(html,/function quickAdd\(\)/);
  assert.match(html,/function saveFlight\(\)/);
});


test('current entry hints are neutral and the CSV import template is actually blank',()=>{
  const importSource=source('03-import-and-integrity.js');
  const printSource=source('05-archive-and-corrections.js');
  const op=fs.readFileSync(path.join(__dirname,'operator-rules-ui.js'),'utf8');
  assert.match(importSource,/let sample=\[IMPORT_HEADERS\];/);
  assert.doesNotMatch(importSource,/Example cross-country flight|LY-XYZ|'Matas'/);
  assert.match(printSource,/placeholder="Previous paper logbook reference"/);
  assert.match(op,/placeholder="ICAO type designator"/);
  assert.doesNotMatch(op,/placeholder="EC35"/);
});
