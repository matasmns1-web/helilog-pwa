'use strict';
/* V2.46 TEST — mobile filtering is view-only and preserves full-history totals. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const source=read('source/app/02-dashboard-and-logbook.js');
const css=read('source/base.css');

function scenario(){
 const flights=Array.from({length:40},(_,i)=>({
   id:'id-'+i,date:'2026-10-20',aid:i%2?'g':'r',
   dep:'EYVI',arr:'EYPA',off:'08:00',on:'09:00',
   mins:60,role:i%2?'PIC':'DUAL',ifrMin:i%4===0?20:0,
   nightMin:i%5===0?30:0,crossCountry:i%2===1,remarks:'TEST'
 }));
 const c={},listeners={};
 for(const id of ['logSearch','filterFrom','filterTo','filterAircraft','filterRole','filterXC','filterNight','filterIFR']){
   c[id]={value:'',addEventListener(type,cb){listeners[id+':'+type]=cb;}};
 }
 for(const id of ['logbookBody','logbookPagination','logbookPageSummary',
  'logbookPageLabel','logbookPrevPage','logbookNextPage','resultCount',
  'filteredTime','filteredSimulatorTime','filteredIFRTime','filteredNightTime',
  'filteredIFRWrap','filteredNightWrap','logbookFilterCount','logbookMobileClear',
  'logbookFilterToggleText']){
   c[id]={textContent:'',innerHTML:'',hidden:false,disabled:false,style:{}};
 }
 c.logbookBody.closest=()=>({scrollIntoView(){}});
 const attributes={'aria-expanded':'false'};
 c.logbookFilterToggle={
   getAttribute:key=>attributes[key],
   setAttribute:(key,value)=>{attributes[key]=value;}
 };
 const classes=new Set();
 const card={classList:{toggle:(name,enabled)=>enabled?classes.add(name):classes.delete(name)}};
 const ctx={
  S:{pilot:{name:'Test'},aircraft:[{id:'g',icao:'G2CA',reg:'TEST-G'},{id:'r',icao:'R44',reg:'TEST-R'}]},
  app:{innerHTML:''},
  window:{innerWidth:390,addEventListener(){}},
  document:{getElementById:id=>c[id]??null,querySelector:q=>q==='.logbook-flight-list'?card:null},
  effectiveFlights:()=>flights,isSimulatorSession:()=>false,isStandaloneApp:()=>true,
  isInstalledTouchApp:()=>true,header:()=>'',europeanDateField:id=>'<input id="'+id+'">',
  readEuropeanDate:()=>'',htmlEscape:s=>String(s??''),displayDate:s=>s,
  displayPICName:f=>f.role==='PIC'?'SELF':'TEST',fmt:n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0'),
  flightRemarksForDisplay:f=>f.remarks,simulatorDeviceLabel:()=>'',v23AccountWorkspace:()=>true,
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 ctx.logbook();
 return {ctx,c,classes,attributes,fire:(id,type)=>listeners[id+':'+type]()};
}
test('installed app keeps search and offers accessible compact filter drawer',()=>{
 const s=scenario();
 assert.match(s.ctx.app.innerHTML,/id="logSearch" type="search"/);
 assert.match(s.ctx.app.innerHTML,/id="logbookFilterToggle"/);
 assert.match(s.ctx.app.innerHTML,/aria-expanded="false"/);
 assert.match(s.ctx.app.innerHTML,/aria-controls="logbookPrimaryFilters logbookAdvancedFilters"/);
 assert.match(s.ctx.app.innerHTML,/id="filterIFR"/);
 assert.doesNotMatch(s.ctx.app.innerHTML,/logbook-filter-controls/);
 assert.match(css,/\.logbook-filter-primary>\.filterfield:not\(:first-child\),/);
 assert.match(css,/html\.installed-touch-app \.logbook-mobile-expanded \.logbook-filter-secondary\{display:grid\}/);
 assert.equal(s.c.filteredTime.textContent,'40:00');
 assert.equal(s.c.logbookPageLabel.textContent,'Page 1 of 4');
 assert.equal(s.c.logbookFilterCount.hidden,true);
 s.ctx.toggleLogbookMobileFilters();
 assert.equal(s.attributes['aria-expanded'],'true');
 assert.equal(s.c.logbookFilterToggleText.textContent,'Hide filters');
 assert.equal(s.classes.has('logbook-mobile-expanded'),true);
 s.ctx.toggleLogbookMobileFilters();
 assert.equal(s.attributes['aria-expanded'],'false');
 assert.equal(s.classes.has('logbook-mobile-expanded'),false);
});
test('filter badge, reset and totals reflect full matching list across pagination',()=>{
 const s=scenario();
 s.ctx.setLogbookPage(4);
 s.c.filterRole.value='PIC';s.fire('filterRole','change');
 assert.equal(s.c.logbookPageLabel.textContent,'Page 1 of 2');
 assert.equal(s.c.filteredTime.textContent,'20:00');
 assert.equal(s.c.logbookFilterCount.textContent,'1');
 assert.equal(s.c.logbookFilterCount.hidden,false);
 assert.equal(s.c.logbookMobileClear.hidden,false);
 s.c.filterIFR.value='yes';s.fire('filterIFR','change');
 assert.equal(s.c.filteredTime.textContent,'0:00');
 assert.equal(s.c.logbookFilterCount.textContent,'2');
 s.ctx.clearLogbookFilters();
 assert.equal(s.c.filteredTime.textContent,'40:00');
 assert.equal(s.c.logbookPageLabel.textContent,'Page 1 of 4');
 assert.equal(s.c.logbookFilterCount.hidden,true);
 assert.equal(s.c.logbookMobileClear.hidden,true);
 s.c.logSearch.value='TEST-G';s.fire('logSearch','input');
 assert.equal(s.c.filteredTime.textContent,'20:00');
 assert.equal(s.c.logbookMobileClear.hidden,false);
});
test('mobile drawer has minimum 44px touch targets and never mutates stored records',()=>{
 assert.match(css,/\.logbook-filter-toggle,\.logbook-mobile-clear\{min-height:44px\}/);
 assert.doesNotMatch(source,/localStorage\.setItem|S\.flights\.splice|\.rpc\(/);
});
