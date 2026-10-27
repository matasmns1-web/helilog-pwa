'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const monitor=require('./operator-flight-monitor.js');
const aircraft=[{id:'ec',icao:'EC35'},{id:'test',icao:'TEST'},{id:'g2',icao:'G2CA'}];
const rule=(extra={})=>({id:'r',title:'HESLO 1',aircraftType:'EC35',monitor:'special:HESLO1',
 unit:'cycles',configuration:'all',minimum:3,periodDays:90,acceptedSources:['flight'],...extra});
const flight=(id,date,day,night=0,extra={})=>({id,date,aid:'ec',entryType:'flight',role:'PIC',pilotConfig:'single',
 specialOps:{HESLO1:30},specialOpsCycles:{HESLO1:{day,night}},...extra});
test('HESLO1 monitors only HESLO1 recorded cycles from matching flight entries',()=>{
 const a=monitor.assess(rule(),[
  flight('f1','2026-10-26',2),flight('f2','2026-10-25',1),
  flight('old','2026-07-27',99),flight('future','2026-10-28',99),
  flight('other-type','2026-10-26',99,0,{aid:'g2'}),
  flight('nvis','2026-10-26',99,0,{specialOps:{NVIS:3}}),
  flight('unmarked','2026-10-26',99,0,{specialOps:{}}),
  flight('sim','2026-10-26',99,0,{entryType:'simulator'}),
  flight('f1','2026-10-26',99)
 ],aircraft,'2026-10-27');
 assert.equal(a.count,3);assert.equal(a.evidenceFlights,2);
 assert.equal(a.thresholdMet,true);assert.equal(a.thresholdUntil,'2027-01-23');
 assert.equal(a.certified,false);
});
test('HESLO missing count fields never create automatic credit',()=>{
 const list=[flight('f1','2026-10-26',2),flight('f2','2026-10-26',1,0,{specialOpsCycles:{}}),
   flight('f3','2026-10-26',1,0,{specialOpsCycles:{HESLO1:{day:1.5,night:0}}}),
   flight('f4','2026-10-26',1,0,{specialOpsCycles:{HESLO1:{day:1,night:-1}}})];
 const r=monitor.assess(rule(),list,aircraft,'2026-10-27');
 assert.equal(r.count,2);assert.equal(r.missingCycleCounts,3);assert.equal(r.thresholdMet,false);
});
test('night/day cycles combined, crew configuration and date boundaries correctly applied',()=>{
 const flights=[flight('single','2026-10-26',1,2),flight('multi','2026-10-25',2,0,{pilotConfig:'multi'})];
 const both=monitor.assess(rule(),flights,aircraft,'2026-10-27');
 const single=monitor.assess(rule({configuration:'single'}),flights,aircraft,'2026-10-27');
 const multi=monitor.assess(rule({configuration:'multi'}),flights,aircraft,'2026-10-27');
 assert.equal(both.count,5);assert.equal(single.count,3);assert.equal(multi.count,2);
 assert.equal(single.thresholdMet,true);assert.equal(multi.thresholdMet,false);
});
test('HESLO2 never absorbs HESLO1 cycles and offshore needs its own landings field',()=>{
 const flights=[flight('a','2026-10-26',4),flight('b','2026-10-26',0,0,{specialOps:{OFFSHORE:10},
  specialOpsCycles:{OFFSHORE:{day:1,night:1}},landingDay:5})];
 assert.equal(monitor.assess(rule({monitor:'special:HESLO2'}),flights,aircraft,'2026-10-27').count,0);
 assert.equal(monitor.assess(rule({monitor:'special:OFFSHORE',unit:'landings'}),flights,aircraft,'2026-10-27').count,2);
 assert.equal(monitor.assess(rule({monitor:'special:OFFSHORE',unit:'landings'}),[flights[0]],aircraft,'2026-10-27').count,0);
});
test('NVIS counts flagged flights, not arbitrary cycles; all flights excludes simulator entries',()=>{
 const flights=[flight('a','2026-10-26',3,0,{specialOps:{NVIS:5}}),
 flight('b','2026-10-26',0,0,{specialOps:{}}),
 flight('sim','2026-10-26',0,0,{entryType:'simulator',specialOps:{NVIS:20}})];
 assert.equal(monitor.assess(rule({monitor:'special:NVIS',unit:'flights'}),flights,aircraft,'2026-10-27').count,1);
 assert.equal(monitor.assess(rule({monitor:'flights:all',unit:'flights'}),flights,aircraft,'2026-10-27').count,2);
});
test('source and unit are linked and invalid source fails closed',()=>{
 assert.throws(()=>monitor.assess(rule({monitor:undefined}),[],aircraft,'2026-10-27'),/Choose a monitored activity/);
 assert.throws(()=>monitor.assess(rule({monitor:'special:HESLO1',unit:'flights'}),[],aircraft,'2026-10-27'),/must use cycles/);
 assert.throws(()=>monitor.assess(rule({monitor:'arbitrary:danger'}),[],aircraft,'2026-10-27'),/Choose a monitored activity/);
});
test('linkage stays in Recency, not Settings, and is read-only to cloud/signed records',()=>{
 const src=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
 assert.match(src('source/app/09-recency.js'),/recencyAllDashboardOptions/);
 assert.doesNotMatch(src('source/app/10-settings-and-locations.js'),/Operator recency rules/);
 assert.match(src('operator-rules-ui.js'),/opRuleMonitor/);
 assert.match(src('source/index.template.html'),/operator-flight-monitor\.js\?v=2\.37/);
 assert.match(src('service-worker.js'),/operator-flight-monitor\.js\?v=2\.37/);
 assert.doesNotMatch(src('operator-flight-monitor.js'),/\.insert\(|\.delete\(|localStorage\.setItem\(/);
});

test('night flight monitor counts one flight with validated positive night time, not landings or night minutes',()=>{
 const flights=[
  flight('night1','2026-10-26',0,0,{nightMin:10,mins:60,takeoffNight:2,landingNight:2}),
  flight('night2','2026-10-25',0,0,{nightMin:20,mins:60,takeoffNight:3,landingNight:3}),
  flight('day','2026-10-25',0,0,{nightMin:0,mins:60,takeoffNight:5}),
  flight('invalid','2026-10-24',0,0,{nightMin:80,mins:60}),
  flight('sim','2026-10-26',0,0,{nightMin:30,mins:60,entryType:'simulator'}),
  flight('old','2026-07-27',0,0,{nightMin:30,mins:60}),
  flight('night1','2026-10-26',0,0,{nightMin:40,mins:60})
 ];
 const r=monitor.assess(rule({monitor:'flights:night',unit:'flights',minimum:3}),flights,aircraft,'2026-10-27');
 assert.equal(r.count,2);assert.equal(r.evidenceFlights,2);assert.equal(r.thresholdMet,false);
 const met=monitor.assess(rule({monitor:'flights:night',unit:'flights',minimum:2}),flights,aircraft,'2026-10-27');
 assert.equal(met.count,2);assert.equal(met.thresholdMet,true);
 assert.equal(met.thresholdUntil,'2027-01-23');assert.equal(met.certified,false);
});
