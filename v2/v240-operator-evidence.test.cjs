'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=require('./advanced-recency.js'),monitor=require('./operator-flight-monitor.js');
const source=fs.readFileSync(path.join(__dirname,'operator-rules-ui.js'),'utf8');
const USER='11111111-1111-4111-a111-111111111111';
const DAY='2026-10-27';
function fixture(sources=['flight','ffs','check','training']){
 const data={version:1,ownerId:USER,activeId:'op1',
  profiles:[{schema:1,id:'op1',ownerId:USER,operator:'Example operator',
   rules:[{id:'rule1',title:'Mixed source operations',monitor:'flights:all',
    aircraftType:'G2CA',configuration:'all',unit:'flights',minimum:3,periodDays:90,acceptedSources:sources}]}]};
 const local=new Map(),dom={app:{innerHTML:''}},state={current:data};
 const root={console,Math,Date,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v))},
  document:{getElementById:id=>dom[id]||null},
  v23AccountWorkspace:()=>true,HeliLogV23Sync:{status:()=>({owner:USER})},
  HeliLogV235AdvancedRecency:engine,HeliLogV2362OperatorMonitor:monitor,
  HeliLogOperatorSyncBridge:{read:()=>structuredClone(state.current),write:d=>{state.current=structuredClone(d);}},
  header:name=>'<header>'+name+'</header>',confirm:()=>true};
 root.window=root;vm.createContext(root);vm.runInContext(source,root);
 const ui=root.HeliLogV236OperatorRulesUI,aircraft=[{id:'g2',icao:'G2CA'}];
 const flights=[{id:'f1',date:DAY,aid:'g2',mins:55,nightMin:0,pilotConfig:'single'}];
 const set=(name,value,checked)=>{dom[name]=checked===undefined?{value}:{checked};};
 function fill({status='draft',source='ffs',amount='2',date=DAY,reference='FFS record TEST-4'}={}){
  ui.editEvidence('op1','rule1');
  set('opEvidenceDate',date);set('opEvidenceSource',source);set('opEvidenceAmount',amount);
  set('opEvidenceConfig','single');set('opEvidenceRef',reference);set('opEvidenceNotes','Reviewed simulated session');
  set('opEvidenceReviewed',null,status==='reviewed');
  dom.opEvidenceFeedback={hidden:true,textContent:''};
  ui.saveEvidence();
 }
 const assess=()=>ui.dashboardOptions(flights,aircraft,DAY)[0].result;
 return {data,root,ui,dom,state,flights,aircraft,set,fill,assess};
}
test('legacy operator profiles remain readable with no fabricated evidence',()=>{
 const f=fixture();
 assert.equal(f.ui.read().evidence.length,0);
 assert.equal(f.assess().count,1);
 assert.equal(f.assess().thresholdMet,false);
});
test('pilot-reviewed referenced FFS entries combine with real flights; drafts never count',()=>{
 const f=fixture();f.fill();
 assert.equal(f.ui.read().evidence.length,1);
 assert.equal(f.ui.read().evidence[0].status,'draft');
 assert.equal(f.assess().count,1);
 f.ui.editEvidence('op1','rule1',f.ui.read().evidence[0].id);
 f.set('opEvidenceDate',DAY);f.set('opEvidenceSource','ffs');f.set('opEvidenceAmount','2');
 f.set('opEvidenceConfig','single');f.set('opEvidenceRef','FFS-2026-17');
 f.set('opEvidenceNotes','Evidence reviewed');f.set('opEvidenceReviewed',null,true);
 f.ui.saveEvidence();
 const count=f.assess();
 assert.equal(count.flightCount,1);assert.equal(count.evidenceCount,2);
 assert.equal(count.count,3);assert.equal(count.thresholdMet,true);
 assert.equal(count.thresholdUntil,'2027-01-25');
 assert.equal(count.certified,false);
});
test('disallowed FFS source cannot be pilot-reviewed and does not create credit',()=>{
 const f=fixture(['flight','training']);
 f.fill({status:'reviewed'});
 assert.equal(f.ui.read().evidence.length,0);
 assert.match(f.dom.opEvidenceFeedback.textContent,/does not permit/);
 f.fill({status:'draft'});
 assert.equal(f.ui.read().evidence.length,1);
 assert.equal(f.assess().evidenceCount,0);
});
test('an empty reference never permits reviewed credit',()=>{
 const f=fixture();
 f.fill({status:'reviewed',reference:''});
 assert.equal(f.ui.read().evidence.length,0);
 assert.match(f.dom.opEvidenceFeedback.textContent,/requires evidence reference/i);
});
test('unrelated operator/profile evidence is rejected, and orphaning deletion is blocked',()=>{
 const f=fixture();
 f.fill({status:'reviewed'});
 const id=f.ui.read().evidence[0].id;
 let modified=structuredClone(f.ui.read());
 modified.evidence[0].ownerId='different-user';
 assert.throws(()=>f.ui.validate(modified,USER),/another account/);
 modified=structuredClone(f.ui.read());
 modified.evidence[0].profileId='op_missing';
 assert.throws(()=>f.ui.validate(modified,USER),/invalid/);
 f.ui.select('op1');f.ui.removeRule('rule1');
 assert.ok(f.ui.read().profiles[0].rules.some(r=>r.id==='rule1'));
 f.ui.removeEvidence(id);assert.equal(f.ui.read().evidence.length,0);
 f.ui.removeRule('rule1');assert.equal(f.ui.read().profiles[0].rules.length,0);
});
test('out-of-window reviewed evidence is retained but excluded, while evidence records stay account-synced',()=>{
 const f=fixture();f.fill({status:'reviewed',date:'2026-01-01'});
 assert.equal(f.ui.read().evidence.length,1);
 assert.equal(f.assess().evidenceCount,0);
 assert.equal(f.assess().count,1);
 assert.match(fs.readFileSync(path.join(__dirname,'cloud-sync.js'),'utf8'),/operatorProfiles/);
 assert.match(fs.readFileSync(path.join(__dirname,'auth-gate.js'),'utf8'),/operatorProfiles:next.operatorProfiles/);
});
test('entry fields escape user-provided evidence descriptions in the operator UI',()=>{
 const f=fixture();f.fill({status:'draft',reference:'<script>alert(1)</script>'});
 f.ui.page(f.flights,f.aircraft,DAY);
 assert.doesNotMatch(f.dom.app.innerHTML,/<script>alert\(1\)<\/script>/);
 assert.match(f.dom.app.innerHTML,/&lt;script&gt;/);
});
