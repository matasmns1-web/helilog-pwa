function totals(){
  let t=calcTotals(),by=combinedTotalsByType(),opsTotals=specialisedTotals();
  const simSessions=effectiveFlights().filter(isSimulatorSession),simMinutes=simSessions.reduce((n,f)=>n+Number(f.stdMin||0),0);
  app.innerHTML=header('Totals','Your combined career totals')+
  `${confirmedCorrections().length?`<div class="note" style="margin-bottom:14px">Includes ${confirmedCorrections().length} confirmed archived-entry correction addendum(s). Original signed print batches remain unchanged; any revised carried-forward paper totals are documented in subsequent batches.</div>`:''}
  <div class="grid stats">${[['Total',t.total],['PIC',t.pic],['Co-pilot',t.copilot],['Dual',t.dual]].map(x=>`<div class="card"><div class="label">${x[0]}</div><div class="big">${fmt(x[1])}</div></div>`).join('')}</div>
  <div class="grid two" style="margin-top:16px">
    <div class="card">
      <div class="head"><h2>Aircraft engine experience</h2></div>
      <p>Single-engine (SE) <span style="float:right"><b>${fmt(t.engineSE)}</b></span></p>
      <p>Multi-engine (ME) <span style="float:right"><b>${fmt(t.engineME)}</b></span></p>
      ${previousEngineUnallocated()>0?
         `<div class="mini">Previous paper flight time not allocated to SE/ME: ${fmt(previousEngineUnallocated())}. Enter the missing engine split in previous-logbook totals before your first archive batch, if known.</div>`:''}
    </div>
    <div class="card">
      <div class="head"><h2>Pilot configuration time</h2></div>
      <p>Single-pilot <span style="float:right"><b>${fmt(t.single)}</b></span></p>
      <p>Multi-pilot <span style="float:right"><b>${fmt(t.multi)}</b></span></p>
      ${previousPilotUnallocated()>0?`<div class="mini">Previous paper time not allocated to Single-/Multi-pilot: ${fmt(previousPilotUnallocated())}.</div>`:''}
      <p>Instructor <span style="float:right"><b>${fmt(t.instructor)}</b></span></p>
    </div>
    <div class="card">
      <div class="head"><h2>Additional breakdown</h2></div>
      <p>SPIC <span style="float:right">${fmt(t.spic)}</span></p>
      <p>PICUS <span style="float:right">${fmt(t.picus)}</span></p>
      <p>Night <span style="float:right">${fmt(t.night)}</span></p>
      <p>IFR <span style="float:right">${fmt(t.ifr)}</span></p>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="head"><h2>Simulator / synthetic training device experience</h2></div>
    <div class="grid stats">
      <div class="card"><div class="label">Dedicated simulator sessions</div><div class="big">${simSessions.length}</div></div>
      <div class="card"><div class="label">Simulator session time</div><div class="big">${fmt(simMinutes)}</div></div>
      <div class="card"><div class="label">Total STD time recorded</div><div class="big">${fmt(effectiveFlights().reduce((n,f)=>n+Number(f.stdMin||0),0))}</div></div>
    </div>
    <div class="mini" style="margin-top:8px">Synthetic training time is shown separately and never added to Total, PIC, Dual or Night flight time.</div>
  </div>
  <div class="grid two" style="margin-top:16px">
    <div class="card">
      <div class="head"><h2>Take-offs &amp; landings</h2></div>
      <p>Take-offs day <span style="float:right"><b>${t.toDay}</b></span></p>
      <p>Take-offs night <span style="float:right"><b>${t.toNight}</b></span></p>
      <p>Landings day <span style="float:right"><b>${t.ldgDay}</b></span></p>
      <p>Landings night <span style="float:right"><b>${t.ldgNight}</b></span></p>
    </div>
    <div class="card">
      <div class="head"><h2>By ICAO type</h2></div>
      ${by.length?by.map(([k,v])=>`<p><b>${htmlEscape(k)}</b><span style="float:right">${fmt(v)}</span></p>`).join(''):'<div class="muted">No aircraft-type hours recorded yet.</div>'}
      <div class="mini" style="margin-top:10px">Includes previous hours entered by ICAO type and HeliLog flight entries. Paper hours without a type breakdown are included only in overall totals.</div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="head"><h2>Specialised helicopter operations experience</h2></div>
    <div class="mini" style="margin-bottom:12px">Historical operation hours from your previous logbook are included separately from HeliLog flights. Categories may overlap and must not be added together or added to total flight time.</div>
    ${opsTotals.length?`<div style="overflow-x:auto"><table>
      <thead><tr><th>Operation</th><th>HeliLog flights</th><th>Previous</th><th>Recorded here</th><th>Combined</th><th>By ICAO type (HeliLog flights only)</th></tr></thead>
      <tbody>${opsTotals.map(op=>{
        const byType=new Map();
        effectiveFlights().filter(f=>Object.prototype.hasOwnProperty.call(f.specialOps||{},op.code)).forEach(f=>{
          const type=ac(f.aid)?.icao||'—';
          byType.set(type,(byType.get(type)||0)+Number(f.specialOps[op.code]||0));
        });
        return `<tr><td><b>${htmlEscape(op.code)}</b><div class="mini">${htmlEscape(op.label)}</div></td>
          <td>${op.flights}</td><td>${fmt(op.previousMinutes)}</td><td>${fmt(op.recordedMinutes)}</td><td><b>${fmt(op.minutes)}</b></td>
          <td>${[...byType.entries()].map(([type,mins])=>`${htmlEscape(type)} ${fmt(mins)}`).join(' · ')}</td></tr>`;
      }).join('')}</tbody></table></div>`:
      '<div class="muted">No specialised operations recorded yet. Add previous experience through Settings → Import previous logbook totals, or use More details on a new flight.</div>'}
    <div class="mini" style="margin-top:12px">For example, VRLL and HESLO 2 may describe overlapping portions of the same flight. Their category totals must not be added together.</div>
  </div>`;
}

