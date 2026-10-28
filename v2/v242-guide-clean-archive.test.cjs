'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const review=require('./prearchive-review.js');
const src=fs.readFileSync(path.join(__dirname,'source/app/05-archive-and-corrections.js'),'utf8');
const start=src.indexOf('let pendingArchiveReview=null;');
const end=src.indexOf('/* V2.31.3:',start);
assert.ok(start>=0&&end>start);
const guard=src.slice(start,end);
const flight=(over={})=>({id:'f1',date:'2026-10-21',aid:'a1',dep:'EYVI',arr:'EYVI',
 off:'12:00',on:'13:00',mins:60,role:'PIC',picName:'SELF',picPersonId:'owner',
 pilotConfig:'single',nightMin:0,ifrMin:0,instrMin:0,takeoffDay:1,takeoffNight:0,
 landingDay:1,landingNight:0,...over});
const aircraft=[{id:'a1',reg:'LY-ABC',engine:'Single engine'}],people=[{id:'owner',name:'Owner'}];
function makeDraft(flights=[flight()],over={}){
 const total=flights.reduce((n,f)=>n+(f.mins||0),0);
 const std=flights.reduce((n,f)=>n+(f.stdMin||0),0);
 const pic=flights.reduce((n,f)=>n+(['PIC','SOLO','SPIC','PICUS'].includes(f.role)?f.mins||0:0),0);
 const multi=flights.reduce((n,f)=>n+(f.pilotConfig==='multi'?f.mins||0:0),0);
 const t={total,std,pic,dual:0,copilot:0,single:total-multi,multi,engineSE:total,engineME:0,night:0,ifr:0,instructor:0};
 return {id:'HL-001',firstPage:1,pageCount:1,flights,aircraft,pilot:{name:'Owner'},
   flightTotals:{...t},openingTotals:Object.fromEntries(Object.keys(t).map(k=>[k,0])),
   closingTotals:{...t},lateCount:0,ambiguousSimulatorDays:0,demoCount:0,...over};
}
function fixture(draft=makeDraft(),allFlights=draft.flights){
 const ctx={window:{HeliLogV29Review:review},S:{flights:allFlights,people},
  nextArchiveDraft:()=>draft};
 vm.createContext(ctx);vm.runInContext(guard,ctx);
 return {ctx,status:()=>vm.runInContext('v242ArchiveCheck()',ctx),
  accepted:()=>vm.runInContext('v229ArchiveReviewed()',ctx),
  setReview:()=>vm.runInContext('pendingArchiveReview=v242ArchiveCheck().key',ctx)};
}
test('clean batch bypasses the review acknowledgement but never mutates flight records',()=>{
 const d=makeDraft(),state=fixture(d);
 const before=JSON.stringify({d,all:state.ctx.S.flights});
 const result=state.status();
 assert.equal(result.clean,true);assert.equal(result.ready,true);
 assert.equal(result.report.issues.length,0);assert.equal(state.accepted(),true);
 assert.equal(JSON.stringify({d,all:state.ctx.S.flights}),before);
 assert.equal(vm.runInContext('pendingArchiveReview',state.ctx),null);
});
test('a real finding requires acknowledgement for the exact draft and findings',()=>{
 const f=flight({mins:5,on:'12:05'}),d=makeDraft([f]),state=fixture(d);
 assert.equal(state.status().clean,false);assert.equal(state.accepted(),false);
 assert.ok(state.status().report.advisory>0);
 state.setReview();assert.equal(state.accepted(),true);
 f.remarks='Changed after review';assert.equal(state.accepted(),false);
});
test('changes to another flight that alter findings invalidate previous acknowledgement',()=>{
 const f=flight(),other=flight({id:'old',off:'12:30',on:'13:30'});
 const d=makeDraft([f]),state=fixture(d,[f,other]);
 assert.ok(state.status().report.critical>0);
 state.setReview();assert.equal(state.accepted(),true);
 other.off='12:40';other.on='13:40';
 assert.equal(state.accepted(),false,'external overlap change invalidates acknowledgement');
});
test('late flights, simulator order warnings and demo records never take the clean shortcut',()=>{
 for(const [field,code] of [['lateCount','late-entry'],['ambiguousSimulatorDays','sim-order'],['demoCount','demo-entry']]){
  const st=fixture(makeDraft([flight()],{[field]:1}));
  assert.equal(st.status().clean,false,field);
  assert.equal(st.accepted(),false,field);
  assert.ok(st.status().report.issues.some(i=>i.code===code));
 }
});
test('unavailable, throwing or malformed review modules fail closed',()=>{
 const st=fixture();st.ctx.window.HeliLogV29Review=null;
 assert.equal(st.accepted(),false);assert.match(st.status().error,/unavailable/);
 st.ctx.window.HeliLogV29Review={evaluate(){throw Error('bad result')}};
 assert.equal(st.accepted(),false);assert.match(st.status().error,/failed/);
 st.ctx.window.HeliLogV29Review={evaluate(){return {issues:[],critical:3,advisory:0}}};
 assert.equal(st.accepted(),false);assert.match(st.status().error,/Invalid pre-archive findings/);
});
test('preview and confirmation still perform exact-batch safety gate and require signing',()=>{
 assert.match(src,/if\(!v229ArchiveReviewed\(draft\)\)\{go\("archivereview"\);return;\}/);
 assert.match(src,/if\(!v229ArchiveReviewed\(draft\)\)\{\s*alert\("The reviewed flight batch changed/);
 assert.match(src,/if\(JSON\.stringify\(draft\)!==pendingArchivePreview\)/);
 assert.match(src,/Only confirm if you have printed, checked and signed/);
 assert.match(src,/v242ReviewViewedKey/);
 assert.match(src,/reviewCheck\.clean/);
});
test('Start here leads topics and update history stays collapsed by default',()=>{
 const guide=fs.readFileSync(path.join(__dirname,'source/app/13-help-guide.js'),'utf8');
 const ctx={app:{innerHTML:''},header:()=>'',htmlEscape:x=>String(x)};
 vm.createContext(ctx);vm.runInContext(guide+'\nhelpGuide();',ctx);
 const html=ctx.app.innerHTML;
 const topics=html.slice(html.indexOf('<div class="guide-topics">'),html.indexOf('id="helpNoResults"'));
 assert.ok(topics.indexOf('Start here')>=0&&topics.indexOf('Start here')<topics.indexOf('Flight operations'));
 assert.match(html,/guide-history/);
 assert.match(html,/Older updates \(\d+\)/);
 assert.match(html,/guide-update-details/);
 assert.match(html,/V2\.42/);
 assert.match(html,/helpGuideSearch\(\)/);
 assert.match(html,/helpGuideExpand\(true\)/);
 assert.match(html,/helpGuideExpand\(false\)/);
});
