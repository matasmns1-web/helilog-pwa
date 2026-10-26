'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=require('./recency.js');
const recencySource=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
const dashboardSource=fs.readFileSync(path.join(__dirname,'source/app/02-dashboard-and-logbook.js'),'utf8');
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function fixture(){
 const date=today(),storage=new Map(),aircraft=[{id:'a',icao:'G2CA'},{id:'b',icao:'R44'}];
 const flights=[
  {date,aid:'a',role:'PIC',pilotConfig:'single',entryType:'flight',takeoffDay:3,landingDay:3,takeoffNight:1,landingNight:1},
  {date,aid:'b',role:'PIC',pilotConfig:'single',entryType:'flight',takeoffDay:1,landingDay:1,takeoffNight:0,landingNight:0}
 ];
 const state={window:{HeliLogV233Recency:engine,HeliLogV23Sync:{status:()=>({owner:'pilot'})}},
   v23AccountWorkspace:()=>true,
   localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val)},
   S:{aircraft},app:{innerHTML:''},effectiveFlights:()=>flights,
   isSimulatorSession:f=>f.entryType==='simulator',compareFlightsNewest:(a,b)=>b.date.localeCompare(a.date),
   flightPilotConfig:f=>f.pilotConfig,displayDate:x=>x,htmlEscape:x=>String(x),
   header:name=>'<header>'+name+'</header>',document:{getElementById:()=>null},Date};
 vm.createContext(state);vm.runInContext(recencySource,state);
 return {state,flights,storage,call:s=>vm.runInContext(s,state)};
}
test('dashboard card is compact list; no nested cards or count headlines',()=>{
 const f=fixture(),before=JSON.stringify(f.flights);
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|night"},checked:true})');
 const card=f.call('recencySummaryMarkup()');
 assert.match(card,/dashboard-recency-card/);
 assert.match(card,/recency-dashboard-row/);
 assert.match(card,/Night PIC/);
 assert.match(card,/Estimated met/);
 assert.match(card,/Threshold until/);
 assert.doesNotMatch(card,/recency-lapse|recency-indicator|recency-mini-grid|recorded movement pairs/);
 assert.equal((card.match(/class="card/g)||[]).length,1);
 assert.equal(JSON.stringify(f.flights),before);
});
test('selected cards only; deselecting all removes dashboard recency',()=>{
 const f=fixture();
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|general"},checked:true})');
 assert.match(f.call('recencySummaryMarkup()'),/Passenger-carrying/);
 assert.doesNotMatch(f.call('recencySummaryMarkup()'),/R44/);
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|general"},checked:false})');
 assert.equal(f.call('recencySummaryMarkup()'),'');
});
test('recency page has a single expandable All recencies list instead of many large panels',()=>{
 const f=fixture();f.call('recency()');
 const html=f.state.app.innerHTML;
 assert.match(html,/Show on dashboard/);
 assert.match(html,/recency-detail-list/);
 assert.equal((html.match(/class="recency-detail-row"/g)||[]).length,3);
 assert.equal((html.match(/class="card recency-detail-card"/g)||[]).length,1);
 assert.doesNotMatch(html,/class="recency-grid"|class="recency-panel"/);
 assert.match(html,/recency-detail-expanded/);
 assert.match(html,/EASA FCL\.060/);
 assert.match(html,/If no more qualifying flights are made/);
});
test('dashboard positions the compact recency card alongside upcoming dates',()=>{
 const start=dashboardSource.indexOf('class="dashboard-side-stack"');
 const end=dashboardSource.indexOf('class="grid two desktop-only"',start);
 assert.ok(start>0&&end>start);
 const right=dashboardSource.slice(start,end);
 assert.match(right,/recencySummaryMarkup\(\)/);
 assert.match(right,/Upcoming dates/);
 assert.doesNotMatch(dashboardSource.slice(0,start),/recencySummaryMarkup\(\)/);
});
