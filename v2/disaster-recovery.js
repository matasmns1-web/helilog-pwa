/* HeliLog V2.10 TEST — isolated in-memory encrypted backup recovery drill.
 * This module NEVER sends decrypted contents to a service or writes active data.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV210Drill=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 const parseArray=(value,name)=>{
  if(!Array.isArray(value))throw Error("Backup "+name+" is not an array.");
  if(value.length>100000)throw Error("Backup "+name+" exceeds the safe sandbox limit.");
  return value;
 };
 const canonical=(value)=>JSON.stringify((function sort(x){
  if(Array.isArray(x))return x.map(sort);
  if(x&&typeof x==="object"){
   const o={};for(const key of Object.keys(x).sort())o[key]=sort(x[key]);return o;
  }return x;
 })(value));
 const key=(kind,id)=>String(kind)+":"+String(id);
 function validate(payload,expectedOwner){
  if(!payload||payload.owner!==expectedOwner||!payload.content||
     payload.content.schema!==1||typeof payload.content!=="object")
   throw Error("Backup owner or schema does not match the isolated recovery drill.");
  const doc=payload.content,records=parseArray(doc.records,"records"),
   archives=parseArray(doc.archives,"archives"),frozen=parseArray(doc.frozen,"frozen"),
   addenda=parseArray(doc.addenda,"addenda");
  const problems=[],recordMap=new Map(),batchMap=new Map(),frozenMap=new Map(),signedIDs=new Set();
  for(const r of records){
   if(!r||typeof r.kind!=="string"||!r.kind||
      typeof r.record_id!=="string"||!r.record_id||!r.payload||typeof r.payload!=="object"){
    problems.push("Malformed record");continue;
   }
   const k=key(r.kind,r.record_id);
   if(recordMap.has(k))problems.push("Duplicate cloud record: "+k);
   else recordMap.set(k,r);
  }
  for(const b of archives){
   if(!b||typeof b.id!=="string"||!b.id||!b.payload||typeof b.payload!=="object"||
     !["flight","endorsement"].includes(b.kind)){
    problems.push("Malformed printed archive batch");continue;
   }
   if(batchMap.has(b.id))problems.push("Duplicate archive batch: "+b.id);
   else batchMap.set(b.id,b);
  }
  for(const e of frozen){
   if(!e||typeof e.archive_id!=="string"||!e.record_id||
     !["flight","endorsement"].includes(e.record_kind)||
     !e.snapshot||typeof e.snapshot!=="object"){
    problems.push("Malformed immutable archive snapshot");continue;
   }
   const k=key(e.record_kind,e.record_id);
   if(frozenMap.has(k))problems.push("Duplicate frozen original: "+k);
   frozenMap.set(k,e);
   const batch=batchMap.get(e.archive_id);
   if(!batch||batch.kind!==e.record_kind)
    problems.push("Frozen original references a missing/wrong print batch: "+k);
   const original=recordMap.get(k);
   if(!original)problems.push("Archived original record is missing: "+k);
   else if(canonical(original.payload)!==canonical(e.snapshot))
    problems.push("Archived original differs from frozen snapshot: "+k);
   if(e.record_kind==="endorsement"&&original&&!original.sealed_at)
    problems.push("Archived endorsement is missing its sealed status: "+k);
  }
  for(const b of archives){
   if(!b||!batchMap.has(b.id))continue;
   const refs=b.kind==="flight"?b.payload?.flightIds:
    (Array.isArray(b.payload?.items)?b.payload.items.map(x=>x?.endorsementId):null);
   if(!Array.isArray(refs)||!refs.length){
    problems.push("Printed batch is missing its record index: "+b.id);
    continue;
   }
   for(const id of refs){
    const e=frozenMap.get(key(b.kind,id));
    if(!e||e.archive_id!==b.id)
     problems.push("Printed batch and frozen original do not agree: "+b.id);
   }
  }
  for(const a of addenda){
   if(!a||typeof a.id!=="string"||!a.id||!a.record_id||
      !["flight","endorsement"].includes(a.record_kind)){
    problems.push("Malformed signed correction");continue;
   }
   if(signedIDs.has(a.id))problems.push("Duplicate signed addendum: "+a.id);
   signedIDs.add(a.id);
   const k=key(a.record_kind,a.record_id);
   if(!frozenMap.has(k))problems.push("Signed addendum lacks immutable original: "+k);
   const sig=a.signature_metadata;
   if(!sig||typeof sig!=="object"||!sig.id||!sig.confirmedAt||!a.reason||
      sig.reason!==a.reason||
      canonical(sig.before||{})!==canonical(a.before_snapshot||{})||
      canonical(sig.after||{})!==canonical(a.after_snapshot||{}))
    problems.push("Signed addendum metadata disagrees with before/after: "+a.id);
  }
  // The exercise checks the structure and consistency of a snapshot, not
  // external attestation or the flight records' regulatory authenticity.
  return {ok:problems.length===0,problems,
   counts:{records:records.length,archives:archives.length,
    frozen:frozen.length,addenda:addenda.length}};
 }
 async function digest(x){
  if(!root.crypto?.subtle)throw Error("Web Crypto is unavailable.");
  const bytes=new TextEncoder().encode(canonical(x));
  const hash=new Uint8Array(await root.crypto.subtle.digest("SHA-256",bytes));
  return Array.from(hash).map(v=>v.toString(16).padStart(2,"0")).join("");
 }
 async function drill(payload,expectedOwner){
  const check=validate(payload,expectedOwner);
  if(!check.ok)return {...check,isolated:true,restored:false,
    message:"Sandbox recovery rejected; active cloud records and device data were untouched."};
  // Reconstruction happens ONLY in transient memory, without remote calls.
  const doc=payload.content;
  const reconstructed={
   schema:doc.schema,
   account:doc.account==null?null:JSON.parse(JSON.stringify(doc.account)),
   records:JSON.parse(JSON.stringify(doc.records)),
   archives:JSON.parse(JSON.stringify(doc.archives)),
   frozen:JSON.parse(JSON.stringify(doc.frozen)),
   addenda:JSON.parse(JSON.stringify(doc.addenda))
  };
  const [from,to]=await Promise.all([digest(doc),digest(reconstructed)]);
  const matched=from===to;
  return {ok:matched,isolated:true,restored:matched,problems:matched?[]:["Reconstructed sandbox fingerprint mismatch"],
   counts:check.counts,sourceFingerprint:from,recoveryFingerprint:to,
   message:matched?"Independent encrypted file reconstructed in a temporary IN-MEMORY sandbox. No cloud or local logbook was modified.":
    "Isolated recovery fingerprint mismatch; no live data was changed."};
 }
 return Object.freeze({validate,drill});
});
