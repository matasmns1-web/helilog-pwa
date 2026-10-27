'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const model=require('./simulator-evidence.js');
const engine=require('./advanced-recency.js'),monitor=require('./operator-flight-monitor.js');
const source=fs.readFileSync(path.join(__dirname,'operator-rules-ui.js'),'utf8');
const USER='11111111-1111-4111-a111-111111111111',DAY='2026-10-27';
const clone=v=>structuredClone(v);
function fixture(){
 const rule={id:'rule1',title:'Operator training requirement',aircraftType:'G2CA',
  monitor:'flights:all',unit:'flights',configuration:'all',minimum:2,periodDays:90,
  acceptedSources:['flight','ffs']};
 const state={data:{version:1,ownerId:USER,activeId:'op1',profiles:[
  {schema:1,id:'op1',ownerId:USER,operator:'Example Operator',rules:[rule]}]}};
 const flights=[{id:'sim1',entryType:'simulator',date:DAY,simCategory:'FFS',
  simAircraftType:'G2CA',simPilotConfig:'single',simDevice:'Cabri G2',
  simQualification:'FFS-123',stdMin:120,remarks:'Approved training scenario'}];
 const nodes={app:{innerHTML:''}},storage=new Map();
 const root={console,Date,Math,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  document:{getElementById:id=>nodes[id]||null},header:name=>'<header>'+name+'</header>',
  HeliLogV235AdvancedRecency:engine,HeliLogV2362OperatorMonitor:monitor,
  HeliLogV241SimulatorEvidence:model,
  HeliLogV23Sync:{status:()=>({owner:USER})},v23AccountWorkspace:()=>true,
  HeliLogOperatorSyncBridge:{read:()=>clone(state.data),write:v=>{state.data=clone(v)}},
  effectiveFlights:()=>flights,confirm:()=>true};
 root.window=root;vm.createContext(root);vm.runInContext(source,root);
 const ui=root.HeliLogV236OperatorRulesUI;
 ui.page(flights,[],DAY);
 const set=(id,value,checked)=>{nodes[id]=checked===undefined?{value}:{checked};};
 const review=(amount='2',ref='Simulator report TEST-2')=>{
  ui.reviewSession('op1','rule1','sim1');
  set('opEvidenceAmount',amount);set('opEvidenceRef',ref);
  set('opEvidenceNotes','Pilot reviewed');set('opEvidenceReviewed',null,true);
  nodes.opEvidenceFeedback={hidden:true,textContent:''};
  ui.saveEvidence();
 };
 const assess=()=>ui.dashboardOptions(flights,[],DAY)[0].result;
 return {rule,ui,flights,root,nodes,storage,review,assess,set,state};
}
test('matches require an explicitly identified FFS, exact ICAO type, known crew and permitted source',()=>{
 const f=fixture(),s=f.flights[0];
 assert.equal(model.matches(s,f.rule),true);
 assert.equal(model.suggestions(s,f.ui.read().profiles).length,1);
 assert.equal(model.matches({...s,simCategory:'FNPT II'},f.rule),false);
 assert.equal(model.matches({...s,simAircraftType:''},f.rule),false);
 assert.equal(model.matches({...s,simAircraftType:'R44'},f.rule),false);
 assert.equal(model.matches({...s,simPilotConfig:''},f.rule),false);
 assert.equal(model.matches({...s,simPilotConfig:'multi'},{...f.rule,configuration:'single'}),false);
 assert.equal(model.matches(s,{...f.rule,acceptedSources:['flight']}),false);
 assert.equal(model.matches({...s,date:'2026-02-30'},f.rule),false);
});
test('suggestion is non-crediting, explicit review links exactly one session per operator rule',()=>{
 const f=fixture();assert.equal(f.assess().count,0);
 assert.equal(f.ui.sessionMatches(f.flights[0]).length,1);
 f.ui.reviewSession('op1','rule1','sim1');
 assert.doesNotMatch(f.nodes.app.innerHTML,/Session changed since the last review/);
 f.review('2');
 const result=f.assess();
 assert.equal(result.count,2);assert.equal(result.evidenceCount,2);
 assert.equal(result.thresholdMet,true);assert.equal(result.certified,false);
 const records=f.ui.read().evidence;
 assert.equal(records.length,1);
 assert.equal(records[0].sessionId,'sim1');
 assert.equal(records[0].sessionProof,model.proof(f.flights[0]));
 f.review('1');
 assert.equal(f.ui.read().evidence.length,1,'repeated review edits existing evidence');
 assert.equal(f.assess().count,1);
});
test('edited simulator date/device/remarks and deleted simulator suspend prior credit without modifying evidence',()=>{
 const f=fixture();f.review();
 const original=f.ui.read().evidence[0];
 f.flights[0].remarks='Changed exercise';assert.equal(f.assess().evidenceCount,0);
 f.flights[0].remarks='Approved training scenario';assert.equal(f.assess().evidenceCount,2);
 f.flights[0].date='2026-10-26';assert.equal(f.assess().evidenceCount,0);
 f.flights[0].date=DAY;f.flights[0].simDevice='Changed device';
 assert.equal(f.assess().evidenceCount,0);
 f.flights[0].simDevice='Cabri G2';
 assert.equal(f.assess().evidenceCount,2);
 assert.equal(f.ui.read().evidence[0].sessionProof,original.sessionProof);
 f.flights.splice(0,1);assert.equal(f.assess().evidenceCount,0);
 assert.equal(f.ui.read().evidence.length,1,'deleted simulator does not silently erase evidence');
});
test('rule changes invalidate linked evidence and a second explicit review can restore it',()=>{
 const f=fixture();f.review();const former=f.ui.read().evidence[0];
 f.flights[0].simQualification='Changed qualification';
 assert.equal(f.assess().evidenceCount,0);
 f.ui.reviewSession('op1','rule1','sim1');
 assert.match(f.nodes.app.innerHTML,/Session changed since the last review/);
 f.set('opEvidenceAmount','2');f.set('opEvidenceRef','New simulator report');
 f.set('opEvidenceNotes','Re-reviewed');f.set('opEvidenceReviewed',null,true);
 f.ui.saveEvidence();
 assert.equal(f.assess().evidenceCount,2);
 assert.notEqual(f.ui.read().evidence[0].sessionProof,former.sessionProof);
 f.state.data.profiles[0].rules[0].acceptedSources=['flight'];
 assert.equal(f.assess().evidenceCount,0);
});
test('unreviewed or unreferenced matches never produce credits',()=>{
 const f=fixture();f.ui.reviewSession('op1','rule1','sim1');
 f.set('opEvidenceAmount','3');f.set('opEvidenceRef','REPORT-A');
 f.set('opEvidenceNotes','Draft');f.set('opEvidenceReviewed',null,false);
 f.ui.saveEvidence();assert.equal(f.assess().evidenceCount,0);
 f.ui.reviewSession('op1','rule1','sim1');
 f.set('opEvidenceAmount','2');f.set('opEvidenceRef','');
 f.set('opEvidenceNotes','Missing reference');f.set('opEvidenceReviewed',null,true);
 f.nodes.opEvidenceFeedback={hidden:true,textContent:''};
 f.ui.saveEvidence();
 assert.match(f.nodes.opEvidenceFeedback.textContent,/requires evidence reference/);
 assert.equal(f.assess().evidenceCount,0);
});
test('linked provenance fails closed but older manual FFS evidence remains compatible',()=>{
 const f=fixture();f.review();
 const linked=f.ui.read();linked.evidence[0].sessionProof='';
 assert.throws(()=>f.ui.validate(linked,USER),/invalid provenance/);
 const manual=f.ui.read();delete manual.evidence[0].sessionId;delete manual.evidence[0].sessionProof;
 assert.equal(f.ui.validate(manual,USER).evidence[0].sessionId,undefined);
 assert.equal(model.proof({entryType:'simulator',simCategory:'FFS',simAircraftType:'',id:'sim1'}),null);
});
test('entrypoint includes simulator classification fields and app caches matcher offline',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
 assert.match(read('source/app/06-flights-and-night.js'),/id="simAircraftType"/);
 assert.match(read('source/app/06-flights-and-night.js'),/id="simPilotConfig"/);
 assert.match(read('source/index.template.html'),/simulator-evidence\.js\?v=2\.41/);
 assert.match(read('service-worker.js'),/simulator-evidence\.js\?v=2\.41/);
 assert.doesNotMatch(read('recency.js'),/HeliLogV241SimulatorEvidence/);
});
