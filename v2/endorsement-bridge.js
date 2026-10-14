/* HeliLog V2 bridge: V1.43.2 UI/state to V2 endorsement-archive domain.
 * The V1-shaped flight logbook remains the full user-facing surface. This bridge
 * stores confirmed endorsement batches and amendments INSIDE its JSON Full Backup.
 * No access to the earlier V2 alpha workspace key or to V1 production origin.
 */
(function(root,factory){
 const api=factory(root.HeliLogV2Domain,root.HeliLogV2Print);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV2Bridge=api;
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
 function signatureOf(e){
  if(!e.signatureData)return null;
  return {
   signatoryPersonId:e.signatoryPersonId,
   name:e.signedName||"",
   licence:e.signedLicence||"",
   data:e.signatureData,
   signedAt:e.signedAt||e.date+"T00:00:00.000Z"
  };
 }
 function convertRecord(e){
  const created=(e.createdAt&&String(e.createdAt).includes("T"))?e.createdAt:e.date+"T00:00:00.000Z";
  return {id:e.id,date:e.date,category:e.category||"Other",title:e.title||"",
   text:e.text||"",location:e.location||"",qualificationId:e.qualificationId||"",
   signatoryPersonId:e.signatoryPersonId||"",signature:signatureOf(e),
   createdAt:created,updatedAt:e.signedAt||created};
 }
 function workspace(db){
  const archive=stored(db);
  const people=(db.people||[]).map(p=>({id:p.id,name:p.name,licence:p.licence||"",role:p.role||""}));
  const state={
   schemaVersion:2,
   meta:{workspaceId:"v2-restored-interface",environment:"development",revision:0,
    createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z"},
   people,aircraft:[],flights:[],
   endorsements:(db.endorsements||[]).map(convertRecord),
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
