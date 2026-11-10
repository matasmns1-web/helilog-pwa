'use strict';
/* V2.56: HEMS/HAA are independently tagged flight-hour subsets, not cycles
 * or regulatory endorsements. No changes to archived flight snapshots.
 */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const domain=read('source/app/01-domain-and-navigation.js');
const flight=read('source/app/06-flights-and-night.js');
const totals=read('source/app/09-totals.js');
const guide=read('source/app/13-help-guide.js');
function section(src,start,end){
 const i=src.indexOf('function '+start+'(');
 const j=src.indexOf('\nfunction '+end+'(',i+1);
 assert.ok(i>=0&&j>i,start+' must be a standalone function');
 return src.slice(i,j);
}
const ops=[{code:'HEMS',label:'HEMS — Emergency medical service (EASA)'},
 {code:'HAA',label:'HAA — Helicopter air ambulance (FAA Part 135)'}];
test('separate EASA HEMS and FAA HAA keys remain plain tracked-time subsets',()=>{
 assert.match(domain,/\{code:'HEMS',label:'HEMS — Emergency medical service \(EASA\)'\}/);
 assert.match(domain,/\{code:'HAA',label:'HAA — Helicopter air ambulance \(FAA Part 135\)'\}/);
 const ctx={SPECIAL_OP_KEYS:new Set(['HEMS','HAA']),Number,Object};
 vm.createContext(ctx);
 vm.runInContext(section(domain,'validSpecialOps','specialOpsAnnotation'),ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.validSpecialOps({HEMS:45,HAA:60},90))),{
  valid:true,ops:{HEMS:45,HAA:60}});
 assert.equal(ctx.validSpecialOps({HEMS:91},90).valid,false);
 assert.equal(ctx.validSpecialOps({HEMS:-1},90).valid,false);
 assert.equal(ctx.validSpecialOps({HAA:1.5},90).valid,false);
 assert.equal(ctx.validSpecialOps({UNKNOWN:1},90).valid,false);
});
test('previous + recorded HEMS and HAA hours are separate, count qualifying tagged flights once',()=>{
 const flights=[{id:'one',specialOps:{HEMS:45},mins:60},
 {id:'two',specialOps:{HEMS:0,HAA:30},mins:30},
 {id:'three',specialOps:{HAA:20},mins:45}];
 const ctx={S:{broughtForward:{specialOps:{HEMS:120,HAA:60}}},
  SPECIAL_OPS:ops,effectiveFlights:()=>flights,Number,Object};
 vm.createContext(ctx);
 vm.runInContext(section(domain,'specialisedTotals','broughtForwardInputMinutes'),ctx);
 const sums=JSON.parse(JSON.stringify(ctx.specialisedTotals()));
 const hems=sums.find(x=>x.code==='HEMS'),haa=sums.find(x=>x.code==='HAA');
 assert.equal(hems.flights,2);assert.equal(hems.previousMinutes,120);
 assert.equal(hems.recordedMinutes,45);assert.equal(hems.minutes,165);
 assert.equal(hems.counter,'flights');assert.equal(hems.total,2);assert.equal(hems.unrecorded,0);
 assert.equal(haa.flights,2);assert.equal(haa.previousMinutes,60);
 assert.equal(haa.recordedMinutes,50);assert.equal(haa.minutes,110);
 assert.equal(haa.counter,'flights');assert.equal(haa.total,2);assert.equal(haa.unrecorded,0);
});
test('medical operations have a time input and automatic flight count, no mandatory cycle inputs',()=>{
 assert.match(flight,/Medical flights/);
 assert.match(flight,/\['NVIS','HEMS','HAA'\]\.includes\(op\.code\)/);
 assert.match(flight,/medical-operation hours and flights, not cycles/i);
 assert.match(flight,/minutes>totalMinutes/);
 const ctx={SPECIAL_OPS:ops,document:{getElementById:id=>({checked:true})}};
 vm.createContext(ctx);
 vm.runInContext(section(flight,'collectSpecialOpCycles','toggleRecencyEvidence'),ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.collectSpecialOpCycles(0))),{});
 assert.match(totals,/if\(op\.counter==='flights'\)item\.total\+\+/);
 assert.match(totals,/Previous<\/th><th>Recorded here<\/th><th>Combined/);
});
test('help explains regulatory distinctions; no invented HEMS/HAA recency or new cloud schema',()=>{
 assert.match(guide,/HEMS \(EASA\) and HAA \(FAA Part 135\)/);
 assert.match(guide,/no HeliLog recency counter/);
 assert.match(guide,/v:"V2\.57",name:"HEMS and HAA hours and flights"/);
 assert.match(read('source/app/03-import-and-integrity.js'),/validSpecialOps\(data,total\)/);
 assert.match(read('source/app/09-recency.js'),/Recency|recency/);
 assert.doesNotMatch(read('special-recency.js'),/HEMS|HAA/);
 assert.match(read('index.html'),/V2\.57 · TEST ENVIRONMENT/);
 assert.match(read('manifest.webmanifest'),/HeliLog V2\.57 — Flight Statistics Test/);
 assert.match(read('service-worker.js'),/helilog-v2-57-flight-statistics-1/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.57'/);
});
