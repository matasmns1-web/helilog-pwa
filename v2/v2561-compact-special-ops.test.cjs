'use strict';
/* V2.57: show historical operation columns only when any operation has
 * positive brought-forward time. This is a read-only presentation rule. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const source=read('source/app/09-totals.js');
const from=source.indexOf('function totals(){'),to=source.indexOf('\nfunction editBroughtForwardTotals()',from);
assert.ok(from>=0&&to>from,'Totals renderer exists');
const render=source.slice(from,to);
const op=(code,previous,recorded)=>({
 code,label:code+' — example operation',flights:1,previousMinutes:previous,
 recordedMinutes:recorded,minutes:previous+recorded,counter:'flights',
 total:1,day:0,night:0,unrecorded:0
});
function page(ops){
 const original=JSON.stringify(ops),app={innerHTML:''};
 const context={app,window:{},Number,Math,Map,String,Object,
  calcTotals:()=>({}),combinedTotalsByType:()=>[],
  specialisedTotals:()=>ops,
  effectiveFlights:()=>[{id:'f1',aid:'a1',specialOps:{HEMS:60,HAA:30}}],
  isSimulatorSession:()=>false,
  confirmedCorrections:()=>[],header:()=>'',fmt:n=>{
   const v=Number(n||0);return Math.floor(v/60)+':'+String(v%60).padStart(2,'0');
  },previousEngineUnallocated:()=>0,previousPilotUnallocated:()=>0,
  htmlEscape:v=>String(v),ac:()=>({icao:'EC35'})
 };
 vm.createContext(context);
 vm.runInContext(render,context);
 vm.runInContext('totals()',context);
 assert.equal(JSON.stringify(ops),original,'Totals must not change operation records');
 const html=app.innerHTML;
 const thead=html.match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/)?.[1];
 const tbody=html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
 return {html,thead,tbody};
}
test('no previous hours: only one Hours column and no duplicated previous/combined totals',()=>{
 const {html,thead,tbody}=page([op('HEMS',0,60),op('HAA',0,30)]);
 assert.ok(thead&&tbody);
 assert.match(thead,/<th>HeliLog flights<\/th><th>Hours<\/th><th>Flights \/ cycles \/ landings<\/th>/);
 assert.doesNotMatch(thead,/<th>Previous<\/th>|<th>Recorded here<\/th>|<th>Combined<\/th>/);
 assert.match(tbody,/<td>1<\/td><td><b>1:00<\/b><\/td>/);
 assert.match(tbody,/<td>1<\/td><td><b>0:30<\/b><\/td>/);
 assert.doesNotMatch(html,/Previous-logbook hours are separate/);
 assert.doesNotMatch(html,/Historical hours have no associated cycle counts/);
});
test('any historical hours: show all historical columns for every category',()=>{
 const {html,thead,tbody}=page([op('HEMS',30,60),op('HAA',0,30)]);
 assert.match(thead,/<th>Previous<\/th><th>Recorded here<\/th><th>Combined<\/th>/);
 assert.doesNotMatch(thead,/<th>Hours<\/th>/);
 assert.match(tbody,/<td>1<\/td><td>0:30<\/td><td>1:00<\/td><td><b>1:30<\/b><\/td>/);
 assert.match(tbody,/<td>1<\/td><td>0:00<\/td><td>0:30<\/td><td><b>0:30<\/b><\/td>/);
 assert.match(html,/Previous-logbook hours are separate/);
 assert.match(html,/Historical hours have no associated cycle counts/);
});
test('no operation totals still shows the standard empty-state notice',()=>{
 const {html}=page([]);
 assert.match(html,/No specialised operations recorded yet/);
 assert.doesNotMatch(html,/<th>Previous<\/th>|<th>Combined<\/th>/);
});
test('app version/cache and help describe the display-only change',()=>{
 assert.match(read('source/index.template.html'),/HeliLog V2\.57 — Flight Statistics · Test/);
 assert.match(read('index.html'),/V2\.57 · TEST ENVIRONMENT/);
 assert.match(read('manifest.webmanifest'),/HeliLog V2\.57 — Flight Statistics Test/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.57'/);
 assert.match(read('service-worker.js'),/helilog-v2-57-flight-statistics-1/);
 assert.match(read('source/app/13-help-guide.js'),/v:"V2\.57\.1",name:"Hide empty previous operation hours"/);
});
