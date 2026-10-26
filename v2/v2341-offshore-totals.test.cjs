'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const calc=require('./special-recency.js');
const aircraft=[{id:'a',icao:'EC35'},{id:'b',icao:'G2CA'}],iso='2026-10-26';
function fl(id,date,aid,config,code,day=0,night=0,extra={}){
 return {id,date,aid,pilotConfig:config,entryType:'flight',role:'PIC',
  specialOps:{[code]:20},specialOpsCycles:{[code]:{day,night}},...extra};
}
test('SPA.NVIS.130 combines NVIS flights across single/multi pilot on same ICAO type',()=>{
 const records=[fl('a','2026-10-25','a','single','NVIS'),
  fl('b','2026-10-24','a','multi','NVIS'),fl('c','2026-10-23','a','single','NVIS'),
  fl('d','2026-10-22','b','single','NVIS')];
 const report=calc.groups(records,aircraft,iso);
 const ec=report.filter(r=>r.type==='EC35'&&r.id==='NVIS');
 assert.equal(ec.length,1);
 assert.equal(ec[0].config,'all');assert.equal(ec[0].day,3);assert.equal(ec[0].dayMet,true);
 assert.equal(report.find(r=>r.type==='G2CA').day,1);
});
test('SPA.HHO.130 combines hoist cycles across SP/MP with night cycle credit',()=>{
 const records=[fl('a','2026-10-25','a','single','HHO',1,0),
  fl('b','2026-10-23','a','multi','HHO',0,3)];
 const r=calc.groups(records,aircraft,iso).filter(x=>x.id==='HHO');
 assert.equal(r.length,1);assert.equal(r[0].day,4);assert.equal(r[0].night,3);
 assert.equal(r[0].config,'all');assert.equal(r[0].dayMet,true);assert.equal(r[0].nightMet,true);
});
test('SPA.HOFO.170 keeps SP/MP offshore landing evidence separate and does not infer ordinary landings',()=>{
 const records=[fl('a','2026-10-25','a','single','OFFSHORE',1,1),
  fl('b','2026-10-24','a','multi','OFFSHORE',1,0),
  fl('c','2026-10-23','a','single','OFFSHORE',1,0),
  fl('d','2026-10-22','a','single','OFFSHORE',0,0,{landingDay:10,landingNight:10,specialOpsCycles:undefined})];
 const reports=calc.groups(records,aircraft,iso).filter(x=>x.id==='OFFSHORE');
 assert.equal(reports.length,2);
 const s=reports.find(x=>x.config==='single'),m=reports.find(x=>x.config==='multi');
 assert.equal(s.day,3);assert.equal(s.night,1);assert.equal(s.dayMet,true);
 assert.equal(m.day,1);assert.equal(m.dayMet,false);
 assert.equal(s.missingCounts,1);
 assert.equal(s.source,'landings');
});
test('specialised Totals reports recorded day/night counts, NVIS flights and preserves previous hours',()=>{
 const source=fs.readFileSync(path.join(__dirname,'source/app/01-domain-and-navigation.js'),'utf8');
 const start=source.indexOf('function specialisedTotals(){'),end=source.indexOf('function broughtForwardInputMinutes',start);
 assert.ok(start>0&&end>start);
 const records=[
  fl('1','2026-10-25','a','single','HHO',2,1),
  fl('2','2026-10-24','a','multi','HHO',0,2),
  fl('3','2026-10-23','b','single','HHO',0,0,{specialOpsCycles:undefined}),
  fl('4','2026-10-25','a','single','NVIS',0,0),
  fl('5','2026-10-24','a','single','OFFSHORE',1,2)];
 const before=JSON.stringify(records);
 const ctx={S:{broughtForward:{specialOps:{HHO:30}}},SPECIAL_OPS:[{code:'HHO'},{code:'NVIS'},{code:'OFFSHORE'}],
  effectiveFlights:()=>records};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const out=ctx.specialisedTotals(),h=out.find(x=>x.code==='HHO');
 assert.equal(h.minutes,90);assert.equal(h.previousMinutes,30);
 assert.equal(h.day,2);assert.equal(h.night,3);assert.equal(h.total,5);assert.equal(h.unrecorded,1);
 assert.equal(out.find(x=>x.code==='NVIS').counter,'flights');
 assert.equal(out.find(x=>x.code==='NVIS').total,1);
 assert.equal(out.find(x=>x.code==='OFFSHORE').counter,'landings');
 assert.equal(out.find(x=>x.code==='OFFSHORE').total,3);
 assert.equal(JSON.stringify(records),before);
});
test('offshore entry form uses concise day/night landing labels and is not auto-filled',()=>{
 const entry=fs.readFileSync(path.join(__dirname,'source/app/06-flights-and-night.js'),'utf8');
 assert.match(entry,/Day landings/);assert.match(entry,/Night landings/);
 assert.doesNotMatch(entry,/Day sequences|Night sequences/);
 assert.match(entry,/platform, helideck or vessel/);
 assert.match(entry,/specialOpsCycles,/);
 const tot=fs.readFileSync(path.join(__dirname,'source/app/09-totals.js'),'utf8');
 assert.match(tot,/Cycles \/ landings/);
 assert.match(tot,/countText/);
 const ui=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
 assert.match(ui,/Offshore landings/);
 assert.match(ui,/single\|multi\|all/);
});
test('prior SP and MP local NVIS/HHO indicator selections map to consolidated same-type selection',()=>{
 const source=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
 const start=source.indexOf('function recencyDashboardKeys(){'),end=source.indexOf('function recencyDashboardOptions',start);
 const data=JSON.stringify(['EC35|single|hho','EC35|multi|hho','EC35|multi|nvis','EC35|single|offshore','EC35|single|general']);
 const ctx={localStorage:{getItem:()=>data},recencyDashboardStorageKey:()=> 'k'};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const keys=ctx.recencyDashboardKeys();
 assert.equal([...keys].filter(k=>k==='EC35|all|hho').length,1);
 assert.ok(keys.includes('EC35|all|nvis'));
 assert.ok(keys.includes('EC35|single|offshore'));
 assert.ok(keys.includes('EC35|single|general'));
});
