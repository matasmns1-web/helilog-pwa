'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=require('./recency.js');
const source=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
function run(){
 const a=[{id:'g',icao:'G2CA'}],flights=[{id:'f',date,aid:'g',role:'PIC',pilotConfig:'single',takeoffDay:3,landingDay:3,takeoffNight:1,landingNight:1}];
 const before=JSON.stringify(flights),store=new Map(),ctx={
 window:{HeliLogV233Recency:engine,HeliLogV23Sync:{status:()=>({owner:'owner1'})}},
 v23AccountWorkspace:()=>true,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 S:{aircraft:a},app:{innerHTML:''},effectiveFlights:()=>flights,isSimulatorSession:()=>false,
 compareFlightsNewest:()=>0,flightPilotConfig:f=>f.pilotConfig,header:()=>'<header>Recency</header>',
 displayDate:x=>x,htmlEscape:x=>String(x),document:{getElementById:()=>null},Date};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const call=code=>vm.runInContext(code,ctx);
 return {ctx,call,flights,before};
}
test('recency page emphasizes operation labels grouped beneath the helicopter type',()=>{
 const f=run();f.call('recency()');const html=f.ctx.app.innerHTML;
 assert.match(html,/recency-picker-type/);
 assert.match(html,/recency-detail-type/);
 assert.match(html,/<b class="recency-kind">Night PIC<\/b>/);
 assert.match(html,/<b class="recency-kind">Passenger-carrying<\/b>/);
 assert.doesNotMatch(html,/class="recency-pilot-note"/);
 assert.equal(JSON.stringify(f.flights),f.before);
});
test('dashboard labels operations in bold below a single type heading',()=>{
 const f=run();
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|night"},checked:true})');
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|general"},checked:true})');
 const card=f.call('recencySummaryMarkup()');
 assert.equal((card.match(/class="recency-type-heading"/g)||[]).length,1);
 assert.match(card,/<b class="recency-kind">Night PIC<\/b>/);
 assert.match(card,/<b class="recency-kind">Passenger-carrying<\/b>/);
 assert.doesNotMatch(card,/Single-pilot/);
 assert.match(card,/Threshold until/);
 assert.equal((card.match(/class="recency-dashboard-row"/g)||[]).length,2);
 assert.equal((card.match(/class="card /g)||[]).length,1);
 assert.equal(JSON.stringify(f.flights),f.before);
});
