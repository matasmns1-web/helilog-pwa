/* HeliLog V2.33.5 — bold recency labels in compact rows.
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
   short:confirmed?'Met':threshold?'Estimated':'Below threshold'};
}
function recencyStatusDetails(status){
 const n=status.count;
 const source=status.confirmed?'confirmed PF sequence':'recorded movement pair';
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
     /^[A-Z0-9]{2,8}\|(single|multi)\|(general|night)$/.test(x)))];
 }catch{return [];}
}
function recencyDashboardOptions(rows){
 const result=[];
 for(const row of rows){
   for(const kind of (row.nightApplicable?['general','night']:['general'])){
     result.push({row,kind,key:row.type+'|'+row.config+'|'+kind});
   }
 }
 return result;
}
function recencySetDashboardIndicator(input){
 const key=String(input?.dataset?.recencyKey||'');
 const options=recencyDashboardOptions(recencyRows());
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
 if(status.threshold&&status.change)return 'Threshold until '+displayDate(status.change)+' if no more flights';
 return Math.max(0,status.target-status.count)+' more recorded '+(status.target-status.count===1?'movement pair':'movement pairs')+' needed';
}
function recencyCompactLabel(status){
 return status.tone==='met'?'Met':status.tone==='estimated'?'Estimated met':'Below threshold';
}
function recencySummaryMarkup(){
 const selected=new Set(recencyDashboardKeys());
 const chosen=recencyDashboardOptions(recencyRows()).filter(o=>selected.has(o.key));
 if(!chosen.length)return '';
 const item=({row,kind})=>{
   const status=recencyStatus(row,kind);
   return `<div class="recency-dashboard-row">
     <div class="recency-dashboard-row-text">
       <b>${htmlEscape(row.type)} · ${row.config==='multi'?'Multi-pilot':'Single-pilot'}</b>
       <div class="muted"><strong class="recency-kind">${kind==='night'?'Night PIC':'Passenger-carrying'}</strong> · ${recencyCompactDate(status)}</div>
     </div>
     <span class="recency-compact-status recency-tone-${status.tone}">${recencyCompactLabel(status)}</span>
   </div>`;
 };
 return `<div class="card dashboard-recency-card">
   <div class="head"><h2>Recent experience</h2><button class="btn" onclick="go('recency')">Customize</button></div>
   <div class="recency-dashboard-list">${chosen.map(item).join('')}</div>
   <div class="mini recency-dashboard-disclaimer">Estimates only · Confirm approaches and privileges in Recency.</div>
 </div>`;
}
function recency(){
 const rows=recencyRows(),asOf=recencyCurrent();
 const dashboardOptions=recencyDashboardOptions(rows);
 const enabled=new Set(recencyDashboardKeys());
 const selectedCount=dashboardOptions.filter(o=>enabled.has(o.key)).length;
 const chooser=dashboardOptions.map(o=>{
   const title=o.kind==='night'?'Night PIC recency':'Passenger-carrying recency';
   const configuration=o.row.config==='multi'?'Multi-pilot':'Single-pilot';
   const status=recencyStatus(o.row,o.kind);
   return `<label class="recency-dashboard-choice">
     <input type="checkbox" data-recency-key="${o.key}" ${enabled.has(o.key)?'checked':''} onchange="recencySetDashboardIndicator(this)">
     <span class="recency-choice-name"><b>${htmlEscape(o.row.type)}</b> · ${configuration}<span class="recency-choice-title recency-kind">${title}</span></span>
     <span class="recency-choice-status recency-tone-${status.tone}">${status.short}</span>
   </label>`;
 }).join('');
 const renderOne=({row,kind})=>{
   const status=recencyStatus(row,kind);
   const headerTitle=kind==='night'?'Night PIC':'Passenger-carrying';
   const configuration=row.config==='multi'?'Multi-pilot':'Single-pilot';
   return `<details class="recency-detail-row">
     <summary>
       <span class="recency-detail-main">
         <b>${htmlEscape(row.type)} · ${configuration}</b>
         <span class="muted"><strong class="recency-kind">${headerTitle}</strong> · ${recencyCompactDate(status)}</span>
       </span>
       <span class="recency-compact-status recency-tone-${status.tone}">${recencyCompactLabel(status)}</span>
       <span class="recency-expand-cue" aria-hidden="true">⌄</span>
     </summary>
     <div class="recency-detail-expanded">
       <p>${recencyStatusDetails(status)}</p>
       ${status.threshold&&status.change?`<p>If no more qualifying flights are made, the recorded threshold will fall below the minimum on <b>${displayDate(status.change)}</b>.</p>`:''}
       ${status.tone==='estimated'?'<p>Estimated using single-pilot PIC/SOLO take-off and landing pairs; approaches are not separately verified.</p>':''}
       ${row.unverifiedFlights?`<p>${row.unverifiedFlights} flight(s) have unverified PF movement pairs excluded from credit.</p>`:''}
       <span class="mini">EASA ${kind==='night'?'FCL.060(b)(2)':'FCL.060(b)(1)'} · Rolling preceding 90 days. This indicator does not certify privileges.</span>
     </div>
   </details>`;
 };
 app.innerHTML=header('Recency','Select which recencies you want on the dashboard and view the full breakdown below',
    '<button class="btn" onclick="go(\'dashboard\')">← Dashboard</button>')+
   `<div class="card recency-picker-card">
     <div class="head"><div><h2>Show on dashboard</h2><div class="muted">Choose which recencies appear on your dashboard.</div></div>
       <span class="mini" id="recencyDashboardSelectionCount">${selectedCount} selected</span></div>
     ${dashboardOptions.length?`<div class="recency-choice-grid">${chooser}</div>`:'<p class="muted">Add flights first to choose recency indicators.</p>'}
     <div class="mini" style="margin-top:12px" id="recencyDashboardSaveMessage">Choices are saved on this device only. Unticking every option removes the recency card from the dashboard.</div>
   </div>
   <details class="card recency-method" style="margin-top:14px">
     <summary style="cursor:pointer;font-weight:700">How HeliLog calculates recency</summary>
     <p class="mini">Period: ${displayDate(window.HeliLogV233Recency.dateShift(asOf,-89))} to ${displayDate(asOf)}. Passenger-carrying recency requires 3 qualifying take-offs, approaches and landings as PF in the preceding 90 days. Night PIC requires a qualifying night sequence or an IR alternative under FCL.060.</p>
     <p class="mini">Single-pilot PIC/SOLO movements are estimated from recorded take-offs and landings. Earlier private and training flights can contribute, but HeliLog does not independently verify the approach, type/FFS alternatives, or legal privileges. Multi-pilot, other pilot functions, licence and operator requirements need separate assessment.</p>
     <p class="mini"><a target="_blank" rel="noopener noreferrer" href="https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aircrew-regulation-eu-no-11782011">EASA Aircrew Rules · FCL.060</a></p>
   </details>
   <div class="card recency-detail-card" style="margin-top:14px">
     <div class="head"><div><h2>All recencies</h2><div class="muted">Rolling 90 days · Select a row for details</div></div></div>
     ${dashboardOptions.length?`<div class="recency-detail-list">${dashboardOptions.map(renderOne).join('')}</div>`:'<p class="muted">No flights recorded yet.</p>'}
   </div>
`;
}
