'use strict';
/* V2.57: Flight Statistics are a read-only view of corrected helicopter
 * flights, excluding previous paper hours and simulator sessions. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=pathName=>fs.readFileSync(path.join(__dirname,pathName),'utf8');
const src=read('source/app/09-flight-statistics.js');
const aircraft=[
 {id:'g1',icao:'G2CA',reg:'LY-G01',engine:'Single engine'},
 {id:'g2',icao:'G2CA',reg:'LY-G02',engine:'Single engine'},
 {id:'e1',icao:'EC35',reg:'LY-E01',engine:'Multi engine'}
];
const ops=[
 {code:'HEMS',label:'HEMS — Emergency medical service (EASA)'},
 {code:'HHO',label:'HHO — Helicopter hoist operations'},
 {code:'HAA',label:'HAA — Helicopter air ambulance (FAA Part 135)'}
];
const flights=[
 {id:'f1',entryType:'flight',date:'2026-11-05',aid:'g1',role:'PIC',mins:60,
  nightMin:20,ifrMin:0,crossCountry:true,pilotConfig:'single',takeoffDay:1,landingDay:1,
  specialOps:{HEMS:45,HHO:20}},
 {id:'f2',entryType:'flight',date:'2026-11-06',aid:'g2',role:'PICUS',mins:90,
  nightMin:0,ifrMin:40,crossCountry:false,pilotConfig:'single',takeoffDay:1,landingDay:1,
  specialOps:{HEMS:0}},
 {id:'f3',entryType:'flight',date:'2026-08-01',aid:'e1',role:'CO-PILOT',mins:120,
  nightMin:60,ifrMin:80,crossCountry:true,pilotConfig:'multi',takeoffDay:1,landingDay:1,
  specialOps:{HAA:90}},
 {id:'f4',entryType:'flight',date:'2024-12-31',aid:'e1',role:'DUAL',mins:45,
  nightMin:0,ifrMin:0,crossCountry:false,pilotConfig:'single',
  specialOps:{}},
 {id:'sim',entryType:'simulator',date:'2026-11-08',aid:'e1',role:'PIC',
  mins:1000,stdMin:1000,nightMin:1000,ifrMin:1000,specialOps:{HEMS:1000}}
];
function setup(){
 const context={Date,Number,Math,Object,String,Map,Set,Array,
  flightPilotConfig:f=>f.pilotConfig==='multi'?'multi':'single',
  engineCode:a=>a?.engine==='Multi engine'?'ME':'SE',
  htmlEscape:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  fmt:n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0')
 };
 vm.createContext(context);vm.runInContext(src,context);
 const get=(filter={},entries=flights)=>JSON.parse(JSON.stringify(
  context.flightStatsCompute(entries,aircraft,ops,filter,'2026-11-10')));
 return {context,get};
}
test('all recorded flights: no simulator, paper hours, double-counting or data mutation',()=>{
 const {get}=setup(),before=JSON.stringify(flights);
 const s=get({range:'all'});
 assert.equal(s.totals.flights,4);
 assert.equal(s.totals.minutes,315);
 assert.equal(s.totals.pic,150);
 assert.equal(s.totals.copilot,120);
 assert.equal(s.totals.dual,45);
 assert.equal(s.totals.night,80);
 assert.equal(s.totals.ifr,120);
 assert.equal(s.totals.xc,180);
 assert.equal(s.totals.engineSE,150);
 assert.equal(s.totals.engineME,165);
 assert.equal(s.totals.multi,120);
 assert.equal(s.totals.single,195);
 assert.equal(s.totals.takeoffs,3);
 assert.equal(s.simulators,1);
 assert.equal(s.byType.find(x=>x.key==='G2CA').minutes,150);
 assert.equal(s.byType.find(x=>x.key==='G2CA').flights,2);
 assert.equal(s.byType.find(x=>x.key==='EC35').minutes,165);
 assert.equal(s.byOp.find(x=>x.key==='HEMS').minutes,45);
 assert.equal(s.byOp.find(x=>x.key==='HEMS').flights,2);
 assert.equal(s.byOp.find(x=>x.key==='HHO').minutes,20);
 assert.equal(s.byOp.find(x=>x.key==='HAA').minutes,90);
 assert.equal(s.trend.find(x=>x.key==='2024').minutes,45);
 assert.equal(s.trend.find(x=>x.key==='2026').minutes,270);
 assert.equal(JSON.stringify(flights),before);
});
test('specific ICAO type joins registrations and PIC-group roles stay separate from co-pilot',()=>{
 const {get}=setup();
 const s=get({type:'G2CA',role:'PIC_GROUP'});
 assert.equal(s.totals.flights,2);
 assert.equal(s.totals.minutes,150);
 assert.equal(s.totals.pic,150);
 assert.deepEqual(s.byRole.map(x=>x.key).sort(),['PIC','PICUS']);
 assert.equal(get({type:'EC35',role:'CO-PILOT'}).totals.minutes,120);
 assert.equal(get({type:'G2CA',role:'DUAL'}).totals.flights,0);
});
test('last 90 days and 12 months use local calendar boundaries, not UTC midnight',()=>{
 const {get}=setup();
 const recent=get({range:'90'});
 assert.equal(recent.totals.flights,2);
 assert.equal(recent.totals.minutes,150);
 assert.equal(recent.bounds.from,'2026-08-13');
 assert.equal(recent.bounds.to,'2026-11-10');
 const year=get({range:'year'});
 assert.equal(year.totals.flights,3);
 assert.equal(year.bounds.from,'2026-01-01');
 assert.equal(get({range:'365'}).totals.flights,3);
 assert.equal(year.trend.length,2);
 assert.ok(year.trend.every(x=>/^\d{4}-\d{2}$/.test(x.key)));
});
test('specialised-operation filters count zero-minute tags but do not duplicate flight time',()=>{
 const {get}=setup();
 const hems=get({operation:'HEMS'});
 assert.equal(hems.totals.flights,2);
 assert.equal(hems.totals.minutes,150);
 assert.equal(hems.byOp.find(x=>x.key==='HEMS').minutes,45);
 assert.equal(get({operation:'HEMS',condition:'ifr'}).totals.minutes,90);
 assert.equal(get({operation:'HHO',condition:'night'}).totals.minutes,60);
 assert.equal(get({condition:'xc',crew:'multi'}).totals.minutes,120);
 assert.equal(get({condition:'night',type:'EC35'}).totals.flights,1);
});
test('custom date ranges validate order and exclude out-of-period records',()=>{
 const {get}=setup();
 assert.equal(get({range:'custom',from:'2026-11-06',to:'2026-11-06'}).totals.minutes,90);
 assert.equal(get({range:'custom',from:'2026-11-07',to:'2026-11-01'}).bounds.invalid,true);
 assert.equal(get({range:'custom',from:'2026-11-07',to:'2026-11-01'}).totals.minutes,0);
 assert.equal(get({range:'custom',from:'2026-02-30'}).bounds.invalid,true);
 assert.equal(get({range:'custom',from:'2027-01-01'}).totals.minutes,0);
});
test('page is accessible from desktop sidebar, mobile More and route; controls are read-only',()=>{
 const {context}=setup(),app={innerHTML:''};
 context.app=app;
 context.S={aircraft,flights,broughtForward:{total:999999}};
 context.SPECIAL_OPS=ops;
 context.effectiveFlights=()=>flights;
 context.header=()=>'<header>Flight statistics</header>';
 context.document={getElementById:id=>id==='flightStatsResults'?{innerHTML:''}:null};
 context.flightStatsPage();
 assert.match(app.innerHTML,/<label for="flightStatsType">ICAO helicopter type<\/label>/);
 assert.match(app.innerHTML,/PIC total \(PIC, SOLO, SPIC, PICUS\)/);
 assert.match(app.innerHTML,/Specialised operation/);
 assert.match(app.innerHTML,/More filters · dates, conditions & crew/);
 assert.match(app.innerHTML,/Simulator sessions and previous paper-logbook totals are excluded/);
 assert.match(read('source/index.template.html'),/data-v="statistics"/);
 assert.match(read('source/app/01-domain-and-navigation.js'),/go\('statistics'\)/);
 assert.match(read('source/app/13-routing-and-boot.js'),/statistics:flightStatsPage/);
 assert.match(read('../scripts/build-helilog-v2.cjs'),/'09-flight-statistics\.js'/);
});
test('new TEST cache is isolated from production and release is versioned',()=>{
 assert.match(read('source/index.template.html'),/V2\.57 · TEST ENVIRONMENT/);
 assert.match(read('manifest.webmanifest'),/HeliLog V2\.57 — Flight Statistics Test/);
 assert.match(read('service-worker.js'),/helilog-v2-57-flight-statistics-1/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.57'/);
 assert.match(read('source/app/13-help-guide.js'),/v:"V2\.57",name:"Helicopter Flight Statistics"/);
 assert.doesNotMatch(src,/localStorage\.setItem|save\(|HeliLogV23Sync\.track|fetch\(/);
});
