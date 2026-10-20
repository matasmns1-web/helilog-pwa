function aircraft(){
  editingAircraftId=null;
  app.innerHTML=header('Aircraft','ICAO type designator is the primary logbook identifier',`<button class="btn primary" onclick="newAircraft()">＋ Add aircraft</button>`)+
  `<div class="grid aircraft">${S.aircraft.map(a=>{
    let usedFlights=effectiveFlights().filter(f=>f.aid===a.id);
    let m=usedFlights.reduce((n,f)=>n+Number(f.mins||0),0);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div>
          <div class="icao">${a.icao}</div>
          <h3>${a.reg}</h3>
        </div>
        <button class="btn" type="button" onclick="editAircraft('${a.id}')">Edit</button>
      </div>
      <div class="muted">${a.manufacturer} ${a.model} ${a.variant||''}</div>
      <p><b>${fmt(m)}</b> <span class="muted">your time · ${usedFlights.length} flight${usedFlights.length===1?'':'s'}</span></p>
      <span class="muted">✓ ${engineCode(a)==='ME'?'Multi-engine (ME)':'Single-engine (SE)'}</span>
    </div>`;
  }).join('')}</div>`;
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

function pilots(){
  editingPersonId=null;
  let cards=S.people
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
            </div>
            ${p.licence?`<div class="muted" style="margin-top:5px">${htmlEscape(p.licence)}</div>`:''}
          </div>
          ${p.isAccountHolder
            ? `<button class="btn" type="button" onclick="go('profile')">Profile</button>`
            : `<button class="btn" type="button" onclick="editPerson('${p.id}')">Edit</button>`}
        </div>
        <p><b>${linked.length}</b> <span class="muted">flight${linked.length===1?'':'s'} recorded with this person as PIC</span></p>
        ${p.notes?`<div class="muted" style="margin-bottom:10px">${htmlEscape(p.notes)}</div>`:''}
        <div class="signature-placeholder">Signature profile: planned for V2 — this pilot profile will be the link point for reusable signatures/certifications.</div>
      </div>`;
    }).join('');

  app.innerHTML=header('Pilots','Saved pilot profiles for quick selection and future certification workflows',
    `<button class="btn primary" onclick="newPerson()">＋ Add pilot</button>`)+
    `<div class="grid aircraft">${cards||'<div class="card"><p class="muted">No saved pilots yet.</p></div>'}</div>`;
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
        <div class="field"><label>Licence / identifier</label><input id="personLicence" value="${existing?htmlEscape(existing.licence||''):''}" placeholder="Optional"></div>
        <div class="field"><label>Notes</label><input id="personNotes" value="${existing?htmlEscape(existing.notes||''):''}" placeholder="Optional"></div>
      </div>
      <div class="signature-placeholder" style="margin-top:14px">Signature association will be added later in V2. This profile ID is already stored with linked flights so signatures can be attached to the person rather than re-entered each time.</div>
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
    p.role=role;p.licence=licence;p.notes=notes;
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
      name,firstName,lastName,role,licence,notes,isAccountHolder:false
    });
  }

  save();
  editingPersonId=null;
  go('pilots');
}


