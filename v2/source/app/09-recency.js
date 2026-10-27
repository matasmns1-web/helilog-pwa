/* HeliLog V2.37 — combined NVIS/HHO, offshore landings specialised-operation recency.
 * "CAT" is not a flight classification: FCL.060 applies to passenger/CAT
 * operations, but qualifying prior PF movements may be private/training.
 */
function recencyCurrent(){
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function recencyRows(){return window.HeliLogV233Recency.groups(effectiveFlights(),S.aircraft,recencyCurrent());}
function recencyDaysTo(iso){
 if(!iso)return null;
 return Math.round((Date.parse(iso+'T00:00:00Z')-Date.parse(recencyCurrent()+'T00:00:00Z'))/86400000);
}
function recencyStatus(row,kind){
 const confirmed=kind==='night'?row.nightDocumented:row.generalDocumented;
 const threshold=kind==='night'?row.nightEstimated:row.generalEstimated;
 const count=kind==='night'?row.night:row.general;
 const target=kind==='night'?1:3;
 const change=kind==='night'?row.nextNightLoss:row.nextGeneralLoss;
 const days=recencyDaysTo(change);
 return {count,target,confirmed,threshold,change,days,
   text:confirmed?'Requirement met':threshold?'90-day threshold met':'Threshold not met',
   tone:confirmed?'met':threshold?'estimated':'below',
   short:confirmed?'Met':threshold?'Met':'Below threshold'};
}
function recencyStatusDetails(status){
 const n=status.count;
 const source=status.source==='flights'?'NVIS flight':status.source==='cycles'?'hoist cycle':
   status.source==='landings'?'offshore landing':
   status.confirmed?'confirmed PF sequence':'recorded movement pair';
 const plural=n===1?'':'s';
 const counted=n+' '+source+plural+' in the preceding 90 days.';
 if(status.threshold)return counted;
 return counted+' '+Math.max(0,status.target-n)+' more needed to reach the recorded threshold.';
}
function recencyLapseMarkup(status){
 if(!status.threshold||!status.change)return '';
 const days=status.days;
 return `<div class="recency-lapse"><span>If no further qualifying flights:</span>
   <b>Threshold falls below minimum on ${displayDate(status.change)}</b>
   ${days!==null?`<span>In ${days} day${days===1?'':'s'}</span>`:''}
 </div>`;
}
// View preferences only. Per-account and per-device: no logbook mutation,
// cloud schema migration, or cross-account sharing of dashboard choices.
function recencyDashboardStorageKey(){
 const owner=(typeof v23AccountWorkspace==='function' && v23AccountWorkspace())?
   String(window.HeliLogV23Sync.status().owner||''):'';
 const scope=owner?'owner:'+owner:(typeof TEST_MODE!=='undefined' && TEST_MODE?'sandbox':'local');
 return 'helilog_recency_dashboard_v1:'+scope;
}
function recencyDashboardKeys(){
 try{
   const raw=localStorage.getItem(recencyDashboardStorageKey());
   if(!raw)return [];
   const value=JSON.parse(raw);
   if(!Array.isArray(value)||value.length>100)return [];
   return [...new Set(value.filter(x=>typeof x==='string'&&
     (/^[A-Z0-9]{2,8}\|(single|multi|all)\|(general|night|nvis|hho|hhoNight|offshore|offshoreNight)$/.test(x)||
      /^operator\|[A-Za-z0-9:_-]{1,128}\|[A-Za-z0-9:_-]{1,128}$/.test(x)))
     .map(key=>key.replace(/^([A-Z0-9]{2,8})\|(single|multi)\|(nvis|hho|hhoNight)$/,'$1|all|$3')))];
 }catch{return [];}
}
function recencyDashboardOptions(rows){
 const result=[];
 for(const row of rows){
   for(const kind of (row.nightApplicable?['general','night']:['general'])){
     result.push({row,kind,key:row.type+'|'+row.config+'|'+kind});
   }
 }
 const specialised=window.HeliLogV234SpecialRecency?.groups(effectiveFlights(),S.aircraft,recencyCurrent())||[];
 for(const item of specialised){
   const row={...item,special:true};
   const prefix=item.id==='NVIS'?'nvis':item.id==='HHO'?'hho':'offshore';
   result.push({row,kind:prefix,key:row.type+'|'+row.config+'|'+prefix});
   if(item.nightTarget&&item.nightHistory)
     result.push({row,kind:prefix+'Night',key:row.type+'|'+row.config+'|'+prefix+'Night'});
 }
 return result;
}
function recencyAllDashboardOptions(rows){
 const legal=recencyDashboardOptions(rows);
 const custom=window.HeliLogV236OperatorRulesUI?.dashboardOptions?.(
   effectiveFlights(),S.aircraft,recencyCurrent())||[];
 return legal.concat(custom);
}
function recencyOptionLabel(option){
 return option.operatorRule?'Operator · '+option.rule.title:recencyOperationLabel(option.kind);
}
function recencyOperationLabel(kind){
 return ({general:'Passenger-carrying',night:'Night PIC',
   nvis:'NVIS',hho:'Hoist (HHO)',hhoNight:'Hoist (night)',
   offshore:'Offshore landings',offshoreNight:'Offshore landings (night)'})[kind]||kind;
}
function recencyOptionStatus(option){
 if(option.operatorRule){
   const r=option.result,met=r.thresholdMet;
   return {count:r.count,target:r.minimum,change:r.thresholdUntil,
     periodDays:option.rule.periodDays,unit:r.unit,operator:true,
     days:recencyDaysTo(r.thresholdUntil),threshold:met,confirmed:false,
     tone:met?'met':'below',short:met?'Met':'Below threshold',
     text:met?'Recorded threshold met':'Below recorded threshold',
     source:r.unit};
 }
 if(!option.row.special)return recencyStatus(option.row,option.kind);
 const {row,kind}=option,night=kind.endsWith('Night');
 const count=night?row.night:row.day;
 const target=night?row.nightTarget:row.dayTarget;
 const met=count>=target;
 const change=night?row.nightLapse:row.dayLapse;
 return {count,target,change,days:recencyDaysTo(change),
  threshold:met,confirmed:false,tone:met?'estimated':'below',
  text:met?'Recorded threshold met':'Below recorded threshold',
  short:met?'Recorded':'Below threshold',source:row.source};
}
// Presentation groups only: the underlying single-/multi-pilot calculations
// and account/device dashboard preference keys remain separate.
function recencyTypeGroups(options){
 const groups=new Map();
 for(const option of options){
   if(!groups.has(option.row.type))groups.set(option.row.type,[]);
   groups.get(option.row.type).push(option);
 }
 return [...groups].sort((a,b)=>a[0].localeCompare(b[0])).map(([type,items])=>({
   type,
   items:items.sort((a,b)=>(a.kind==='general'?0:1)-(b.kind==='general'?0:1)||
     (a.row.config==='single'?0:1)-(b.row.config==='single'?0:1))
 }));
}
function recencyPilotNote(all,option){
 if(option.operatorRule)return option.row.config==='all'?'':option.row.config==='multi'?'Multi-pilot':'Single-pilot';
 return all.some(other=>other!==option&&other.row.type===option.row.type&&
   other.kind===option.kind&&other.row.config!==option.row.config)
     ?(option.row.config==='multi'?'Multi-pilot':'Single-pilot'):'';
}
function recencySetDashboardIndicator(input){
 const key=String(input?.dataset?.recencyKey||'');
 const options=recencyAllDashboardOptions(recencyRows());
 if(!options.some(o=>o.key===key))return;
 const selected=new Set(recencyDashboardKeys());
 if(input.checked)selected.add(key);else selected.delete(key);
 // Exclude stale choices when saving, e.g. aircraft no longer flown.
 const current=options.filter(o=>selected.has(o.key)).map(o=>o.key);
 try{localStorage.setItem(recencyDashboardStorageKey(),JSON.stringify(current));}
 catch{
   input.checked=!input.checked;
   const note=document.getElementById('recencyDashboardSaveMessage');
   if(note)note.textContent='Could not save dashboard choices on this device. Browser storage may be unavailable.';
   return;
 }
 const count=document.getElementById('recencyDashboardSelectionCount');
 if(count)count.textContent=current.length+' selected';
 const note=document.getElementById('recencyDashboardSaveMessage');
 if(note)note.textContent='Saved on this device. Your dashboard will update when you open it.';
}
function recencyCompactDate(status){
 if(status.operator){
   if(status.threshold&&status.change)return 'Threshold until '+displayDate(status.change)+' if no further qualifying activity';
   return Math.max(0,status.target-status.count)+' more recorded '+status.unit+' needed within '+status.periodDays+' days';
 }
 if(status.threshold&&status.change)return 'Threshold until '+displayDate(status.change)+' if no more flights';
 return Math.max(0,status.target-status.count)+' more recorded '+(status.target-status.count===1?'movement pair':'movement pairs')+' needed';
}
function recencyCompactLabel(status){
 return status.threshold?'Met':'Below threshold';
}
function recencySummaryMarkup(){
 const options=recencyAllDashboardOptions(recencyRows());
 const selected=new Set(recencyDashboardKeys());
 const chosen=options.filter(o=>selected.has(o.key));
 if(!chosen.length)return '';
 const item=option=>{
   const {row,kind}=option,status=recencyOptionStatus(option);
   const pilot=recencyPilotNote(options,option);
   return `<div class="recency-dashboard-row">
     <div class="recency-dashboard-row-text">
       <b class="recency-kind">${recencyOptionLabel(option)}</b>
       ${pilot?`<span class="recency-pilot-note">${pilot}</span>`:''}
       <div class="muted">${recencyCompactDate(status)}</div>
     </div>
     <span class="recency-compact-status recency-tone-${status.tone}">${recencyCompactLabel(status)}</span>
   </div>`;
 };
 const groups=recencyTypeGroups(chosen).map(group=>`<section class="recency-type-group">
   <div class="recency-type-heading">${htmlEscape(group.type)}</div>
   <div class="recency-type-rows">${group.items.map(item).join('')}</div>
 </section>`).join('');
 return `<div class="card dashboard-recency-card">
   <div class="head"><h2>Recent experience</h2><button class="btn" onclick="go('recency')">Customize</button></div>
   <div class="recency-dashboard-list">${groups}</div>
   <div class="mini recency-dashboard-disclaimer">Estimates only · Confirm approaches and privileges in Recency.</div>
 </div>`;
}
function recency(){
 const rows=recencyRows(),asOf=recencyCurrent();
 const dashboardOptions=recencyAllDashboardOptions(rows);
 const enabled=new Set(recencyDashboardKeys());
 const selectedCount=dashboardOptions.filter(o=>enabled.has(o.key)).length;
 const chooserItem=o=>{
   const title=recencyOptionLabel(o);
   const pilot=recencyPilotNote(dashboardOptions,o);
   const status=recencyOptionStatus(o);
   return `<label class="recency-dashboard-choice">
     <input type="checkbox" data-recency-key="${o.key}" ${enabled.has(o.key)?'checked':''} onchange="recencySetDashboardIndicator(this)">
     <span class="recency-choice-name"><b class="recency-kind">${title}</b>${pilot?`<span class="recency-pilot-note">${pilot}</span>`:''}</span>
     <span class="recency-choice-status recency-tone-${status.tone}">${status.short}</span>
   </label>`;
 };
 const typeChooser=recencyTypeGroups(dashboardOptions).map(group=>`<section class="recency-picker-type">
   <div class="recency-type-heading">${htmlEscape(group.type)}</div>
   <div class="recency-choice-grid">${group.items.map(chooserItem).join('')}</div>
 </section>`).join('');
 const renderOne=option=>{
   const {row,kind}=option,status=recencyOptionStatus(option);
   const headerTitle=recencyOptionLabel(option);
   const pilot=recencyPilotNote(dashboardOptions,option);
   return `<details class="recency-detail-row">
     <summary>
       <span class="recency-detail-main">
         <b class="recency-kind">${headerTitle}</b>${pilot?`<span class="recency-pilot-note">${pilot}</span>`:''}
         <span class="muted">${recencyCompactDate(status)}</span>
       </span>
       <span class="recency-compact-status recency-tone-${status.tone}">${recencyCompactLabel(status)}</span>
       <span class="recency-expand-cue" aria-hidden="true">⌄</span>
     </summary>
     <div class="recency-detail-expanded">
       <p>${status.operator
         ?'Recorded '+status.count+' / '+status.target+' '+htmlEscape(status.unit)+' in the preceding '+status.periodDays+' days.'+
           ' ('+option.result.flightCount+' flight-based + '+option.result.evidenceCount+' pilot-reviewed evidence)'
           +(status.threshold?'':' '+Math.max(0,status.target-status.count)+' more needed.')
         :recencyStatusDetails(status)}</p>
       ${status.threshold&&status.change?`<p>If no further qualifying activity is recorded, the threshold will fall below the minimum on <b>${displayDate(status.change)}</b>.</p>`:''}
       ${!status.operator&&status.tone==='estimated'&&!row.special?'<p>Estimated using single-pilot PIC/SOLO take-off and landing pairs; approaches are not separately verified.</p>':''}
       ${!status.operator&&row.special&&row.missingCounts?`<p>${row.missingCounts} earlier operation flight(s) lack recorded cycles/sequences and are not automatically credited.</p>`:''}
       ${!status.operator&&!row.special&&row.unverifiedFlights?`<p>${row.unverifiedFlights} flight(s) have unverified PF movement pairs excluded from credit.</p>`:''}
       <span class="mini">${status.operator
         ?'Operator-defined requirement · '+htmlEscape(option.operatorName)+'. Only explicitly permitted recorded flights and pilot-reviewed, referenced FFS/check/training events count. Pilot review is not independent verification, operator approval or an EASA result.'
           +(option.rule.monitor==='flights:night'?' Night time greater than zero defines a counted flight; Night VFR status is not independently verified.':'')
           +(option.rule.monitor==='flights:night-vfr'?' Night VFR is inferred here from night time greater than zero and IFR time equal to zero. This is a tracking convention, not verified flight rules.':'')
           +(option.result.missingCycleCounts?' '+option.result.missingCycleCounts+' operation flight(s) lack valid recorded cycles.':'')
         :'EASA '+(row.special?row.rule:kind==='night'?'FCL.060(b)(2)':'FCL.060(b)(1)')+' · Rolling preceding 90 days. This indicator does not certify privileges. '+(row.special?'Cycles/sequences are self-recorded and still require operator and crew competency verification.':'')}</span>
     </div>
   </details>`;
 };
 const allGroups=recencyTypeGroups(dashboardOptions).map(group=>`<section class="recency-detail-type">
   <div class="recency-type-heading">${htmlEscape(group.type)}</div>
   <div class="recency-detail-list">${group.items.map(renderOne).join('')}</div>
 </section>`).join('');
 app.innerHTML=header('Recency','Select which recencies you want on the dashboard and view the full breakdown below',
    '<button class="btn" onclick="go(\'dashboard\')">← Dashboard</button>')+
   `<div class="card recency-picker-card">
     <div class="head"><div><h2>Show on dashboard</h2><div class="muted">Choose which recencies appear on your dashboard.</div></div>
       <span class="mini" id="recencyDashboardSelectionCount">${selectedCount} selected</span></div>
     ${dashboardOptions.length?typeChooser:'<p class="muted">Add flights first to choose recency indicators.</p>'}
     <div class="mini" style="margin-top:12px" id="recencyDashboardSaveMessage">Choices are saved on this device only. Unticking every option removes the recency card from the dashboard.</div>
   </div>
   <details class="card recency-method" style="margin-top:14px">
     <summary style="cursor:pointer;font-weight:700">How HeliLog calculates recency</summary>
     <p class="mini">Period: ${displayDate(window.HeliLogV233Recency.dateShift(asOf,-89))} to ${displayDate(asOf)}. Passenger-carrying recency requires 3 qualifying take-offs, approaches and landings as PF in the preceding 90 days. Night PIC requires a qualifying night sequence or an IR alternative under FCL.060.</p>
     <p class="mini">Single-pilot PIC/SOLO movements are estimated from recorded take-offs and landings. NVIS counts recorded NVIS flights and HHO counts hoist cycles across SP/MP operation configurations of the same type. Offshore is separated by SP/MP and counts manually entered offshore landings that also represent complete qualifying take-off, departure and approach sequences. Entries are self-reported. Older flights without counts are not automatically credited. Training, operator approvals, night hover transitions, crew duties and permitted simulator credits still require independent verification.</p>
     <p class="mini"><a target="_blank" rel="noopener noreferrer" href="https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aircrew-regulation-eu-no-11782011">EASA Aircrew Rules · FCL.060</a></p>
   </details>
   <div class="card recency-detail-card" style="margin-top:14px">
     <div class="head"><div><h2>All recencies</h2><div class="muted">EASA and active operator requirements · select a row for details</div></div>
     <button type="button" class="btn" onclick="go('operatorrules')">Manage operator rules</button></div>
     ${dashboardOptions.length?allGroups:'<p class="muted">No flights recorded yet.</p>'}
   </div>
`;
}
