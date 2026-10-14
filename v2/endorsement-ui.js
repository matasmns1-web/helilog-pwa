/* HeliLog V2: endorsement archive UI that plugs into the complete V1 interface.
 * This file is loaded before the original inline app script. Functions are
 * executed only after its S, app, format helpers and event handlers exist.
 */
let v2PendingEndorsementBatch=null;
let v2PendingCorrection=null;
let v2CorrectionDraft=null;
let v2PreviewShown=false;
let v2CorrectionPreviewShown=false;
const v2ArchiveBridge=window.HeliLogV2Bridge;

// Installed PWA: record and sign only. Printing, locking batches and corrections
// are browser-only. Guard every entrypoint, not merely the visible menu buttons.
function v2ArchiveWebAllowed(){return !isStandaloneApp();}
function v2RequireWebArchive(){
 if(v2ArchiveWebAllowed())return true;
 alert('Open HeliLog in a web browser to print, archive or correct a signed endorsement. The installed app is for recording and reviewing.');
 return false;
}

function v2StoreArchive(next){
 if(!v2RequireWebArchive())return false;
  const previous=S.endorsementV2Archive;
  S.endorsementV2Archive=next;
  if(!save()){
    S.endorsementV2Archive=previous;
    return false;
  }
  // Detect storage persistence failure before declaring the page archived.
  try{
    const verify=JSON.parse(localStorage.getItem(KEY)||'{}');
    if(JSON.stringify(verify.endorsementV2Archive)!==JSON.stringify(next))
      throw Error('Archive backup verification failed');
  }catch(e){
    S.endorsementV2Archive=previous;
    alert('The endorsement archive could not be verified: '+e.message);
    return false;
  }
  return true;
}
function v2PrintEndorsementHTML(markup){
 if(!v2RequireWebArchive())return false;
  const w=window.open('','_blank');
  if(!w){alert('Pop-up blocked. Allow printing windows for HeliLog and try again. Nothing has been archived.');return false;}
  w.document.open();w.document.write(markup);w.document.close();w.focus();
  return true;
}
function v2PageOf(id){
  return v2ArchiveBridge.source(S,id);
}
function v2EndorsementArchive(){
 if(!v2ArchiveWebAllowed()){
  if(location.hash!=='#endorsements')location.hash='#endorsements';
  endorsements();return;
 }
  const archive=v2ArchiveBridge.stored(S);
  const pending=(S.endorsements||[]).filter(e=>e.signatureData&&!v2ArchiveBridge.isArchived(S,e.id))
    .sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const hasDraft=!!v2PendingEndorsementBatch;
  app.innerHTML=header('Print archive — Endorsements',
    'Separate, consecutively numbered paper endorsement pages with permanent signed originals and correction addenda.',
    '<button class="btn" onclick="go(\'printarchive\')">← Flight Print Archive</button>')+
  '<div class="note" style="margin-bottom:14px"><b>HeliLog V2 test feature.</b> Sign endorsements in the Endorsements section, then print and confirm the pages here. Printed originals remain unchanged; corrections require a separately signed addendum. This is not authority-approved electronic signature verification.</div>'+
  '<div class="card" style="margin-bottom:16px"><div class="head"><h2>New endorsement print batch</h2></div>'+
  (hasDraft?
    '<div class="note"><b>Preview prepared:</b> '+v2PendingEndorsementBatch.items.length+
    ' endorsement(s), '+v2PendingEndorsementBatch.pageCount+' A4 page(s), beginning at endorsement page '+
    v2PendingEndorsementBatch.firstPage+'.</div><div class="actions" style="margin-top:12px">'+
    '<button class="btn" onclick="v2ReopenEndorsementPreview()">Reopen preview</button>'+
    '<button class="btn" onclick="v2DiscardEndorsementPreview()">Discard preview</button></div>'+
    '<div class="checkbox-row"><input type="checkbox" id="v2EndorsementConfirmed">'+
    '<label for="v2EndorsementConfirmed">I printed/saved, carefully checked and signed the required paper pages.</label></div>'+
    '<button class="btn primary" onclick="v2ConfirmEndorsementBatch()">Confirm printed endorsement pages</button>':
    (pending.length?
      '<p class="muted">Select signed endorsements. A3 portrait is not used: the pages print in <b>A4 portrait</b> with separate endorsement numbering.</p>'+
      '<form id="v2ArchiveEndorsementSelect" onsubmit="v2PreviewEndorsements(event)">'+
      pending.map(e=>'<label class="checkbox-row" style="border-bottom:1px solid var(--line);padding:10px 0">'+
       '<input type="checkbox" name="v2ArchiveId" value="'+htmlEscape(e.id)+'" checked>'+
       '<span><b>'+htmlEscape(e.title)+'</b> · '+displayDate(e.date)+' · '+htmlEscape(e.signedName||'')+'</span></label>').join('')+
      '<button class="btn primary" style="margin-top:12px">Preview / Print endorsement pages</button></form>':
      '<p class="muted">No signed, unarchived endorsements. Go to Endorsements to add and sign one.</p>'))+
  '</div>'+
  '<div class="card" style="margin-bottom:16px"><div class="head"><h2>Confirmed endorsement pages ('+archive.batches.length+')</h2></div>'+
  (archive.batches.length?archive.batches.map(b=>
    '<div class="qual-item"><div class="qual-top"><div><b>'+htmlEscape(b.id)+'</b> · Page '+
    b.firstPage+(b.pageCount>1?'–'+(b.firstPage+b.pageCount-1):'')+
    '<div class="mini">'+b.items.length+' endorsement(s) · '+htmlEscape(formatDateTime(b.confirmedAt))+'</div></div>'+
    '<button class="btn" onclick="v2ReprintEndorsementBatch(\''+htmlEscape(b.id)+'\')">Reprint exact pages</button></div>'+
    b.items.map(it=>'<div class="endorsement-mini"><b>'+htmlEscape(it.snapshot.title)+'</b>'+
    '<div class="mini">Endorsed by '+htmlEscape(it.snapshot.signature?.name||'')+
    ' · Page '+(b.firstPage+Math.floor(b.items.indexOf(it)/b.itemsPerPage))+'</div>'+
    '<button class="btn" onclick="v2StartEndorsementCorrection(\''+htmlEscape(it.endorsementId)+'\')">Create correction addendum</button></div>').join('')+
    '</div>').join(''):
    '<div class="muted">No endorsement pages confirmed yet.</div>')+'</div>'+
  '<div class="card"><div class="head"><h2>Signed correction addenda ('+archive.amendments.length+')</h2></div>'+
  (archive.amendments.length?[...archive.amendments].reverse().map(am=>
     '<div class="qual-item"><b>'+htmlEscape(am.id)+'</b> · '+htmlEscape(am.reason)+
     '<div class="mini">'+htmlEscape(am.after.title)+' · Confirmed '+htmlEscape(formatDateTime(am.confirmedAt))+'</div>'+
     '<button class="btn" onclick="v2ReprintEndorsementCorrection(\''+htmlEscape(am.id)+'\')">Reprint correction</button></div>').join(''):
    '<p class="muted">No archived endorsement corrections.</p>')+'</div>';
}
function v2DiscardEndorsementPreview(){v2PendingEndorsementBatch=null;v2PreviewShown=false;v2EndorsementArchive();}
function v2PreviewEndorsements(ev){
 if(!v2RequireWebArchive())return;
  ev.preventDefault();
  const ids=[...document.querySelectorAll('#v2ArchiveEndorsementSelect input[name=v2ArchiveId]:checked')]
    .map(el=>el.value);
  try{
    const preview=v2ArchiveBridge.draft(S,ids,'END-'+Date.now(),new Date().toISOString());
    if(!v2PrintEndorsementHTML(v2ArchiveBridge.printBatch(preview)))return;
    v2PendingEndorsementBatch=preview;v2PreviewShown=true;v2EndorsementArchive();
  }catch(e){alert('Cannot preview endorsements: '+e.message);}
}
function v2ReopenEndorsementPreview(){
 if(!v2RequireWebArchive())return;
  if(v2PendingEndorsementBatch)
   v2PreviewShown=v2PrintEndorsementHTML(v2ArchiveBridge.printBatch(v2PendingEndorsementBatch));
}
function v2ConfirmEndorsementBatch(){
 if(!v2RequireWebArchive())return;
  if(!v2PendingEndorsementBatch||!v2PreviewShown)return;
  if(!document.getElementById('v2EndorsementConfirmed')?.checked){
    alert('Confirm that you printed and reviewed the endorsement pages first.');return;
  }
  if(!confirm('Permanently archive these printed endorsement pages? Originals will be locked.'))return;
  try{
    const result=v2ArchiveBridge.confirm(S,v2PendingEndorsementBatch,new Date().toISOString());
    if(!v2StoreArchive(result))return;
    v2PendingEndorsementBatch=null;v2PreviewShown=false;v2EndorsementArchive();
  }catch(e){alert('Archive not confirmed: '+e.message);}
}
function v2ReprintEndorsementBatch(id){
 if(!v2RequireWebArchive())return;
  const b=v2ArchiveBridge.stored(S).batches.find(x=>x.id===id);
  if(b)v2PrintEndorsementHTML(v2ArchiveBridge.printBatch(b));
}
function v2StartEndorsementCorrection(id){
 if(!v2RequireWebArchive())return;
  try{
    const e=v2ArchiveBridge.effective(S,id);
    if(!e||!v2ArchiveBridge.isArchived(S,id))throw Error('Endorsement is not archived.');
    v2CorrectionDraft=null;v2PendingCorrection=null;v2CorrectionPreviewShown=false;
    const options=(S.people||[]).filter(p=>!p.isAccountHolder).map(p=>
      '<option value="'+htmlEscape(p.id)+'"'+(p.id===e.signatoryPersonId?' selected':'')+'>'+htmlEscape(p.name)+'</option>').join('');
    app.innerHTML=header('Correct archived endorsement',
      'The original paper page and its existing signatures will remain unchanged.',
      '<button class="btn" onclick="go(\'endorsementarchive\')">Cancel</button>')+
      '<form class="card form" onsubmit="v2PrepareEndorsementCorrection(event)">'+
      '<input type="hidden" id="v2CorrectionId" value="'+htmlEscape(id)+'">'+
      '<div class="note"><b>Original paper:</b> '+htmlEscape(v2PageOf(id)?.id||'')+
       ' · Page '+(v2PageOf(id)?.page||'?')+'. A separate printed addendum is required.</div>'+
      '<div class="formgrid">'+
      '<div class="field"><label>Date</label>'+europeanDateField('v2CorrectionDate',e.date,true)+'</div>'+
      '<div class="field"><label>Category</label><input id="v2CorrectionCategory" required value="'+htmlEscape(e.category)+'"></div>'+
      '<div class="field"><label>Title</label><input id="v2CorrectionTitle" required value="'+htmlEscape(e.title)+'"></div>'+
      '<div class="field"><label>Location</label><input id="v2CorrectionLocation" value="'+htmlEscape(e.location)+'"></div>'+
      '<div class="field"><label>Related licence / rating</label><input id="v2CorrectionRating" value="'+htmlEscape(e.qualificationId)+'"></div>'+
      '<div class="field"><label>Endorsing pilot</label><select id="v2CorrectionSigner" required>'+options+'</select></div></div>'+
      '<div class="field"><label>Endorsement wording</label><textarea id="v2CorrectionText" required>'+htmlEscape(e.text)+'</textarea></div>'+
      '<div class="field"><label>Reason for correction (required)</label><textarea id="v2CorrectionReason" required></textarea></div>'+
      '<div class="actions"><button class="btn primary">Continue to signature</button></div></form>';
  }catch(e){alert('Cannot correct endorsement: '+e.message);}
}
function v2PrepareEndorsementCorrection(ev){
 if(!v2RequireWebArchive())return;
 ev.preventDefault();
 try{
  const id=document.getElementById('v2CorrectionId').value;
  const date=readEuropeanDate('v2CorrectionDate',true);
  if(!date)throw Error('Enter a valid correction date.');
  const read=id=>document.getElementById(id).value.trim();
  const changes={date,category:read('v2CorrectionCategory'),title:read('v2CorrectionTitle'),
    location:read('v2CorrectionLocation'),qualificationId:read('v2CorrectionRating'),
    signatoryPersonId:read('v2CorrectionSigner'),text:read('v2CorrectionText')};
  v2CorrectionDraft=v2ArchiveBridge.amendmentDraft(S,id,changes,read('v2CorrectionReason'),
    'AM-'+Date.now(),new Date().toISOString());
  const signer=personById(changes.signatoryPersonId);
  app.innerHTML=header('Sign endorsement correction','The signatory must review and sign this specific amendment.',
    '<button class="btn" onclick="go(\'endorsementarchive\')">Cancel</button>')+
    '<div class="card"><div class="note">Signed name: <b>'+htmlEscape(signer?.name||'')+'</b> · '+
    htmlEscape(v2CorrectionDraft.reason)+'</div>'+
    '<p style="white-space:pre-wrap">'+htmlEscape(changes.text)+'</p>'+
    '<div class="signature-canvas-wrap"><div><b>Correction signature</b></div>'+
    '<canvas id="signatureCanvas" width="900" height="260"></canvas>'+
    '<div class="actions" style="margin-top:12px">'+
    '<button class="btn" onclick="clearEndorsementSignature()">Clear</button>'+
    '<button class="btn primary" onclick="v2SignEndorsementCorrection()">Apply signature and preview addendum</button></div></div></div>';
  setupEndorsementSignaturePad();
 }catch(e){alert('Unable to prepare correction: '+e.message);}
}
function v2SignEndorsementCorrection(){
 if(!v2RequireWebArchive())return;
 if(!v2CorrectionDraft||!endorsementSignatureDirty){alert('The signatory must sign inside the signature box.');return;}
 const canvas=document.getElementById('signatureCanvas');
 if(!canvas)return;
 try{
  v2PendingCorrection=v2ArchiveBridge.signAmendment(S,v2CorrectionDraft,
    canvas.toDataURL('image/png'),new Date().toISOString());
  v2CorrectionDraft=null;
  v2CorrectionPreviewShown=false;
  v2PrintCorrectionPreview();
 }catch(e){alert('Cannot sign correction: '+e.message);}
}
function v2PrintCorrectionPreview(){
 if(!v2RequireWebArchive())return;
 if(!v2PendingCorrection)return;
 try{
  const source=v2PageOf(v2PendingCorrection.endorsementId);
  if(!source)throw Error('Original archived page not found.');
  if(!v2PrintEndorsementHTML(v2ArchiveBridge.printAmendment(v2PendingCorrection,source)))return;
  v2CorrectionPreviewShown=true;
  app.innerHTML=header('Confirm endorsement correction','Keep this addendum with the original archived page.',
   '<button class="btn" onclick="go(\'endorsementarchive\')">← Archive</button>')+
   '<div class="card"><h2>'+htmlEscape(v2PendingCorrection.after.title)+'</h2>'+
   '<p><b>Reason:</b> '+htmlEscape(v2PendingCorrection.reason)+'</p>'+
   '<p><b>Original:</b> '+htmlEscape(source.id)+' · page '+source.page+'</p>'+
   '<div class="actions"><button class="btn" onclick="v2PrintCorrectionPreview()">Reopen print</button></div>'+
   '<div class="checkbox-row"><input type="checkbox" id="v2CorrectionConfirmed">'+
   '<label for="v2CorrectionConfirmed">I printed, checked and signed this correction addendum.</label></div>'+
   '<button class="btn primary" onclick="v2ConfirmEndorsementCorrection()">Confirm permanent correction</button></div>';
 }catch(e){alert('Cannot print correction: '+e.message);}
}
function v2ConfirmEndorsementCorrection(){
 if(!v2RequireWebArchive())return;
 if(!v2PendingCorrection||!v2CorrectionPreviewShown)return;
 if(!document.getElementById('v2CorrectionConfirmed')?.checked){
  alert('Confirm that the printed correction was reviewed.');return;
 }
 if(!confirm('Confirm signed endorsement correction? The original archive will remain unchanged.'))return;
 try{
  const next=v2ArchiveBridge.confirmAmendment(S,v2PendingCorrection,new Date().toISOString());
  if(!v2StoreArchive(next))return;
  v2PendingCorrection=null;v2CorrectionPreviewShown=false;v2EndorsementArchive();
 }catch(e){alert('Correction not saved: '+e.message);}
}
function v2ReprintEndorsementCorrection(id){
 if(!v2RequireWebArchive())return;
 const correction=v2ArchiveBridge.stored(S).amendments.find(x=>x.id===id);
 if(correction)v2PrintEndorsementHTML(v2ArchiveBridge.printAmendment(correction,v2PageOf(correction.endorsementId)));
}
