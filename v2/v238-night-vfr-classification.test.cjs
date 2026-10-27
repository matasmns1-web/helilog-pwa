'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=require('./operator-flight-monitor.js');
const aircraft=[{id:'ec',icao:'EC35'},{id:'g',icao:'G2CA'}];
const rule=(extra={})=>({id:'nvfr',title:'Night VFR Operator',monitor:'flights:night-vfr',unit:'flights',minimum:3,periodDays:90,
 aircraftType:'EC35',configuration:'all',acceptedSources:['flight'],...extra});
const flight=(id,nightMin,flightRules,extra={})=>({id,date:'2026-10-27',aid:'ec',pilotConfig:'single',entryType:'flight',
 mins:60,nightMin,flightRules,...extra});
test('Night VFR credit requires a positively recorded VFR flight with valid night minutes',()=>{
 const sample=[flight('a',10,'VFR'),flight('b',1,'VFR'),
 flight('legacy',20,undefined),flight('unspecified',20,''),flight('IFR',35,'IFR'),
 flight('day',0,'VFR'),flight('invalid-negative',-1,'VFR'),flight('too-long',61,'VFR'),
 flight('other-type',20,'VFR',{aid:'g'}),flight('sim',20,'VFR',{entryType:'simulator'}),
 flight('old',20,'VFR',{date:'2026-07-28'}),flight('future',20,'VFR',{date:'2026-10-28'}),
 flight('a',60,'VFR')
 ];
 const result=engine.assess(rule(),sample,aircraft,'2026-10-27');
 assert.equal(result.count,2);assert.equal(result.evidenceFlights,2);assert.equal(result.thresholdMet,false);
 assert.equal(result.minimum,3);assert.equal(result.certified,false);
 const satisfied=engine.assess(rule({minimum:2}),sample,aircraft,'2026-10-27');
 assert.equal(satisfied.thresholdMet,true);assert.equal(satisfied.thresholdUntil,'2027-01-25');
});
test('Legacy Night flights monitor remains independent and includes IFR/unspecified night entries',()=>{
 const inputs=[flight('vfr',20,'VFR'),flight('ifr',20,'IFR'),flight('legacy',15,undefined)];
 const all=engine.assess(rule({monitor:'flights:night'}),inputs,aircraft,'2026-10-27');
 const vfr=engine.assess(rule(),inputs,aircraft,'2026-10-27');
 assert.equal(all.count,3);assert.equal(vfr.count,1);
});
test('Night VFR is one flight per flight ID and obeys aircraft/crew configuration and rolling dates',()=>{
 const flights=[flight('a',5,'VFR',{pilotConfig:'single'}),flight('b',15,'VFR',{pilotConfig:'multi'}),flight('a',25,'VFR')];
 assert.equal(engine.assess(rule(),flights,aircraft,'2026-10-27').count,2);
 assert.equal(engine.assess(rule({configuration:'single'}),flights,aircraft,'2026-10-27').count,1);
 assert.equal(engine.assess(rule({configuration:'multi'}),flights,aircraft,'2026-10-27').count,1);
 assert.equal(engine.assess(rule({aircraftType:'G2CA'}),flights,aircraft,'2026-10-27').count,0);
});
test('Night VFR does not use IFR minutes or a purported VFR flag without night time',()=>{
 const list=[flight('i',0,'VFR',{ifrMin:60}),flight('v',10,'VFR',{ifrMin:20}),
 flight('r',10,'OTHER'),flight('uncertain',12,'vfr')];
 assert.equal(engine.assess(rule(),list,aircraft,'2026-10-27').count,1);
});
test('entry and detail forms preserve legacy unclassified and archived correction semantics',()=>{
 const src=fs.readFileSync(path.join(__dirname,'source/app/06-flights-and-night.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 assert.match(src,/<select id="flightRules">/);
 assert.match(src,/<option value="">Not specified<\/option>/);
 assert.match(src,/<option value="VFR">VFR<\/option>/);
 assert.match(src,/<option value="IFR">IFR<\/option>/);
 assert.match(src,/\$\('#flightRules'\)\.value=\['VFR','IFR'\]\.includes\(existing\.flightRules\)\?existing\.flightRules:''/);
 assert.match(src,/flightRules:flightRules,/);
 assert.match(src,/return recordArchiveCorrection\(editingFlightId,f,/);
 assert.match(src,/Record|Not specified/);
 assert.match(html,/flightRules:flightRules,/);
 assert.match(fs.readFileSync(path.join(__dirname,'source/index.template.html'),'utf8'),/operator-flight-monitor\.js\?v=2\.38/);
 assert.match(fs.readFileSync(path.join(__dirname,'service-worker.js'),'utf8'),/operator-flight-monitor\.js\?v=2\.38/);
});
