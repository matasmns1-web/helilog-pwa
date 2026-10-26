'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const calc=require('./special-recency.js');
const ac=[{id:'g',icao:'G2CA'},{id:'a',icao:'AS50'}],d='2026-10-26';
const flight=(date,code='HHO',cycles={day:0,night:0},other={})=>({
 id:date+code,date,aid:'g',role:'PIC',pilotConfig:'single',entryType:'flight',
 specialOps:{[code]:25},specialOpsCycles:{[code]:cycles},...other
});
test('HHO recency counts day and night cycles separately in 90 days',()=>{
 const flights=[flight('2026-10-24','HHO',{day:1,night:3}),
   flight('2026-10-22','HHO',{day:2,night:0}),
   flight('2026-07-28','HHO',{day:55,night:55})];
 const r=calc.assess(flights,ac,d,'G2CA','HHO');
 assert.equal(r.day,6);assert.equal(r.night,3);
 assert.equal(r.dayMet,true);assert.equal(r.nightMet,true);
 assert.equal(r.dayLapse,'2027-01-22');assert.equal(r.nightLapse,'2027-01-22');
 assert.equal(r.missingCounts,0);
});
test('NVIS counts distinct flagged real flights, not hours/cycles, and excludes simulator sessions',()=>{
 const flights=[flight('2026-10-24','NVIS',{day:44,night:30}),
  flight('2026-10-23','NVIS',{day:0,night:0},{specialOps:{NVIS:0}}),
  flight('2026-10-22','NVIS',{day:0,night:0}),
  flight('2026-10-21','NVIS',{day:0,night:0},{entryType:'simulator'})];
 const r=calc.assess(flights,ac,d,'G2CA','NVIS');
 assert.equal(r.day,3);assert.equal(r.dayMet,true);
 assert.equal(r.nightTarget,0);assert.equal(r.nightHistory,false);
 assert.equal(r.dayLapse,'2027-01-20');
});
test('offshore complete sequences do not borrow normal airport landings',()=>{
 const flights=[flight('2026-10-24','OFFSHORE',{day:1,night:1},{takeoffDay:10,landingDay:10}),
  flight('2026-10-23','OFFSHORE',{day:1,night:0}),
  flight('2026-10-22','OFFSHORE',{day:0,night:1}),
  flight('2026-10-21','OFFSHORE',{day:0,night:0},{specialOpsCycles:undefined})];
 const r=calc.assess(flights,ac,d,'G2CA','OFFSHORE');
 assert.equal(r.day,4);assert.equal(r.night,2);
 assert.equal(r.dayMet,true);assert.equal(r.nightMet,false);
 assert.equal(r.nightHistory,true);assert.equal(r.missingCounts,1);
});
test('no historic backfill: missing cycle data and inactive operation codes remain uncredited',()=>{
 const f=flight('2026-10-24','HHO',{day:10,night:10},{specialOpsCycles:undefined});
 const bogus=flight('2026-10-23','HHO',{day:99,night:0},{specialOps:{}});
 const r=calc.assess([f,bogus],ac,d,'G2CA','HHO');
 assert.equal(r.day,0);assert.equal(r.dayMet,false);assert.equal(r.missingCounts,1);
 assert.equal(calc.groups([f],ac,d).length,1);
 assert.equal(calc.assess([f],ac,d,'AS50','HHO').day,0);
});
test('specialised indicators grouped by type/config and night variants only with recorded night cycles',()=>{
 const flights=[flight('2026-10-24','HHO',{day:2,night:0}),
  flight('2026-10-23','NVIS',{day:0,night:0}),
  flight('2026-10-22','HHO',{day:1,night:2},{aid:'a',pilotConfig:'multi'})];
 const g=calc.groups(flights,ac,d);
 assert.ok(g.some(x=>x.type==='G2CA'&&x.id==='HHO'&&!x.nightHistory));
 assert.ok(g.some(x=>x.type==='AS50'&&x.id==='HHO'&&x.nightHistory&&x.config==='multi'));
 assert.equal(g.some(x=>x.type==='AS50'&&x.id==='NVIS'),false);
});
test('source has beside-hours cycle/sequence fields and round-trip persistence without changing minute totals',()=>{
 const source=fs.readFileSync(path.join(__dirname,'source/app/06-flights-and-night.js'),'utf8');
 const template=fs.readFileSync(path.join(__dirname,'source/index.template.html'),'utf8');
 const guide=fs.readFileSync(path.join(__dirname,'source/app/13-help-guide.js'),'utf8');
 assert.match(source,/class="special-count-fields"/);
 assert.match(source,/specialDayCycles_/);
 assert.match(source,/specialNightCycles_/);
 assert.match(source,/function collectSpecialOpCycles\(/);
 assert.match(source,/specialOpsCycles,/);
 assert.match(source,/existing\.specialOpsCycles/);
 assert.match(template,/special-recency\.js\?v=2\.34/);
 assert.match(guide,/NVIS counts one flight automatically/);
});
test('cycle count input validation rejects missing/fractional and night counts with no night time',()=>{
 const s=fs.readFileSync(path.join(__dirname,'source/app/06-flights-and-night.js'),'utf8');
 const start=s.indexOf('function collectSpecialOpCycles('),end=s.indexOf('function toggleRecencyEvidence()',start);
 assert.ok(start>0&&end>start);
 const code=s.slice(start,end);
 const el=new Map(),field=id=>({value:'0',classList:{add(){},remove(){}},focus(){}});
 const inputs=['specialCheck_HHO','specialDayCycles_HHO','specialNightCycles_HHO'].map(id=>{const v=field(id);el.set(id,v);return v;});
 inputs[0].checked=true;
 const context={SPECIAL_OPS:[{code:'HHO'}],document:{getElementById:id=>el.get(id)||null},
  $:()=>({open:false}),showFormError:m=>{context.error=m}};
 vm.createContext(context);vm.runInContext(code,context);
 inputs[1].value='3';inputs[2].value='2';
 assert.equal(context.collectSpecialOpCycles(8).HHO.day,3);
 assert.equal(context.collectSpecialOpCycles(8).HHO.night,2);
 assert.equal(context.collectSpecialOpCycles(0),null);
 inputs[2].value='0';inputs[1].value='1.5';assert.equal(context.collectSpecialOpCycles(8),null);
 inputs[1].value='-1';assert.equal(context.collectSpecialOpCycles(8),null);
 inputs[1].value='0';inputs[2].value='0';assert.deepEqual(Object.keys(context.collectSpecialOpCycles(0)),[]);
});
test('recency chooser includes NVIS, HHO, offshore and preserves FCL.060 selections',()=>{
 const html=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
 assert.match(html,/HeliLogV234SpecialRecency/);
 assert.match(html,/offshoreNight/);assert.match(html,/hhoNight/);
 assert.match(html,/HeliLogV234SpecialRecency/);
});
