/* HeliLog V2.39.1 TEST — account-scoped operator-rule editor.
 * Custom operator guidance ONLY. Never overwrites EASA counters or flights.
 * Account workspaces sync rules; signed archives remain unchanged.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HeliLogV236OperatorRulesUI=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 const engine=root.HeliLogV235AdvancedRecency;
 const monitor=root.HeliLogV2362OperatorMonitor;
 const matcher=root.HeliLogV241SimulatorEvidence;
 const PREFIX='helilog_operator_profiles_v1:';
 let openKey=null,selectedId=null,editingRuleId=null,editingEvidenceId=null,evidenceRuleId=null,matchedSessionId=null,addingProfile=false,note='';
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
   if(key!==openKey){openKey=key;selectedId=null;editingRuleId=null;editingEvidenceId=null;evidenceRuleId=null;matchedSessionId=null;addingProfile=false;note='';}
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
   // Optional V2.40 evidence is backwards compatible with older accounts.
   // Each event is explicitly tied to an existing operator/rule; an FFS/check/
   // training record is never silently promoted from a logged real flight.
   const events=data.evidence===undefined?[]:data.evidence;
   if(!Array.isArray(events)||events.length>500)throw Error('Stored training evidence is invalid.');
   const eventIds=new Set();
   const evidence=events.map(raw=>{
     if(!raw||typeof raw.profileId!=='string'||eventIds.has(raw.id)||
       !ids.has(raw.profileId)||raw.source==='flight')throw Error('Stored training evidence is invalid.');
     const profile=profiles.find(p=>p.id===raw.profileId);
     if(!profile?.rules.some(r=>r.id===raw.ruleId))throw Error('Training evidence links to a missing rule; preserve the original record.');
     const event=engine.creditEvent(raw);
     if(event.ownerId!==ownerId)throw Error('Training evidence belongs to another account.');
     const notes=raw.notes===undefined?'':String(raw.notes);
     if(notes.length>500)throw Error('Training evidence notes exceed 500 characters.');
     const linked=raw.sessionId!==undefined||raw.sessionProof!==undefined;
     if(linked && (event.source!=='ffs'||
       typeof raw.sessionId!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(raw.sessionId)||
       typeof raw.sessionProof!=='string'||!raw.sessionProof||raw.sessionProof.length>12000))
       throw Error('Linked simulator evidence has invalid provenance; no records were overwritten.');
     eventIds.add(event.id);
     return {...event,profileId:raw.profileId,notes,
       ...(linked?{sessionId:raw.sessionId,sessionProof:raw.sessionProof}:{})};
   });
   return {version:1,ownerId,activeId:data.activeId,profiles,evidence};
 }
 function read(){
   const {key,ownerId}=context();
   if(typeof root.v23AccountWorkspace==='function'&&root.v23AccountWorkspace()){
     if(!root.HeliLogOperatorSyncBridge?.read)throw Error('Cloud operator storage is unavailable. Reload online.');
     const value=root.HeliLogOperatorSyncBridge.read();
     return value===null||value===undefined?{version:1,ownerId,activeId:null,profiles:[]}:validate(value,ownerId);
   }
   const raw=root.localStorage.getItem(key);
   if(raw===null)return {version:1,ownerId,activeId:null,profiles:[]};
   if(raw.length>450000)throw Error('Stored operator profiles exceed the safety limit.');
   let value;try{value=JSON.parse(raw);}catch{throw Error('Saved operator profiles cannot be read. Nothing has been overwritten.');}
   return validate(value,ownerId);
 }
 function write(data){
   const {key,ownerId}=context();
   const checked=validate(data,ownerId);
   if(typeof root.v23AccountWorkspace==='function'&&root.v23AccountWorkspace()){
     if(!root.HeliLogOperatorSyncBridge?.write)throw Error('Cloud operator storage is unavailable. Nothing was replaced.');
     root.HeliLogOperatorSyncBridge.write(checked);
   }else root.localStorage.setItem(key,JSON.stringify(checked));
   return checked;
 }
 // Read-only, one-time source for moving earlier browser rules to account sync.
 // Never delete the old local storage key; it is a recovery copy.
 function legacyForAccount(ownerId){
   if(!/^[0-9a-f-]{36}$/i.test(String(ownerId)))throw Error('Invalid operator-profile account ID.');
   const raw=root.localStorage.getItem(PREFIX+ownerId);
   if(raw===null)return null;
   if(raw.length>450000)throw Error('Saved operator rules exceed the safety limit.');
   let data;try{data=JSON.parse(raw);}catch{throw Error('Saved operator rules cannot be read. Nothing was overwritten.');}
   return validate(data,ownerId);
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
     if(data.evidence.some(e=>e.profileId===id))throw Error('This operator has linked evidence. Delete those evidence entries first to preserve traceability.');
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
     selectedId=p.id;editingRuleId=id;editingEvidenceId=null;evidenceRuleId=null;note='';refresh();
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
     if(data.evidence.some(e=>e.profileId===p.id&&e.ruleId===id))throw Error('This rule has linked training evidence. Remove the evidence first.');
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
 // Phase 3C: combine only source-authorised, pilot-reviewed evidence with
 // independently recorded real flights. Never count unreviewed drafts.
 function assessRule(profile,rule,data,flights,aircraft,asOf){
   const observed=monitor.assess(rule,flights,aircraft,asOf);
   const related=data.evidence.filter(e=>e.profileId===profile.id&&e.ruleId===rule.id);
   const sessions=new Map((Array.isArray(flights)?flights:[])
     .filter(f=>f?.entryType==='simulator').map(f=>[f.id,f]));
   // A linked event is credited only if the CURRENT simulator record still
   // exists, matches the rule and is exactly as reviewed. No stale snapshots,
   // deleted sessions or duplicate links may inflate the result.
   const linkedSeen=new Set();
   const validated=related.filter(e=>{
     if(!e.sessionId)return true; // Historical manual Phase 3C evidence.
     if(linkedSeen.has(e.sessionId))return false;
     linkedSeen.add(e.sessionId);
     return matcher?.eligibleRecord(e,sessions.get(e.sessionId),rule)===true;
   });
   const assessed=engine.assess(profile,validated,asOf,rule.id);
   const allowedFlight=rule.acceptedSources.includes('flight');
   const flightCount=allowedFlight?observed.count:0;
   const evidenceCount=assessed.count;
   const count=flightCount+evidenceCount;
   const allowedIds=new Set(assessed.evidenceIds);
   const events=[...(allowedFlight?(observed.evidenceEvents||[]):[]),
     ...related.filter(e=>allowedIds.has(e.id)).map(e=>({date:e.date,count:e.amount}))];
   let thresholdUntil=null;
   if(count>=rule.minimum){
     let total=0;
     for(const e of events.sort((a,b)=>b.date.localeCompare(a.date))){
       total+=e.count;
       if(total>=rule.minimum){thresholdUntil=engine.shift(e.date,rule.periodDays);break;}
     }
   }
   return {...observed,count,flightCount,evidenceCount,
     evidenceEntries:assessed.evidenceIds.length,thresholdMet:count>=rule.minimum,thresholdUntil,
     source:'mixed-pilot-reviewed',certified:false};
 }
 function sourceAssessment(rule){
   if(!rule.monitor)return '<span class="mini">Not connected · Edit this rule to select a monitored flight activity.</span>';
   if(!renderAsOf)return '<span class="mini">Waiting for flight data.</span>';
   try{
     const data=read(),profile=data.profiles.find(p=>p.rules.some(r=>r.id===rule.id));
     if(!profile)throw Error('Rule profile was not found.');
     const r=assessRule(profile,rule,data,renderFlights,renderAircraft,renderAsOf);
     const tone=r.thresholdMet?'met':'below';
     return '<div class="mini">Recorded '+r.count+' / '+r.minimum+' '+esc(r.unit)+' · '+
       '<b class="recency-tone-'+tone+'">'+(r.thresholdMet?'Recorded threshold met':'Below threshold')+'</b>'+ 
       ' ('+r.flightCount+' flight + '+r.evidenceCount+' pilot-reviewed evidence)'+
       (r.thresholdUntil?' · Until '+esc(r.thresholdUntil)+' if no further qualifying activity':'')+
       (r.missingCycleCounts?' · '+r.missingCycleCounts+' flight(s) missing cycle counts':'')+
       '</div>';
   }catch(e){return '<span class="mini">'+esc(e.message)+'</span>';}
 }
 function editEvidence(profileId,ruleId,id='new'){
   try{
     const data=read(),profile=data.profiles.find(p=>p.id===profileId);
     if(!profile?.rules.some(r=>r.id===ruleId))throw Error('Choose an existing operator rule first.');
     if(id!=='new'&&!data.evidence.some(e=>e.profileId===profileId&&e.ruleId===ruleId&&e.id===id))
       throw Error('Selected evidence record is no longer available.');
     const existing=id==='new'?null:data.evidence.find(e=>e.id===id);
     selectedId=profileId;evidenceRuleId=ruleId;editingEvidenceId=id;
     matchedSessionId=existing?.sessionId||null;editingRuleId=null;note='';refresh();
     dom('opEvidenceDate')?.focus?.();
   }catch(e){fail(e);}
 }
 function cancelEvidence(){editingEvidenceId=null;evidenceRuleId=null;matchedSessionId=null;note='';refresh();}
 function sessionMatches(session){
   try{return matcher?.suggestions(session,read().profiles)||[];}catch{return [];}
 }
 function reviewSession(profileId,ruleId,sessionId){
   try{
     const data=read(),profile=data.profiles.find(p=>p.id===profileId),
       rule=profile?.rules.find(r=>r.id===ruleId);
     const session=renderFlights.find(f=>f.id===sessionId);
     if(!rule||!matcher?.matches(session,rule)||!matcher.proof(session))
       throw Error('This FFS session cannot be matched. Check its ICAO type, crew configuration and the operator rule.');
     const linked=data.evidence.find(e=>e.profileId===profileId&&
       e.ruleId===ruleId&&e.sessionId===sessionId);
     selectedId=profileId;evidenceRuleId=ruleId;
     editingEvidenceId=linked?.id||'new';matchedSessionId=sessionId;
     editingRuleId=null;note='Review the simulator report before awarding any operator credit.';
     refresh();dom('opEvidenceAmount')?.focus?.();
   }catch(e){fail(e);}
 }
 function saveEvidence(){
   try{
     const data=read(),profile=data.profiles.find(p=>p.id===selectedId);
     const rule=profile?.rules.find(r=>r.id===evidenceRuleId);
     if(!rule)throw Error('The operator rule is no longer available.');
     const value=id=>String(dom(id)?.value??'').trim();
     const liveFlights=typeof root.effectiveFlights==='function'?root.effectiveFlights():renderFlights;
     const session=matchedSessionId?liveFlights.find(f=>f.id===matchedSessionId):null;
     const source=matchedSessionId?'ffs':value('opEvidenceSource'),
       date=matchedSessionId?session?.date:value('opEvidenceDate'),
       amount=Number(value('opEvidenceAmount'));
     const status=dom('opEvidenceReviewed')?.checked?'reviewed':'draft';
     const evidenceRef=value('opEvidenceRef'),notes=value('opEvidenceNotes');
     if(!['ffs','check','training'].includes(source))throw Error('Select FFS, Check or Training as evidence source.');
     if(status==='reviewed'&&!rule.acceptedSources.includes(source))
       throw Error('This rule does not permit that credit source. Update the operator rule first or save a draft.');
     const previous=data.evidence.find(e=>e.id===editingEvidenceId);
     if(previous?.sessionId && previous.sessionId!==matchedSessionId)
       throw Error('A simulator-linked record cannot be detached silently. Delete it explicitly first.');
     if(matchedSessionId){
       if(!matcher?.matches(session,rule)||!matcher.proof(session))
         throw Error('The simulator session or matching rule changed. Nothing was credited. Reopen the matching review.');
       if(data.evidence.some(e=>e!==previous&&e.profileId===profile.id&&e.ruleId===rule.id&&e.sessionId===session.id))
         throw Error('This simulator session is already linked to this operator rule. Edit the existing record.');
       if(evidenceRef && data.evidence.some(e=>e!==previous&&e.profileId===profile.id&&e.ruleId===rule.id&&
         e.source==='ffs'&&e.date===session.date&&
         String(e.evidenceRef||'').trim().toLowerCase()===evidenceRef.toLowerCase()))
         throw Error('This rule already has FFS evidence with the same date and report reference. Review the existing evidence before linking a second copy.');
     }
     if(!previous&&data.evidence.length>=500)throw Error('Maximum 500 evidence entries per account.');
     const record={id:previous?.id||uid('ev_'),profileId:profile.id,ownerId:data.ownerId,
       ruleId:rule.id,date,aircraftType:rule.aircraftType,
       configuration:matchedSessionId?session.simPilotConfig:
         rule.configuration==='all'?value('opEvidenceConfig'):rule.configuration,
       source,unit:rule.unit,amount,status,evidenceRef,notes,
       ...(matchedSessionId?{sessionId:session.id,sessionProof:matcher.proof(session)}:{})};
     engine.creditEvent(record);
     if(notes.length>500)throw Error('Notes must be under 500 characters.');
     if(previous)data.evidence=data.evidence.map(e=>e.id===previous.id?record:e);
     else data.evidence.push(record);
     write(data);
     editingEvidenceId=null;evidenceRuleId=null;matchedSessionId=null;note=status==='reviewed'?
       'Pilot-reviewed evidence saved. Counting is conditional on this operator rule; no regulatory approval is implied.':
       'Draft evidence saved without recency credit.';
     refresh();
   }catch(e){
     const target=dom('opEvidenceFeedback');
     if(target){target.hidden=false;target.textContent='Evidence not saved: '+(e?.message||e);}
     else fail(e);
   }
 }
 function removeEvidence(id){
   try{
     const data=read(),record=data.evidence.find(e=>e.id===id);
     if(!record)return;
     if(!root.confirm('Delete this evidence record? It will no longer contribute to operator tracking.'))return;
     data.evidence=data.evidence.filter(e=>e.id!==id);
     write(data);editingEvidenceId=null;evidenceRuleId=null;matchedSessionId=null;note='Evidence record removed.';refresh();
   }catch(e){fail(e);}
 }
 function evidenceForm(rule,record){
   const linked=matchedSessionId?renderFlights.find(f=>f.id===matchedSessionId):null;
   const changed=!!(linked&&record?.sessionId&&record.sessionProof!==matcher?.proof(linked));
   const r=record||{date:linked?.date||'',amount:1,source:'ffs',
     configuration:linked?.simPilotConfig|| (rule.configuration==='all'?'single':rule.configuration),
     evidenceRef:'',notes:'',status:'draft'};
   return '<div class="card" id="opEvidenceForm" style="margin-top:14px">'+
     (linked?'<div class="note"><b>Matched FFS session</b> · '+esc(linked.date)+' · '+esc(linked.simAircraftType)+
       ' · '+esc(linked.simPilotConfig)+'. Review the real training report and enter only its qualifying '+esc(rule.unit)+
       '. Session duration does not establish qualifying movements.'+
       (changed?'<br><b>Session changed since the last review:</b> previous credit is suspended until reviewed again.':'')+'</div>':'')+
     '<h3>'+(record?'Edit':'Add')+' simulator / check / training evidence</h3>'+
     '<p class="mini">Record a reference to your simulator report, proficiency check or training document. No file is uploaded in this version. Do not enter passwords or medical information.</p>'+
     '<div class="grid">'+
     '<div class="field"><label for="opEvidenceDate">Date</label><input type="date" id="opEvidenceDate" '+(linked?'disabled ':'')+'value="'+esc(linked?.date||r.date)+'"></div>'+
     '<div class="field"><label for="opEvidenceSource">Evidence type</label><select id="opEvidenceSource" '+(linked?'disabled':'')+'>'+
     choices(['ffs','check','training'],linked?'ffs':r.source,['Approved FFS session','Proficiency / operator check','Training session'])+'</select></div>'+
     '<div class="field"><label for="opEvidenceAmount">Qualifying '+esc(rule.unit)+'</label><input type="number" min="1" max="9999" step="1" id="opEvidenceAmount" value="'+esc(r.amount)+'"></div>'+
     (rule.configuration==='all'?'<div class="field"><label for="opEvidenceConfig">Crew configuration</label><select id="opEvidenceConfig" '+(linked?'disabled':'')+'>'+
       choices(['single','multi'],linked?.simPilotConfig||r.configuration,['Single-pilot','Multi-pilot'])+'</select></div>':'')+
     '<div class="field"><label for="opEvidenceRef">Evidence reference</label><input id="opEvidenceRef" maxlength="240" placeholder="FFS report no. / check record reference" value="'+esc(r.evidenceRef)+'"></div>'+
     '<div class="field"><label for="opEvidenceNotes">Notes (optional)</label><input id="opEvidenceNotes" maxlength="500" value="'+esc(r.notes)+'"></div></div>'+
     '<label style="display:flex;align-items:flex-start;gap:9px;margin-top:12px"><input type="checkbox" id="opEvidenceReviewed" '+(r.status==='reviewed'&&!changed?'checked':'')+'><span>I have reviewed the supporting record and its permitted credit source. This is my own evidence review, not operator approval or EASA credit.</span></label>'+
     '<p class="mini">Leave unchecked to save a draft. Only reviewed entries with a reference and an allowed source can contribute to this operator-defined threshold.</p>'+
     '<p class="mini" id="opEvidenceFeedback" role="alert" hidden></p>'+
     '<div class="actions"><button class="btn primary" type="button" onclick="HeliLogV236OperatorRulesUI.saveEvidence()">Save evidence</button>'+ 
     '<button class="btn" type="button" onclick="HeliLogV236OperatorRulesUI.cancelEvidence()">Cancel</button></div></div>';
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
    '<p class="mini">Recorded flights count only when Flight is permitted. Eligible FFS/check/training entries count only after pilot review, with a traceable reference. Neither is proof of EASA or operator approval.</p>'+
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
     '<div class="mini">Accepted: '+esc(r.acceptedSources.join(', '))+'</div>'+
     (matcher?renderFlights.filter(f=>matcher.matches(f,r)).filter(f=>
       !data.evidence.some(e=>e.profileId===chosen.id&&e.ruleId===r.id&&e.sessionId===f.id))
       .map(f=>'<div class="mini" style="margin-top:9px"><b>Suggested FFS match</b> · '+esc(f.date)+
        ' · '+esc(f.simAircraftType)+' · '+esc(f.simPilotConfig)+
        ' <button class="btn" type="button" onclick="HeliLogV236OperatorRulesUI.reviewSession(\''+chosen.id+'\',\''+r.id+'\',\''+f.id+'\')">Review match</button></div>')
       .join(''):'')+ 
     (data.evidence.filter(e=>e.profileId===chosen.id&&e.ruleId===r.id).map(e=>
       '<div class="mini" style="margin-top:7px;border-top:1px solid var(--line);padding-top:7px">'+
       '<b>'+esc(({ffs:'FFS',check:'Check',training:'Training'})[e.source]||e.source)+'</b> · '+esc(e.date)+
       ' · '+e.amount+' '+esc(e.unit)+' · '+(e.sessionId&&
         !matcher?.eligibleRecord(e,renderFlights.find(f=>f.id===e.sessionId),r)?
         'Needs re-review · not counted':e.status==='reviewed'?'Pilot-reviewed':'Draft · not counted')+
       (e.evidenceRef?' · '+esc(e.evidenceRef):'')+
       (e.notes?' · '+esc(e.notes):'')+
       ' <button class="btn" type="button" onclick="HeliLogV236OperatorRulesUI.editEvidence(\''+chosen.id+'\',\''+r.id+'\',\''+e.id+'\')">Edit</button>'+ 
       ' <button class="btn" type="button" onclick="HeliLogV236OperatorRulesUI.removeEvidence(\''+e.id+'\')">Delete</button></div>').join(''))+
     '</div>'+
     '<div class="actions"><button type="button" class="btn" onclick="HeliLogV236OperatorRulesUI.editEvidence(\''+chosen.id+'\',\''+r.id+'\')">Add evidence</button>'+ 
     '<button type="button" class="btn" onclick="HeliLogV236OperatorRulesUI.editRule(\''+r.id+'\')">Edit</button>'+
     '<button type="button" class="btn" onclick="HeliLogV236OperatorRulesUI.removeRule(\''+r.id+'\')">Delete</button></div></div>').join(''):'';
   const edit=chosen&&editingRuleId?
     ruleForm(chosen.rules.find(r=>r.id===editingRuleId)||null):'';
   const evidenceEdit=chosen&&evidenceRuleId&&editingEvidenceId?
     evidenceForm(chosen.rules.find(r=>r.id===evidenceRuleId),
       data.evidence.find(e=>e.id===editingEvidenceId)||null):'';
   root.document.getElementById('app').innerHTML=root.header('Operator recency rules','Separate from EASA default recency',
     '<button class="btn" onclick="go(\'recency\')">← Recency</button>')+
     '<div class="card"><div class="head"><div><h2>Custom operator profiles</h2><div class="muted">Select the operator whose internal requirements you want to track.</div></div>'+
     '<button class="btn primary" type="button" onclick="HeliLogV236OperatorRulesUI.showCreate()">Add operator</button></div>'+
     (typeof root.v23AccountWorkspace==='function'&&root.v23AccountWorkspace()?
       '<p class="mini">Custom operator profiles sync privately between signed-in devices when extended cloud sync is enabled. Conflicts require review. EASA recency and signed archives remain unchanged.</p>':
       '<p class="mini">Local sandbox profiles remain on this device, not in your account cloud.</p>')+
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
       '<h3 style="margin-top:14px">Rules</h3>'+(rules||'<p class="muted">No custom rules yet.</p>')+edit+evidenceEdit+'</div>':'')+
     '<div class="card" style="margin-top:14px"><h2>EASA recency is unchanged</h2><p class="mini">'+
     'These are operator-defined tracking requirements, not official EASA rules. Night flight counts use recorded night minutes, not independently verified Night VFR. FFS/check/training records require pilot review and a reference, but are not independently verified by HeliLog. Existing FCL.060 and SPA results are unaffected.</p></div>';
 }
 function cancelCreate(){addingProfile=false;note='';refresh();}
 function dashboardOptions(flights,aircraft,asOf){
   try{
     const data=read(),active=data.profiles.find(p=>p.id===data.activeId);
     if(!active)return [];
     return active.rules.filter(rule=>!!monitor.optionFor(rule.monitor)).flatMap(rule=>{
       try{
         const result=assessRule(active,rule,data,flights,aircraft,asOf);
         return [{
           key:'operator|'+active.id+'|'+rule.id,operatorRule:true,rule,result,
           operatorName:active.operator,
           row:{type:rule.aircraftType+' · Operator: '+active.operator,config:rule.configuration},
           kind:'operator'
         }];
       }catch{return [];}
     });
   }catch{return [];}
 }
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
 return Object.freeze({storageKey,read,write,validate,legacyForAccount,page,summary,createProfile,showCreate,
   cancelCreate,select,activate,removeProfile,renameProfile,editRule,saveRule,removeRule,monitorChanged,
   editEvidence,cancelEvidence,saveEvidence,removeEvidence,sessionMatches,reviewSession,
   assessRule,recencySummary,dashboardOptions});
});