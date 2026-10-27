'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=require('./advanced-recency.js');
const monitor=require('./operator-flight-monitor.js');
const source=fs.readFileSync(path.join(__dirname,'operator-rules-ui.js'),'utf8');
function fixture(){
 const store=new Map(),nodes={app:{innerHTML:''}},root={
   console,Date,Math,
   S:{aircraft:[{icao:'G2CA'},{icao:'EC35'}]},
   localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)},
   document:{getElementById:id=>nodes[id]||null},
   header:(title,sub,action)=>'<header>'+title+action+'</header>',
   HeliLogV235AdvancedRecency:engine,HeliLogV2362OperatorMonitor:monitor,
   HeliLogV23Sync:{status:()=>({owner:root.owner})},
   v23AccountWorkspace:()=>root.cloud,
   HELILOG_OPERATOR_SANDBOX:false,
   confirm:()=>true,owner:'pilot_one',cloud:true
 };
 root.window=root;vm.createContext(root);vm.runInContext(source,root);
 const ui=root.HeliLogV236OperatorRulesUI;
 return {root,ui,store,nodes,field:(id,value,checked)=>{
    nodes[id]=checked===undefined?{value}:{checked};},read:()=>ui.read()};
}
test('create, rename, activate and deactivate operator profile independently of flights',()=>{
 const f=fixture();f.ui.page();assert.match(f.nodes.app.innerHTML,/Create profile/);
 f.field('operatorProfileName','Heli Operator');
 f.ui.createProfile();let data=f.read();
 assert.equal(data.profiles.length,1);assert.equal(data.activeId,null);
 const id=data.profiles[0].id;
 f.ui.activate(id);assert.equal(f.read().activeId,id);
 f.field('operatorRename','Heli Operator 2');f.ui.renameProfile();
 assert.equal(f.read().profiles[0].operator,'Heli Operator 2');
 f.ui.activate(null);assert.equal(f.read().activeId,null);
 assert.equal(f.store.has('helilog_v2_complete_test_data'),false);
});
test('rule editor creates, updates and removes validated rules with explicit credit sources',()=>{
 const f=fixture();f.field('operatorProfileName','Training operator');f.ui.createProfile();
 const id=f.read().profiles[0].id;
 f.ui.editRule('new');assert.match(f.nodes.app.innerHTML,/opRuleType/);
 f.field('opRuleTitle','Hoist exercise');
 f.field('opRuleType','EC35');f.field('opRuleMonitor','special:HESLO1');f.field('opRuleConfig','all');
 f.field('opRuleUnit','cycles');f.field('opRuleMin','3');f.field('opRuleDays','90');
 for(const source of engine.SOURCES)f.field('opSource_'+source,'',source==='flight'||source==='ffs');
 f.ui.saveRule();
 let data=f.read(),rule=data.profiles[0].rules[0];
 assert.equal(rule.minimum,3);assert.deepEqual(Array.from(rule.acceptedSources),['flight','ffs']);
 assert.equal(engine.ruleSet(data.profiles[0]).rules[0].aircraftType,'EC35');
 f.ui.editRule(rule.id);f.field('opRuleMin','5');f.ui.saveRule();
 assert.equal(f.read().profiles[0].rules[0].minimum,5);
 f.ui.removeRule(rule.id);assert.equal(f.read().profiles[0].rules.length,0);
 assert.equal(f.read().profiles[0].id,id);
});
test('invalid rule input cannot overwrite previous saved rules',()=>{
 const f=fixture();f.field('operatorProfileName','Operator');f.ui.createProfile();
 f.ui.editRule('new');
 const before=JSON.stringify(f.read());
 f.field('opRuleTitle','Test');f.field('opRuleType','R44');f.field('opRuleMonitor','special:HESLO1');
 f.field('opRuleConfig','all');f.field('opRuleUnit','cycles');
 f.field('opRuleMin','1.5');f.field('opRuleDays','90');
 for(const source of engine.SOURCES)f.field('opSource_'+source,'',source==='flight');
 f.nodes.opRuleFeedback={hidden:true,textContent:'',setAttribute(){}};
 const beforeHtml=f.nodes.app.innerHTML;
 f.ui.saveRule();assert.equal(JSON.stringify(f.read()),before);
 assert.equal(f.nodes.app.innerHTML,beforeHtml,'failed validation must not redraw or clear entered data');
 assert.match(f.nodes.opRuleFeedback.textContent,/whole number from 1 to 9999/);
 assert.equal(f.nodes.opRuleFeedback.hidden,false);
});
test('Add Rule scrolls into view; save rejects missing ICAO type without destroying form',()=>{
 const f=fixture();f.field('operatorProfileName','Local Operator');f.ui.createProfile();
 let scrolled=0,focused=0;
 f.nodes.opRuleForm={scrollIntoView:()=>scrolled++};
 f.nodes.opRuleTitle={value:'NVIS check',focus:()=>focused++};
 f.ui.editRule('new');
 assert.match(f.nodes.app.innerHTML,/id="opRuleForm"/);
 assert.equal(scrolled,1);assert.equal(focused,1);
 f.nodes.opRuleFeedback={hidden:true,textContent:'',setAttribute(){}};
 f.field('opRuleType','');f.field('opRuleMonitor','special:HESLO1');
 f.field('opRuleConfig','all');f.field('opRuleUnit','flights');
 f.field('opRuleMin','3');f.field('opRuleDays','90');
 for(const src of engine.SOURCES)f.field('opSource_'+src,'',src==='flight');
 const html=f.nodes.app.innerHTML;
 f.ui.saveRule();
 assert.equal(f.nodes.app.innerHTML,html);
 assert.match(f.nodes.opRuleFeedback.textContent,/ICAO helicopter type designator/);
 assert.equal(f.read().profiles[0].rules.length,0);
});
test('new-rule edit always resolves active operator selection instead of silently returning',()=>{
 const f=fixture();f.field('operatorProfileName','Operator');f.ui.createProfile();
 const id=f.read().profiles[0].id;f.ui.activate(id);
 f.root.HeliLogV236OperatorRulesUI.select(id);
 f.ui.editRule('new');
 assert.match(f.nodes.app.innerHTML,/id="opRuleTitle"/);
});
test('cloud owner changes isolate stored profiles; sandbox and local storage differ',()=>{
 const f=fixture();f.field('operatorProfileName','Operator A');f.ui.createProfile();
 assert.equal(f.read().profiles.length,1);
 f.root.owner='pilot_two';
 assert.equal(f.read().profiles.length,0);
 f.field('operatorProfileName','Operator B');f.ui.createProfile();
 assert.equal(f.read().profiles[0].operator,'Operator B');
 f.root.owner='pilot_one';assert.equal(f.read().profiles[0].operator,'Operator A');
 f.root.cloud=false;assert.equal(f.read().profiles.length,0);
 f.root.HELILOG_OPERATOR_SANDBOX=true;assert.equal(f.read().profiles.length,0);
 assert.equal(f.store.size,2);
});
test('unknown owner or corrupt/wrong-owner saved payload fails closed',()=>{
 const f=fixture();f.root.owner='';
 assert.throws(()=>f.read(),/authenticated account identifier/);
 f.root.owner='pilot_one';
 const key=f.ui.storageKey(),bad='{"version":1,"ownerId":"pilot_two","activeId":null,"profiles":[]}';
 f.store.set(key,bad);assert.throws(()=>f.read(),/invalid/);
 f.ui.page();assert.match(f.nodes.app.innerHTML,/cannot be opened/);
 assert.equal(f.store.get(key),bad);
});
test('profile names and user supplied strings are escaped before rendering',()=>{
 const f=fixture();f.field('operatorProfileName','<img src=x onerror=alert(1)>');f.ui.createProfile();
 assert.doesNotMatch(f.nodes.app.innerHTML,/<img src=x/);
 assert.match(f.nodes.app.innerHTML,/&lt;img src=x/);
});
test('UI route and assets are connected without changing EASA calculators or archive data',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
 assert.match(read('source/index.template.html'),/operator-rules-ui\.js\?v=2\.37/);
 assert.match(read('service-worker.js'),/operator-rules-ui\.js\?v=2\.37/);
 assert.match(read('source/app/13-routing-and-boot.js'),/operatorrules:/);
 assert.match(read('source/app/09-recency.js'),/Manage operator rules/);
 assert.doesNotMatch(read('source/app/10-settings-and-locations.js'),/Operator recency rules/);
 assert.doesNotMatch(read('recency.js'),/operatorprofiles|operatorRules/);
 assert.doesNotMatch(read('special-recency.js'),/operatorprofiles|operatorRules/);
});