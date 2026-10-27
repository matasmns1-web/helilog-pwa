'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=require('./recency.js'),advanced=require('./advanced-recency.js'),monitor=require('./operator-flight-monitor.js');
const uiSource=fs.readFileSync(path.join(__dirname,'operator-rules-ui.js'),'utf8');
const recencySource=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
function fixture(){
 const d=new Date(),today=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const store=new Map(),aircraft=[{id:'ec',icao:'EC35'},{id:'r',icao:'R44'}];
 const flights=[
  {id:'1',date:today,aid:'ec',mins:60,nightMin:20,role:'PIC',pilotConfig:'single',takeoffDay:2,landingDay:2,takeoffNight:1,landingNight:1},
  {id:'2',date:today,aid:'ec',mins:60,nightMin:10,role:'PIC',pilotConfig:'single',takeoffDay:1,landingDay:1,takeoffNight:1,landingNight:1},
  {id:'3',date:today,aid:'r',mins:30,nightMin:30,role:'PIC',pilotConfig:'single',takeoffDay:1,landingDay:1}
 ];
 let owner='pilotA';let sandbox=false;
 const data={version:1,ownerId:owner,activeId:'opA',profiles:[
  {schema:1,id:'opA',ownerId:owner,operator:'Night VFR Training',rules:[
   {id:'night_rule',title:'Night VFR company minimum',monitor:'flights:night',aircraftType:'EC35',
    configuration:'all',unit:'flights',minimum:3,periodDays:90,acceptedSources:['flight']}
  ]}
 ]};
 store.set('helilog_operator_profiles_v1:'+owner,JSON.stringify(data));
 const nodes={app:{innerHTML:''},recencyDashboardSelectionCount:{textContent:''},recencyDashboardSaveMessage:{textContent:''}};
 const ctx={console,Math,Date,S:{aircraft},app:nodes.app,HeliLogV23Sync:{status:()=>({owner})},
  HeliLogV235AdvancedRecency:advanced,HeliLogV2362OperatorMonitor:monitor,
  HeliLogV233Recency:engine,HELILOG_OPERATOR_SANDBOX:false,
  v23AccountWorkspace:()=>true,effectiveFlights:()=>flights,
  localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
  document:{getElementById:id=>nodes[id]||null},
  header:t=>'<header>'+t+'</header>',displayDate:x=>x,
  htmlEscape:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;'),confirm:()=>true,
  isSimulatorSession:f=>f.entryType==='simulator',compareFlightsNewest:(a,b)=>b.date.localeCompare(a.date),
  flightPilotConfig:f=>f.pilotConfig
 };
 ctx.HeliLogOperatorSyncBridge={
  read:()=>JSON.parse(store.get('helilog_operator_profiles_v1:'+owner)||'null'),
  write:data=>store.set('helilog_operator_profiles_v1:'+owner,JSON.stringify(data))
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(uiSource,ctx);vm.runInContext(recencySource,ctx);
 return {ctx,store,flights,aircraft,nodes,before:JSON.stringify(flights),call:s=>vm.runInContext(s,ctx),
   setOwner:x=>owner=x,setSandbox:x=>sandbox=x,date:today};
}
test('operator rule is in the same All recencies group/picker with Below threshold as EASA and no default dashboard card',()=>{
 const f=fixture();f.call('recency()');const html=f.nodes.app.innerHTML;
 assert.match(html,/Manage operator rules/);
 assert.match(html,/Operator · Night VFR company minimum/);
 assert.match(html,/data-recency-key="operator\|opA\|night_rule"/);
 assert.match(html,/EC35 · Operator: Night VFR Training/);
 assert.match(html,/Below threshold/);
 assert.match(html,/Recorded 2 \/ 3 flights in the preceding 90 days/);
 assert.match(html,/Night VFR status is not independently verified/);
 assert.doesNotMatch(f.call('recencySummaryMarkup()'),/Night VFR company minimum/);
 assert.equal(JSON.stringify(f.flights),f.before);
});
test('operator dashboard checkbox mirrors EASA selection, account scope and deactivation',()=>{
 const f=fixture();
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"operator|opA|night_rule"},checked:true})');
 let card=f.call('recencySummaryMarkup()');
 assert.match(card,/Operator · Night VFR company minimum/);
 assert.match(card,/Below threshold/);
 assert.match(card,/1 more recorded flights needed/);
 assert.equal(f.nodes.recencyDashboardSelectionCount.textContent,'1 selected');
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"EC35|single|general"},checked:true})');
 card=f.call('recencySummaryMarkup()');
 assert.match(card,/Passenger-carrying/);assert.match(card,/Operator · Night VFR company minimum/);
 assert.equal(f.nodes.recencyDashboardSelectionCount.textContent,'2 selected');
 const data=JSON.parse(f.store.get('helilog_operator_profiles_v1:pilotA'));
 data.activeId=null;f.store.set('helilog_operator_profiles_v1:pilotA',JSON.stringify(data));
 card=f.call('recencySummaryMarkup()');
 assert.doesNotMatch(card,/Night VFR company minimum/);
 assert.match(card,/Passenger-carrying/);
 data.activeId='opA';f.store.set('helilog_operator_profiles_v1:pilotA',JSON.stringify(data));
 assert.match(f.call('recencySummaryMarkup()'),/Night VFR company minimum/);
 f.setOwner('pilotB');
 assert.equal(f.call('recencySummaryMarkup()'),'');
 assert.equal(JSON.stringify(f.flights),f.before);
});
test('night rule turns Met when exactly three distinct same-type night flights are recorded',()=>{
 const f=fixture();
 f.flights.push({id:'4',date:f.date,aid:'ec',mins:40,nightMin:20,
  role:'PIC',pilotConfig:'single',takeoffDay:1,landingDay:1});
 f.call('recency()');
 assert.match(f.nodes.app.innerHTML,/Operator · Night VFR company minimum/);
 const options=f.call('recencyAllDashboardOptions(recencyRows())');
 const row=Array.from(options).find(x=>x.operatorRule);
 assert.equal(row.result.count,3);assert.equal(row.result.thresholdMet,true);
 assert.match(f.nodes.app.innerHTML,/recency-choice-status recency-tone-met">Met/);
});
test('monitor options contain Night flights and remains a local no-write calculation',()=>{
 const options=monitor.OPTIONS;
 assert.ok(options.some(x=>x.id==='flights:night'&&x.unit==='flights'));
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'operator-flight-monitor.js'),'utf8'),/localStorage\.setItem|\.insert\(|\.delete\(/);
});