function editBroughtForwardTotals(){
  if(S.printArchive?.batches?.length){
    alert('Your previous-logbook opening balance is already part of a confirmed print archive. Changing it would break signed page continuity. Keep the original records; a traceable amendment workflow will be added separately.');
    return;
  }
  let b=S.broughtForward||{};
  let correcting=!!S.broughtForwardImported;
  const durationField=(id,label,key)=>`<div class="field"><label>${label}</label><input id="${id}" type="text" inputmode="decimal" placeholder="0:00" value="${broughtForwardInputMinutes(b[key])}"><div class="mini">H:MM, or decimal hours</div></div>`;
  const countField=(id,label,key)=>`<div class="field"><label>${label}</label><input id="${id}" type="number" min="0" step="1" value="${Number(b[key]||0)||''}" placeholder="0"></div>`;

  app.innerHTML=header(correcting?'Correct imported logbook totals':'Import previous logbook totals',
    correcting?'Use this only to correct the original paper-logbook import.':'Enter the cumulative totals from your paper logbook before you start using HeliLog.',
    `<button class="btn" onclick="go('settings')">Cancel</button>`)+
  `<form class="card form" onsubmit="saveBroughtForwardTotals(event)">
    <div class="note">${correcting?'<b>Correction mode.</b> These values have already been imported. Saving will replace the original brought-forward totals.':'This is intended as a <b>one-time setup import</b>.'} The values stay separate from individual HeliLog flights, contribute to career totals, and populate <b>TOTAL FROM PREVIOUS PAGES</b> in the paper-style logbook export.</div>

    <div class="section-title">Flight time</div>
    <div class="mini" style="margin-bottom:10px">Engine type and pilot configuration are independent: SE + ME should equal your total flight time, and Single-pilot + Multi-pilot should separately equal the same total. The two groups must not be added together. If old paper records do not provide every category, HeliLog will indicate the unallocated difference.</div>
    <div class="formgrid">
      ${durationField('bfTotal','Total time','total')}
      ${durationField('bfEngineSE','Single-engine (SE) total','engineSE')}
      ${durationField('bfEngineME','Multi-engine (ME) total','engineME')}
      ${durationField('bfSingle','Single-pilot total','single')}
      ${durationField('bfMulti','Multi-pilot total','multi')}
      ${durationField('bfPIC','PIC','pic')}
      ${durationField('bfCopilot','Co-pilot','copilot')}
      ${durationField('bfDual','Dual','dual')}
      ${durationField('bfInstructor','Instructor','instructor')}
      ${durationField('bfSPIC','SPIC','spic')}
      ${durationField('bfPICUS','PICUS','picus')}
      ${durationField('bfNight','Night','night')}
      ${durationField('bfIFR','IFR','ifr')}
    </div>

    <div class="section-title">Take-offs and landings</div>
    <div class="formgrid">
      ${countField('bfToDay','Take-offs day','toDay')}
      ${countField('bfToNight','Take-offs night','toNight')}
      ${countField('bfLdgDay','Landings day','ldgDay')}
      ${countField('bfLdgNight','Landings night','ldgNight')}
    </div>

    <div class="section-title">Previous specialised helicopter operations</div>
    <div class="mini" style="margin-bottom:10px">Optional historical operation time. These categories describe activities within your previous flight hours, not additional flight time. Individual categories may overlap.</div>
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px">
      <button type="button" class="btn" onclick="openBroughtForwardSpecialOps()">Specialised operations…</button>
      <span id="bfSpecialOpsSummary" class="mini"></span>
    </div>

    <div class="section-title">Flight time by aircraft type</div>
    <div class="mini">Optional: enter your paper-logbook hours for each ICAO type. These hours are a breakdown of the Total above, not additional flying time.</div>
    <datalist id="bfICAOTypes">${[...new Set(S.aircraft.map(a=>String(a.icao||'').trim().toUpperCase()).filter(Boolean))]
      .map(icao=>`<option value="${htmlEscape(icao)}"></option>`).join('')}</datalist>
    <div id="bfTypeRows" style="display:grid;gap:10px"></div>
    <div><button type="button" class="btn" onclick="addBroughtForwardTypeRow()">＋ Add aircraft type</button></div>

    <div id="bfError" class="errorbox"></div>
    <div class="actions"><button type="button" class="btn" onclick="go('profile')">Cancel</button><button class="btn primary">${correcting?'Save correction':'Import totals'}</button></div>
  </form>
  <div id="bfSpecialOpsModal" class="modalbackdrop" role="presentation" onclick="if(event.target===this)closeBroughtForwardSpecialOps()">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="bfSpecialOpsTitle" style="max-width:720px;max-height:85vh;overflow-y:auto">
      <h3 id="bfSpecialOpsTitle">Previous specialised operations</h3>
      <p class="mini">Enter hours already included in the previous-logbook total. Values are separate per operation and can overlap. Empty fields mean 0:00.</p>
      <div class="formgrid">
        ${SPECIAL_OPS.map(op=>`<div class="field"><label for="bfSpecialOp_${op.code}">${htmlEscape(op.label)}</label>
          <input id="bfSpecialOp_${op.code}" type="text" inputmode="decimal" placeholder="0:00" autocomplete="off"></div>`).join('')}
      </div>
      <div id="bfSpecialOpsError" class="errorbox" role="alert" style="margin-top:12px"></div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn" type="button" onclick="closeBroughtForwardSpecialOps()">Cancel</button>
        <button class="btn primary" type="button" onclick="applyBroughtForwardSpecialOps()">Apply to import</button>
      </div>
      <p class="mini" style="margin-top:12px">Applying updates only this unsaved form. Use Import totals / Save correction on the main page to confirm and synchronize the values.</p>
    </div>
  </div>`;
  bfSpecialOpsDraft={...validPreviousSpecialOps(S.broughtForward?.specialOps)};
  updateBroughtForwardSpecialOpsSummary();
  if((S.broughtForwardByType||[]).length){
    S.broughtForwardByType.forEach(e=>addBroughtForwardTypeRow(e.icao,e.minutes));
  }else addBroughtForwardTypeRow();
}

