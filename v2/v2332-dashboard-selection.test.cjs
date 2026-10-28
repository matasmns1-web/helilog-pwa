'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const recencyEngine=require('./recency.js');
const script=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
function fixture(){
 const storage=new Map(),aircraft=[{id:'g',icao:'G2CA'},{id:'r',icao:'R44'}];
 const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const flights=[
  {id:'1',date,aid:'g',role:'PIC',pilotConfig:'single',takeoffDay:3,landingDay:3,takeoffNight:1,landingNight:1},
  {id:'2',date,aid:'r',role:'SOLO',pilotConfig:'single',takeoffDay:2,landingDay:2,takeoffNight:0,landingNight:0}
 ];
 const before=JSON.stringify(flights);let owner='pilot-a',cloud=true,sandbox=false,broken=false;
 const ui={recencyDashboardSelectionCount:{textContent:''},recencyDashboardSaveMessage:{textContent:''}};
 const context={
  window:{HeliLogV233Recency:recencyEngine,HeliLogV23Sync:{status:()=>({owner})}},
  v23AccountWorkspace:()=>cloud, get TEST_MODE(){return sandbox},
  localStorage:{
   getItem:k=>storage.get(k)||null,
   setItem(k,v){if(broken)throw Error('quota');storage.set(k,v)}
  },
  S:{aircraft},app:{innerHTML:''},
  effectiveFlights:()=>flights,isSimulatorSession:f=>f.entryType==='simulator',
  compareFlightsNewest:(a,b)=>String(b.date).localeCompare(String(a.date)),
  flightPilotConfig:f=>f.pilotConfig,
  header:(name)=>'<header>'+name+'</header>',
  displayDate:x=>x,htmlEscape:x=>String(x),document:{getElementById:id=>ui[id]||null},
  Date
 };
 vm.createContext(context);vm.runInContext(script,context);
 const call=expr=>vm.runInContext(expr,context);
 return {context,call,storage,flights,before,ui,
   setOwner:x=>owner=x,setCloud:x=>cloud=x,setSandbox:x=>sandbox=x,setBroken:x=>broken=x};
}
test('Recency page offers passenger and night checkboxes separately for each type, with nothing selected by default',()=>{
 const f=fixture();f.call('recency()');const html=f.context.app.innerHTML;
 assert.match(html,/Show on dashboard/);
 assert.match(html,/data-recency-key="G2CA\|single\|general"/);
 assert.match(html,/data-recency-key="G2CA\|single\|night"/);
 assert.match(html,/data-recency-key="R44\|single\|general"/);
 assert.doesNotMatch(html,/data-recency-key="R44\|single\|night"/);
 assert.equal(f.call('recencySummaryMarkup()'),'');
 assert.match(html,/All recencies/);
 assert.equal(JSON.stringify(f.flights),f.before);
});
test('Selecting individual cards saves and dashboard renders ONLY those recencies',()=>{
 const f=fixture();f.call('recency()');
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|night"},checked:true})');
 let html=f.call('recencySummaryMarkup()');
 assert.match(html,/G2CA/);assert.match(html,/Night PIC/);
 assert.doesNotMatch(html,/Passenger-carrying|R44/);
 assert.equal(f.ui.recencyDashboardSelectionCount.textContent,'1 selected');
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"R44|single|general"},checked:true})');
 html=f.call('recencySummaryMarkup()');
 assert.match(html,/R44/);assert.match(html,/Night PIC/);
 assert.match(html,/Passenger-carrying/);
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|night"},checked:false})');
 html=f.call('recencySummaryMarkup()');
 assert.match(html,/R44/);assert.doesNotMatch(html,/G2CA|Night PIC/);
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"R44|single|general"},checked:false})');
 assert.equal(f.call('recencySummaryMarkup()'),'');
 assert.equal(JSON.stringify(f.flights),f.before);
});
test('Preferences persist across page re-render but remain isolated by pilot and sandbox',()=>{
 const f=fixture();f.call('recency()');
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|general"},checked:true})');
 const saved=f.call('recencyDashboardStorageKey()');
 assert.match(saved,/pilot-a/);
 f.call('recency()');assert.match(f.context.app.innerHTML,/data-recency-key="G2CA\|single\|general" checked/);
 f.setOwner('pilot-b');assert.equal(f.call('recencySummaryMarkup()'),'');
 f.setOwner('pilot-a');assert.match(f.call('recencySummaryMarkup()'),/G2CA/);
 f.setCloud(false);f.setSandbox(true);assert.equal(f.call('recencySummaryMarkup()'),'');
 f.setSandbox(false);assert.equal(f.call('recencySummaryMarkup()'),'');
});
test('Malformed or stale selections are ignored; failed storage writes revert checkbox',()=>{
 const f=fixture();f.call('recency()');
 f.storage.set(f.call('recencyDashboardStorageKey()'),JSON.stringify(['bogus','R44|single|night','G2CA|single|general']));
 assert.match(f.call('recencySummaryMarkup()'),/G2CA/);
 assert.doesNotMatch(f.call('recencySummaryMarkup()'),/R44/);
 f.setBroken(true);
 const input={dataset:{recencyKey:'R44|single|general'},checked:true};
 f.context.input=input;f.call('recencySetDashboardIndicator(input)');
 assert.equal(input.checked,false);
 assert.match(f.ui.recencyDashboardSaveMessage.textContent,/Could not save/);
 assert.equal(JSON.stringify(f.flights),f.before);
});
