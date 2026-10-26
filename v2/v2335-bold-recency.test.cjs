'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=require('./recency.js');
const source=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
const date=new Date().toLocaleDateString('en-CA').replace(/\//g,'-');
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
test('bold Night PIC and Passenger-carrying names in Recency list and selector only',()=>{
 const f=run();f.call('recency()');const html=f.ctx.app.innerHTML;
 assert.match(html,/<strong class="recency-kind">Night PIC<\/strong> ·/);
 assert.match(html,/<strong class="recency-kind">Passenger-carrying<\/strong> ·/);
 assert.match(html,/recency-choice-title recency-kind">Night PIC recency/);
 assert.match(html,/recency-choice-title recency-kind">Passenger-carrying recency/);
 assert.doesNotMatch(html,/<strong class="recency-kind">Threshold until/);
 assert.equal(JSON.stringify(f.flights),f.before);
});
test('dashboard remains compact while highlighting only the recency operation names',()=>{
 const f=run();
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|night"},checked:true})');
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"G2CA|single|general"},checked:true})');
 const card=f.call('recencySummaryMarkup()');
 assert.match(card,/<strong class="recency-kind">Night PIC<\/strong> ·/);
 assert.match(card,/<strong class="recency-kind">Passenger-carrying<\/strong> ·/);
 assert.match(card,/Threshold until/);
 assert.equal((card.match(/class="recency-dashboard-row"/g)||[]).length,2);
 assert.equal((card.match(/class="card /g)||[]).length,1);
 assert.equal(JSON.stringify(f.flights),f.before);
});
