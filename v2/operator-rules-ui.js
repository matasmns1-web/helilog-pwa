/* HeliLog V2.36.2 TEST — local, account-scoped operator-rule editor.
 * Custom operator guidance ONLY. Never overwrites EASA counters or flights.
 * Rules stay on this device, not in account cloud sync or signed archives.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HeliLogV236OperatorRulesUI=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 const engine=root.HeliLogV235AdvancedRecency;
 const monitor=root.HeliLogV2362OperatorMonitor;
 const PREFIX='helilog_operator_profiles_v1:';
 let openKey=null,selectedId=null,editingRuleId=null,addingProfile=false,note='';
 let renderFlights=[],renderAircraft=[],renderAsOf='';
 const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const dom=id=>root.document.getElementById(id);
 const getOwner=()=>{
   const logged=typeof root.v23AccountWorkspace==='function'&&root.v23AccountWorkspace();
   if(logged){
     const owner=String(root.HeliLogV23Sync?.status?.().owner||'');
     return /^[A-Za-z0-9:_-]{1,128}$/.test(owner)?owner:null;
   }
   // Local and sandbox workspaces have distinct browser storage namespaces.
   return root.HELILOG_OPERATOR_SANDBOX===true?'sandbox':'local';
 };
 function storageKey(){
   const owner=getOwner();
   return owner?PREFIX+owner:null;
 }
 function context(){
   const key=storageKey();
   if(key!==openKey){openKey=key;selectedId=null;editingRuleId=null;addingProfile=false;note='';}
   if(!key)throw Error('An authenticated account identifier is required before saving operator rules.');
   return {key,ownerId:key.slice(PREFIX.length)};
 }
 function validate(data,ownerId){
   if(!data||data.version!==1||data.ownerId!==ownerId||!Array.isArray(data.profiles)||
      data.profiles.length>20)throw Error('Stored operator profiles are invalid.');
   const ids=new Set();
   const profiles=data.profiles.map(p=>{
     if(!p||! /^[A-Za-z0-9:_-]{1,128}$/.test(p.id)||ids.has(p.id)||
       p.ownerId!==ownerId||typeof p.operator!=='string'||!p.operator.trim()||
       p.operator.trim().length>120||!Array.isArray(p.rules)||p.rules.length>50)
       throw Error('Stored operator profiles are invalid.');
     ids.add(p.id);
     if(p.rules.length)engine.ruleSet(p);
     // Legacy v2.36 rules remain intact and visibly unlinked until the pilot selects a source.
     for(const rule of p.rules)if(rule.monitor!==undefined&&rule.monitor!=='' )monitor.validate(rule);
     return {schema:1,id:p.id,ownerId,operator:p.operator.trim(),
       rules:p.rules.map(r=>({...r,acceptedSources:[...r.acceptedSources]}))};
   });
   if(data.activeId!==null&&(typeof data.activeId!=='string'||!ids.has(data.activeId)))
     throw Error('Stored active operator is invalid.');
   return {version:1,ownerId,activeId:data.activeId,profiles};
 }
 function read(){
   const {key,ownerId}=context();
   const raw=root.localStorage.getItem(key);
   if(raw===null)return {version:1,ownerId,activeId:null,profiles:[]};
   if(raw.length>150000)throw Error('Stored operator profiles exceed the safety limit.');
   let value;try{value=JSON.parse(raw);}catch{throw Error('Saved operator profiles cannot be read. Nothing has been overwritten.');}
   return validate(value,ownerId);
 }
 function write(data){
   const {key,ownerId}=context();
   const checked=validate(data,ownerId);
   root.localStorage.setItem(key,JSON.stringify(checked));
   return checked;
 }
 function refresh(){page();}
 function fail(e){note=(e?.message||String(e));refresh();}
 function fieldError(message,id){
   // Validation must never destroy typed values or hide feedback above the fold.
   const line=dom('opRuleFeedback');
   if(line){line.textContent=message;line.hidden=false;line.setAttribute?.('role','alert');}
   else note=message;
   const field=id?dom(id):null;
   if(field){field.setAttribute?.('aria-invalid','true');field.focus?.();}
   else line?.scrollIntoView?.({block:'nearest'});
 }
 function focusEditor(){
   const panel=dom('opRuleForm');
   panel?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
   const first=dom('opRuleTitle');
   first?.focus?.({preventScroll:true});
 }
 function uid(prefix){return prefix+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.floor(Math.random()*1e9).toString(36));}
 function createProfile(){
   try{
     const data=read(),name=String(dom('operatorProfileName')?.value||'').trim();
     if(!name||name.length>120)throw Error('Enter an operator name (1–120 characters).');
     if(data.profiles.length>=20)throw Error('Maximum 20 operator profiles.');
     const p={schema:1,id:uid('op_'),ownerId:data.ownerId,operator:name,rules:[]};
     data.profiles.push(p);
     // Do not implicitly activate a draft profile.
     write(data);selectedId=p.id;addingProfile=false;editingRuleId=null;note='Operator profile saved on this device.';
     refresh();
   }catch(e){fail(e);}
 }
 function showCreate(){addingProfile=true;note='';refresh();}
 function select(id){
   try{const data=read();if(!data.profiles.some(p=>p.id===id))return;
     selectedId=id;editingRuleId=null;addingProfile=false;note='';refresh();
   }catch(e){fail(e);}
 }
 function activate(id){
   try{const data=read();if(id!==null&&!data.profiles.some(p=>p.id===id))throw Error('Unknown operator profile.');
     data.activeId=id;write(data);note=id?'Active operator profile selected.':'No operator profile is active.';
     refresh();
   }catch(e){fail(e);}
 }
 function removeProfile(id){
   try{const data=read(),p=data.profiles.find(p=>p.id===id);if(!p)return;
     if(!root.confirm('Delete operator profile "'+p.operator+'" and all its custom rules on this device?'))return;
     data.profiles=data.profiles.filter(p=>p.id!==id);
     if(data.activeId===id)data.activeId=null;
     write(data);if(selectedId===id)selectedId=null;editingRuleId=null;
     note='Operator profile deleted locally.';refresh();
   }catch(e){fail(e);}
 }
 function renameProfile(){
   try{const data=read(),p=data.profiles.find(p=>p.id===selectedId);
     if(!p)throw Error('Select an operator profile.');
     const name=String(dom('operatorRename')?.value||'').trim();
     if(!name||name.length>120)throw Error('Enter an operator name (1–120 characters).');
     p.operator=name;write(data);note='Operator name updated.';refresh();
   }catch(e){fail(e);}
 }
 function editRule(id){
   try{
     const data=read();
     const fallback=data.profiles.find(p=>p.id===data.activeId)||data.profiles[0];
     const p=data.profiles.find(p=>p.id===selectedId)||fallback;
     if(!p)throw Error('Create an operator profile before adding a rule.');
     if(id!==null&&id!=='new'&&!p.rules.some(r=>r.id===id))
       throw Error('Selected rule is no longer available. Refresh this page.');
     selectedId=p.id;editingRuleId=id;note='';refresh();
     if(id!==null)focusEditor();
   }catch(e){fail(e);}
 }
 function saveRule(){
   try{
     const data=read(),p=data.profiles.find(p=>p.id===selectedId);
     if(!p)throw Error('Select an operator profile before saving a rule.');
     const v=id=>String(dom(id)?.value??'').trim();
     const title=v('opRuleTitle'),aircraftType=v('opRuleType').toUpperCase();
     const chosenMonitor=v('opRuleMonitor');
     const metric=monitor.optionFor(chosenMonitor);
     if(!metric){fieldError('Choose exactly which flight-entry activity this rule monitors.','opRuleMonitor');return;}
     if(!title||title.length>120){fieldError('Enter a rule name (up to 120 characters).','opRuleTitle');return;}
     if(!/^[A-Z0-9]{2,8}$/.test(aircraftType)){
       fieldError('Enter an ICAO helicopter type designator, such as G2CA, R44 or EC35.','opRuleType');return;
     }
     const days=Number(v('opRuleDays')),minimum=Number(v('opRuleMin'));
     if(!Number.isSafeInteger(minimum)||minimum<1||minimum>9999){
       fieldError('Minimum number must be a whole number from 1 to 9999.','opRuleMin');return;
     }
     if(!Number.isSafeInteger(days)||days<1||days>1095){
       fieldError('Rolling period must be a whole number from 1 to 1095 days.','opRuleDays');return;
     }
     const acceptedSources=engine.SOURCES.filter(x=>dom('opSource_'+x)?.checked);
     if(!acceptedSources.length){
       fieldError('Choose at least one credit source. This only defines eligibility; it does not award credits.');return;
     }
     const old=p.rules.find(r=>r.id===editingRuleId);
     if(!old&&p.rules.length>=50)throw Error('Maximum 50 rules per operator.');
     const next={id:old?.id||uid('rule_'),title,aircraftType,
       configuration:v('opRuleConfig'),unit:metric.unit,monitor:metric.id,
       periodDays:days,minimum,acceptedSources};
     if(old)p.rules=p.rules.map(r=>r.id===old.id?next:r);else p.rules.push(next);
     // Enforce the same strict operator rule schema as the separate credit engine.
     engine.ruleSet(p);
     monitor.validate(next);
     write(data);editingRuleId=null;note='Custom rule saved: '+title+'.';
     refresh();
   }catch(e){fieldError('Rule not saved: '+(e?.message||String(e)));}
 }
 function removeRule(id){
   try{const data=read(),p=data.profiles.find(p=>p.id===selectedId);
     if(!p||!p.rules.some(r=>r.id===id))return;
     if(!root.confirm('Delete this custom operator rule?'))return;
     p.rules=p.rules.filter(r=>r.id!==id);
     write(data);editingRuleId=null;note='Rule deleted locally.';refresh();
   }catch(e){fail(e);}
 }
 const choices=(values,selected,labels)=>values.map((v,i)=>
   '<option value="'+esc(v)+'"'+(v===selected?' selected':'')+'>'+esc(labels?.[i]||v)+'</option>').join('');
 function monitorChanged(){
   const selected=monitor.optionFor(dom('opRuleMonitor')?.value);
   const measure=dom('opRuleUnit');
   if(measure)measure.value=selected?.unit||'';
 }
 function sourceAssessment(rule){
   if(!rule.monitor)return '<span class="mini">Not connected · Edit this rule to select a monitored flight activity.</span>';
   if(!renderAsOf)return '<span class="mini">Waiting for flight data.</span>';
   try{
     const r=monitor.assess(rule,renderFlights,renderAircraft,renderAsOf);
     const tone=r.thresholdMet?'met':'below';
     return '<div class="mini">Recorded '+r.count+' / '+r.minimum+' '+esc(r.unit)+' · '+
       '<b class="recency-tone-'+tone+'">'+(r.thresholdMet?'Recorded threshold met':'Below threshold')+'</b>'+
       (r.thresholdUntil?' · Until '+esc(r.thresholdUntil)+' if no more recorded activity':'')+
       (r.missingCycleCounts?' · '+r.missingCycleCounts+' flight(s) missing cycle counts':'')+
       '</div>';
   }catch(e){return '<span class="mini">'+esc(e.message)+'</span>';}
 }
 function ruleForm(rule){
   const r=rule||{title:'',aircraftType:'',configuration:'all',unit:'cycles',
     periodDays:90,minimum:3,monitor:'',acceptedSources:['flight']};
   const available=(typeof S!=='undefined'&&Array.isArray(S.aircraft)?S.aircraft:[])
     .map(a=>String(a.icao||'').trim().toUpperCase()).filter(x=>/^[A-Z0-9]{2,8}$/.test(x));
   return '<div class="card" id="opRuleForm" style="margin-top:12px;scroll-margin-top:18px"><h3>'+(rule?'Edit rule':'Add rule')+'</h3>'+
    '<div class="grid">'+
    '<div class="field"><label for="opRuleTitle">Rule name</label><input id="opRuleTitle" maxlength="120" value="'+esc(r.title)+'" placeholder="HHO operational recency"></div>'+
    '<div class="field"><label for="opRuleType">ICAO helicopter type</label><input id="opRuleType" list="opAircraftTypes" maxlength="8" value="'+esc(r.aircraftType)+'" placeholder="EC35"><datalist id="opAircraftTypes">'+[...new Set(available)].map(x=>'<option value="'+esc(x)+'"></option>').join('')+'</datalist></div>'+
    '<div class="field"><label for="opRuleMonitor">Monitor from recorded activity</label>'+
    '<select id="opRuleMonitor" onchange="HeliLogV236OperatorRulesUI.monitorChanged()"><option value="">Select a source…</option>'+
    monitor.OPTIONS.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===r.monitor?' selected':'')+'>'+esc(x.label)+'</option>').join('')+
    '</select><div class="mini">Links this rule to the selected field in existing flight entries. Previously saved flights are read automatically.</div></div>'+
    '<div class="field"><label for="opRuleConfig">Crew configuration</label><select id="opRuleConfig">'+choices(engine.CONFIGS,r.configuration,['Single-pilot','Multi-pilot','Either / combined'])+'</select></div>'+
    '<div class="field"><label for="opRuleUnit">Measure (set by monitored activity)</label><select id="opRuleUnit" disabled>'+
    choices(engine.UNITS,monitor.optionFor(r.monitor)?.unit||r.unit,['Sequences','Flights','Cycles','Landings','Sessions'])+'</select></div>'+
    '<div class="field"><label for="opRuleMin">Minimum number</label><input id="opRuleMin" type="number" min="1" max="9999" step="1" value="'+esc(r.minimum)+'"></div>'+
    '<div class="field"><label for="opRuleDays">Rolling period (days)</label><input id="opRuleDays" type="number" min="1" max="1095" step="1" value="'+esc(r.periodDays)+'"></div></div>'+
    '<div class="field" style="margin-top:12px"><label>Permitted credit sources (explicitly authorised by your operator)</label>'+
    '<div class="actions" style="flex-wrap:wrap">'+engine.SOURCES.map(s=>'<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="opSource_'+s+'" '+(r.acceptedSources.includes(s)?'checked':'')+'>'+esc(({flight:'Flight',ffs:'Approved FFS',check:'Check',training:'Training'})[s])+'</label>').join('')+'</div></div>'+
    '<p class="mini">Only recorded flight activity is automatically counted in this version. FFS/check/training credits require separately reviewed evidence in a future phase; selecting them does not add credit.</p>'+
    '<p class="mini" id="opRuleFeedback" role="status" aria-live="polite" hidden></p>'+
    '<div class="actions"><button type="button" class="btn primary" onclick="HeliLogV236OperatorRulesUI.saveRule()">Save rule</button>'+
    '<button type="button" class="btn" onclick="HeliLogV236OperatorRulesUI.editRule(null)">Cancel</button></div></div>';
 }
 function page(flights,aircraft,asOf){
   if(Array.isArray(flights))renderFlights=flights;
   if(Array.isArray(aircraft))renderAircraft=aircraft;
   if(typeof asOf==='string')renderAsOf=asOf;
   let data;try{data=read();}catch(e){
     root.document.getElementById('app').innerHTML=root.header('Operator recency rules','Custom operator-specific requirements',
       '<button class="btn" onclick="go(\'recency\')">← Recency</button>')+
       '<div class="card"><h2>Operator rules cannot be opened</h2><p>'+esc(e.message)+'</p><p class="mini">Existing local records have not been changed or reset. Resolve account/storage access before editing.</p></div>';
     return;
   }
   const chosen=data.profiles.find(p=>p.id===selectedId)||data.profiles.find(p=>p.id===data.activeId)||data.profiles[0]||null;
   if(chosen)selectedId=chosen.id;
   const profiles=data.profiles.map(p=>
     '<div class="profileline" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><b>'+esc(p.operator)+'</b>'+
     '<div class="mini">'+p.rules.length+' rule'+(p.rules.length===1?'':'s')+(data.activeId===p.id?' · Active':' · Inactive')+'</div></div>'+
     '<div class="actions"><button class="btn'+(selectedId===p.id?' primary':'')+'" type="button" onclick="HeliLogV236OperatorRulesUI.select(\''+p.id+'\')">Manage</button>'+
     (data.activeId===p.id?'<button class="btn" type="button" onclick="HeliLogV236OperatorRulesUI.activate(null)">Deactivate</button>':
       '<button class="btn" type="button" onclick="HeliLogV236OperatorRulesUI.activate(\''+p.id+'\')">Set active</button>')+
     '<button class="btn" type="button" onclick="HeliLogV236OperatorRulesUI.removeProfile(\''+p.id+'\')">Delete</button></div></div>').join('');
   const rules=chosen?chosen.rules.map(r=>
     '<div class="profileline" style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">'+
     '<div><b>'+esc(r.title)+'</b><div class="mini">'+esc(r.aircraftType)+' · '+esc(r.configuration)+
     ' · '+r.minimum+' '+esc(r.unit)+' in '+r.periodDays+' days</div>'+
     '<div class="mini">Source: '+esc(monitor.optionFor(r.monitor)?.label||'Not connected')+'</div>'+
     sourceAssessment(r)+
     '<div class="mini">Accepted: '+esc(r.acceptedSources.join(', '))+'</div></div>'+
     '<div class="actions"><button type="button" class="btn" onclick="HeliLogV236OperatorRulesUI.editRule(\''+r.id+'\')">Edit</button>'+
     '<button type="button" class="btn" onclick="HeliLogV236OperatorRulesUI.removeRule(\''+r.id+'\')">Delete</button></div></div>').join(''):'';
   const edit=chosen&&editingRuleId?
     ruleForm(chosen.rules.find(r=>r.id===editingRuleId)||null):'';
   root.document.getElementById('app').innerHTML=root.header('Operator recency rules','Separate from EASA default recency',
     '<button class="btn" onclick="go(\'recency\')">← Recency</button>')+
     '<div class="card"><div class="head"><div><h2>Custom operator profiles</h2><div class="muted">Select the operator whose internal requirements you want to track.</div></div>'+
     '<button class="btn primary" type="button" onclick="HeliLogV236OperatorRulesUI.showCreate()">Add operator</button></div>'+
     '<p class="mini">Saved only in this browser for this HeliLog account or local workspace. Not cloud-synced, included in signed archives, or part of encrypted cloud backups.</p>'+
     (note?'<p role="status" class="mini">'+esc(note)+'</p>':'')+
     (addingProfile||!data.profiles.length?'<div class="field"><label for="operatorProfileName">Operator name</label>'+
       '<input maxlength="120" id="operatorProfileName" placeholder="Operator name"></div>'+
       '<div class="actions"><button type="button" class="btn primary" onclick="HeliLogV236OperatorRulesUI.createProfile()">Create profile</button>'+
       (data.profiles.length?'<button type="button" class="btn" onclick="HeliLogV236OperatorRulesUI.cancelCreate()">Cancel</button>':'')+'</div>':'')+
     (profiles||'<p class="muted">No operator profile yet. Create one to start configuring custom requirements.</p>')+'</div>'+
     (chosen?'<div class="card" style="margin-top:14px"><div class="head"><div><h2>'+esc(chosen.operator)+'</h2><div class="mini">'+
       (data.activeId===chosen.id?'Active custom operator profile':'Inactive custom operator profile')+'</div></div>'+
       '<button type="button" class="btn primary" onclick="HeliLogV236OperatorRulesUI.editRule(\'new\')">Add rule</button></div>'+
       '<div class="field"><label for="operatorRename">Rename operator</label><input id="operatorRename" maxlength="120" value="'+esc(chosen.operator)+'"></div>'+
       '<button class="btn" type="button" onclick="HeliLogV236OperatorRulesUI.renameProfile()">Save name</button>'+
       '<h3 style="margin-top:14px">Rules</h3>'+(rules||'<p class="muted">No custom rules yet.</p>')+edit+'</div>':'')+
     '<div class="card" style="margin-top:14px"><h2>EASA recency is unchanged</h2><p class="mini">'+
     'These are operator-defined tracking requirements, not official EASA rules. Flight counts use existing, self-recorded activity only. They do not certify currency; FFS/check/training credits still require reviewed evidence. Existing FCL.060 and SPA results are unaffected.</p></div>';
 }
 function cancelCreate(){addingProfile=false;note='';refresh();}
 function recencySummary(flights,aircraft,asOf){
   try{
     const data=read(),active=data.profiles.find(p=>p.id===data.activeId);
     if(!active)return '<p class="mini">No active operator. Select one under Manage rules.</p>';
     const list=active.rules.map(rule=>{
       if(!rule.monitor)return '<div class="recency-detail-row" style="padding:12px"><b>'+esc(rule.title)+'</b><div class="mini">Not connected · Edit this rule to choose a flight source</div></div>';
       const prevF=renderFlights,prevA=renderAircraft,prevDate=renderAsOf;
       renderFlights=flights;renderAircraft=aircraft;renderAsOf=asOf;
       const status=sourceAssessment(rule);
       renderFlights=prevF;renderAircraft=prevA;renderAsOf=prevDate;
       return '<div class="recency-detail-row" style="padding:12px"><b>'+esc(rule.title)+'</b>'+
         '<div class="mini">'+esc(monitor.optionFor(rule.monitor)?.label||'Unknown source')+
         ' · '+esc(rule.aircraftType)+'</div>'+status+'</div>';
     }).join('');
     return '<div class="mini">Active operator: <b>'+esc(active.operator)+'</b></div>'+
       (list||'<p class="mini">No rules in the active profile.</p>');
   }catch(e){return '<p class="mini">Custom rules unavailable: '+esc(e.message)+'</p>';}
 }
 function summary(){
   try{const data=read(),active=data.profiles.find(p=>p.id===data.activeId);
     return active?esc(active.operator)+' · '+active.rules.length+' custom rule'+(active.rules.length===1?'':'s'):'No operator profile active';
   }catch{return 'Operator profiles unavailable';}
 }
 return Object.freeze({storageKey,read,validate,page,summary,createProfile,showCreate,
   cancelCreate,select,activate,removeProfile,renameProfile,editRule,saveRule,removeRule,monitorChanged,recencySummary});
});