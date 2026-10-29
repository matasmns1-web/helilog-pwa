let showArchivedAircraft=false;
function aircraft(){
  const inactiveCount=S.aircraft.filter(a=>a.inactive===true).length;
  editingAircraftId=null;
  app.innerHTML=header('Aircraft',showArchivedAircraft?'Archived registrations remain linked to all past flights and career totals':'Active aircraft appear when adding new flights. Archiving only hides future selections.',
    `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="showArchivedAircraft=!showArchivedAircraft;aircraft()">${showArchivedAircraft?'← Active aircraft':`Archived aircraft (${inactiveCount})`}</button><button class="btn primary" onclick="newAircraft()">＋ Add aircraft</button></div>`)+
  `<div class="grid aircraft">${S.aircraft.filter(a=>showArchivedAircraft?a.inactive===true:a.inactive!==true).map(a=>{
    let usedFlights=effectiveFlights().filter(f=>f.aid===a.id);
    let m=usedFlights.reduce((n,f)=>n+Number(f.mins||0),0);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div>
          <div class="icao">${a.icao}</div>
          <h3>${htmlEscape(a.reg)}</h3>${a.inactive===true?'<span class="badge gray">Inactive</span>':''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn" type="button" onclick="editAircraft('${a.id}')">Edit</button>
          <button class="btn" type="button" onclick="toggleAircraftInactive('${a.id}')">${a.inactive===true?'Reactivate':'Archive'}</button>
        </div>
      </div>
      <div class="muted">${a.manufacturer} ${a.model} ${a.variant||''}</div>
      <p><b>${fmt(m)}</b> <span class="muted">your time · ${usedFlights.length} flight${usedFlights.length===1?'':'s'}</span></p>
      <span class="muted">✓ ${engineCode(a)==='ME'?'Multi-engine (ME)':'Single-engine (SE)'}</span>
    </div>`;
  }).join('')||'<div class="card"><p class="muted">No '+(showArchivedAircraft?'archived':'active')+' aircraft. '+(showArchivedAircraft?'Switch back to active aircraft.':'Add or reactivate a registration.')+'</p></div>'}</div>`;
}

function newAircraft(editId=null){
  editingAircraftId=editId;
  let existing=editId?S.aircraft.find(a=>a.id===editId):null;
  if(editId && !existing){go('aircraft');return;}

  let linkedFlights=existing?S.flights.filter(f=>f.aid===existing.id).length:0;
  let title=existing?'Edit aircraft':'Add aircraft';
  let subtitle=existing
    ? 'Update aircraft details. Existing flights remain linked to this aircraft.'
    : 'The ICAO type designator will appear in flight records';

  app.innerHTML=header(title,subtitle,`<button class="btn" onclick="go('aircraft')">Cancel</button>`)+
  `<form class="card form" onsubmit="saveAircraft(event)">
    ${existing && linkedFlights?`<div class="note" style="margin-bottom:16px"><b>${linkedFlights} existing flight${linkedFlights===1?'':'s'} use this aircraft.</b><br>Changes to the aircraft details will also be reflected in those flight records and exports. If you change SE ↔ ME, the Single-pilot SE/ME allocation for those flights will change accordingly.</div>`:''}
    <div class="formgrid">
      <div class="field"><label>Registration</label><input id="reg" required value="${existing?htmlEscape(existing.reg||''):''}"></div>
      <div class="field"><label>ICAO type designator</label><input id="icao" required value="${existing?htmlEscape(existing.icao||''):''}"></div>
      <div class="field"><label>Manufacturer</label><input id="man" required value="${existing?htmlEscape(existing.manufacturer||''):''}"></div>
      <div class="field"><label>Model</label><input id="model" required value="${existing?htmlEscape(existing.model||''):''}"></div>
      <div class="field"><label>Variant (optional)</label><input id="variant" value="${existing?htmlEscape(existing.variant||''):''}"></div>
      <div class="field"><label>Engine configuration</label>
        <select id="engine">
          <option value="Single engine"${existing&&engineCode(existing)==='SE'?' selected':''}>Single-engine (SE)</option>
          <option value="Multi engine"${existing&&engineCode(existing)==='ME'?' selected':''}>Multi-engine (ME)</option>
        </select>
        <div class="mini">Used automatically for Single-pilot SE/ME logbook allocation.</div>
      </div>
    </div>
    <div class="actions"><button class="btn primary">${existing?'Save changes':'Save aircraft'}</button></div>
  </form>`;
}

function editAircraft(id){
  if(archivedFlightIdsForAircraft(id)){
    alert('This aircraft has flights in the signed print archive. Its details are locked to avoid changing how archived flights are classified. Add a new aircraft entry for new details.');
    return;
  }
  newAircraft(id);
}

function saveAircraft(e){
  e.preventDefault();

  let reg=$('#reg').value.trim().toUpperCase();
  let icao=$('#icao').value.trim().toUpperCase();
  let manufacturer=$('#man').value.trim();
  let model=$('#model').value.trim();
  let variant=$('#variant').value.trim();
  let engine=$('#engine').value;

  let duplicate=S.aircraft.find(a=>a.id!==editingAircraftId && String(a.reg||'').toUpperCase()===reg);
  if(duplicate){
    alert(`Another aircraft already uses registration ${reg}.`);
    return;
  }

  if(editingAircraftId){
    if(archivedFlightIdsForAircraft(editingAircraftId)){
      alert('This aircraft has archived flight entries and cannot be edited.');
      return;
    }
    let a=S.aircraft.find(a=>a.id===editingAircraftId);
    if(!a){go('aircraft');return;}
    a.reg=reg;
    a.icao=icao;
    a.manufacturer=manufacturer;
    a.model=model;
    a.variant=variant;
    a.engine=engine;
  }else{
    S.aircraft.push({
      id:'a'+Date.now(),
      reg,icao,manufacturer,model,variant,engine
    });
  }

  save();
  editingAircraftId=null;
  go('aircraft');
}

function toggleAircraftInactive(id){
  const a=S.aircraft.find(x=>x.id===id);
  if(!a)return;
  const prior=a.inactive;
  if(prior!==true && !confirm('Archive '+a.reg+'? It will be hidden from new-flight selection, but past flights, printed records and type totals will stay unchanged.'))return;
  a.inactive=prior!==true;
  if(!save()){a.inactive=prior;return;}
  go('aircraft');
}

// Literal SELF is a PIC display value, not an independent pilot profile.
function isLegacySelfPilotProfile(person){
  return !!person && !person.isAccountHolder && String(person.name||'').trim().toUpperCase()==='SELF';
}
function repairImportedSelfProfile(id){
  const legacy=personById(id),owner=ownerPerson();
  if(!isLegacySelfPilotProfile(legacy) || !owner?.isAccountHolder || owner.id===legacy?.id){
    alert('The account-holder profile is unavailable. No records were changed.');
    return;
  }
  const eligible=S.flights.filter(f=>!isSimulatorSession(f) &&
    ['PIC','SOLO'].includes(f.role) && !isArchivedFlight(f.id) &&
    (f.picPersonId===legacy.id ||
      (!f.picPersonId && String(f.picName||'').trim().toUpperCase()==='SELF')));
  const frozen=S.flights.filter(f=>isArchivedFlight(f.id) && f.picPersonId===legacy.id);
  if(!eligible.length && !S.people.includes(legacy))return;
  if(!confirm('Repair '+eligible.length+' unarchived PIC/SOLO flight(s) linked to SELF? They will be linked to your account-holder profile. '+frozen.length+' archived flight(s) will remain unchanged. An unneeded SELF profile will be removed; otherwise it will be hidden.'))return;
  const oldPeople=S.people;
  const before=eligible.map(f=>({f,picName:f.picName,picPersonId:f.picPersonId}));
  const oldInactive=legacy.inactive;
  eligible.forEach(f=>{f.picPersonId=owner.id;f.picName='SELF';});
  const stillReferenced=S.flights.some(f=>f.picPersonId===legacy.id) ||
    (S.endorsements||[]).some(e=>e.signatoryPersonId===legacy.id);
  const hasProfileData=!!(
    legacy.savedSignatureData || legacy.savedSignatureAt || legacy.savedSignatureConsentAt ||
    String(legacy.licence||'').trim() || String(legacy.notes||'').trim() ||
    (legacy.role && legacy.role!=='Pilot')
  );
  const removed=!stillReferenced&&!hasProfileData;
  if(removed) S.people=S.people.filter(p=>p.id!==legacy.id);
  else legacy.inactive=true;
  if(!save()){
    before.forEach(({f,picName,picPersonId})=>{f.picName=picName;f.picPersonId=picPersonId;});
    S.people=oldPeople;
    legacy.inactive=oldInactive;
    return;
  }
  alert('Repaired '+eligible.length+' unarchived PIC/SOLO flight(s). The original archived records were not modified. '+(removed?'Unused SELF profile removed.':'SELF profile retained under Archived pilots because it is still referenced or contains saved information.'));
  pilots();
}

let showArchivedPilots=false;
function pilots(){
  const inactiveCount=S.people.filter(p=>!p.isAccountHolder&&p.inactive===true).length;
  editingPersonId=null;
  let cards=S.people
    .filter(p=>showArchivedPilots?!p.isAccountHolder&&p.inactive===true:p.isAccountHolder||p.inactive!==true)
    .slice()
    .sort((a,b)=>(b.isAccountHolder?1:0)-(a.isAccountHolder?1:0) || a.name.localeCompare(b.name))
    .map(p=>{
      let linked=S.flights.filter(f=>f.picPersonId===p.id || (!f.picPersonId && String(f.picName||'').toLowerCase()===p.name.toLowerCase()));
      return `<div class="card pilot-card">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div>
            <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
              <h3 style="margin:0">${htmlEscape(p.name)}</h3>
              ${p.isAccountHolder?'<span class="badge">Account holder</span>':'<span class="badge gray">'+htmlEscape(p.role||'Pilot')+'</span>'}
              ${p.inactive===true?'<span class="badge gray">Inactive</span>':''}
            </div>
            ${p.licence?`<div class="muted" style="margin-top:5px">${htmlEscape(p.licence)}</div>`:''}
          </div>
          ${p.isAccountHolder
            ? `<button class="btn" type="button" onclick="go('profile')">Profile</button>`
            : `<button class="btn" type="button" onclick="editPerson('${p.id}')">Edit</button>`}
          ${!p.isAccountHolder?`<button class="btn" type="button" onclick="togglePersonInactive('${p.id}')">${p.inactive===true?'Reactivate':'Archive'}</button>`:''}
          ${isLegacySelfPilotProfile(p)?`<button class="btn" type="button" onclick="repairImportedSelfProfile('${p.id}')">Repair SELF imports</button>`:''}
          <button class="btn" type="button" onclick="v227EditSignature('${p.id}')">Signature</button>
        </div>
        <p><b>${linked.length}</b> <span class="muted">flight${linked.length===1?'':'s'} recorded with this person as PIC</span></p>
        ${p.notes?`<div class="muted" style="margin-bottom:10px">${htmlEscape(p.notes)}</div>`:''}
        <div class="mini"><b>Signature:</b> ${v227IsPNG(p.savedSignatureData)?'Saved to pilot profile':'Not saved'} · Endorsements still require approval for each signing.</div>
      </div>`;
    }).join('');

  app.innerHTML=header('Pilots',showArchivedPilots?'Archived pilots remain linked to past flights, endorsements and signatures':'Active pilots appear in new PIC and endorsement suggestions.',
    `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="showArchivedPilots=!showArchivedPilots;pilots()">${showArchivedPilots?'← Active pilots':`Archived pilots (${inactiveCount})`}</button><button class="btn primary" onclick="newPerson()">＋ Add pilot</button></div>`)+
    `<div class="grid aircraft">${cards||'<div class="card"><p class="muted">No '+(showArchivedPilots?'archived':'active')+' pilot profiles.</p></div>'}</div>`;
}

function newPerson(editId=null){
  editingPersonId=editId;
  let existing=editId?personById(editId):null;
  if(existing?.isAccountHolder){go('profile');return;}
  if(editId && !existing){go('pilots');return;}

  let linked=existing?S.flights.filter(f=>f.picPersonId===existing.id).length:0;
  app.innerHTML=header(existing?'Edit pilot':'Add pilot',
    existing?'Update the saved pilot profile. Linked flights stay connected.':'Save a pilot once, then select them quickly when adding flights.',
    `<button class="btn" onclick="go('pilots')">Cancel</button>`)+
    `<form class="card form" onsubmit="savePerson(event)">
      ${existing&&linked?`<div class="note" style="margin-bottom:16px"><b>${linked} linked flight${linked===1?'':'s'}.</b><br>If you change this pilot's name, linked flight records will be updated automatically.</div>`:''}
      <div class="formgrid">
        <div class="field"><label for="personFirstName">First name</label><input id="personFirstName" autocomplete="given-name" required value="${existing?htmlEscape(pilotNameParts(existing).firstName):''}" placeholder="First name"></div>
        <div class="field"><label for="personLastName">Surname</label><input id="personLastName" autocomplete="family-name" required value="${existing?htmlEscape(pilotNameParts(existing).lastName):''}" placeholder="Surname"></div>
        <div class="field"><label>Role / relationship</label><input id="personRole" value="${existing?htmlEscape(existing.role||'Pilot'):'Pilot'}" placeholder="Instructor, examiner, commander..."></div>
        <div class="field"><label>Licence / qualification</label><input id="personLicence" value="${existing?htmlEscape(existing.licence||''):''}" placeholder="e.g. CPL(H), FI(H), FE(H)"></div>
        <div class="field"><label>Licence number</label><input id="personLicenceNumber" value="${existing?htmlEscape(existing.licenceNumber||''):''}" placeholder="Optional"></div>
        <div class="field"><label>FI / FE authorisation number</label><input id="personFiFeNumber" value="${existing?htmlEscape(existing.fiFeNumber||''):''}" placeholder="Optional"></div>
        <div class="field"><label>Notes</label><input id="personNotes" value="${existing?htmlEscape(existing.notes||''):''}" placeholder="Optional"></div>
      </div>
      <div class="mini" style="margin-top:14px">After saving, use Signature on this pilot’s card to capture or update their signature. It will never be applied automatically.</div>
      <div class="actions"><button class="btn primary">${existing?'Save changes':'Save pilot'}</button></div>
    </form>`;
}

function editPerson(id){newPerson(id)}

function savePerson(e){
  e.preventDefault();
  let firstName=$('#personFirstName').value.trim().replace(/\s+/g,' ');
  let lastName=$('#personLastName').value.trim().replace(/\s+/g,' ');
  let name=[firstName,lastName].filter(Boolean).join(' ');
  let role=$('#personRole').value.trim()||'Pilot';
  let licence=$('#personLicence').value.trim();
  let licenceNumber=$('#personLicenceNumber')?.value.trim()||'';
  let fiFeNumber=$('#personFiFeNumber')?.value.trim()||'';
  let notes=$('#personNotes').value.trim();
  if(!firstName||!lastName){
    alert('Please enter both the first name and surname.');
    return;
  }

  let duplicate=S.people.find(p=>p.id!==editingPersonId && p.name.toLowerCase()===name.toLowerCase());
  if(duplicate){
    alert('A saved pilot with this name already exists.');
    return;
  }

  if(editingPersonId){
    let p=personById(editingPersonId);
    if(!p){go('pilots');return;}
    let oldName=p.name;
    p.name=name;p.firstName=firstName;p.lastName=lastName;
    p.role=role;p.licence=licence;p.licenceNumber=licenceNumber;p.fiFeNumber=fiFeNumber;p.notes=notes;
    S.flights.forEach(f=>{
      if(isArchivedFlight(f.id)) return;
      if(f.picPersonId===p.id || (!f.picPersonId && String(f.picName||'').toLowerCase()===oldName.toLowerCase())){
        f.picPersonId=p.id;
        f.picName=name;
      }
    });
  }else{
    S.people.push({
      id:'p'+Date.now()+Math.random().toString(36).slice(2,6),
      name,firstName,lastName,role,licence,licenceNumber,fiFeNumber,notes,isAccountHolder:false
    });
  }

  save();
  editingPersonId=null;
  go('pilots');
}




function togglePersonInactive(id){
  const p=personById(id);
  if(!p||p.isAccountHolder)return;
  const prior=p.inactive;
  if(prior!==true && !confirm('Archive '+p.name+'? The pilot will be hidden from new PIC and endorsement suggestions, but all past records and saved signatures will remain.'))return;
  p.inactive=prior!==true;
  if(!save()){p.inactive=prior;return;}
  go('pilots');
}

/* V2.27 — consent-based pilot profile signatures.
 * Records are stored as PNG snapshots per person. Endorsements embed a copy,
 * not a live reference. Not independent identity verification or a QES.
 */
function v227IsPNG(x){
  return typeof x==='string' && x.length<=250000 &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(x);
}
function v227EditSignature(id){
  const person=personById(id);
  if(!person){go('pilots');return;}
  const has=v227IsPNG(person.savedSignatureData);
  app.innerHTML=header('Pilot signature','Manage a reusable signature for '+person.name,
    '<button class="btn" type="button" onclick="go(\'pilots\')">← Pilots</button>')+
    '<div class="card v227-signature-view">'+
    '<h2>'+htmlEscape(person.name)+'</h2>'+
    '<p class="muted">The named pilot must draw or approve storing their own signature. A saved signature is never applied to an endorsement automatically.</p>'+
    (has?'<div class="v227-saved-image"><b>Saved signature</b><img alt="Saved pilot signature" src="'+person.savedSignatureData+'">'+
      '<div class="mini">Saved '+htmlEscape(person.savedSignatureAt?formatDateTime(person.savedSignatureAt):'previously')+'. Existing signed records remain unchanged if you replace or remove this signature.</div></div>':
      '<div class="note">No saved signature yet.</div>')+
    '<div class="signature-canvas-wrap"><b>Draw the signature</b><canvas id="signatureCanvas" width="900" height="260"></canvas>'+
      '<button type="button" class="btn" onclick="clearEndorsementSignature()">Clear</button></div>'+
    '<label class="v227-confirm"><input type="checkbox" id="v227StoreConsent"> I am the named pilot, or the pilot is present and explicitly agrees to store this signature in their profile.</label>'+
    '<p class="mini">Saved signatures can be included in cloud synchronization and backups. Treat them as sensitive personal information. Saving a profile signature does not approve signing future records.</p>'+
    '<div class="actions"><button type="button" class="btn primary" onclick="v227SaveSignature(\''+htmlEscape(person.id)+'\')">'+(has?'Replace signature':'Save signature')+'</button>'+
    (has?'<button type="button" class="btn dangerbtn" onclick="v227RemoveSignature(\''+htmlEscape(person.id)+'\')">Remove</button>':'')+'</div></div>';
  setupEndorsementSignaturePad();
}
function v227SaveSignature(id){
  const person=personById(id),canvas=document.getElementById('signatureCanvas');
  if(!person||!canvas)return;
  if(!document.getElementById('v227StoreConsent')?.checked){
    alert('Please confirm the named pilot’s consent to store the signature.');return;
  }
  if(!endorsementSignatureDirty){alert('Draw the signature before saving.');return;}
  const png=canvas.toDataURL('image/png');
  if(!v227IsPNG(png)){alert('Invalid or oversized signature. Please draw it again.');return;}
  if(v227IsPNG(person.savedSignatureData)&&
     !confirm('Replace this saved signature? Already signed endorsements will stay unchanged.'))return;
  const before={savedSignatureData:person.savedSignatureData,savedSignatureAt:person.savedSignatureAt,savedSignatureConsentAt:person.savedSignatureConsentAt};
  person.savedSignatureData=png;
  person.savedSignatureAt=new Date().toISOString();
  person.savedSignatureConsentAt=person.savedSignatureAt;
  if(!save()){Object.assign(person,before);return;}
  v227EditSignature(id);
}
function v227RemoveSignature(id){
  const person=personById(id);
  if(!person||!v227IsPNG(person.savedSignatureData))return;
  if(!confirm('Remove this saved signature? Previously signed endorsements will not change.'))return;
  const before={savedSignatureData:person.savedSignatureData,savedSignatureAt:person.savedSignatureAt,savedSignatureConsentAt:person.savedSignatureConsentAt};
  delete person.savedSignatureData;delete person.savedSignatureAt;delete person.savedSignatureConsentAt;
  if(!save()){Object.assign(person,before);return;}
  v227EditSignature(id);
}
function v227SignerApproved(){
  if(document.getElementById('v227ApproveSignature')?.checked)return true;
  alert('The named endorser must review and expressly approve signing this particular endorsement.');
  return false;
}
function v227WriteEndorsementSignature(e,person,png,method){
  if(!e||!person||e.signatoryPersonId!==person.id||e.signatureData||
    v2ArchiveBridge.isArchived(S,e.id)||!v227IsPNG(png))return false;
  const before={signatureData:e.signatureData,signedAt:e.signedAt,signedName:e.signedName,
    signedLicence:e.signedLicence,signedLicenceNumber:e.signedLicenceNumber,
    signedFiFeNumber:e.signedFiFeNumber,signedSource:e.signedSource,signedConsentAt:e.signedConsentAt};
  const now=new Date().toISOString();
  e.signatureData=png;e.signedAt=now;e.signedName=person.name;
  e.signedLicence=person.licence||'';
  e.signedLicenceNumber=person.licenceNumber||'';
  e.signedFiFeNumber=person.fiFeNumber||'';
  e.signedSource=method;e.signedConsentAt=now;
  if(!save()){Object.assign(e,before);return false;}
  return true;
}
function v227UseSavedSignature(id){
  const e=endorsementById(id);
  if(!e||e.signatureData||v2ArchiveBridge.isArchived(S,id)){
    alert('This endorsement is already signed or archived.');return;
  }
  const person=personById(e.signatoryPersonId);
  if(!person||!v227IsPNG(person.savedSignatureData)){
    alert('No valid saved signature for this endorser. Draw a new signature instead.');return;
  }
  if(!v227SignerApproved())return;
  if(!confirm('Confirm that '+person.name+' has personally reviewed and approved this exact endorsement: '+e.title+'?'))return;
  if(!v227WriteEndorsementSignature(e,person,person.savedSignatureData,'saved-profile'))return;
  v2EndorsementNotice='Endorsement signed with the endorser’s explicit approval using a saved signature. The signature is independently copied to this record.';
  endorsements();
}
