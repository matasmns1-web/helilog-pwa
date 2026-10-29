'use strict';
/* V2.45.1: Logbook pagination is UI-only; totals and filters span all records. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'source/app/02-dashboard-and-logbook.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'source/base.css'),'utf8');
function fixture({count=50,width=410,installed=false}={}){
 const flights=Array.from({length:count},(_,i)=>{
  const at=i+1;
  return {id:'flight-'+String(at).padStart(3,'0'),date:'2026-10-'+String(1+Math.floor(i/2)%28).padStart(2,'0'),
   dep:at%2?'EYVI':'EYPA',arr:at%2?'EYKA':'EYVI',off:'10:00',on:'11:00',mins:60,role:at%2?'PIC':'DUAL',
   aid:at%2?'c':'r',nightMin:at%4===0?15:0,ifrMin:at%5===0?25:0,crossCountry:at%2===1,
   remarks:'TEST RECORD'};
 });
 const controls={},calls={scroll:0,resizes:0};
 for(const k of ['logSearch','filterFrom','filterTo','filterAircraft','filterRole','filterXC','filterNight','filterIFR']){
  controls[k]={value:'',listeners:{},addEventListener(type,cb){this.listeners[type]=cb;}};
 }
 for(const k of ['logbookBody','logbookPagination','logbookPageSummary','logbookPageLabel','logbookPrevPage','logbookNextPage',
  'resultCount','filteredSimulatorTime','filteredTime','filteredIFRTime','filteredNightTime','filteredIFRWrap','filteredNightWrap']){
  controls[k]={textContent:'',innerHTML:'',style:{},hidden:false,disabled:false};
 }
 controls.logbookBody.closest=()=>({scrollIntoView(){calls.scroll++;}});
 const ctx={
  S:{pilot:{name:'Test Pilot'},aircraft:[{id:'c',icao:'G2CA',reg:'TEST-C'},{id:'r',icao:'R44',reg:'TEST-R'}],endorsements:[],qualifications:[]},
  app:{innerHTML:''},window:{innerWidth:width,addEventListener(name,cb){if(name==='resize'){calls.onResize=cb;calls.resizes++;}}},
  document:{getElementById:id=>controls[id]??null},
  isStandaloneApp:()=>installed,isInstalledTouchApp:()=>installed,header:()=>'<header>Logbook</header>',v23AccountWorkspace:()=>true,
  europeanDateField:id=>'<input id="'+id+'">',isSimulatorSession:f=>f.entryType==='simulator',
  effectiveFlights:()=>flights,flightRemarksForDisplay:f=>f.remarks||'',
  compareFlightsNewest:(a,b)=>String(b.date).localeCompare(a.date)||String(b.id).localeCompare(a.id),
  readEuropeanDate:()=>'',fmt:n=>Math.floor((n||0)/60)+':'+String((n||0)%60).padStart(2,'0'),
  htmlEscape:val=>String(val||''),displayDate:v=>v,displayPICName:f=>f.role==='PIC'?'SELF':'TEST INSTRUCTOR',
  simulatorDeviceLabel:()=>'', 
 };
 vm.createContext(ctx);vm.runInContext(code,ctx);
 const boot=()=>ctx.logbook(),call=expr=>vm.runInContext(expr,ctx);
 return {ctx,controls,calls,flights,boot,call,emit:(name,type)=>controls[name].listeners[type]?.()};
}
function nRows(html){return (html.match(/<tr class="click"/g)||[]).length;}
test('50 flights on phone appear as 10 per page; counts and totals include all 50',()=>{
 const f=fixture();f.boot();
 assert.match(f.ctx.app.innerHTML,/id="logbookPagination"/);
 assert.equal(nRows(f.controls.logbookBody.innerHTML),10);
 assert.equal(f.controls.logbookPageLabel.textContent,'Page 1 of 5');
 assert.equal(f.controls.logbookPageSummary.textContent,'Showing 1–10 of 50 entries');
 assert.equal(f.controls.resultCount.textContent,'50 entries');
 assert.equal(f.controls.filteredTime.textContent,'50:00');
 assert.equal(f.controls.logbookPrevPage.disabled,true);
 assert.equal(f.controls.logbookNextPage.disabled,false);
 f.call('setLogbookPage(2)');
 assert.equal(nRows(f.controls.logbookBody.innerHTML),10);
 assert.equal(f.controls.logbookPageSummary.textContent,'Showing 11–20 of 50 entries');
 assert.equal(f.controls.logbookPageLabel.textContent,'Page 2 of 5');
 assert.equal(f.controls.filteredTime.textContent,'50:00');
 assert.equal(f.calls.scroll,1,'Changing mobile pages should return to the start of the table');
 f.call('setLogbookPage(5)');
 assert.equal(f.controls.logbookNextPage.disabled,true);
 assert.equal(f.controls.logbookPrevPage.disabled,false);
 assert.equal(f.controls.logbookPageSummary.textContent,'Showing 41–50 of 50 entries');
 f.call('setLogbookPage(100)');
 assert.equal(f.controls.logbookPageLabel.textContent,'Page 5 of 5','Page changes are clamped');
 assert.equal(f.controls.filteredTime.textContent,'50:00');
});
test('desktop shows 25 entries and installed app is compact even in tablet landscape',()=>{
 const desktop=fixture({width:1440});desktop.boot();
 assert.equal(nRows(desktop.controls.logbookBody.innerHTML),25);
 assert.equal(desktop.controls.logbookPageLabel.textContent,'Page 1 of 2');
 desktop.call('setLogbookPage(2)');
 assert.equal(desktop.calls.scroll,0,'Desktop paging should not scroll unexpectedly');
 const installed=fixture({width:1024,installed:true});installed.boot();
 assert.equal(nRows(installed.controls.logbookBody.innerHTML),10);
 assert.equal(installed.controls.logbookPageLabel.textContent,'Page 1 of 5');
});
test('search, role and night filters apply globally, resetting to first page',()=>{
 const f=fixture();f.boot();f.call('setLogbookPage(5)');
 f.controls.filterRole.value='PIC';f.emit('filterRole','change');
 assert.equal(f.controls.logbookPageLabel.textContent,'Page 1 of 3');
 assert.equal(nRows(f.controls.logbookBody.innerHTML),10);
 assert.equal(f.controls.filteredTime.textContent,'25:00');
 f.controls.logSearch.value='TEST-R';f.emit('logSearch','input');
 assert.equal(f.controls.resultCount.textContent,'0 entries');
 assert.equal(f.controls.logbookPagination.hidden,true);
 assert.equal(f.controls.logbookPrevPage.disabled,true);
 assert.equal(f.controls.logbookNextPage.disabled,true);
 assert.match(f.controls.logbookBody.innerHTML,/No flights match/);
 f.controls.logSearch.value='';f.emit('logSearch','input');
 f.controls.filterRole.value='';
 f.controls.filterNight.value='yes';f.emit('filterNight','change');
 assert.equal(f.controls.resultCount.textContent,'12 entries');
 assert.equal(nRows(f.controls.logbookBody.innerHTML),10);
 assert.equal(f.controls.filteredNightWrap.style.display,'inline');
 assert.equal(f.controls.filteredNightTime.textContent,'3:00');
 f.call('clearLogbookFilters()');
 assert.equal(f.controls.logbookPageLabel.textContent,'Page 1 of 5');
 assert.equal(f.controls.resultCount.textContent,'50 entries');
});
test('empty/short logbook hides controls and resize re-paginates without adding records',()=>{
 const empty=fixture({count:0});empty.boot();
 assert.equal(empty.controls.logbookPagination.hidden,true);
 assert.match(empty.controls.logbookBody.innerHTML,/No flights match/);
 const f=fixture({count:35,width:1024});f.boot();assert.equal(f.controls.logbookPageLabel.textContent,'Page 1 of 2');
 f.call('setLogbookPage(2)');
 f.ctx.window.innerWidth=360;f.calls.onResize();
 assert.equal(f.controls.logbookPageLabel.textContent,'Page 1 of 4');
 assert.equal(nRows(f.controls.logbookBody.innerHTML),10);
 assert.equal(f.controls.filteredTime.textContent,'35:00');
 const short=fixture({count:7});short.boot();assert.equal(short.controls.logbookPagination.hidden,true);
 assert.equal(short.controls.resultCount.textContent,'7 entries');
});
test('pager uses responsive touch targets and no changes to logbook storage format',()=>{
 assert.match(css,/\.logbook-page-controls \.btn\{min-width:0;min-height:44px\}/);
 assert.match(css,/\.logbook-pagination\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(code,/localStorage\.setItem|\.rpc\(|S\.flights\.splice/);
});
