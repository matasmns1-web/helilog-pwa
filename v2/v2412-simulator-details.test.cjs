'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
test('simulator details show only simulator duration, not redundant zero actual-flight-time stat',()=>{
 const source=read('source/app/06-flights-and-night.js');
 const start=source.indexOf('function simulatorDetails(id){'),end=source.indexOf('function quickAdd(){',start);
 assert.ok(start>=0&&end>start);
 const view=source.slice(start,end);
 assert.ok(view.includes('Simulator session'));
 assert.ok(view.includes('fmt(f.stdMin)'));
 assert.ok(!view.includes('Actual flight time'));
 assert.ok(!view.includes('0:00'));
 assert.ok(view.includes('Does not add to actual helicopter flight time'));
 assert.equal(view.split('class="big"').length-1,1);
});
test('simulator time stays distinct from helicopter flight time',()=>{
 const source=read('source/app/06-flights-and-night.js');
 assert.ok(source.includes("entryType:'simulator'"));
 assert.ok(source.includes('mins:0'));
 assert.ok(source.includes('simAircraftType,simPilotConfig'));
 assert.ok(read('source/index.template.html').includes('V2.45 — Stability & Refinement'));
 assert.ok(read('service-worker.js').includes('helilog-v2-45-stability-1'));
});
