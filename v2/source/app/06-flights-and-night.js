function isSimulatorSession(f){return f?.entryType==='simulator';}
function simulatorDeviceLabel(f){return [f.simCategory,f.simDevice,f.simQualification?'('+f.simQualification+')':''].filter(Boolean).join(' ');}
function addSimulator(editId=null){
  if(editId && isArchivedFlight(editId)&&correctingArchivedId!==editId){
    alert('Use the archived correction workflow from the session details.');return;
  }
  editingFlightId=editId||null;
  const old=editId?effectiveFlight(S.flights.find(f=>f.id===editId)):null;
  if(editId && !isSimulatorSession(old))return;
  app.innerHTML=header(old?'Edit simulator session':'Add simulator session',
    'A synthetic training device session is not a helicopter flight.',
    `<button class="btn" onclick="cancelFlightForm('${old?.id||''}')">Cancel</button>`)+
    `<form class="card form" id="flightForm" novalidate><div id="formError" class="errorbox"></div>
       ${(!!editId&&correctingArchivedId===editId)?`<div class="note"><b>Correction to signed simulator record</b>: original print page stays unchanged. A separate addendum is required.</div>`:''}
       ${!old?`<div class="choice-row" style="margin-bottom:16px"><button class="btn" type="button" onclick="if(confirmLeaveFlightForm()){clearFlightFormGuard();add()}">Helicopter flight</button><button class="btn primary" type="button">Simulator session ✓</button></div>`:''}
       <div class="section-title">Synthetic training device session</div>
       <div class="formgrid">
         <div class="field"><label>Session date</label>${europeanDateField('simDate',old?.date||new Date().toISOString().slice(0,10),true)}</div>
         <div class="field"><label>Device category</label><select id="simCategory">
           ${['FNPT I','FNPT II','FTD','FFS','FS','Other'].map(c=>`<option value="${c}"${(old?.simCategory||'FNPT II')===c?' selected':''}>${c}</option>`).join('')}
         </select></div>
         <div class="field"><label>Device / aircraft type (required for FS/FFS/FTD)</label><input id="simDevice" maxlength="90" placeholder="Device or represented aircraft type" value="${htmlEscape(old?.simDevice||'')}"></div>
         <div class="field"><label>Device qualification / ID (optional)</label><input id="simQualification" maxlength="60" placeholder="e.g. Q1234" value="${htmlEscape(old?.simQualification||'')}"></div>
         <div class="field"><label>Total time of session (H:MM)</label><input id="simDuration" inputmode="decimal" placeholder="2:30" value="${old?fmt(old.stdMin||0):''}">
           <div class="mini">Include associated pre- and after-flight checks, per the paper-logbook instructions.</div></div>
       </div>
       <div class="field" style="margin-top:12px"><label>Exercise / proficiency check / remarks</label>
         <textarea id="simRemarks" placeholder="e.g. IR(H) procedures, proficiency check, revalidation">${htmlEscape(old?.remarks||'')}</textarea></div>
       <div class="note">Only the Synthetic Training Devices Session and Remarks columns are filled on paper. Departure, arrival, aircraft flight time, PIC time and take-offs/landings remain blank.</div>
       ${(!!editId&&correctingArchivedId===editId)?`<div class="field"><label>Reason for correction (required)</label><textarea id="correctionReason" placeholder="Explain the correction and evidence" required></textarea></div>`:''}
       <div class="actions"><button class="btn" type="button" onclick="cancelFlightForm('${old?.id||''}')">Cancel</button>
         <button class="btn primary" type="button" onclick="saveSimulatorSession()">${(!!editId&&correctingArchivedId===editId)?'Propose correction':old?'Save session':'Save simulator session'}</button></div>
     </form>`;
  const form=document.getElementById('flightForm');
  form.addEventListener('input',markFlightFormDirty);
  form.addEventListener('change',markFlightFormDirty);
  flightFormDirty=false;
}
function saveSimulatorSession(){
  if(editingFlightId&&isArchivedFlight(editingFlightId)&&correctingArchivedId!==editingFlightId){
    alert('Archived simulator sessions require an addendum.');return;
  }
  clearFormError();
  const date=readEuropeanDate('simDate',true),category=$('#simCategory').value,device=$('#simDevice').value.trim(),
    qualification=$('#simQualification').value.trim(),remarks=$('#simRemarks').value.trim();
  const time=parseBroughtForwardMinutes($('#simDuration').value);
  if(!date)return showFormError('Enter a valid simulator session date in DD-MM-YYYY format.');
  if(!device && !category.startsWith('FNPT'))return showFormError('Enter the simulator device or aircraft type (required for FS/FFS/FTD).');
  if(time===null||!Number.isSafeInteger(time)||time<=0)return showFormError('Enter positive simulator time in H:MM format.');
  const old=editingFlightId?S.flights.find(f=>f.id===editingFlightId):null;
  if(editingFlightId&&!isSimulatorSession(old))return showFormError('Cannot convert a flight into a simulator session.');
  const entry={
    id:old?.id||'sim'+Date.now()+Math.random().toString(36).slice(2,8),
    entryType:'simulator',date,simCategory:category,simDevice:device,simQualification:qualification,
    stdType:[category,device,qualification?'('+qualification+')':''].filter(Boolean).join(' '),stdMin:time,
    mins:0,aid:'',dep:'',off:'',arr:'',on:'',role:'',picName:'',nightMin:0,ifrMin:0,
    takeoffDay:0,takeoffNight:0,landingDay:0,landingNight:0,crossCountry:false,specialOps:{},remarks,
    createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  if(correctingArchivedId===editingFlightId&&isArchivedFlight(editingFlightId))
    return recordArchiveCorrection(editingFlightId,entry,$('#correctionReason').value);
  if(old)S.flights[S.flights.findIndex(f=>f.id===old.id)]=entry;else S.flights.push(entry);
  if(!save())return;
  const id=entry.id;editingFlightId=null;clearFlightFormGuard();flight(id);
}
function simulatorDetails(id){
  const f=effectiveFlight(S.flights.find(x=>x.id===id));
  if(!isSimulatorSession(f))return go('logbook');
  editingFlightId=null;
  app.innerHTML=header('Simulator session',formatDate(f.date)+' · '+htmlEscape(f.simCategory),
  `<div style="display:flex;gap:8px;flex-wrap:wrap">
    ${v229CanReturnToReview(id)?
      '<button class="btn" onclick="v229ReturnToReview()">← Back to review</button>':
      '<button class="btn" onclick="go(\'logbook\')">← Logbook</button>'}
    <button class="btn primary" onclick="editFlight('${f.id}')">${isArchivedFlight(f.id)?'Propose correction':'Edit session'}</button>
    ${!isArchivedFlight(f.id)?`<button class="btn dangerbtn" onclick="openDeleteModal('${f.id}')">Delete session</button>`:''}</div>`)+
    `<div class="card"><h2>${htmlEscape(simulatorDeviceLabel(f))}</h2>
     <div class="grid stats">
       <div class="card"><div class="label">Simulator session</div><div class="big">${fmt(f.stdMin)}</div></div>
       <div class="card"><div class="label">Actual flight time</div><div class="big">0:00</div></div>
     </div><p><b>Exercise / remarks</b></p><p>${htmlEscape(f.remarks||'—')}</p>
     <p class="mini">Printed only in Synthetic Training Devices and Remarks columns. Does not add to actual helicopter flight time.</p></div>`+
    correctionHistoryMarkup(id);
}
function quickAdd(){add(null,true);}
function setFlightEntryMode(mode){
  const form=document.getElementById('flightForm');
  if(!form || editingFlightId)return;
  const quick=mode==='quick';
  form.classList.toggle('quick-entry-active',quick);
  form.querySelectorAll('[data-entry-mode]').forEach(button=>{
    const selected=button.dataset.entryMode===(quick?'quick':'full');
    button.classList.toggle('primary',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  const hint=document.getElementById('quickEntryHint');
  if(hint)hint.hidden=!quick;
  const description=document.getElementById('flightEntryModeDescription');
  if(description)description.textContent=quick
    ? 'Core UTC flight details and Save are together. Expand options only when needed.'
    : 'All flight fields are available. Your entries are kept when switching modes.';
  updateQuickPICVisibility();
  if(typeof scheduleQuickFlightScrollLock==='function')scheduleQuickFlightScrollLock();
}
function updateQuickPICVisibility(){
  const form=document.getElementById('flightForm');
  const role=document.getElementById('role')?.value;
  if(!form||!role)return;
  form.classList.toggle('quick-pic-self',['PIC','SOLO'].includes(role));
}
function toggleQuickEntryExtras(){
  const form=document.getElementById('flightForm');
  if(!form||editingFlightId)return;
  const expanded=form.classList.toggle('quick-entry-extra-open');
  const button=document.getElementById('quickExtraToggle');
  if(button){
    button.setAttribute('aria-expanded',String(expanded));
    button.textContent=expanded?'− Hide cross-country & remarks':'+ Cross-country & remarks';
  }
  if(typeof scheduleQuickFlightScrollLock==='function')scheduleQuickFlightScrollLock();
}
function updateQuickNightNotice(outcome){
  const note=document.getElementById('quickNightNotice');
  if(!note)return;
  const ready=['date','dep','off','arr','on'].every(id=>
    String(document.getElementById(id)?.value||'').trim());
  const show=!!ready&&!!document.getElementById('nightAuto')?.checked&&!outcome?.ok;
  note.hidden=!show;
  note.textContent=show?
    'Automatic night time unavailable: '+String(outcome.reason||'Missing coordinates')+
    '. Uncheck Auto for manual entry or add the operating site under Settings → Aerodromes & Helipads.':'';
  if(typeof scheduleQuickFlightScrollLock==='function')scheduleQuickFlightScrollLock();
}
function add(editId=null,quick=false){
if(editId && isArchivedFlight(editId)&&correctingArchivedId!==editId){
  alert('This flight is in a signed batch. Use Propose correction.');return;
}
editingFlightId=editId||null;
let existing=editingFlightId?effectiveFlight(S.flights.find(f=>f.id===editingFlightId)):null;
if(editingFlightId && !existing){editingFlightId=null; return go('logbook');}
let editing=!!existing;
app.innerHTML=header(
  editing?'Edit flight':quick?'Quick flight entry':'Add flight',
  editing?'Update the existing flight record':quick?'A shorter way to record your flight':'Structured around your paper logbook',
  `<button class="btn" onclick="cancelFlightForm('${editing?existing.id:''}')">Cancel</button>`
)+`<form id="flightForm" class="card form" novalidate>
<div id="formError" class="errorbox"></div>
${(!!editId&&correctingArchivedId===editId)?`<div class="note"><b>Archived correction</b>: the signed page stays unchanged. Revised values only take effect after you print, sign and confirm a correction addendum.</div>`:editing?`<div class="editnotice">Editing an unarchived flight.</div>`:''}

${!editing?`<div class="quick-entry-switch" role="group" aria-label="Flight entry mode">
  <button class="btn" type="button" data-entry-mode="quick" aria-pressed="false" onclick="setFlightEntryMode('quick')">⚡ Quick entry</button>
  <button class="btn" type="button" data-entry-mode="full" aria-pressed="true" onclick="setFlightEntryMode('full')">Full details</button>
</div>
<p class="mini quick-entry-description" id="flightEntryModeDescription"></p>
<div class="quick-entry-hint" id="quickEntryHint" hidden>
  <b>Quick-entry defaults:</b> Single-pilot; landing counts follow take-offs; instructor and specialised-operation time are off. Night time is calculated automatically when location data is available. Change any of these under Full details.
</div>`:''}

${!editing?`<div class="choice-row quick-entry-advanced" style="margin-bottom:16px">
   <button class="btn primary" type="button">Helicopter flight ✓</button>
   <button class="btn" type="button" onclick="if(confirmLeaveFlightForm()){clearFlightFormGuard();addSimulator()}">Simulator session</button>
 </div>`:''}
<div class="section-title">Flight identification</div>
<div class="formgrid quick-flight-identification">
  <div class="field"><label>Date</label>${europeanDateField('date','',true)}</div>
  <div class="field"><label>Aircraft</label><select id="aid">${S.aircraft.map(a=>`<option value="${a.id}">${a.icao} — ${a.reg}</option>`).join('')}</select></div>

  <div class="field"><label>Departure place</label><input id="dep" class="uppercase-input" maxlength="12" autocapitalize="characters" autocorrect="off" spellcheck="false" oninput="uppercasePlaceInput(this)"></div>
  <div class="field"><label>Departure time (UTC, 24h)</label>
    <div class="timewrap">
      <input id="off" type="text" inputmode="numeric" maxlength="5" autocomplete="off">
      <button type="button" class="timebtn" title="Choose time" onclick="toggleTimePicker('offPicker','off')">◷</button>
      <div id="offPicker" class="timepicker">
        <div class="timepicker-row">
          <select id="offHour"></select><span class="colon">:</span><select id="offMinute"></select>
        </div>
        <div class="timepicker-actions">
          <button type="button" onclick="closeTimePicker('offPicker')">Cancel</button>
          <button type="button" class="settime" onclick="applyTimePicker('offPicker','off','offHour','offMinute')">Set</button>
        </div>
      </div>
    </div>
    <div class="mini">HHmm or HH:mm</div>
    <div id="offError" class="field-error">Enter a valid 24-hour time.</div>
  </div>

  <div class="field"><label>Arrival place</label><input id="arr" class="uppercase-input" maxlength="12" autocapitalize="characters" autocorrect="off" spellcheck="false" oninput="uppercasePlaceInput(this)"></div>
  <div class="field"><label>Arrival time (UTC, 24h)</label>
    <div class="timewrap">
      <input id="on" type="text" inputmode="numeric" maxlength="5" autocomplete="off">
      <button type="button" class="timebtn" title="Choose time" onclick="toggleTimePicker('onPicker','on')">◷</button>
      <div id="onPicker" class="timepicker">
        <div class="timepicker-row">
          <select id="onHour"></select><span class="colon">:</span><select id="onMinute"></select>
        </div>
        <div class="timepicker-actions">
          <button type="button" onclick="closeTimePicker('onPicker')">Cancel</button>
          <button type="button" class="settime" onclick="applyTimePicker('onPicker','on','onHour','onMinute')">Set</button>
        </div>
      </div>
    </div>
    <div class="mini">HHmm or HH:mm</div>
    <div id="onError" class="field-error">Enter a valid 24-hour time.</div>
  </div>
</div>

<div class="section-title">Flight time and function</div>
<div class="formgrid quick-flight-function">
  <div class="field"><label>Total time of flight (minutes)</label><input id="mins" type="number" min="1"></div>
  <div class="field"><label>Pilot function</label><select id="role" onchange="roleChanged()">${['PIC','CO-PILOT','DUAL','SOLO','SPIC','PICUS'].map(x=>`<option>${x}</option>`).join('')}</select></div>
  <div class="field quick-pic-field">
    <label>Name of PIC</label>
    <input id="picName" list="picPeopleList" autocomplete="off">
    <datalist id="picPeopleList">${S.people.filter(p=>!p.isAccountHolder).map(p=>`<option value="${htmlEscape(p.name)}"></option>`).join('')}</datalist>
    <div class="mini">Choose a saved pilot or type a new name. New names are saved automatically.</div>
  </div>
</div>
<div class="quick-self-pic-note" aria-live="polite">PIC name: SELF (automatic)</div>

<div class="section-title quick-entry-advanced">Aircraft and pilot configuration</div>
<div class="formgrid quick-entry-advanced">
  <div class="field">
    <label>Aircraft engine configuration</label>
    <div id="aircraftEngineInfo" class="engine-indicator"></div>
    <div class="mini">Set automatically from the selected helicopter.</div>
  </div>
  <div class="field">
    <label>Pilot configuration</label>
    <div class="choice-row">
      <label class="choice-option"><input type="radio" name="pilotConfig" value="single" checked onchange="toggleRecencyEvidence()"> Single-pilot</label>
      <label class="choice-option"><input type="radio" name="pilotConfig" value="multi" onchange="toggleRecencyEvidence()"> Multi-pilot</label>
    </div>
    <div class="mini">The total flight time will be allocated automatically in the PDF export.</div>
  </div>
</div>

<div class="section-title">Take-offs and landings</div>
<div class="formgrid quick-flight-movements">
  <div class="field"><label>Take-offs day</label><input id="toDay" type="number" min="0" value="0"></div>
  <div class="field"><label>Take-offs night</label><input id="toNight" type="number" min="0" value="0"></div>
  <div class="field quick-entry-advanced"><label>Landings day</label><input id="ldgDay" type="number" min="0" value="0"><div class="mini">Automatically follows take-offs unless overwritten.</div></div>
  <div class="field quick-entry-advanced"><label>Landings night</label><input id="ldgNight" type="number" min="0" value="0"><div class="mini">Automatically follows take-offs unless overwritten.</div></div>
</div>

<div class="section-title">Operational condition time</div>
<div class="formgrid quick-flight-conditions">
  <div class="field"><label>Night time (minutes)</label><input id="nightMin" type="number" min="0" value="0">
  <label class="mini" style="display:flex;gap:8px;align-items:center;margin-top:8px">
    <input id="nightAuto" type="checkbox" checked> <span class="full-night-label">Automatically calculate using civil twilight (UTC)</span><span class="quick-night-label">Auto night (UTC)</span>
  </label>
  <div class="mini">Uncheck to manually override night minutes. Older flights retain their original entries until you opt in.</div>
</div>
  <div class="field"><label>IFR time (minutes)</label><input id="ifrMin" type="number" min="0" value="0"></div>
</div>

<div id="nightCalcStatus" class="note" role="status" aria-live="polite" style="margin-top:10px">Enter flight date, UTC times and aerodrome coordinates to calculate night time.</div>
<div id="quickNightNotice" class="quick-entry-night-note" role="status" aria-live="polite" hidden></div>
<div class="mini quick-entry-advanced" style="margin-top:8px">Night is based on the Sun’s centre 6° below the horizon (civil twilight), not sunset. En-route calculations use a direct-line estimate; always check applicable national rules and official twilight data.</div>

<div class="quick-entry-extras-switch">
  <button id="quickExtraToggle" class="btn" type="button" aria-expanded="false" aria-controls="quickExtraFields quickRemarks" onclick="toggleQuickEntryExtras()">+ Cross-country &amp; remarks</button>
</div>
<div id="quickExtraFields" class="checkbox-row quick-entry-optional">
  <input id="crossCountry" type="checkbox">
  <label for="crossCountry">Cross-country flight</label>
</div>

<details id="moreDetails" class="quick-entry-advanced"><summary>More details</summary>
  <div style="border:1px solid var(--line);border-radius:9px;padding:10px;max-width:420px;margin-top:12px">
    <label style="display:flex;gap:8px;align-items:start;cursor:pointer">
      <input id="instructorCheck" type="checkbox" onchange="toggleInstructorTime()">
      <span>Instructor time</span>
    </label>
    <div id="instructorWrap" style="display:none;margin-top:9px">
      <label for="instrMin" class="mini">Instructor time (H:MM)</label>
      <input id="instrMin" type="text" inputmode="decimal" placeholder="0:00" value="0:00">
      <div class="mini">Recorded separately from PIC, Dual and total flight time. Can be part of the same flight.</div>
    </div>
  </div>

  <details id="recencyEvidence" style="margin-top:14px;border:1px solid var(--line);padding:12px;border-radius:10px">
    <summary style="cursor:pointer;font-weight:700">FCL.060 recency — automatic or manual</summary>
    <div id="recencyAutoWrap">
      <p class="mini">Single-pilot PIC/SOLO: HeliLog automatically estimates qualifying movements from the take-offs and landings already recorded above. No duplicate sequence entry is necessary. Check the approaches and any unusual crew arrangements yourself.</p>
      <label class="choice-option" style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <input id="recencyAutoExclude" type="checkbox"> Exclude this flight from automatic recency estimates (e.g. you did not fly the complete approach/landing)
      </label>
    </div>
    <div id="recencyManualWrap" style="display:none">
      <p class="mini">For multi-pilot, DUAL, SPIC, PICUS or CO-PILOT: manually confirm complete take-off, approach and landing sequences flown by you as PF, if applicable. Do not confuse aircraft movements with your PF credit.</p>
      <label class="choice-option" style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <input id="recencyPF" type="checkbox" onchange="toggleRecencyEvidence()"> I was pilot flying for these complete sequences
      </label>
      <div class="formgrid">
        <div class="field"><label for="recencyDay">Confirmed day sequences</label><input id="recencyDay" type="number" min="0" max="100" step="1" value="0" disabled></div>
        <div class="field"><label for="recencyNight">Confirmed night sequences</label><input id="recencyNight" type="number" min="0" max="100" step="1" value="0" disabled></div>
      </div>
      <p class="mini">Night sequences also count toward the general 3-sequence threshold. Approved simulator and IR credit require separate checks.</p>
    </div>
  </details>
  <div class="section-title">Specialised helicopter operations</div>
  <div class="mini">Select the operations performed. Record operation time and, where applicable, completed cycles or offshore sequences. These are separate experience counters and do not increase total flight time.</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:10px;margin-top:12px">
    ${SPECIAL_OPS.map(op=>`<div style="border:1px solid var(--line);border-radius:9px;padding:10px">
      <label style="display:flex;gap:8px;align-items:start;cursor:pointer">
        <input id="specialCheck_${op.code}" type="checkbox" onchange="toggleSpecialOp('${op.code}')">
        <span>${htmlEscape(op.label)}</span>
      </label>
      <div id="specialWrap_${op.code}" style="display:none;margin-top:9px">
        <div class="special-count-fields">
          <div><label for="specialTime_${op.code}" class="mini">Operation time (H:MM)</label>
             <input id="specialTime_${op.code}" type="text" inputmode="decimal" placeholder="0:00" value="0:00" oninput="updateSpecialOpsPreview()"></div>
          ${op.code==='NVIS'?'<div class="special-nvis-auto"><span class="mini">NVIS flights</span><strong>1 per flight</strong><span class="mini">Counted automatically</span></div>':`
          <div><label for="specialDayCycles_${op.code}" class="mini">${op.code==='OFFSHORE'?'Day sequences':'Day cycles'}</label>
             <input id="specialDayCycles_${op.code}" type="number" min="0" max="9999" step="1" value="0" inputmode="numeric"></div>
          <div><label for="specialNightCycles_${op.code}" class="mini">${op.code==='OFFSHORE'?'Night sequences':'Night cycles'}</label>
             <input id="specialNightCycles_${op.code}" type="number" min="0" max="9999" step="1" value="0" inputmode="numeric"></div>`}
        </div>
      </div>
    </div>`).join('')}
  </div>
  <div class="mini" style="margin-top:10px">Unknown duration or counts may remain 0. For HHO, record only completed hoist cycles with transitions to and from hover. For offshore recency, record only complete offshore take-off, departure, approach and landing sequences. Night cycles must have occurred at night. NVIS uses flights, not cycles. Activities may overlap.</div>
  <div id="specialOpsPreview" class="mini" style="margin-top:8px"></div>
</details>

<div id="quickRemarks" class="field quick-entry-optional"><label>Remarks and endorsements</label><textarea id="remarks"></textarea></div>
${(!!editId&&correctingArchivedId===editId)?`<div class="field"><label>Reason for correction (required)</label><textarea id="correctionReason" placeholder="What was incorrect and why?" required></textarea></div>`:''}
<div class="actions"><button type="button" class="btn quick-entry-cancel" onclick="cancelFlightForm('${editing?existing.id:''}')">Cancel</button><button type="button" id="saveFlightBtn" class="btn primary" onclick="saveFlight()">${(!!editId&&correctingArchivedId===editId)?'Propose correction':editing?'Save changes':'Save flight'}</button></div>
</form>`;

populateTimePicker('offHour','offMinute');
populateTimePicker('onHour','onMinute');

if(existing){
  $('#date').value=formatDate(existing.date||'');
  $('#aid').value=existing.aid||S.aircraft[0]?.id||'';
  $('#dep').value=existing.dep||'';
  $('#arr').value=existing.arr||'';
  $('#off').value=existing.off||'';
  $('#on').value=existing.on||'';
  $('#mins').value=existing.mins||'';
  $('#role').value=existing.role||'PIC';
  $('#picName').value=displayPICName(existing);
  $('#picName').dataset.personId=existing.picPersonId||'';
  let pc=flightPilotConfig(existing);
  let pcRadio=document.querySelector(`input[name="pilotConfig"][value="${pc}"]`);
  if(pcRadio) pcRadio.checked=true;
  $('#toDay').value=existing.takeoffDay||0;
  $('#toNight').value=existing.takeoffNight||0;
  $('#ldgDay').value=existing.landingDay||0;
  $('#ldgNight').value=existing.landingNight||0;
  $('#nightMin').value=existing.nightMin||0;
  $('#ifrMin').value=existing.ifrMin||0;
  // Pre-V1.41.2 entries only have instrMin; automatically enable the control
  // when those earlier flights have recorded instructor time.
  const hasInstructorFlag=Object.prototype.hasOwnProperty.call(existing,'instructorSelected');
  $('#instructorCheck').checked=hasInstructorFlag
    ? !!existing.instructorSelected
    : Number(existing.instrMin||0)>0;
  $('#instrMin').value=fmt(existing.instrMin||0);
  toggleInstructorTime();
  $('#crossCountry').checked=!!existing.crossCountry;
  $('#remarks').value=existing.remarks||'';
  $('#recencyAutoExclude').checked=existing.recency?.excludeAuto===true;
  if(existing.recency?.pfConfirmed){
    $('#recencyPF').checked=true;
    $('#recencyDay').value=existing.recency.day||0;
    $('#recencyNight').value=existing.recency.night||0;
    toggleRecencyEvidence();
  }
  SPECIAL_OPS.forEach(op=>{
    if(Object.prototype.hasOwnProperty.call(existing.specialOps||{},op.code)){
      $('#specialCheck_'+op.code).checked=true;
      $('#specialTime_'+op.code).value=fmt(existing.specialOps[op.code]);
      if(op.code!=='NVIS'){
        $('#specialDayCycles_'+op.code).value=Number(existing.specialOpsCycles?.[op.code]?.day||0);
        $('#specialNightCycles_'+op.code).value=Number(existing.specialOpsCycles?.[op.code]?.night||0);
      }
      toggleSpecialOp(op.code);
    }
  });
  if($('#instructorCheck').checked || Object.keys(existing.specialOps||{}).length || existing.recency?.pfConfirmed || existing.recency?.excludeAuto) $('#moreDetails').open=true;
  if(existing.recency?.pfConfirmed || existing.recency?.excludeAuto) $('#recencyEvidence').open=true;
}else{
  $('#date').value=formatDate(new Date().toISOString().slice(0,10));
  if(quick){
    const lastFlight=effectiveFlights().filter(f=>!isSimulatorSession(f)).sort(compareFlightsNewest)[0];
    if(lastFlight && S.aircraft.some(a=>a.id===lastFlight.aid)) $('#aid').value=lastFlight.aid;
  }
}

updateSpecialOpsPreview();
v218InitNight(existing);
$('#off').onblur=()=>validateTimeField('off');
$('#on').onblur=()=>validateTimeField('on');
$('#off').oninput=()=>{clearTimeError('off');calc();};
$('#on').oninput=()=>{clearTimeError('on');calc();};

let dayLandingOverridden=existing ? Number(existing.landingDay||0)!==Number(existing.takeoffDay||0) : false;
let nightLandingOverridden=existing ? Number(existing.landingNight||0)!==Number(existing.takeoffNight||0) : false;
$('#ldgDay').oninput=()=>{dayLandingOverridden=true};
$('#ldgNight').oninput=()=>{nightLandingOverridden=true};
$('#toDay').oninput=()=>{ if(!dayLandingOverridden) $('#ldgDay').value=$('#toDay').value||0; };
$('#toNight').oninput=()=>{ if(!nightLandingOverridden) $('#ldgNight').value=$('#toNight').value||0; };

$('#aid').onchange=updateAircraftEngineInfo;
updateAircraftEngineInfo();
roleChanged();

let flightForm=document.getElementById('flightForm');
if(flightForm){
  flightForm.addEventListener('input',markFlightFormDirty);
  flightForm.addEventListener('change',markFlightFormDirty);
}
flightFormDirty=false;
if(!editing)setFlightEntryMode(quick?'quick':'full');
}
function toggleInstructorTime(){
  const checked=!!document.getElementById('instructorCheck')?.checked;
  const wrap=document.getElementById('instructorWrap');
  if(wrap)wrap.style.display=checked?'block':'none';
  const input=document.getElementById('instrMin');
  if(input){
    if(!checked)input.value='0:00';
    input.classList.remove('time-input-invalid');
  }
}
function collectInstructorTime(totalMinutes){
  const checked=!!document.getElementById('instructorCheck')?.checked;
  if(!checked)return {instructorSelected:false,instrMin:0};
  const input=document.getElementById('instrMin');
  const raw=String(input?.value||'').trim();
  const minutes=parseBroughtForwardMinutes(raw);
  if(!raw||minutes===null||!Number.isSafeInteger(minutes)||minutes<0||minutes>totalMinutes){
    $('#moreDetails').open=true;
    input.classList.add('time-input-invalid');
    showFormError('Instructor time must be in H:MM (e.g. 0:45) or decimal hours, and cannot exceed total flight time.');
    input.focus();
    return null;
  }
  input.classList.remove('time-input-invalid');
  return {instructorSelected:true,instrMin:minutes};
}
function toggleSpecialOp(code){
  const checked=document.getElementById('specialCheck_'+code)?.checked;
  const wrap=document.getElementById('specialWrap_'+code);
  if(wrap)wrap.style.display=checked?'block':'none';
  if(!checked){
    const field=document.getElementById('specialTime_'+code);
    if(field)field.value='0:00';
    for(const id of ['specialDayCycles_','specialNightCycles_']){
      const count=document.getElementById(id+code);
      if(count)count.value='0';
    }
  }
  updateSpecialOpsPreview();
}
function updateSpecialOpsPreview(){
  const el=document.getElementById('specialOpsPreview');
  if(!el)return;
  const codes=SPECIAL_OPS.filter(op=>document.getElementById('specialCheck_'+op.code)?.checked).map(op=>op.code);
  el.textContent=codes.length?'Automatic remark: OPS: '+codes.join(', '):'No specialised operation codes selected.';
}
function collectSpecialOps(totalMinutes){
  const ops={};
  for(const op of SPECIAL_OPS){
    if(!document.getElementById('specialCheck_'+op.code)?.checked)continue;
    const input=document.getElementById('specialTime_'+op.code);
    const minutes=parseBroughtForwardMinutes(input.value);
    if(minutes===null || minutes<0 || minutes>totalMinutes){
      $('#moreDetails').open=true;
      input.classList.add('time-input-invalid');
      showFormError(op.code+' time must be H:MM or decimal hours and cannot exceed total flight time.');
      input.focus();return null;
    }
    input.classList.remove('time-input-invalid');
    ops[op.code]=minutes;
  }
  return ops;
}
function collectSpecialOpCycles(nightMinutes){
  const result={};
  for(const op of SPECIAL_OPS){
    if(op.code==='NVIS'||!document.getElementById('specialCheck_'+op.code)?.checked)continue;
    const dayInput=document.getElementById('specialDayCycles_'+op.code);
    const nightInput=document.getElementById('specialNightCycles_'+op.code);
    const rawDay=String(dayInput?.value??'').trim(),rawNight=String(nightInput?.value??'').trim();
    const day=Number(rawDay),night=Number(rawNight);
    if(!/^\\d{1,4}$/.test(rawDay)||!/^\\d{1,4}$/.test(rawNight)||
      !Number.isSafeInteger(day)||!Number.isSafeInteger(night)||
      day<0||night<0||day>9999||night>9999||(night>0&&nightMinutes<=0)){
      $('#moreDetails').open=true;
      if(dayInput)dayInput.classList.add('time-input-invalid');
      if(nightInput)nightInput.classList.add('time-input-invalid');
      showFormError(op.code+' needs whole, non-negative day/night cycle counts (0–9999). Night counts require recorded night flight time.');
      (night>0&&nightMinutes<=0?nightInput:dayInput)?.focus();
      return null;
    }
    dayInput?.classList.remove('time-input-invalid');
    nightInput?.classList.remove('time-input-invalid');
    if(day||night)result[op.code]={day,night};
  }
  return result;
}
function toggleRecencyEvidence(){
  const role=document.getElementById('role')?.value;
  const cfg=document.querySelector('input[name="pilotConfig"]:checked')?.value||'single';
  const auto=cfg==='single'&&['PIC','SOLO'].includes(role);
  const autoWrap=document.getElementById('recencyAutoWrap');
  const manualWrap=document.getElementById('recencyManualWrap');
  if(autoWrap)autoWrap.style.display=auto?'block':'none';
  if(manualWrap)manualWrap.style.display=auto?'none':'block';
  const checked=!auto&&!!document.getElementById('recencyPF')?.checked;
  for(const id of ['recencyDay','recencyNight']){
    const input=document.getElementById(id);
    if(input)input.disabled=!checked;
  }
}
function collectRecencyEvidence(icao,dayTo,dayLdg,nightTo,nightLdg,nightMin,role,cfg,original){
  const code=String(icao||'').trim().toUpperCase();
  if(cfg==='single'&&['PIC','SOLO'].includes(role)){
    if(document.getElementById('recencyAutoExclude')?.checked)return {excludeAuto:true,icao:code};
    // Preserve historical explicit PF evidence when editing a PIC/SOLO flight.
    // If movement counts change, read-only computation rechecks validity.
    return original?.recency?.pfConfirmed===true?{...original.recency,icao:code}:null;
  }
  const flag=document.getElementById('recencyPF');
  if(!flag?.checked)return null;
  const day=Number(document.getElementById('recencyDay')?.value);
  const night=Number(document.getElementById('recencyNight')?.value);
  const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=100;
  if(!valid(day)||!valid(night)||day+night===0||
    day>Math.min(dayTo,dayLdg)||night>Math.min(nightTo,nightLdg)||
    (night>0&&nightMin<=0)){
    document.getElementById('moreDetails').open=true;
    document.getElementById('recencyEvidence').open=true;
    showFormError('Complete PF sequences must not exceed day/night take-offs or landings; night sequences need night time.');
    return false;
  }
  return {pfConfirmed:true,day,night,icao:code};
}
function uppercasePlaceInput(el){
  let start=el.selectionStart, end=el.selectionEnd;
  let upper=String(el.value||'').toUpperCase();
  if(el.value!==upper){
    el.value=upper;
    try{el.setSelectionRange(start,end)}catch(e){}
  }
}
function editFlight(id){
  if(isArchivedFlight(id))return startArchivedCorrection(id);
  const entry=S.flights.find(f=>f.id===id);
  if(isSimulatorSession(entry))addSimulator(id);
  else add(id);
}
function populateTimePicker(hourId, minuteId){
  let h=document.getElementById(hourId), m=document.getElementById(minuteId);
  h.innerHTML=Array.from({length:24},(_,i)=>`<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`).join('');
  m.innerHTML=Array.from({length:60},(_,i)=>`<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`).join('');
}

function canonicalTime(v){
  let raw=(v||'').trim().replace(/[^0-9]/g,'');
  if(!raw) return '';
  if(raw.length===3) raw='0'+raw;
  if(raw.length!==4) return null;
  let h=Number(raw.slice(0,2)), m=Number(raw.slice(2,4));
  if(h>23 || m>59) return null;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}

function normalizeTimeInput(el){
  let c=canonicalTime(el.value);
  if(c===null) return false;
  if(c!=='') el.value=c;
  return true;
}

function clearTimeError(fieldId){
  let el=document.getElementById(fieldId);
  let err=document.getElementById(fieldId+'Error');
  el.classList.remove('time-input-invalid');
  if(err) err.classList.remove('show');
}

function markTimeError(fieldId){
  let el=document.getElementById(fieldId);
  let err=document.getElementById(fieldId+'Error');
  el.classList.add('time-input-invalid');
  if(err) err.classList.add('show');
}

function validateTimeField(fieldId){
  let el=document.getElementById(fieldId);
  if(!el.value.trim()){
    clearTimeError(fieldId);
    return false;
  }
  if(!normalizeTimeInput(el)){
    markTimeError(fieldId);
    return false;
  }
  clearTimeError(fieldId);
  calc();
  return true;
}

function toggleTimePicker(pickerId, fieldId){
  let p=document.getElementById(pickerId);
  let opening=!p.classList.contains('open');
  document.querySelectorAll('.timepicker.open').forEach(x=>x.classList.remove('open'));
  if(opening){
    let c=canonicalTime(document.getElementById(fieldId).value);
    if(c){
      let parts=c.split(':');
      let prefix=fieldId==='off'?'off':'on';
      document.getElementById(prefix+'Hour').value=parts[0];
      document.getElementById(prefix+'Minute').value=parts[1];
    }
    p.classList.add('open');
  }
}

function closeTimePicker(pickerId){
  document.getElementById(pickerId).classList.remove('open');
}

function applyTimePicker(pickerId, fieldId, hourId, minuteId){
  let value=document.getElementById(hourId).value+':'+document.getElementById(minuteId).value;
  document.getElementById(fieldId).value=value;
  clearTimeError(fieldId);
  closeTimePicker(pickerId);
  calc();
  markFlightFormDirty();
}

function calc(){
  let aa=canonicalTime($('#off').value), bb=canonicalTime($('#on').value);
  if(!aa||!bb){v218UpdateNight();return;}
  let n=parseHM(bb)-parseHM(aa); if(n<0)n+=1440;
  $('#mins').value=n;
  v218UpdateNight();
}

/* V2.19: optional UTC civil-twilight calculation, never rewrites saved history
 * unless a flight is saved with the automatic switch deliberately enabled. */
/* V2.19: account-scoped site directory, synchronized as a single private
 * settings record. ICAO discovery uses the bundled points first and, when
 * online, the optional OpenFlights global index. */
function v219Sites(){
 if(!Array.isArray(S.siteLocations))S.siteLocations=[];
 // Account data is not trusted HTML. Restrict inline action identifiers to
 // validated site codes and reject malformed cloud/imported location records.
 return S.siteLocations.filter(x=>x&&typeof x.code==='string'&&
  /^[A-Z0-9_-]{2,12}$/.test(x.code)&&window.HeliLogNight.coordinates(x));
}
const v219Requested=new Set();
function v219LocalPoint(code){
 const key=String(code||'').trim().toUpperCase();
 const saved=v219Sites().find(x=>x.code===key);
 const point=saved&&window.HeliLogNight.coordinates(saved);
 return point?{...point,source:'Saved site',name:saved.name}:null;
}
function v218SavedPoint(place){
 const code=String(place||'').trim().toUpperCase();
 if(!code)return null;
 const custom=v219LocalPoint(code);
 if(custom)return custom;
 const builtin=window.HeliLogAerodromes.cached(code);
 if(builtin)return builtin;
 // Preserve reference coordinates recorded on older flights.
 for(const f of [...S.flights].reverse()){
  const meta=f.nightCalculation;
  if(!meta)continue;
  for(const side of ['dep','arr']){
   if(f[side]===code){
    const point=window.HeliLogNight.coordinates(meta[side+'Coordinates']);
    if(point)return {...point,source:'Previously saved flight'};
   }
  }
 }
 return null;
}
function v218Point(which){
 const code=$('#'+which)?.value.trim().toUpperCase()||'';
 if(!code)return null;
 const current=editingFlightId&&S.flights.find(f=>f.id===editingFlightId);
 const saved=current?.nightCalculation;
 const earlier=current?.[which]===code?
  window.HeliLogNight.coordinates(saved?.[which+'Coordinates']):null;
 return v219LocalPoint(code)||earlier||v218SavedPoint(code);
}
async function v219RequestICAO(code){
 const key=String(code||'').trim().toUpperCase();
 if(!/^[A-Z]{4}$/.test(key)||v218SavedPoint(key)||v219Requested.has(key))return;
 v219Requested.add(key);
 await window.HeliLogAerodromes.lookup(key);
 if(document.getElementById('flightForm')&&
   [$('#dep')?.value.trim().toUpperCase(),$('#arr')?.value.trim().toUpperCase()].includes(key))
  v218UpdateNight();
}
function v218PlaceChanged(which){
 const key=$('#'+which)?.value.trim().toUpperCase();
 if(key && $('#nightAuto')?.checked && !v218SavedPoint(key))
  void v219RequestICAO(key);
 v218UpdateNight();
}
function v218NightResult(){
 const date=parseExternalDate($('#date')?.value||'');
 return window.HeliLogNight.calculate({
  date,off:canonicalTime($('#off')?.value||''),on:canonicalTime($('#on')?.value||''),
  dep:v218Point('dep'),arr:v218Point('arr')
 });
}
function v218UpdateNight(){
 const toggle=$('#nightAuto'),field=$('#nightMin'),status=$('#nightCalcStatus');
 if(!toggle||!field||!status)return;
 field.readOnly=toggle.checked;
 field.style.background=toggle.checked?'#f3f4f6':'';
 if(!toggle.checked){
  status.textContent='Manual night-time entry: confirm the value against applicable official rules. No automatic correction will be applied.';
  status.dataset.valid='manual';updateQuickNightNotice({ok:true});return;
 }
 const outcome=v218NightResult();
 status.dataset.valid=outcome.ok?'yes':'no';
 if(!outcome.ok){
  const depCode=$('#dep').value.trim().toUpperCase();
  const arrCode=$('#arr').value.trim().toUpperCase();
  if(depCode&&!v218SavedPoint(depCode))void v219RequestICAO(depCode);
  if(arrCode&&!v218SavedPoint(arrCode))void v219RequestICAO(arrCode);
  status.textContent='Automatic night time unavailable: '+outcome.reason+
    ' Airport ICAO codes are looked up online when needed. For unknown helipads or operating sites, save their coordinates in Settings → Aerodromes & Helipads, or choose manual night time.';
  updateQuickNightNotice(outcome);
  return;
 }
 field.value=outcome.nightMinutes;
 const dep=window.HeliLogNight.twilightAround(window.HeliLogNight.utcFlight(outcome.date,outcome.off,outcome.on).start,outcome.departure);
 const fmtTime=t=>t==null?'no twilight in ±24h':window.HeliLogNight.utcLabel(t);
 let info='Calculated night: '+outcome.nightMinutes+' of '+outcome.totalMinutes+
  ' minutes (UTC, Sun centre below −6°). '+
  (outcome.method==='same-site'?'Same-base calculation.':
   'Approximate straight-line route: '+outcome.distanceKm+' km between aerodromes.');
 info+=' Departure site civil dusk: '+fmtTime(dep?.eveningUtc)+
       '; civil dawn: '+fmtTime(dep?.morningUtc)+'.';
 if(outcome.distanceKm>=2){
  const flight=window.HeliLogNight.utcFlight(outcome.date,outcome.off,outcome.on);
  const arr=window.HeliLogNight.twilightAround(flight.end,outcome.arrival);
  info+=' Arrival site civil dusk: '+fmtTime(arr?.eveningUtc)+
        '; civil dawn: '+fmtTime(arr?.morningUtc)+'.';
 }
 if(outcome.distanceKm>250)info+=' Long route: real track/twilight can differ; review manually.';
 status.textContent=info;
 updateQuickNightNotice(outcome);
}
function v218InitNight(existing){
 const old=existing?.nightCalculation;
 $('#nightAuto').checked=existing?old?.mode==='automatic':true;
 $('#nightAuto').addEventListener('change',v218UpdateNight);
 for(const which of ['dep','arr']){
  $('#'+which).addEventListener('change',()=>v218PlaceChanged(which));
  $('#'+which).addEventListener('input',()=>v218PlaceChanged(which));
 }
 $('#date').addEventListener('input',v218UpdateNight);
 $('#date').addEventListener('change',v218UpdateNight);
 v218UpdateNight();
}
function updateAircraftEngineInfo(){
  let el=document.getElementById('aircraftEngineInfo');
  let a=ac(document.getElementById('aid')?.value);
  if(!el || !a) return;
  let code=engineCode(a);
  el.innerHTML=`<span class="tick">✓</span>${code==='ME'?'Multi-engine (ME)':'Single-engine (SE)'}`;
}
function roleChanged(){
  let r=$('#role').value, field=$('#picName');
  if(['PIC','SOLO'].includes(r)){
    let owner=ownerPerson();
    field.value='SELF';
    field.dataset.personId=owner?.id||'';
    field.readOnly=true;
    field.style.background='#f3f4f6';
  }else{
    if(field.value==='SELF'||field.value===S.pilot.name){
      field.value='';
      field.dataset.personId='';
    }
    field.readOnly=false;
    field.style.background='#fff';
  }
  if(typeof updateQuickPICVisibility==='function')updateQuickPICVisibility();
  if(typeof toggleRecencyEvidence==='function')toggleRecencyEvidence();
}

function showFormError(msg){
  let box=$('#formError');
  box.textContent=msg;
  box.classList.add('show');
  box.scrollIntoView({behavior:'smooth',block:'center'});
}
function clearFormError(){
  let box=$('#formError');
  if(box){box.textContent='';box.classList.remove('show');}
}
function saveFlight(){
  if(editingFlightId && isArchivedFlight(editingFlightId)&&correctingArchivedId!==editingFlightId){
    alert('This archived flight requires a correction addendum.');return;
  }
  clearFormError();

  if(readEuropeanDate('date',true)===null)return showFormError('Enter a valid flight date in DD-MM-YYYY format.');
  if(!$('#aid').value) return showFormError('Please select an aircraft.');
  if(!$('#dep').value.trim() || !$('#arr').value.trim()) return showFormError('Please enter both departure and arrival places.');

  let offValid=validateTimeField('off');
  let onValid=validateTimeField('on');
  if(!offValid || !onValid){
    return showFormError('Please correct the highlighted departure or arrival time before saving.');
  }
  calc();

  let m=Number($('#mins').value||0);
  if(m<=0) return showFormError('Total flight time must be greater than zero.');

  let night=Number($('#nightMin').value||0), ifr=Number($('#ifrMin').value||0);
  const nightAuto=$('#nightAuto').checked;
  let nightPreview=null;
  if(nightAuto){
   nightPreview=v218NightResult();
   if(!nightPreview.ok) return showFormError('Night-time calculation unavailable: '+nightPreview.reason+' Configure the site under Settings → Aerodromes & Helipads, or use manual night time.');
   night=nightPreview.nightMinutes;
   $('#nightMin').value=night;
  }
  if(!Number.isInteger(night)||night<0||!Number.isInteger(ifr)||ifr<0)
   return showFormError('Night and IFR times must be whole, non-negative minutes.');
  if(night>m) return showFormError('Night time cannot be greater than total flight time.');
  if(ifr>m) return showFormError('IFR time cannot be greater than total flight time.');

  const specialOps=collectSpecialOps(m);
  if(specialOps===null)return;
  const specialOpsCycles=collectSpecialOpCycles(night);
  if(specialOpsCycles===null)return;
  const instructorTime=collectInstructorTime(m);
  if(instructorTime===null)return;
  let pilotConfig=document.querySelector('input[name="pilotConfig"]:checked')?.value||'single';
  let role=$('#role').value;
  const originalEntry=editingFlightId?S.flights.find(x=>x.id===editingFlightId):null;
  const recencyEvidence=collectRecencyEvidence(ac($('#aid').value)?.icao,
    Number($('#toDay').value||0),Number($('#ldgDay').value||0),
    Number($('#toNight').value||0),Number($('#ldgNight').value||0),night,
    role,pilotConfig,originalEntry);
  if(recencyEvidence===false)return;

  let picName=$('#picName').value.trim();
  if(['PIC','SOLO'].includes(role))picName='SELF';
  if(!picName) return showFormError('Please enter the name of the PIC.');
  if(!['PIC','SOLO'].includes(role) && picName.toLowerCase()===S.pilot.name.toLowerCase()){
    return showFormError('For '+role+', Name of PIC must be the commander/PIC of the flight, not the account holder.');
  }

  let picPerson=['PIC','SOLO'].includes(role)?ownerPerson():ensurePersonForName(picName);
  if(picPerson && !['PIC','SOLO'].includes(role)) picName=picPerson.name;

  let existingIndex=editingFlightId?S.flights.findIndex(x=>x.id===editingFlightId):-1;
  let original=existingIndex>=0?S.flights[existingIndex]:null;
  let f={
    id:original?original.id:'f'+Date.now(),
    date:readEuropeanDate('date',true),
    aid:$('#aid').value,
    dep:$('#dep').value.trim().toUpperCase(),
    arr:$('#arr').value.trim().toUpperCase(),
    off:$('#off').value,
    on:$('#on').value,
    mins:m,
    role:role,
    picName:picName,
    picPersonId:picPerson?.id||'',
    pilotConfig:pilotConfig,
    nightMin:night,
    nightCalculation:{
      mode:nightAuto?'automatic':'manual',
      convention:'EASA/SERA civil twilight; solar centre below -6 degrees',
      algorithm:'V2.19 minute-midpoint straight-line approximation',
      depCoordinates:v218Point('dep'),
      arrCoordinates:v218Point('arr'),
      distanceKm:nightPreview?.distanceKm??null
    },
    ifrMin:ifr,
    takeoffDay:Number($('#toDay').value||0),
    takeoffNight:Number($('#toNight').value||0),
    landingDay:Number($('#ldgDay').value||0),
    landingNight:Number($('#ldgNight').value||0),
    instrMin:instructorTime.instrMin,
    instructorSelected:instructorTime.instructorSelected,
    // Preserve legacy simulator information on old flight entries when editing.
    // New simulator sessions use their dedicated entry type instead.
    stdType:original?.stdType||'',
    stdMin:Number(original?.stdMin||0),
    crossCountry:$('#crossCountry').checked,
    specialOps,
    specialOpsCycles,
    recency:recencyEvidence,
    remarks:$('#remarks').value.trim(),
    createdAt:original?.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };

  const signature=flightFingerprintForRecord(f);
  if(signature){
    const duplicate=S.flights.find(other=>other.id!==f.id && flightFingerprintForRecord(other)===signature);
    if(duplicate)return showFormError('A flight with the same aircraft, date, route and departure/arrival times already exists. Check your logbook before saving.');
  }
  if(correctingArchivedId===editingFlightId&&isArchivedFlight(editingFlightId))
    return recordArchiveCorrection(editingFlightId,f,$('#correctionReason').value);
  if(existingIndex>=0) S.flights[existingIndex]=f;
  else S.flights.push(f);
  if(!save())return;
  editingFlightId=null;
  clearFlightFormGuard();
  flight(f.id);
}
function flight(id){const entry=effectiveFlight(S.flights.find(x=>x.id===id));if(isSimulatorSession(entry))return simulatorDetails(id);editingFlightId=null;let f=entry,a=ac(f.aid);app.innerHTML=header('Flight details',`${formatDate(f.date)} · ${a.icao}`,`<div style="display:flex;gap:8px;flex-wrap:wrap">${v229CanReturnToReview(id)?'<button class="btn" onclick="v229ReturnToReview()">← Back to review</button>':'<button class="btn" onclick="go(\'logbook\')">← Logbook</button>'}<button class="btn primary" onclick="editFlight('${id}')">${isArchivedFlight(id)?'Propose correction':'Edit flight'}</button>${!isArchivedFlight(id)?`<button class="btn dangerbtn" onclick="openDeleteModal('${id}')">Delete flight</button>`:''}</div>`)+`<div class="card">
<div class="icao">${a.icao}</div><div class="muted">${a.reg} · ${a.manufacturer} ${a.model} ${a.variant}</div>
<h2 style="margin-top:22px">${f.dep} ${f.off||''} → ${f.arr} ${f.on||''}</h2>
<div class="kpi-grid"><div class="card"><div class="label">Total time</div><div class="big">${fmt(f.mins)}</div></div><div class="card"><div class="label">Pilot function</div><div class="big" style="font-size:20px">${f.role}</div></div><div class="card"><div class="label">Night</div><div class="big">${fmt(f.nightMin||0)}</div></div><div class="card"><div class="label">IFR</div><div class="big">${fmt(f.ifrMin||0)}</div></div></div>
<div class="mini" style="margin-top:12px">Night entry: ${f.nightCalculation?.mode==='automatic'?'Automatically estimated from aerodrome coordinates and civil twilight':'Manually entered / legacy record'}.</div>
<div class="formgrid" style="margin-top:18px"><div><b>Name of PIC</b><div class="muted">${htmlEscape(displayPICName(f)||'—')}</div></div><div><b>Engine configuration</b><div class="muted">✓ ${engineCode(a)==='ME'?'Multi-engine (ME)':'Single-engine (SE)'}</div></div><div><b>Pilot configuration</b><div class="muted">${flightPilotConfig(f)==='multi'?'Multi-pilot':'Single-pilot'}</div></div><div><b>Configuration time</b><div class="muted">${(()=>{let c=configurationTimes(f);return c.multi?`Multi-pilot ${fmt(c.multi)}`:c.spME?`Single-pilot ME ${fmt(c.spME)}`:`Single-pilot SE ${fmt(c.spSE)}`})()}</div></div><div><b>Take-offs</b><div class="muted">Day ${f.takeoffDay||0} · Night ${f.takeoffNight||0}</div></div><div><b>Landings</b><div class="muted">Day ${f.landingDay||0} · Night ${f.landingNight||0}</div></div><div><b>Cross-country</b><div class="muted">${f.crossCountry?'Yes':'No'}</div></div></div>
<p><b>FCL.060 recency:</b> <span class="muted">${(()=>{const e=window.HeliLogV233Recency.evidence(f);return e.source==='excluded'?'Excluded from automatic estimate':e.source==='unverified'?'PF evidence not established':e.source==='estimated'?'Automatically estimated day '+e.day+' · night '+e.night+' movements':'Confirmed day '+e.day+' · night '+e.night+' PF sequences';})()}</span></p>
<p><b>Remarks / endorsements</b><br><span class="muted">${htmlEscape(flightRemarksForDisplay(f)||'—')}</span></p>
${Object.keys(f.specialOps||{}).length?`<div class="card" style="margin-top:16px"><h3>Specialised helicopter operations</h3>
${SPECIAL_OPS.filter(op=>Object.prototype.hasOwnProperty.call(f.specialOps||{},op.code)).map(op=>`<div class="profileline"><div class="k">${htmlEscape(op.label)}</div>
 <b>${fmt(f.specialOps[op.code])}${op.code==='NVIS'?' · NVIS flight':f.specialOpsCycles?.[op.code]?' · Day '+Number(f.specialOpsCycles[op.code].day)+' / Night '+Number(f.specialOpsCycles[op.code].night):''}</b></div>`).join('')}
<div class="mini">Breakdown only — no additional flight-time credit.</div></div>`:''}</div>`+
  correctionHistoryMarkup(id)}

function openDeleteModal(id){
  if(isArchivedFlight(id)){
    alert('This flight is part of a confirmed print archive and cannot be deleted. A traceable amendment is required.');
    return;
  }
  let f=S.flights.find(x=>x.id===id);
  if(!f) return;
  pendingDeleteFlightId=id;
  let a=ac(f.aid);
  let modal=document.getElementById('deleteModal');
  let textEl=document.getElementById('deleteText');
  textEl.textContent=isSimulatorSession(f)?`Delete simulator session ${formatDate(f.date)} · ${simulatorDeviceLabel(f)} · ${fmt(f.stdMin)}?`:`Delete ${formatDate(f.date)} · ${a?.icao||'aircraft'} · ${f.dep} → ${f.arr} · ${fmt(f.mins)}? This removes the flight from the V1 prototype.`;
  modal.classList.add('open');
}
function closeDeleteModal(){
  pendingDeleteFlightId=null;
  document.getElementById('deleteModal').classList.remove('open');
}
function confirmDeleteFlight(){
  if(!pendingDeleteFlightId) return;
  if(isArchivedFlight(pendingDeleteFlightId)){
    closeDeleteModal();
    alert('Archived flights cannot be deleted.');
    return;
  }
  let idx=S.flights.findIndex(f=>f.id===pendingDeleteFlightId);
  if(idx>=0){
    S.flights.splice(idx,1);
    save();
  }
  pendingDeleteFlightId=null;
  document.getElementById('deleteModal').classList.remove('open');
  go('logbook');
}