// Previous operations are kept inside broughtForward, which is already
// independently revision-checked as one cloud settings record.
let bfSpecialOpsDraft=null;
function validPreviousSpecialOps(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const result={};
  for(const op of SPECIAL_OPS){
    if(!Object.prototype.hasOwnProperty.call(value,op.code))continue;
    const n=Number(value[op.code]);
    if(Number.isSafeInteger(n)&&n>=0)result[op.code]=n;
  }
  return result;
}
function updateBroughtForwardSpecialOpsSummary(){
  const target=document.getElementById('bfSpecialOpsSummary');
  if(!target)return;
  const saved=validPreviousSpecialOps(bfSpecialOpsDraft);
  const count=Object.values(saved).filter(n=>n>0).length;
  target.textContent=count?count+' operation '+(count===1?'category':'categories')+' entered':'No previous operation time entered';
}
function openBroughtForwardSpecialOps(){
  const modal=document.getElementById('bfSpecialOpsModal');
  if(!modal||!bfSpecialOpsDraft||S.printArchive?.batches?.length)return;
  const saved=validPreviousSpecialOps(bfSpecialOpsDraft);
  for(const op of SPECIAL_OPS){
    const input=document.getElementById('bfSpecialOp_'+op.code);
    if(input)input.value=broughtForwardInputMinutes(saved[op.code]||0);
  }
  const error=document.getElementById('bfSpecialOpsError');
  if(error){error.textContent='';error.classList.remove('show');}
  modal.classList.add('open');
  document.getElementById('bfSpecialOp_'+SPECIAL_OPS[0].code)?.focus();
}
function closeBroughtForwardSpecialOps(){
  const modal=document.getElementById('bfSpecialOpsModal');
  if(!modal?.classList.contains('open'))return;
  modal.classList.remove('open'); // Unsaved edits in the popup are discarded.
  document.querySelector('[onclick="openBroughtForwardSpecialOps()"]')?.focus();
}
function applyBroughtForwardSpecialOps(){
  const modal=document.getElementById('bfSpecialOpsModal');
  if(!modal?.classList.contains('open'))return;
  const next={},error=document.getElementById('bfSpecialOpsError');
  const total=parseBroughtForwardMinutes(document.getElementById('bfTotal')?.value);
  if(total===null||!Number.isSafeInteger(total)||total<0){
    error.textContent='Enter a valid overall previous flight-time total in the main form first.';
    error.classList.add('show');return;
  }
  for(const op of SPECIAL_OPS){
    const value=parseBroughtForwardMinutes(document.getElementById('bfSpecialOp_'+op.code)?.value);
    if(value===null||!Number.isSafeInteger(value)||value<0||value>total){
      error.textContent=op.code+' must be a valid H:MM or decimal-hours value not exceeding the previous flight-time total '+fmt(total)+'.';
      error.classList.add('show');return;
    }
    if(value>0)next[op.code]=value;
  }
  bfSpecialOpsDraft=next;
  updateBroughtForwardSpecialOpsSummary();
  closeBroughtForwardSpecialOps();
}

