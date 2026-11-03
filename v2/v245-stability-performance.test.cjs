'use strict';
/* v2.45 first increment: correction lookup, date ranges and filtering. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const pathTo=name=>path.join(__dirname,'source/app/',name);
const corrections=fs.readFileSync(pathTo('05-archive-and-corrections.js'),'utf8');
const pages=fs.readFileSync(pathTo('02-dashboard-and-logbook.js'),'utf8');
test('confirmed archived addenda resolve once per snapshot; last signed correction wins',()=>{
 const flights=Array.from({length:1600},(_,i)=>({id:'f'+i,aid:'a',mins:i+10}));
 const before=JSON.stringify(flights),old={...flights[18]},corrected={...flights[18],mins:88};
 const last={...flights[18],mins:101};
 const data={flights,printArchive:{corrections:[
   {flightId:'f18',confirmedAt:'2026-01-01',before:old,after:corrected},
   {flightId:'f18',confirmedAt:'2026-02-01',before:corrected,after:last},
   {flightId:'f18',confirmedAt:'',before:last,after:{...last,mins:999}},
   {flightId:'f26',confirmedAt:'',after:{...flights[26],mins:999}}
 ]}};
 const context={S:data};vm.createContext(context);vm.runInContext(corrections,context);
 let scans=0;const original=context.confirmedCorrections;
 context.confirmedCorrections=function(...args){scans++;return original(...args);};
 const values=context.effectiveFlights(data);
 assert.equal(scans,1,'Do not scan every correction for every flight');
 assert.equal(values.length,1600);
 assert.equal(values[18].mins,101);
 assert.equal(values[26],flights[26],'Unsigned proposals cannot change effective flight');
 assert.equal(values[17],flights[17],'Uncorrected flights retain identity');
 assert.equal(JSON.stringify(flights),before,'Stored flights must not mutate');
 assert.equal(context.effectiveFlight(flights[18],data).mins,101);
});
test('dashboard aggregates aircraft time using one effective snapshot while preserving totals',()=>{
 const flights=[
  {id:'f1',date:'2026-09-01',aid:'a',mins:40,role:'PIC'},
  {id:'f2',date:'2026-09-02',aid:'a',mins:50,role:'DUAL'},
  {id:'f3',date:'2026-09-03',aid:'b',mins:70,role:'PIC'},
  {id:'s1',date:'2026-09-04',aid:'',stdMin:90,mins:0,entryType:'simulator'}
 ];
 const S={pilot:{name:'Test Pilot'},qualifications:[],endorsements:[],
   aircraft:[{id:'a',icao:'G2CA',reg:'TEST-A'},{id:'b',icao:'R44',reg:'TEST-B'}]};
 let effectiveCount=0;
 const ctx={S,Date,app:{innerHTML:''},
  effectiveFlights:()=>{effectiveCount++;return flights},
  isSimulatorSession:f=>f.entryType==='simulator',
  calcTotals:()=>({total:160,pic:110,copilot:0,dual:50,night:0,ifr:0}),
  fmt:n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0'),
  header:()=>'<div class="top"></div>',v23AccountWorkspace:()=>true,
  TEST_MODE:false,recencySummaryMarkup:()=>'',displayDate:s=>s,
  htmlEscape:s=>String(s),ac:id=>S.aircraft.find(a=>a.id===id)};
 vm.createContext(ctx);vm.runInContext(pages,ctx);ctx.dashboard();
 assert.equal(effectiveCount,1,'The dashboard should resolve correction overlays only once');
 assert.match(ctx.app.innerHTML,/G2CA<\/b> · TEST-A<\/span><b>1:30<\/b>/);
 assert.match(ctx.app.innerHTML,/R44<\/b> · TEST-B<\/span><b>1:10<\/b>/);
 assert.match(ctx.app.innerHTML,/id="dashFlightCount">3<\/span>/);
});
test('empty search skips constructing searchable text; nonempty query retains type search',()=>{
 const flights=[
  {id:'f1',date:'2026-09-02',aid:'a',dep:'EYVI',arr:'EYKA',mins:40,role:'PIC'},
  {id:'f2',date:'2026-09-03',aid:'b',dep:'EYPA',arr:'EYVI',mins:50,role:'DUAL'}
 ];
 const controls={logSearch:{value:''}};
 const ctx={S:{aircraft:[{id:'a',icao:'G2CA',reg:'DEMO-1'},{id:'b',icao:'R44',reg:'DEMO-2'}]},
  document:{getElementById:k=>controls[k]||null},
  readEuropeanDate:()=>'',effectiveFlights:()=>flights,
  flightRemarksForDisplay:()=>{throw Error('Must not construct search text without a query');},
  Date};
 vm.createContext(ctx);vm.runInContext(pages,ctx);
 assert.equal(ctx.getFilteredFlights().length,2);
 ctx.flightRemarksForDisplay=()=>'';controls.logSearch.value='g2ca';
 const found=ctx.getFilteredFlights();
 assert.equal(found.length,1);assert.equal(found[0].id,'f1');
 controls.logSearch.value='  eyvi  ';
 assert.equal(ctx.getFilteredFlights().length,2);
});
test('calendar day ranges respect local time in positive and negative time zones',()=>{
 const script=[
  "const vm=require('node:vm'),fs=require('node:fs');",
  "const src=fs.readFileSync(process.argv[1],'utf8');",
  "class FixedDate extends Date {constructor(...a){super(...(a.length?a:[2026,9,29,9,30,0]));}}",
  "const records=['2026-09-29','2026-09-30','2026-10-29'].map((date,i)=>({id:String(i),date,mins:60}));",
  "const ctx={Date:FixedDate,effectiveFlights:()=>records,isSimulatorSession:()=>false};",
  "vm.createContext(ctx);vm.runInContext(src,ctx);",
  "process.stdout.write(ctx.dashboardPeriodFlights(30).map(f=>f.date).join(','));"
 ].join('\n');
 for(const tz of ['UTC','Europe/Vilnius','Asia/Kolkata','America/New_York']){
  const result=spawnSync(process.execPath,['-e',script,pathTo('02-dashboard-and-logbook.js')],{
   encoding:'utf8',env:{...process.env,TZ:tz}
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'2026-09-30,2026-10-29',tz);
 }
});
