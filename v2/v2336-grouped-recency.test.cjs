'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=require('./recency.js');
const script=fs.readFileSync(path.join(__dirname,'source/app/09-recency.js'),'utf8');
const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
function fixture(){
 const aircraft=[{id:'e',icao:'EC35'},{id:'t',icao:'TEST'}];
 const flights=[
  {date,aid:'e',role:'PIC',pilotConfig:'single',takeoffDay:3,landingDay:3,takeoffNight:1,landingNight:1},
  {date,aid:'t',role:'PIC',pilotConfig:'single',takeoffDay:4,landingDay:4,takeoffNight:1,landingNight:1},
  {date,aid:'t',role:'PIC',pilotConfig:'multi',takeoffDay:2,landingDay:2,takeoffNight:0,landingNight:0,
   recency:{pfConfirmed:true,day:2,night:0,icao:'TEST'}}
 ];
 const before=JSON.stringify(flights);
 const store=new Map(),ctx={window:{HeliLogV233Recency:engine,HeliLogV23Sync:{status:()=>({owner:'pilot'})}},
  v23AccountWorkspace:()=>true,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  S:{aircraft},app:{innerHTML:''},effectiveFlights:()=>flights,isSimulatorSession:()=>false,
  compareFlightsNewest:(a,b)=>b.date.localeCompare(a.date),flightPilotConfig:f=>f.pilotConfig,
  header:name=>'<header>'+name+'</header>',displayDate:x=>x,htmlEscape:x=>String(x),
  document:{getElementById:()=>null},Date};
 vm.createContext(ctx);vm.runInContext(script,ctx);
 return {ctx,flights,before,call:s=>vm.runInContext(s,ctx)};
}
test('dashboard groups selected recencies by ICAO type, uses operation names as row headings',()=>{
 const f=fixture();
 for(const k of ['EC35|single|general','EC35|single|night',
   'TEST|single|general','TEST|single|night','TEST|multi|general']){
   f.ctx.key=k;f.call('recencySetDashboardIndicator({dataset:{recencyKey:key},checked:true})');
 }
 const html=f.call('recencySummaryMarkup()');
 assert.equal((html.match(/class="recency-type-heading"/g)||[]).length,2);
 assert.equal((html.match(/class="recency-dashboard-row"/g)||[]).length,5);
 assert.ok(html.indexOf('>EC35</div>')<html.indexOf('>TEST</div>'));
 assert.match(html,/class="recency-type-heading">EC35<\/div>[\s\S]*?<b class="recency-kind">Passenger-carrying<\/b>/);
 assert.match(html,/<b class="recency-kind">Night PIC<\/b>/);
 // No unnecessary 'single-pilot' for the EC35's unique recency conditions.
 const ec35=html.split('class="recency-type-heading">EC35')[1].split('class="recency-type-heading">TEST')[0];
 assert.doesNotMatch(ec35,/Single-pilot|Multi-pilot/);
 // TEST has both crew configurations for passenger recency; distinguish them only there.
 const testGroup=html.split('class="recency-type-heading">TEST')[1];
 assert.match(testGroup,/recency-pilot-note">Single-pilot<\/span>/);
 assert.match(testGroup,/recency-pilot-note">Multi-pilot<\/span>/);
 assert.equal(JSON.stringify(f.flights),f.before);
});
test('recency page selectors and expandable rows grouped by type, still preserve config keys',()=>{
 const f=fixture();f.call('recency()');const html=f.ctx.app.innerHTML;
 assert.equal((html.match(/class="recency-picker-type"/g)||[]).length,2);
 assert.equal((html.match(/class="recency-detail-type"/g)||[]).length,2);
 assert.match(html,/data-recency-key="TEST\|multi\|general"/);
 assert.match(html,/data-recency-key="TEST\|single\|general"/);
 assert.match(html,/class="recency-choice-name"><b class="recency-kind">Passenger-carrying<\/b>/);
 assert.match(html,/class="recency-detail-main">\s*<b class="recency-kind">Night PIC<\/b>/);
 assert.match(html,/recency-pilot-note">Multi-pilot<\/span>/);
 assert.equal(JSON.stringify(f.flights),f.before);
});
test('removing a dashboard selection changes only selected rows, not underlying groups or flights',()=>{
 const f=fixture();
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"TEST|multi|general"},checked:true})');
 const before=f.call('recencySummaryMarkup()');
 assert.match(before,/TEST/);
 f.call('recencySetDashboardIndicator({dataset:{recencyKey:"TEST|multi|general"},checked:false})');
 assert.equal(f.call('recencySummaryMarkup()'),'');
 f.call('recency()');
 assert.match(f.ctx.app.innerHTML,/data-recency-key="TEST\|multi\|general"/);
 assert.equal(JSON.stringify(f.flights),f.before);
});
