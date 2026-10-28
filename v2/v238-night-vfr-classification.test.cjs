'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const engine=require('./operator-flight-monitor.js');
const aircraft=[{id:'ec',icao:'EC35'},{id:'g',icao:'G2CA'}];
const rule=(extra={})=>({id:'nvfr',title:'Night VFR Operator',monitor:'flights:night-vfr',unit:'flights',
 minimum:3,periodDays:90,aircraftType:'EC35',configuration:'all',acceptedSources:['flight'],...extra});
const flight=(id,nightMin,ifrMin=0,extra={})=>({id,date:'2026-10-27',aid:'ec',pilotConfig:'single',
 entryType:'flight',mins:60,nightMin,ifrMin,...extra});
test('Night VFR uses recorded night minutes and zero IFR minutes; an empty IFR field also counts as zero',()=>{
 const sample=[
   flight('a',10,0),flight('b',1,undefined),flight('c',20,''),
   flight('ifr',25,35),flight('vfr-marker',20,20,{flightRules:'VFR'}),
   flight('legacy-ifr-marker',15,0,{flightRules:'IFR'}),
   flight('day',0,0),flight('negative',-1,0),flight('longer-than-flight',61,0),
   flight('other-type',20,0,{aid:'g'}),flight('sim',20,0,{entryType:'simulator'}),
   flight('old',20,0,{date:'2026-07-28'}),flight('future',20,0,{date:'2026-10-28'}),
   flight('a',60,0)
 ];
 const result=engine.assess(rule(),sample,aircraft,'2026-10-27');
 assert.equal(result.count,4);assert.equal(result.evidenceFlights,4);assert.equal(result.thresholdMet,true);
 assert.equal(result.thresholdUntil,'2027-01-25');
 assert.equal(result.certified,false);
 assert.equal(engine.assess(rule({minimum:5}),sample,aircraft,'2026-10-27').thresholdMet,false);
});
test('Unclassified older night flights count as Night VFR by the user-selected IFR-zero convention',()=>{
 const inputs=[flight('noIFR',20,0),flight('withIFR',20,10),
   flight('legacy',15,undefined),flight('blank',15,'')];
 const all=engine.assess(rule({monitor:'flights:night'}),inputs,aircraft,'2026-10-27');
 const vfr=engine.assess(rule(),inputs,aircraft,'2026-10-27');
 assert.equal(all.count,4);assert.equal(vfr.count,3);
});
test('Night VFR counts distinct flights and follows aircraft, configuration and rolling date boundaries',()=>{
 const flights=[flight('a',5,0,{pilotConfig:'single'}),
   flight('b',15,0,{pilotConfig:'multi'}),flight('a',25,0)];
 assert.equal(engine.assess(rule(),flights,aircraft,'2026-10-27').count,2);
 assert.equal(engine.assess(rule({configuration:'single'}),flights,aircraft,'2026-10-27').count,1);
 assert.equal(engine.assess(rule({configuration:'multi'}),flights,aircraft,'2026-10-27').count,1);
 assert.equal(engine.assess(rule({aircraftType:'G2CA'}),flights,aircraft,'2026-10-27').count,0);
});
test('Invalid IFR time does not create false Night VFR credit; any positive IFR minutes exclude the flight',()=>{
 const list=[flight('day',0,0),flight('ifr',10,10),flight('ifr-half',25,1),
 flight('negative',20,-1),flight('nan',20,'bad'),flight('too-large',20,65),
 flight('fraction',20,1.5),flight('verified-zero',20,0)];
 assert.equal(engine.assess(rule(),list,aircraft,'2026-10-27').count,1);
 assert.equal(engine.assess(rule({monitor:'flights:night'}),list,aircraft,'2026-10-27').count,7);
});
test('Flight entry and detail have Night and IFR time but no new flight-rules selector or recorded field',()=>{
 const source=fs.readFileSync(path.join(__dirname,'source/app/06-flights-and-night.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 const template=fs.readFileSync(path.join(__dirname,'source/index.template.html'),'utf8');
 const sw=fs.readFileSync(path.join(__dirname,'service-worker.js'),'utf8');
 for(const s of [source,html]){
   assert.doesNotMatch(s,/<select id="flightRules">|flightRules:flightRules|#\('flightRules'\)/);
   assert.match(s,/id="nightMin"/);assert.match(s,/id="ifrMin"/);
   assert.match(s,/nightMin:night,/);assert.match(s,/ifrMin:ifr,/);
   assert.match(s,/return recordArchiveCorrection\(editingFlightId,f,/);
 }
 assert.match(template,/operator-flight-monitor\.js\?v=2\.40/);
 assert.match(sw,/operator-flight-monitor\.js\?v=2\.40/);
});
test('Operator monitor remains read-only and makes no EASA flight-rule certification claim',()=>{
 const src=fs.readFileSync(path.join(__dirname,'operator-flight-monitor.js'),'utf8');
 assert.match(src,/ifr===0/);
 assert.doesNotMatch(src,/localStorage\.setItem|\.insert\(|\.delete\(/);
 assert.match(src,/independently establish/);
});
