/* HeliLog V2 bridge: V1.43.2 UI/state to V2 endorsement-archive domain.
 * The V1-shaped flight logbook remains the full user-facing surface. This bridge
 * stores confirmed endorsement batches and amendments INSIDE its JSON Full Backup.
 * No access to the earlier V2 alpha workspace key or to V1 production origin.
 */
(function(root,factory){
 if(typeof module==="object"&&module.exports)
  module.exports=factory(require("./domain.js"),require("./print.js"));
 else root.HeliLogV2Bridge=factory(root.HeliLogV2Domain,root.HeliLogV2Print);
})(typeof globalThis!=="undefined"?globalThis:this,function(D,Printer){
 "use strict";
 if(!D||!Printer)return null;
 const clone=value=>JSON.parse(JSON.stringify(value));
 const empty=()=>({batches:[],amendments:[]});
 function stored(db){
  const data=db.endorsementV2Archive||empty();
  if(!Array.isArray(data.batches)||!Array.isArray(data.amendments)){
   throw Error("Endorsement archive data is malformed; do not overwrite it");
  }
  return data;
 }
 // Display-only qualification and signer credentials are frozen in each
 // print snapshot. IDs remain private links for archive validation.
 function signatureOf(e,signer,frozenSnapshot){
  if(!e.signatureData)return null;
  const signature={
   signatoryPersonId:e.signatoryPersonId,
   name:e.signedName||"",
   licence:e.signedLicence||"",
   data:e.signatureData,
   signedAt:e.signedAt||e.date+"T00:00:00.000Z",
   source:e.signedSource||"drawn",
   approvedAt:e.signedConsentAt||e.signedAt||""
  };
  for(const [field,signedField,profileField] of [
   ["licenceNumber","signedLicenceNumber","licenceNumber"],
   ["fiFeNumber","signedFiFeNumber","fiFeNumber"]
  ]){
   let value="";
   if(frozenSnapshot){
    // Pre-V2.48 originals without identifiers remain unchanged.
    if(Object.prototype.hasOwnProperty.call(frozenSnapshot.signature||{},field))
     value=frozenSnapshot.signature[field];
   }else{
    value=Object.prototype.hasOwnProperty.call(e,signedField)
     ?e[signedField]:(signer?.[profileField]||"");
   }
   if(String(value||"").trim())signature[field]=String(value).trim();
  }
  return signature;
 }
 function convertRecord(e,db,frozenSnapshot){
  const created=(e.createdAt&&String(e.createdAt).includes("T"))?e.createdAt:e.date+"T00:00:00.000Z";
  const signer=(db.people||[]).find(p=>p.id===e.signatoryPersonId);
  const record={id:e.id,date:e.date,category:e.category||"Other",title:e.title||"",
   text:e.text||"",location:e.location||"",qualificationId:e.qualificationId||"",
   signatoryPersonId:e.signatoryPersonId||"",signature:signatureOf(e,signer,frozenSnapshot),
   createdAt:created,updatedAt:e.signedAt||created};
  if(frozenSnapshot){
   // V2.48.1: the confirmed snapshot is authoritative for its exact stored
   // print metadata and property layout. Older snapshots did not have today's
   // qualification/signer fields. Reconstructing them can trigger a false
   // archive-integrity mismatch even when the signed source is unchanged.
   //
   // Validate the original signed facts against the current source first:
   // NEVER trust a frozen snapshot as a substitute for modified signed data.
   const immutableFields=["id","date","category","title","text","location",
    "qualificationId","signatoryPersonId","createdAt","updatedAt"];
   for(const key of immutableFields){
    if(JSON.stringify(record[key])!==JSON.stringify(frozenSnapshot[key]))
     throw Error("Archived endorsement signed source differs in "+key+": "+e.id+
      ". Keep the signed original and review any corrections.");
   }
   const actualSignature=record.signature;
   const frozenSignature=frozenSnapshot.signature;
   if(!actualSignature||!frozenSignature)
    throw Error("Archived endorsement signature is missing: "+e.id);
   for(const key of ["signatoryPersonId","name","licence","data","signedAt","source","approvedAt"]){
    if(JSON.stringify(actualSignature[key])!==JSON.stringify(frozenSignature[key]))
     throw Error("Archived endorsement signed signature differs in "+key+": "+e.id+
      ". Keep the signed original and review any corrections.");
   }
   // Explicitly captured numbers are part of signed record history; changes to
   // these must not be quietly adopted from a later pilot-profile edit.
   for(const [sourceKey,printedKey] of [
    ["signedLicenceNumber","licenceNumber"],["signedFiFeNumber","fiFeNumber"]]){
    if(Object.prototype.hasOwnProperty.call(e,sourceKey) &&
       String(e[sourceKey]||"").trim()!==String(frozenSignature[printedKey]||"").trim())
     throw Error("Archived endorsement signed identifier differs: "+e.id);
   }
   // Preserve all original keys (including empty metadata) and their order.
   // The domain validator still compares this frozen signed original against
   // the archived snapshot, and signed content was independently checked above.
   return clone(frozenSnapshot);
  }
  const qualification=(db.qualifications||[]).find(q=>q.id===e.qualificationId);
  if(qualification?.name)record.qualificationPrintName=String(qualification.name);
  if(qualification?.number)record.qualificationPrintNumber=String(qualification.number);
  return record;
 }
 function workspace(db){
  const archive=stored(db);
  const people=(db.people||[]).map(p=>({id:p.id,name:p.name,licence:p.licence||"",role:p.role||""}));
  const snapshots=new Map();
  for(const batch of archive.batches){
   for(const item of batch.items||[])if(item?.snapshot && !snapshots.has(item.endorsementId))
    snapshots.set(item.endorsementId,item.snapshot);
  }
  const state={
   schemaVersion:2,
   meta:{workspaceId:"v2-restored-interface",environment:"development",revision:0,
    createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z"},
   people,aircraft:[],flights:[],
   endorsements:(db.endorsements||[]).map(e=>convertRecord(e,db,snapshots.get(e.id))),
   archives:{flights:[],endorsements:clone(archive.batches)},
   amendments:{flights:[],endorsements:clone(archive.amendments)}
  };
  const errors=D.validateState(state);
  if(errors.length)throw Error("Endorsement archive integrity error: "+errors.join("; "));
  return state;
 }
 function isArchived(db,id){
  return stored(db).batches.some(batch=>batch.items.some(item=>item.endorsementId===id));
 }
 function draft(db,ids,batchId,now){
  return D.prepareEndorsementPrint(workspace(db),ids,batchId,now);
 }
 function confirm(db,preview,now){
  const state=D.confirmEndorsementPrint(workspace(db),preview,now);
  return {batches:state.archives.endorsements,amendments:state.amendments.endorsements};
 }
 function effective(db,id){return D.effectiveEndorsement(workspace(db),id);}
 function amendmentDraft(db,id,changes,reason,amendmentId,now){
  return D.prepareEndorsementAmendment(workspace(db),id,changes,reason,amendmentId,now);
 }
 function signAmendment(db,proposal,png,now){
  return D.signEndorsementAmendment(workspace(db),proposal,png,now);
 }
 function confirmAmendment(db,signed,now){
  const state=D.confirmEndorsementAmendment(workspace(db),signed,now);
  return {batches:state.archives.endorsements,amendments:state.amendments.endorsements};
 }
 function source(db,id){
  for(const batch of stored(db).batches){
   const index=batch.items.findIndex(item=>item.endorsementId===id);
   if(index>=0)return {id:batch.id,page:batch.firstPage+Math.floor(index/batch.itemsPerPage)};
  }
  return null;
 }
 function printBatch(batch){return Printer.renderEndorsementBatch(batch);}
 function printAmendment(amendment,reference){return Printer.renderAmendment(amendment,reference);}
 return Object.freeze({workspace,isArchived,stored,draft,confirm,effective,amendmentDraft,
  signAmendment,confirmAmendment,source,printBatch,printAmendment});
});
