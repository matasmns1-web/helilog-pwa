function endorsementById(id){return (S.endorsements||[]).find(e=>e.id===id)}
// V2.1 - signed on installed app, archived from browser.
let v2EndorsementNotice='';
function v2EndorsementStatus(e){
 if(!e.signatureData)return '<span class="badge gray">Draft · Unsigned</span>';
 if(v2ArchiveBridge.isArchived(S,e.id)){
  const ref=v2PageOf(e.id), corrections=v2ArchiveBridge.stored(S).amendments.filter(a=>a.endorsementId===e.id).length;
  return '<span class="badge">Archived'+(ref?' · Page '+ref.page:'')+'</span>'+
   (corrections?'<span class="badge gray">'+corrections+' correction(s)</span>':'');
 }
 return '<span class="badge">Signed · Awaiting web archive</span>';
}
function v2EndorsementStatusHelp(e){
 if(!e.signatureData)return '';
 if(v2ArchiveBridge.isArchived(S,e.id)){
  const ref=v2PageOf(e.id);
  return '<div class="mini" style="margin-top:8px">Archived'+(ref?' · endorsement page '+ref.page:'')+
   '. Original signed endorsement remains locked. Corrections are handled in the web browser.</div>';
 }
 return '<div class="mini" style="margin-top:8px">'+
 (isStandaloneApp()?
 (window.HeliLogV23Sync.extended()?
 'Signed and saved on this device. Awaiting cloud synchronization and web-only printing/archiving.':
 'Signed locally. Enable extended sync under Cloud account to send this endorsement to the web browser.'):
 'Signed and saved in this browser. Awaiting printing and archive confirmation in Print Archive → Endorsements.')+
 '</div>';
}

