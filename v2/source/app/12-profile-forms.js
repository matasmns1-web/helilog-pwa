function editOwnProfile(){
  app.innerHTML=header('Edit pilot profile','Update the details used throughout HeliLog and in PDF exports',
    `<button class="btn" onclick="go('profile')">Cancel</button>`)+
  `<form class="card form" onsubmit="saveOwnProfile(event)">
    <div class="formgrid">
      <div class="field"><label for="ownFirstName">First name</label><input id="ownFirstName" autocomplete="given-name" required value="${htmlEscape(pilotNameParts().firstName)}"></div>
      <div class="field"><label for="ownLastName">Surname</label><input id="ownLastName" autocomplete="family-name" required value="${htmlEscape(pilotNameParts().lastName)}"></div>
      <div class="field"><label>Licence type</label><input id="ownLicenceType" value="${htmlEscape(S.pilot.licenceType||'')}" placeholder="Licence type"></div>
      <div class="field"><label>Licence number</label><input id="ownLicenceNumber" value="${htmlEscape(S.pilot.licenceNumber||'')}" placeholder="Optional"></div>
      <div class="field"><label>Competent authority</label><input id="ownAuthority" value="${htmlEscape(S.pilot.authority||'')}"></div>
    </div>
    <div class="note" style="margin-top:14px">First name and surname are stored separately while your full name remains available for exports. PIC and SOLO flights display SELF in the PIC name field; other commanders retain their entered names.</div>
    <div class="actions"><button class="btn primary">Save profile</button></div>
  </form>`;
}

function saveOwnProfile(e){
  e.preventDefault();
  let oldName=String(S.pilot.name||'');
  let firstName=$('#ownFirstName').value.trim().replace(/\s+/g,' ');
  let lastName=$('#ownLastName').value.trim().replace(/\s+/g,' ');
  let name=[firstName,lastName].filter(Boolean).join(' ');
  let licenceType=$('#ownLicenceType').value.trim();
  let licenceNumber=$('#ownLicenceNumber').value.trim();
  let authority=$('#ownAuthority').value.trim();
  if(!firstName||!lastName){
    alert('Please enter both your first name and surname.');
    return;
  }

  let owner=ownerPerson();
  S.pilot.firstName=firstName;
  S.pilot.lastName=lastName;
  S.pilot.name=name;
  S.pilot.licenceType=licenceType;
  S.pilot.licenceNumber=licenceNumber;
  S.pilot.licence=licenceType;
  S.pilot.authority=authority;

  if(owner){
    owner.name=name;
    owner.licence=pilotLicenceDisplay();
    S.flights.forEach(f=>{
      if(isArchivedFlight(f.id)) return;
      if(f.picPersonId===owner.id || (!f.picPersonId && String(f.picName||'').toLowerCase()===oldName.toLowerCase())){
        f.picPersonId=owner.id;
        f.picName=['PIC','SOLO'].includes(f.role)?'SELF':name;
      }
    });
  }

  let primary=(S.qualifications||[]).find(q=>q.isPrimary);
  if(primary){
    primary.name=licenceType||primary.name;
    primary.number=licenceNumber;
  }

  save();
  profile();
}

function editMedical(){
  let m=S.pilot.medical||{};
  app.innerHTML=header('Edit medical','Store medical certificate information without automatic validity calculations',
    `<button class="btn" onclick="go('profile')">Cancel</button>`)+
  `<form class="card form" onsubmit="saveMedical(event)">
    <div class="formgrid">
      <div class="field"><label>Medical class</label>
        <select id="medicalClass">
          <option value=""${!m.class?' selected':''}>Not set</option>
          <option value="Class 1"${m.class==='Class 1'?' selected':''}>Class 1</option>
          <option value="Class 2"${m.class==='Class 2'?' selected':''}>Class 2</option>
          <option value="LAPL"${m.class==='LAPL'?' selected':''}>LAPL</option>
          <option value="Other"${m.class==='Other'?' selected':''}>Other</option>
        </select>
      </div>
      <div class="field"><label>Certificate / reference</label><input id="medicalNumber" value="${htmlEscape(m.number||'')}" placeholder="Optional"></div>
      <div class="field"><label>Issue date</label>${europeanDateField('medicalIssue',m.issueDate)}</div>
      <div class="field"><label>Valid until</label>${europeanDateField('medicalValid',m.validUntil)}</div>
      <div class="field"><label>Notes</label><input id="medicalNotes" value="${htmlEscape(m.notes||'')}" placeholder="Optional"></div>
    </div>
    <div class="actions"><button class="btn primary">Save medical</button></div>
  </form>`;
}

