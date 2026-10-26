'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const engine=require('./recency.js');
const recencySource=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
function day(){
 const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function fixture(flights){
 const storage=new Map(),aircraft=[{id:'g',icao:'G2CA'},{id:'r',icao:'R44'}];
 const fake={window:{HeliLogV233Recency:engine,HeliLogV23Sync:{status:()=>({owner:'pilot-1'})}},
   v23AccountWorkspace:()=>true,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
   S:{aircraft},app:{innerHTML:''},effectiveFlights:()=>flights,
   isSimulatorSession:x=>x.entryType==='simulator',
   compareFlightsNewest:(a,b)=>String(b.date).localeCompare(String(a.date)),
   flightPilotConfig:f=>f.pilotConfig,
   header:name=>'<header>'+name+'</header>',
   displayDate:iso=>iso.split('-').reverse().join('-'),
   htmlEscape:s=>String(s),Date,
   document:{getElementById:()=>null}};
 vm.createContext(fake);vm.runInContext(recencySource,fake);
 return {fake,storage,call:s=>vm.runInContext(s,fake)};
}
function pic(date,day,night=0){return {id:'f'+day,date,aid:'g',role:'PIC',pilotConfig:'single',takeoffDay:day,landingDay:day,takeoffNight:night,landingNight:night};}
test('rolling 90-day experience is not a fixed new 90-day certificate',()=>{
 const records=[pic('2026-10-20',8)];
 const at=engine.assess(records,[{id:'g',icao:'G2CA'}],'2026-10-26','G2CA');
 assert.equal(at.general,8);assert.equal(at.generalEstimated,true);
 assert.equal(at.nextGeneralLoss,'2027-01-18');
 assert.equal(engine.assess(records,[{id:'g',icao:'G2CA'}],'2027-01-17','G2CA').generalEstimated,true);
 assert.equal(engine.assess(records,[{id:'g',icao:'G2CA'}],'2027-01-18','G2CA').generalEstimated,false);
});
test('recency status distinguishes manually confirmed from automatically estimated and below-minimum',()=>{
 const f=fixture([pic(day(),8)]);
 const row=f.call('recencyRows()[0]');
 assert.equal(row.general,8);
 const estimated=f.call('recencyStatus(recencyRows()[0],"general")');
 assert.equal(estimated.threshold,true);assert.equal(estimated.confirmed,false);
 assert.equal(estimated.text,'90-day threshold met');
 assert.equal(f.call('recencyStatusDetails(recencyStatus(recencyRows()[0],"general"))'),'8 recorded movement pairs in the preceding 90 days.');
 const low=f.call('recencyStatus({...recencyRows()[0],general:1,generalEstimated:false,generalDocumented:false},"general")');
 assert.equal(low.text,'Threshold not met');
 assert.match(f.call('recencyStatusDetails({...recencyStatus(recencyRows()[0],"general"),threshold:false,count:1})'),/2 more needed/);
 const confirmed=f.call('recencyStatus({...recencyRows()[0],generalDocumented:true},"general")');
 assert.equal(confirmed.text,'Requirement met');
});
test('dashboard and detailed Recency cards use status rather than growing fractions',()=>{
 const records=[pic(day(),8,1),{...pic(day(),1),id:'f-r',aid:'r',role:'PIC'}];
 const before=JSON.stringify(records);
 const f=fixture(records);
 f.call('recency()');let html=f.fake.app.innerHTML;
 assert.match(html,/Show on dashboard/);
 assert.match(html,/All recencies/);
 assert.match(html,/Estimated met/);
 assert.match(html,/9 recorded movement pairs/);
 assert.match(html,/If no more qualifying flights are made/);
 assert.match(html,/threshold will fall below the minimum on/);
 assert.doesNotMatch(html,/9\/3|Next 90-day change:/);
 assert.match(html,/Below threshold/);
 assert.match(html,/1 more needed|2 more needed/);
 assert.match(html,/data-recency-key="G2CA\|single\|general"/);
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|general"},checked:true})');
 const card=f.call('recencySummaryMarkup()');
 assert.match(card,/Estimated met/);
 assert.match(card,/Threshold until/);
 assert.doesNotMatch(card,/9 recorded movement pairs/);
 assert.doesNotMatch(card,/9\/3|R44/);
 assert.equal(JSON.stringify(records),before);
});
test('short selector labels exclude count fractions and duplicate detailed card content',()=>{
 const f=fixture([pic(day(),8,1)]);
 f.call('recency()');
 const html=f.fake.app.innerHTML;
 const selector=html.split('recency-choice-grid')[1]?.split('</div>')[0]||'';
 assert.match(selector,/recency-dashboard-choice/);
 assert.match(selector,/recency-choice-status/);
 assert.doesNotMatch(selector,/9\/3|Threshold falls below minimum|recorded movement pairs/);
 assert.match(html,/rolling (?:preceding )?90 days/i);
});
