'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const a=require('./advanced-recency.js');
const sample=()=>({id:'ops1',ownerId:'pilot1',operator:'Example Helicopter Operator',
 rules:[{id:'hoist',title:'Operator HHO cycles',aircraftType:'EC35',
 configuration:'all',unit:'cycles',minimum:3,periodDays:90,acceptedSources:['flight','ffs']}]});
const event=(id,date,amount=1,extra={})=>({id,ownerId:'pilot1',ruleId:'hoist',date,
 aircraftType:'EC35',configuration:'single',source:'flight',unit:'cycles',amount,
 status:'reviewed',evidenceRef:'File reference '+id,...extra});
test('custom operator rules require explicit allowed sources, and have unique IDs',()=>{
 const rules=a.ruleSet(sample());
 assert.ok(Object.isFrozen(rules.rules[0]));
 assert.equal(rules.rules[0].acceptedSources.includes('check'),false);
 assert.throws(()=>a.ruleSet({...sample(),rules:[{...sample().rules[0],acceptedSources:[]}]}),/Invalid operator rule/);
 assert.throws(()=>a.ruleSet({...sample(),rules:[sample().rules[0],sample().rules[0]]}),/Invalid operator rule/);
});
test('rolling windows only count reviewed in-scope evidence',()=>{
 const events=[event('a','2026-10-26',2),event('b','2026-10-25',1),
 event('old','2026-07-28',99),event('future','2026-10-27',99),
 event('draft','2026-10-26',99,{status:'draft'}),
 event('missing','2026-10-26',99,{evidenceRef:''}),
 event('other','2026-10-26',99,{ownerId:'different'}),
 event('type','2026-10-26',99,{aircraftType:'R44'}),
 event('units','2026-10-26',99,{unit:'flights'}),
 event('check','2026-10-26',99,{source:'check'})];
 const before=JSON.stringify(events);
 const r=a.assess(sample(),events,'2026-10-26','hoist');
 assert.equal(r.count,3);assert.equal(r.thresholdMet,true);
 assert.equal(r.nextThresholdLoss,'2027-01-23');
 assert.equal(r.certification,false);assert.equal(JSON.stringify(events),before);
});
test('simulator/check evidence cannot be credited unless each is expressly accepted',()=>{
 assert.equal(a.assess(sample(),[event('sim','2026-10-26',3,{source:'ffs'})],
   '2026-10-26','hoist').count,3);
 const onlyFlights=sample();onlyFlights.rules[0].acceptedSources=['flight'];
 assert.equal(a.assess(onlyFlights,[event('sim','2026-10-26',3,{source:'ffs'})],
   '2026-10-26','hoist').count,0);
 assert.throws(()=>a.creditEvent(event('bad','2026-10-26',1,{evidenceRef:''})),/requires evidence/);
});
test('duplicate IDs and bad records cannot inflate counts',()=>{
 const r=a.assess(sample(),[event('x','2026-10-26',2),event('x','2026-10-26',2),
 {id:'bad'},event('y','2026-10-26',1,{source:'training'})],'2026-10-26','hoist');
 assert.equal(r.count,2);assert.equal(r.thresholdMet,false);
});
test('advanced module stays separate from the existing FCL.060 engines and is offline-cached',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
 assert.match(read('source/index.template.html'),/advanced-recency\.js\?v=2\.35/);
 assert.match(read('service-worker.js'),/advanced-recency\.js\?v=2\.35/);
 assert.doesNotMatch(read('source/app/09-recency.js'),/Estimated met/);
 assert.match(read('source/app/09-recency.js'),/approaches are not separately verified/);
 assert.match(read('recency.js'),/generalEstimated/);
});