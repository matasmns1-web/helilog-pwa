'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const r=require('./recency.js');
const aircraft=[{id:'g2',icao:'G2CA'},{id:'r44',icao:'R44'}];
const f=(date,day=0,night=0,extra={})=>({date,aid:'g2',entryType:'flight',pilotConfig:'single',
 takeoffDay:day,takeoffNight:night,landingDay:day,landingNight:night,recency:{pfConfirmed:true,day,night,icao:'G2CA'},...extra});
test('90 calendar day boundaries count today through 89 days back, reject future and earlier',()=>{
 const x=r.assess([f('2026-07-28',3,1),f('2026-07-27',9,9),f('2026-10-27',9,9)],aircraft,'2026-10-25','G2CA');
 assert.equal(x.general,4);assert.equal(x.night,1);
 const y=r.assess([f('2026-07-29',3,1),f('2026-07-28',9,9)],aircraft,'2026-10-26','G2CA');
 assert.equal(y.general,4);assert.equal(y.night,1);
 assert.equal(y.from,'2026-07-29');
});
test('only explicit complete pilot-flying sequences count; legacy and simulator not certified',()=>{
 const x=r.assess([f('2026-10-01',3,0,{recency:undefined}),
   f('2026-10-02',3,0,{recency:{pfConfirmed:false,day:3,night:0}}),
   f('2026-10-03',3,0,{entryType:'simulator'}),
   f('2026-10-04',3,0,{recency:{pfConfirmed:true,day:4,night:0}})],aircraft,'2026-10-26','G2CA');
 assert.equal(x.general,0);assert.equal(x.generalDocumented,false);
 assert.equal(x.unverifiedFlights,3);
});
test('aircraft type and pilot configuration stay separate, night contributes to general count',()=>{
 const x=r.assess([f('2026-10-01',1,1),f('2026-10-02',1,0),
 f('2026-10-03',3,1,{aid:'r44',recency:{pfConfirmed:true,day:3,night:1,icao:'R44'}}),
 f('2026-10-04',3,1,{pilotConfig:'multi'})],aircraft,'2026-10-26','G2CA','single');
 assert.equal(x.general,3);assert.equal(x.night,1);
 assert.equal(x.generalDocumented,true);assert.equal(x.nightDocumented,true);
 assert.equal(x.nextGeneralLoss,'2026-12-30');
 assert.equal(x.nextNightLoss,'2026-12-30');
});
test('bad dates and invalid count evidence fail closed',()=>{
 assert.throws(()=>r.assess([],aircraft,'2026-02-30','G2CA'),/Reference date/);
 assert.equal(r.verified(f('2026-10-01',1,0,{recency:{pfConfirmed:true,day:2,night:0}})),false);
 assert.equal(r.verified(f('2026-10-01',1,0,{recency:{pfConfirmed:true,day:-1,night:0}})),false);
});
test('grouping hides aircraft never flown and preserves type separation',()=>{
 const g=r.groups([f('2026-10-10',1,0)],aircraft,'2026-10-26');
 assert.ok(!g.some(x=>x.type==='R44'));
 assert.ok(g.some(x=>x.type==='G2CA'&&x.general===1));
});
test('UI and flight evidence hooks are visible in source with no automatic credit from totals',()=>{
 const fs=require('node:fs'),path=require('node:path'),read=x=>fs.readFileSync(path.join(__dirname,x),'utf8');
 const entry=read('source/app/06-flights-and-night.js');
 const page=read('source/app/09-recency.js');
 const dash=read('source/app/02-dashboard-and-logbook.js');
 assert.match(entry,/id="recencyPF"/);assert.match(entry,/id="recencyAutoExclude"/);assert.match(entry,/collectRecencyEvidence/);
 assert.match(page,/FCL\.060/);assert.match(dash,/recencySummaryMarkup/);
 assert.doesNotMatch(page,/S\.broughtForward/);
});
test('explicit single-pilot configuration overrides legacy multi-pilot minute hints',()=>{
 const x=r.assess([f('2026-10-10',3,0,{pilotConfig:'single',multiPilotMin:20})],
 aircraft,'2026-10-26','G2CA','single');
 assert.equal(x.general,3);
 assert.equal(r.assess([f('2026-10-10',3,0,{pilotConfig:'single',multiPilotMin:20})],
 aircraft,'2026-10-26','G2CA','multi').general,0);
});
test('dashboard glance and Recency route render without modifying records',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
 const today=new Date().toISOString().slice(0,10);
 const flights=[f(today,3,1)];const before=JSON.stringify(flights);
 const ctx={window:{HeliLogV233Recency:r},S:{aircraft},app:{innerHTML:''},
  effectiveFlights:()=>flights,isSimulatorSession:()=>false,compareFlightsNewest:(a,b)=>b.date.localeCompare(a.date),
  flightPilotConfig:x=>x.pilotConfig,header:(a,b)=>'<header>'+a+'</header>',
  displayDate:x=>x,htmlEscape:x=>String(x),Date};
 vm.createContext(ctx);
 vm.runInContext(source+'; recency();',ctx);
 assert.match(ctx.app.innerHTML,/FCL\.060/);
 assert.match(ctx.app.innerHTML,/G2CA/);
 assert.match(ctx.app.innerHTML,/4\/3/);
 assert.match(ctx.app.innerHTML,/1\/1/);
 assert.match(vm.runInContext('recencySummaryMarkup()',ctx),/View recency/);
 assert.equal(JSON.stringify(flights),before);
});

