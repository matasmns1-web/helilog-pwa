/* HeliLog V2.54 — flight-specific PICUS/SPIC countersignatures.
 * Separate from endorsements; never silently apply a saved profile signature.
 */
let v254SignatureTarget=null;
function v254CertificationApi(){return window.HeliLogV254Certification;}
function v254Signatory(f){
 if(!v254CertificationApi()?.required(f))return null;
 const person=personById(f.picPersonId);
 if(!person||person.isAccountHolder||String(person.name)!==String(f.picName))return null;
 return person;
}
function v254CertificationMarkup(f){
 const api=v254CertificationApi();
 if(!api?.required(f))return "";
 const state=api.status(f),cert=f.commanderCertification,person=v254Signatory(f);
 const archived=isArchivedFlight(f.id);
 const past=Array.isArray(f.certificationHistory)?f.certificationHistory.length:0;
 const name=htmlEscape(f.picName||"Unknown commander");
 return '<div class="card v254-certificate-card" style="margin-top:16px">'+
  '<h3>'+htmlEscape(f.role)+' — commander / FI certification</h3>'+
  (state==="certified"?
   '<div class="note"><b>Electronically countersigned</b> by '+htmlEscape(cert.signedName)+
     ' · '+htmlEscape(formatDateTime(cert.signedAt))+'</div>'+
   '<img alt="Commander or instructor signature for this flight" class="v254-signed-image" src="'+cert.signatureData+'">'+
   '<div class="mini">Saved as part of this specific flight. A later profile-signature change will not alter it.</div>':
   '<div class="note"><b>'+(state==="invalid"?'Signature requires re-verification':
     'Electronic countersignature pending')+'</b>. Recorded '+htmlEscape(f.role)+
     ' time remains in the logbook, but it is not shown as digitally countersigned.</div>'+
   '<div class="mini">The recorded PIC/FI is '+name+'. EASA AMC1 FCL.050 calls for their name and signature in Remarks. A handwritten signature may exist on a paper logbook even if not captured here.</div>')+
  (past?'<div class="mini">Previous certifications withdrawn for correction: '+past+'. Earlier evidence remains stored with this record.</div>':'')+
  (!archived&&state==="pending"?
   '<div style="margin-top:12px"><button type="button" class="btn primary" onclick="v254OpenSigning('+htmlEscape(JSON.stringify(f.id))+')">Countersign this flight</button></div>'+
   (!person?'<div class="mini">To sign electronically, first link the recorded commander/FI to a saved pilot profile with exactly the same name.</div>':''):
   !archived&&cert?
    '<div style="margin-top:12px"><button type="button" class="btn" onclick="v254WithdrawCertification('+htmlEscape(JSON.stringify(f.id))+')">Withdraw certification to correct flight</button></div>':
    archived?'<div class="mini">Archived flight: existing signed pages remain unchanged. Use the paper countersignature or the established signed-addendum process for corrections.</div>':'')+
  '<div class="mini" style="margin-top:10px">Digital signature capture does not independently verify identity or guarantee acceptance by your competent authority. Do not use someone else’s saved signature without their direct approval.</div></div>';
}
function v254OpenSigning(id){
 const f=S.flights.find(x=>x.id===id),api=v254CertificationApi();
 if(!f||!api?.required(f)||f.commanderCertification||isArchivedFlight(id)){
  alert("Only an unsigned, unarchived PICUS/SPIC flight can be countersigned here.");return;
 }
 const person=v254Signatory(f);
 if(!person){
  alert("The Name of PIC must be linked to the same saved commander/FI profile before signing. Edit the flight first, then return.");
  return;
 }
 v254SignatureTarget={id:f.id,subject:api.subject(f)};
 const png=typeof v227IsPNG==="function"&&v227IsPNG(person.savedSignatureData);
 app.innerHTML=header("Countersign "+htmlEscape(f.role)+" flight",
   "The recorded commander or flight instructor must personally approve this flight.",
   '<button class="btn" type="button" onclick="v254SignatureTarget=null;flight('+htmlEscape(JSON.stringify(id))+')">← Flight</button>')+
  '<div class="card v254-certification-screen">'+
  '<h2>'+htmlEscape(f.role)+' · '+htmlEscape(formatDate(f.date))+'</h2>'+
  '<p><b>Flight:</b> '+htmlEscape(f.dep)+' '+htmlEscape(f.off)+' → '+htmlEscape(f.arr)+' '+htmlEscape(f.on)+
    ' UTC · '+htmlEscape(fmt(f.mins))+'</p>'+
  '<p><b>Recorded PIC / FI:</b> '+htmlEscape(person.name)+'</p>'+
  '<p class="muted">'+htmlEscape(f.remarks||"")+'</p>'+
  '<div class="note">This signature will certify the specific flight details above, including time and pilot function. The flight must be re-certified if corrected. The signatory should be present and review the full record.</div>'+
  (png?'<div class="v227-saved-option"><b>Saved pilot signature</b>'+
   '<p class="mini">The named commander may approve copying their previously saved profile signature to this flight.</p>'+
   '<button class="btn" type="button" onclick="v254ApplySavedCertification('+htmlEscape(JSON.stringify(id))+')">Use saved signature</button></div>':'')+
  '<div class="signature-canvas-wrap"><b>Or draw signature of '+htmlEscape(person.name)+'</b>'+
  '<canvas id="signatureCanvas" width="900" height="260"></canvas>'+
  '<div class="actions"><button class="btn" type="button" onclick="clearEndorsementSignature()">Clear</button>'+
  '<button class="btn primary" type="button" onclick="v254ApplyDrawnCertification('+htmlEscape(JSON.stringify(id))+')">Apply drawn signature</button></div></div>'+
  '<label class="v227-confirm"><input type="checkbox" id="v254ApproveCertification"> '+htmlEscape(person.name)+
  ' has personally reviewed the full flight record and expressly approves countersigning this specific '+htmlEscape(f.role)+' flight now.</label>'+
  '<p class="mini">Saving a signature does not independently verify signatory identity and is not a qualified electronic signature. Confirm acceptance with your competent authority.</p></div>';
 setupEndorsementSignaturePad();
}
function v254ApplyCertification(id,png,source){
 const api=v254CertificationApi();
 const f=S.flights.find(x=>x.id===id);
 const person=f&&v254Signatory(f);
 if(!f||!person||!v254SignatureTarget||v254SignatureTarget.id!==id||
    v254SignatureTarget.subject!==api.subject(f)||
    f.commanderCertification||isArchivedFlight(id)){
  alert("Flight details, commander or certification state changed. Reopen the flight and review it again.");return false;
 }
 if(!document.getElementById("v254ApproveCertification")?.checked){
  alert("The recorded commander/FI must expressly approve countersigning this exact flight.");return false;
 }
 let cert;
 try{cert=api.create(f,person,png,source);}
 catch(e){alert(e.message);return false;}
 if(!confirm("Confirm that "+person.name+" personally approves the countersignature for this "+f.role+" flight on "+f.date+"?"))return false;
 f.commanderCertification=cert;
 if(!save()){delete f.commanderCertification;return false;}
 v254SignatureTarget=null;
 flight(id);
 return true;
}
function v254ApplySavedCertification(id){
 const f=S.flights.find(x=>x.id===id),person=f&&v254Signatory(f);
 if(!person||!v227IsPNG(person.savedSignatureData)){
  alert("A valid saved signature is unavailable for this PIC/FI.");return;
 }
 v254ApplyCertification(id,person.savedSignatureData,"saved-profile");
}
function v254ApplyDrawnCertification(id){
 const canvas=document.getElementById("signatureCanvas");
 if(!canvas||!endorsementSignatureDirty){
  alert("Please draw the commander/FI signature in the box first.");return;
 }
 const png=canvas.toDataURL("image/png");
 if(!v227IsPNG(png)){alert("Invalid or oversized signature. Please draw it again.");return;}
 v254ApplyCertification(id,png,"drawn");
}
function v254WithdrawCertification(id){
 const f=S.flights.find(x=>x.id===id);
 if(!f||!f.commanderCertification||isArchivedFlight(id)){
  alert("Archived flights and unsigned flights cannot be changed through certification withdrawal.");return;
 }
 if(!confirm("Withdraw the recorded countersignature for this flight? The signed evidence will remain in its correction history, and the flight will become certification pending until the commander/FI signs the corrected version."))return;
 const previous=f.commanderCertification,history=f.certificationHistory;
 f.certificationHistory=[...(Array.isArray(history)?history:[]),
  {...previous,withdrawnAt:new Date().toISOString()}];
 delete f.commanderCertification;
 if(!save()){f.commanderCertification=previous;if(history===undefined)delete f.certificationHistory;else f.certificationHistory=history;return;}
 flight(id);
}