function endorsements(){
  editingEndorsementId=null;
  let items=[...(S.endorsements||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  app.innerHTML=header('Pilot Memoranda / Endorsements',
    'Instructor, examiner and licensing endorsements kept alongside your flight records.',
    `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="go('pilots')">Manage pilots</button><button class="btn primary" onclick="endorsementForm()">＋ Add endorsement</button></div>`)+
  `<div class="card">
    <div class="note" style="margin-bottom:14px">${isStandaloneApp()?
      (window.HeliLogV23Sync.extended()?
  'Create, sign and review endorsements in the app. Endorsements now synchronize to your account. Use the web browser to print and archive once Cloud synced.':
  'Create, sign and review endorsements in the app. Records remain device-local until you enable extended sync in Cloud account. Printing and archiving are web-only.'):
      'Signed endorsements are locked. Use Print Archive → Endorsements to print, archive or correct them.'}</div>
    ${v2EndorsementNotice?'<div class="note" role="status" style="margin-bottom:14px">'+htmlEscape(v2EndorsementNotice)+'</div>':''}
    <div class="endorsement-list">
      ${items.length?items.map(e=>{
        let signer=personById(e.signatoryPersonId);
        let q=qualificationById(e.qualificationId);
        return `<div class="endorsement-card">
          <div class="qual-top">
            <div>
              <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
                <b>${htmlEscape(e.title||e.category||'Endorsement')}</b>
                <span class="badge gray">${htmlEscape(e.category||'Other')}</span>
                ${v2EndorsementStatus(e)}
              </div>
              <div class="endorsement-meta">
                <span><b>Date:</b> ${displayDate(e.date)}</span>
                ${e.location?`<span><b>Place:</b> ${htmlEscape(e.location)}</span>`:''}
                ${q?`<span><b>Related:</b> ${htmlEscape(q.name)}</span>`:''}
                ${signer?`<span><b>Endorsed by:</b> ${htmlEscape(signer.name)}</span>`:''}
              </div>
            </div>
            <div class="qual-actions">
              ${!e.signatureData?`<button class="btn" type="button" onclick="endorsementForm('${e.id}')">Edit</button>
              <button class="btn" type="button" onclick="signEndorsement('${e.id}')">Sign</button>
              <button class="btn dangerbtn" type="button" onclick="deleteEndorsement('${e.id}')">Delete</button>`:
              (isStandaloneApp()||v23AccountWorkspace()?'':`<button class="btn" onclick="go('endorsementarchive')">${v2ArchiveBridge.isArchived(S,e.id)?'View archive / Corrections':'Print / Archive'}</button>`)}
            </div>
          </div>

          <div class="endorsement-body">${htmlEscape(e.text||'')}</div>
          ${v2EndorsementStatusHelp(e)}

          ${e.signatureData?`<div class="signature-preview">
            <div>
              <div class="signature-status"><b>Signed by:</b> ${htmlEscape(e.signedName||signer?.name||'')}</div>
              ${e.signedLicence?`<div class="signature-status"><b>Licence / ID:</b> ${htmlEscape(e.signedLicence)}</div>`:''}
              <div class="signature-status"><b>Signed:</b> ${e.signedAt?htmlEscape(formatDateTime(e.signedAt)):'—'}</div>
            </div>
            <img src="${e.signatureData}" alt="Endorsement signature">
          </div>`:''}
        </div>`;
      }).join(''):`<div class="empty-state">No memoranda or endorsements recorded yet.</div>`}
    </div>
  </div>`;
}

function endorsementForm(editId=null){
  if(editId){
    const original=endorsementById(editId);
    if(original?.signatureData||v2ArchiveBridge.isArchived(S,editId)){
      alert('Signed/archived endorsements cannot be changed directly. Use a correction addendum.');endorsements();return;
    }
  }
  editingEndorsementId=editId;
  let e=editId?endorsementById(editId):null;
  if(editId && !e){endorsements();return;}
  e=e||{
    date:new Date().toISOString().slice(0,10),
    category:'Proficiency check / revalidation',
    title:'',
    text:'',
    location:'',
    qualificationId:'',
    signatoryPersonId:'',
    signatureData:''
  };

  let signers=S.people.filter(p=>!p.isAccountHolder);
  app.innerHTML=header(editId?'Edit endorsement':'Add endorsement',
    'Record the wording written by an instructor, examiner or other authorised person.',
    `<button class="btn" onclick="go('endorsements')">Cancel</button>`)+
  `<form class="card form" onsubmit="saveEndorsement(event)">
    ${e.signatureData?`<div class="note" style="margin-bottom:16px"><b>This endorsement is currently signed.</b><br>Saving edits will remove the existing signature and require the endorsement to be signed again.</div>`:''}
    <div class="formgrid">
      <div class="field"><label>Date</label>${europeanDateField('endorseDate',e.date,true)}</div>
      <div class="field"><label>Category</label>
        <select id="endorseCategory">
          ${['Skill test','Proficiency check / revalidation','Type rating endorsement','Licence endorsement','Training completion','Other'].map(x=>`<option${e.category===x?' selected':''}>${x}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Title</label><input id="endorseTitle" required value="${htmlEscape(e.title||'')}" placeholder="Short description of the endorsement"></div>
      <div class="field"><label>Place</label><input id="endorseLocation" value="${htmlEscape(e.location||'')}" placeholder="Optional"></div>

      <div class="field"><label>Related licence / rating</label>
        <select id="endorseQualification">
          <option value="">None</option>
          ${(S.qualifications||[]).map(q=>`<option value="${q.id}"${e.qualificationId===q.id?' selected':''}>${htmlEscape(q.name)} — ${htmlEscape(q.category)}</option>`).join('')}
        </select>
      </div>

      <div class="field"><label>Instructor / examiner / endorser</label>
        <select id="endorseSigner" required>
          <option value="">Select saved pilot</option>
          ${signers.map(p=>`<option value="${p.id}"${e.signatoryPersonId===p.id?' selected':''}>${htmlEscape(p.name)}${p.licence?' — '+htmlEscape(p.licence):''}</option>`).join('')}
        </select>
        <div class="mini">The endorser is linked to a saved pilot profile. Using a saved signature requires their explicit approval for each endorsement.</div>
      </div>
    </div>

    <div class="field" style="margin-top:14px"><label>Endorsement / memorandum text</label>
      <textarea id="endorseText" required placeholder="Enter the endorsement wording here...">${htmlEscape(e.text||'')}</textarea>
    </div>

    <div class="actions">
      <button class="btn" type="button" onclick="go('pilots')">Manage pilots</button>
      <button class="btn primary">${editId?'Save changes':'Save endorsement'}</button>
    </div>
  </form>`;
}

function saveEndorsement(ev){
  ev.preventDefault();
  let date=readEuropeanDate('endorseDate',true);
  let category=$('#endorseCategory').value;
  let title=$('#endorseTitle').value.trim();
  let location=$('#endorseLocation').value.trim();
  let qualificationId=$('#endorseQualification').value;
  let signatoryPersonId=$('#endorseSigner').value;
  let body=$('#endorseText').value.trim();
  if(!date){alert('Enter a valid endorsement date in DD-MM-YYYY format.');return;}
  if(!title||!signatoryPersonId||!body)return;

  let item={
    date,category,title,location,qualificationId,signatoryPersonId,text:body
  };

  if(editingEndorsementId){
    let e=endorsementById(editingEndorsementId);
    if(!e){endorsements();return;}
    if(e.signatureData||v2ArchiveBridge.isArchived(S,e.id)){
      alert('Signed or archived endorsements cannot be overwritten.');return;
    }
    Object.assign(e,item);
    // An edited statement must be signed again.
    e.signatureData='';
    e.signedAt='';
    e.signedName='';
    e.signedLicence='';
  }else{
    S.endorsements.push({
      id:'e'+Date.now()+Math.random().toString(36).slice(2,6),
      ...item,
      signatureData:'',
      signedAt:'',
      signedName:'',
      signedLicence:''
    });
  }

  save();
  editingEndorsementId=null;
  endorsements();
}

function deleteEndorsement(id){
  let e=endorsementById(id);
  if(!e) return;
  if(e.signatureData||v2ArchiveBridge.isArchived(S,e.id)){
    alert('Signed or archived endorsements cannot be deleted.');return;
  }
  if(!confirm(`Delete "${e.title}"?`)) return;
  S.endorsements=S.endorsements.filter(x=>x.id!==id);
  save();
  endorsements();
}

function signEndorsement(id){
  let e=endorsementById(id);
  if(!e){endorsements();return;}
  if(e.signatureData||v2ArchiveBridge.isArchived(S,id)){
    alert('Already signed. Use a correction addendum for archived changes.');return;
  }
  let signer=personById(e.signatoryPersonId);
  if(!signer){
    alert('This endorsement has no valid saved endorser profile. Edit it and select a saved pilot first.');
    return;
  }

  app.innerHTML=header('Sign endorsement',
    'The selected instructor/examiner explicitly signs this specific endorsement.',
    `<button class="btn" onclick="go('endorsements')">Cancel</button>`)+
  `<div class="card">
    <div class="signer-card">
      <div><b>${htmlEscape(e.title)}</b></div>
      <div class="endorsement-meta">
        <span><b>Date:</b> ${displayDate(e.date)}</span>
        <span><b>Endorser:</b> ${htmlEscape(signer.name)}</span>
        ${signer.licence?`<span><b>Licence / ID:</b> ${htmlEscape(signer.licence)}</span>`:''}
      </div>
      <div class="endorsement-body">${htmlEscape(e.text)}</div>
    </div>

    <div class="note" style="margin-bottom:12px">A saved or drawn signature does not independently verify identity or provide a qualified electronic signature. The endorser must review the text before signing.</div>

    ${v227IsPNG(signer.savedSignatureData)?`<div class="v227-saved-option"><b>Saved signature available</b><p class="muted">The signer may approve applying their profile signature to this specific endorsement.</p><button type="button" class="btn" onclick="v227UseSavedSignature('${e.id}')">Use saved signature</button></div>`:''}
    <div class="signature-canvas-wrap">
      <div style="font-weight:700;margin-bottom:8px">Signature of ${htmlEscape(signer.name)}</div>
      <canvas id="signatureCanvas" width="900" height="260"></canvas>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn" type="button" onclick="clearEndorsementSignature()">Clear</button>
        <button class="btn primary" type="button" onclick="applyEndorsementSignature('${e.id}')">Apply signature</button>
      </div>
    </div>
    <label class="v227-confirm"><input type="checkbox" id="v227ApproveSignature"> I confirm that ${htmlEscape(signer.name)} has reviewed this particular endorsement and expressly approves signing it now.</label>
    <p class="mini">This checkbox is an operator confirmation, not independently verified signatory identity or a qualified electronic signature.</p>
  </div>`;

  setupEndorsementSignaturePad();
}

let endorsementSignatureDirty=false;
function setupEndorsementSignaturePad(){
  let canvas=document.getElementById('signatureCanvas');
  if(!canvas) return;
  let ctx=canvas.getContext('2d');
  ctx.lineWidth=3;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  let drawing=false,lastX=0,lastY=0;
  endorsementSignatureDirty=false;

  function pos(ev){
    let r=canvas.getBoundingClientRect();
    let p=ev.touches?ev.touches[0]:ev;
    return {
      x:(p.clientX-r.left)*(canvas.width/r.width),
      y:(p.clientY-r.top)*(canvas.height/r.height)
    };
  }
  function start(ev){
    ev.preventDefault();
    let p=pos(ev); drawing=true;lastX=p.x;lastY=p.y;
  }
  function move(ev){
    if(!drawing) return;
    ev.preventDefault();
    let p=pos(ev);
    ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(p.x,p.y);ctx.stroke();
    lastX=p.x;lastY=p.y;endorsementSignatureDirty=true;
  }
  function end(ev){if(drawing){ev?.preventDefault?.();drawing=false}}

  canvas.addEventListener('mousedown',start);
  canvas.addEventListener('mousemove',move);
  window.addEventListener('mouseup',end,{once:false});
  canvas.addEventListener('touchstart',start,{passive:false});
  canvas.addEventListener('touchmove',move,{passive:false});
  canvas.addEventListener('touchend',end,{passive:false});
}

function clearEndorsementSignature(){
  let canvas=document.getElementById('signatureCanvas');
  if(!canvas) return;
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  endorsementSignatureDirty=false;
}

function applyEndorsementSignature(id){
  let e=endorsementById(id);
  let canvas=document.getElementById('signatureCanvas');
  if(!e||!canvas) return;
  if(e.signatureData||v2ArchiveBridge.isArchived(S,id)){
    alert('Signed endorsements are locked.');return;
  }
  if(!endorsementSignatureDirty){
    alert('Please sign inside the signature box first.');
    return;
  }
  let signer=personById(e.signatoryPersonId);
  if(!signer) return;

  if(!v227SignerApproved())return;
  if(!v227WriteEndorsementSignature(e,signer,canvas.toDataURL('image/png'),'drawn'))return;
  v2EndorsementNotice=isStandaloneApp()
   ?'Endorsement signed and saved on this device. With extended cloud sync enabled, it will appear on your other devices after Cloud synced. Printing and archive confirmation remain web-only.'
   :'Endorsement signed and saved in this browser. Awaiting print archive confirmation.';
  endorsements();
}