test('single-pilot PIC/SOLO automatically count historical matched movement pairs, without editing original records',()=>{
 const flights=[f('2026-10-10',2,1,{role:'PIC',recency:undefined,operationType:'private'}),
   f('2026-10-11',1,0,{role:'SOLO',recency:undefined,operationType:'training'})];
 const before=JSON.stringify(flights),a=r.assess(flights,aircraft,'2026-10-26','G2CA');
 assert.equal(a.general,4);assert.equal(a.night,1);
 assert.equal(a.generalEstimated,true);assert.equal(a.generalDocumented,false);
 assert.equal(a.estimatedFlights,2);assert.equal(a.nightApplicable,true);
 assert.equal(JSON.stringify(flights),before);
});
test('PF is not inferred for DUAL, SPIC, PICUS or multi-pilot flights',()=>{
 const samples=['DUAL','SPIC','PICUS','CO-PILOT'].map(role=>
   f('2026-10-11',4,0,{role,recency:undefined}));
 samples.push(f('2026-10-11',4,0,{role:'PIC',pilotConfig:'multi',recency:undefined}));
 const s=r.assess(samples,aircraft,'2026-10-26','G2CA','single');
 assert.equal(s.general,0);assert.equal(s.unverifiedFlights,4);
 assert.equal(r.assess(samples,aircraft,'2026-10-26','G2CA','multi').general,0);
});
test('night recency only appears for types with actual night history and persists when expired',()=>{
 const day=[f('2026-10-08',3,0,{role:'PIC',recency:undefined})];
 assert.equal(r.assess(day,aircraft,'2026-10-26','G2CA').nightApplicable,false);
 const past=f('2025-10-08',0,2,{role:'PIC',recency:undefined});
 const report=r.assess([...day,past],aircraft,'2026-10-26','G2CA');
 assert.equal(report.nightApplicable,true);
 assert.equal(report.night,0);
});
test('automatic exceptions opt out and explicit PF records remain countable when applicable',()=>{
 const excluded=f('2026-10-10',4,2,{role:'PIC',recency:{excludeAuto:true}});
 const manual=f('2026-10-12',3,0,{role:'DUAL'});
 assert.equal(r.evidence(excluded).source,'excluded');
 assert.equal(r.evidence(manual).source,'confirmed');
 assert.equal(r.assess([excluded,manual],aircraft,'2026-10-26','G2CA').general,3);
});
test('recency interface avoids CAT flight classification, keeps night hidden without history',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
 const flights=[f('2026-10-10',3,0,{role:'PIC',recency:undefined,operationType:'training'})];
 const ctx={window:{HeliLogV233Recency:r},S:{aircraft},app:{innerHTML:''},
 effectiveFlights:()=>flights,isSimulatorSession:()=>false,compareFlightsNewest:(a,b)=>b.date.localeCompare(a.date),
 flightPilotConfig:x=>x.pilotConfig,header:(a,b)=>'<header>'+a+'</header>',
 displayDate:x=>x,htmlEscape:x=>String(x),Date};
 vm.createContext(ctx);vm.runInContext(source+'; recency();',ctx);
 assert.match(ctx.app.innerHTML,/Passenger-carrying/);
 assert.doesNotMatch(ctx.app.innerHTML,/Passenger \/ CAT|Night PIC — FCL\.060\(b\)\(2\)/);
 assert.match(ctx.app.innerHTML,/Estimated from logbook/);
 assert.match(vm.runInContext('recencySummaryMarkup()',ctx),/3\/3/);
 assert.doesNotMatch(vm.runInContext('recencySummaryMarkup()',ctx),/Night PIC recency/);
});