function saveMedical(e){
  e.preventDefault();
  const issueDate=readEuropeanDate('medicalIssue'),validUntil=readEuropeanDate('medicalValid');
  if(issueDate===null||validUntil===null){alert('Please use DD-MM-YYYY for medical dates.');return;}
  S.pilot.medical={
    class:$('#medicalClass').value,
    number:$('#medicalNumber').value.trim(),
    issueDate,
    validUntil,
    notes:$('#medicalNotes').value.trim()
  };
  save();
  profile();
}

function qualificationForm(editId=null){
  editingQualificationId=editId;
  let q=editId?qualificationById(editId):null;
  if(editId && !q){profile();return;}
  q=q||{category:'Type rating',name:'',number:'',issueDate:'',validUntil:'',notes:'',isPrimary:false};

  app.innerHTML=header(editId?'Edit licence / rating':'Add licence / rating',
    'Store the qualification details exactly as you want them recorded.',
    `<button class="btn" onclick="go('profile')">Cancel</button>`)+
  `<form class="card form" onsubmit="saveQualification(event)">
    <div class="formgrid">
      <div class="field"><label>Category</label>
        <select id="qualCategory">
          ${['Licence','Type rating','Instrument rating','Instructor rating','Other'].map(x=>`<option${q.category===x?' selected':''}>${x}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Name</label><input id="qualName" required value="${htmlEscape(q.name||'')}" placeholder="Qualification or rating name"></div>
      <div class="field"><label>Licence / rating number</label><input id="qualNumber" value="${htmlEscape(q.number||'')}" placeholder="Optional"></div>
      <div class="field"><label>Issue date</label>${europeanDateField('qualIssue',q.issueDate)}</div>
      <div class="field"><label>Valid until</label>${europeanDateField('qualValid',q.validUntil)}</div>
      <div class="field"><label>Notes / privileges</label><input id="qualNotes" value="${htmlEscape(q.notes||'')}" placeholder="Optional"></div>
      <div class="field"><label>Primary licence</label>
        <select id="qualPrimary">
          <option value="no"${!q.isPrimary?' selected':''}>No</option>
          <option value="yes"${q.isPrimary?' selected':''}>Yes</option>
        </select>
        <div class="mini">Only one qualification can be marked as the primary licence.</div>
      </div>
    </div>
    <div class="actions"><button class="btn primary">${editId?'Save changes':'Add qualification'}</button></div>
  </form>`;
}

function saveQualification(e){
  e.preventDefault();
  const issueDate=readEuropeanDate('qualIssue'),validUntil=readEuropeanDate('qualValid');
  if(issueDate===null||validUntil===null){alert('Please use DD-MM-YYYY for licence and rating dates.');return;}
  let item={
    category:$('#qualCategory').value,
    name:$('#qualName').value.trim(),
    number:$('#qualNumber').value.trim(),
    issueDate,
    validUntil,
    notes:$('#qualNotes').value.trim(),
    isPrimary:$('#qualPrimary').value==='yes'
  };
  if(!item.name) return;

  if(item.isPrimary){
    S.qualifications.forEach(q=>q.isPrimary=false);
  }

  if(editingQualificationId){
    let q=qualificationById(editingQualificationId);
    if(!q){profile();return;}
    Object.assign(q,item);
  }else{
    S.qualifications.push({id:'q'+Date.now()+Math.random().toString(36).slice(2,6),...item});
  }

  if(item.isPrimary){
    S.pilot.licenceType=item.name;
    S.pilot.licenceNumber=item.number;
    S.pilot.licence=item.name;
    let owner=ownerPerson();
    if(owner) owner.licence=pilotLicenceDisplay();
  }

  save();
  editingQualificationId=null;
  profile();
}

function deleteQualification(id){
  let q=qualificationById(id);
  if(!q) return;
  if(!confirm(`Delete ${q.name}? This removes it from your HeliLog profile but does not change any flight records.`)) return;
  S.qualifications=S.qualifications.filter(x=>x.id!==id);
  save();
  profile();
}