function addBroughtForwardTypeRow(icao='',minutes=0){
  const list=document.getElementById('bfTypeRows');
  if(!list) return;
  const row=document.createElement('div');
  row.className='bf-type-row';
  row.style.cssText='display:flex;flex-wrap:wrap;align-items:end;gap:10px;border:1px solid var(--line);border-radius:9px;padding:10px';
  row.innerHTML=`<div class="field" style="flex:1 1 140px;min-width:0">
      <label>ICAO type</label>
      <input class="bf-type-icao uppercase-input" type="text" maxlength="4" autocomplete="off"
        list="bfICAOTypes" autocapitalize="characters" autocorrect="off" spellcheck="false"
        value="${htmlEscape(icao)}" placeholder="ICAO designator" oninput="uppercasePlaceInput(this)">
    </div>
    <div class="field" style="flex:1 1 140px;min-width:0">
      <label>Total time</label>
      <input class="bf-type-minutes" type="text" inputmode="decimal" placeholder="H:MM"
        value="${broughtForwardInputMinutes(minutes)}">
    </div>
    <button class="btn" type="button" onclick="this.closest('.bf-type-row').remove()">Remove</button>`;
  list.appendChild(row);
}

function saveBroughtForwardTotals(ev){
  ev.preventDefault();
  if(S.printArchive?.batches?.length){
    alert('A confirmed print archive already uses these opening balances. No previous-logbook values were changed.');
    return;
  }
  let durationMap={
    total:'bfTotal',engineSE:'bfEngineSE',engineME:'bfEngineME',single:'bfSingle',multi:'bfMulti',
    pic:'bfPIC',copilot:'bfCopilot',dual:'bfDual',instructor:'bfInstructor',
    spic:'bfSPIC',picus:'bfPICUS',night:'bfNight',ifr:'bfIFR'
  };
  let next={};
  for(let [key,id] of Object.entries(durationMap)){
    let value=parseBroughtForwardMinutes(document.getElementById(id).value);
    if(value===null){
      let box=document.getElementById('bfError');
      box.textContent='Please enter flight-time totals in H:MM format or as decimal hours.';
      box.classList.add('show');
      return;
    }
    next[key]=value;
  }
  if(next.engineSE+next.engineME>next.total || next.single+next.multi>next.total){
    const error=document.getElementById('bfError');
    error.textContent='The SE+ME total and Single-pilot+Multi-pilot total must not exceed the overall total flight time. Each is a separate breakdown of the same hours.';
    error.classList.add('show');
    error.scrollIntoView({block:'center',behavior:'smooth'});
    return;
  }
  const previousOps=validPreviousSpecialOps(bfSpecialOpsDraft??S.broughtForward?.specialOps);
  for(const [code,minutes] of Object.entries(previousOps)){
    if(minutes>next.total){
      const error=document.getElementById('bfError');
      error.textContent='Previous '+code+' time exceeds the overall previous flight time. Adjust the category in Specialised operations.';
      error.classList.add('show');error.scrollIntoView({block:'center',behavior:'smooth'});return;
    }
  }
  next.specialOps=previousOps;
  // Retain historical SP/SE and SP/ME values for old confirmed archive layouts,
  // but do not mix engine type with pilot configuration for new records.
  next.spSE=Number(S.broughtForward?.spSE||0);
  next.spME=Number(S.broughtForward?.spME||0);
  let countMap={toDay:'bfToDay',toNight:'bfToNight',ldgDay:'bfLdgDay',ldgNight:'bfLdgNight'};
  for(let [key,id] of Object.entries(countMap)){
    let raw=document.getElementById(id).value.trim();
    let value=raw===''?0:Number(raw);
    if(!Number.isInteger(value) || value<0){
      let box=document.getElementById('bfError');
      box.textContent='Take-off and landing totals must be whole numbers of zero or more.';
      box.classList.add('show');
      return;
    }
    next[key]=value;
  }
  let typeEntries=[],seenTypes=new Set();
  for(const row of document.querySelectorAll('#bfTypeRows .bf-type-row')){
    const icao=row.querySelector('.bf-type-icao').value.trim().toUpperCase();
    const raw=row.querySelector('.bf-type-minutes').value.trim();
    if(!icao && !raw) continue;
    const minutes=parseBroughtForwardMinutes(raw);
    const error=document.getElementById('bfError');
    if(!/^[A-Z0-9]{2,4}$/.test(icao) || minutes===null || minutes<=0){
      error.textContent='Each aircraft row needs a 2–4 character ICAO designator and positive hours as H:MM or decimal hours.';
      error.classList.add('show');
      error.scrollIntoView({block:'center',behavior:'smooth'});
      return;
    }
    if(seenTypes.has(icao)){
      error.textContent='Aircraft type '+icao+' is listed twice. Combine its hours into one row.';
      error.classList.add('show');
      error.scrollIntoView({block:'center',behavior:'smooth'});
      return;
    }
    seenTypes.add(icao);
    typeEntries.push({icao,minutes});
  }
  if(typeEntries.reduce((n,e)=>n+e.minutes,0)>next.total){
    const error=document.getElementById('bfError');
    error.textContent='The aircraft-type hours exceed the overall previous flight time. Check the figures before importing.';
    error.classList.add('show');
    error.scrollIntoView({block:'center',behavior:'smooth'});
    return;
  }
  let correcting=!!S.broughtForwardImported;
  let ok=confirm(correcting
    ? 'Replace the previously imported paper logbook totals with these corrected values?'
    : 'Import these paper logbook totals as your brought-forward career totals?\n\nThis is intended as a one-time setup step.');
  if(!ok) return;

  const previousState={broughtForward:S.broughtForward,broughtForwardByType:S.broughtForwardByType,
    broughtForwardImported:S.broughtForwardImported,broughtForwardImportedAt:S.broughtForwardImportedAt};
  S.broughtForward=next;
  S.broughtForwardByType=typeEntries;
  S.broughtForwardImported=true;
  if(!S.broughtForwardImportedAt)S.broughtForwardImportedAt=new Date().toISOString();
  if(!save()){
    Object.assign(S,previousState);return;
  }
  bfSpecialOpsDraft=null;
  settings();
}

const profileExpanded={medical:false,qualifications:false};
