/* HeliLog V2.8 TEST — read-only independent cloud archive audit.
 * No archive writes, no background uploads and no claim of regulatory certification.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV28Integrity=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 const canonical=value=>JSON.stringify((function order(x){
  if(Array.isArray(x))return x.map(order);
  if(x&&typeof x==="object"){
   const o={};for(const key of Object.keys(x).sort())o[key]=order(x[key]);return o;
  }
  return x;
 })(value));
 const safeArray=x=>Array.isArray(x)?x:[];
 const key=(kind,id)=>kind+":"+id;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const types=["flight","endorsement"];
 const validKind=k=>types.includes(k);
 function evaluate({batches=[],entries=[],addenda=[],records=[]}){
  const errors=[],warnings=[],archiveIDs=new Map(),members=new Map(),recordMap=new Map();
  const identifiers=new Set(),pageGroups={flight:[],endorsement:[]};
  for(const r of records){
   if(!validKind(r.kind)||typeof r.record_id!=="string")continue;
   const k=key(r.kind,r.record_id);
   if(recordMap.has(k))errors.push("Duplicate cloud record: "+k);
   recordMap.set(k,r);
  }
  for(const batch of batches){
   const kind=batch.kind,p=batch.payload||{};
   if(!validKind(kind)||!batch.id){errors.push("Malformed cloud archive batch.");continue;}
   if(archiveIDs.has(batch.id))errors.push("Duplicate archive ID: "+batch.id);
   archiveIDs.set(batch.id,batch);
   if(!Number.isInteger(batch.first_page)||batch.first_page<1||
      !Number.isInteger(batch.page_count)||batch.page_count<1||
      p.firstPage!==batch.first_page||p.pageCount!==batch.page_count||
      !p.id||!p.confirmedAt){
    errors.push("Invalid archive page range or metadata: "+batch.id);continue;
   }
   if(!pageGroups[kind])pageGroups[kind]=[];
   pageGroups[kind].push(batch);
   const expected=kind==="flight"?p.flightIds:safeArray(p.items).map(i=>i?.endorsementId);
   if(!Array.isArray(expected)||!expected.length||expected.some(v=>typeof v!=="string"||!v))
    errors.push("Archive has no valid record references: "+batch.id);
   else for(const id of expected){
    const k=key(kind,id);
    if(identifiers.has(k))errors.push("Record appears in multiple archive batches: "+k);
    identifiers.add(k);
    members.set(k,batch.id);
   }
  }
  for(const kind of types){
   const rows=pageGroups[kind].sort((a,b)=>a.first_page-b.first_page);
   for(let i=1;i<rows.length;i++){
    const expected=rows[i-1].first_page+rows[i-1].page_count;
    if(rows[i].first_page!==expected)
     errors.push("Archive "+kind+" page continuity mismatch at "+rows[i].id);
   }
  }
  const found=new Set(),evidence={};
  for(const entry of entries){
   const k=key(entry.record_kind,entry.record_id);
   if(found.has(k))errors.push("Duplicate frozen archive entry: "+k);
   found.add(k);
   const expected=members.get(k);
   if(!expected)errors.push("Unreferenced frozen archive entry: "+k);
   else if(expected!==entry.archive_id)errors.push("Frozen archive entry references the wrong batch: "+k);
   if(!entry.snapshot||typeof entry.snapshot!=="object")
    errors.push("Missing frozen archive snapshot: "+k);
   const record=recordMap.get(k);
   if(!record)errors.push("Archived source record missing: "+k);
   else if(canonical(record.payload)!==canonical(entry.snapshot))
    errors.push("Archived original differs from its frozen cloud snapshot: "+k);
   if(entry.record_kind==="endorsement"&&record&&!record.sealed_at)
    errors.push("Archived endorsement no longer shows sealed status: "+k);
   if(entry.snapshot)evidence[k]=canonical({batch:entry.archive_id,original:entry.snapshot});
  }
  for(const k of members.keys())if(!found.has(k))
   errors.push("Archive batch has no corresponding frozen entry: "+k);
  const addendumIds=new Set();
  for(const row of addenda){
   const k=key(row.record_kind,row.record_id),p=row.signature_metadata||{};
   if(!row.id||addendumIds.has(row.id))errors.push("Missing or duplicate correction identifier.");
   addendumIds.add(row.id);
   if(!found.has(k))errors.push("Correction lacks an archived original: "+k);
   if(!p.id||!p.confirmedAt||!p.reason||p.reason!==row.reason)
    errors.push("Incomplete correction metadata: "+(row.id||k));
   if(canonical(p.before||{})!==canonical(row.before_snapshot||{})||
      canonical(p.after||{})!==canonical(row.after_snapshot||{}))
    errors.push("Correction snapshot differs from its cloud metadata: "+(row.id||k));
   if(p.id)evidence["addendum:"+row.id]=canonical({
    original:k,metadata:p,before:row.before_snapshot,after:row.after_snapshot
   });
  }
  if(records.length>50000||entries.length>50000)
   errors.push("Cloud archive is too large for a complete client-side audit.");
  return {ok:errors.length===0,errors,warnings,counts:{
   batches:batches.length,entries:entries.length,addenda:addenda.length
  },evidence};
 }
 async function sha256(value){
  const subtle=root.crypto?.subtle;
  if(!subtle)throw Error("Archive verification requires HTTPS and Web Crypto.");
  const bytes=new TextEncoder().encode(value);
  const hash=await subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,"0")).join("");
 }
 async function readTable(db,owner,table,columns,kindFilter=false){
  const all=[];let from=0;
  for(;;){
   let query=db.from(table).select(columns).eq("owner_id",owner);
   if(kindFilter)query=query.in("kind",types);
   const {data,error}=await query.range(from,from+499);
   if(error)throw Error("Cloud archive audit could not read "+table+": "+error.message);
   if(!Array.isArray(data))throw Error("Invalid cloud archive audit response from "+table);
   all.push(...data);
   if(data.length<500)return all;
   from+=500;
   if(from>=50000)throw Error("Cloud archive audit exceeded the safe read limit.");
  }
 }
 const baselineKey=owner=>"helilog_v28_archive_evidence_"+owner;
 async function auditCloud({client,owner,previousEvidence,storeEvidence=false}){
  if(!/^[0-9a-f-]{36}$/i.test(String(owner))||root.HeliLogCloud?.snapshot?.().userId!==owner)
   throw Error("Sign in with the verified account before checking cloud archives.");
  if(root.navigator?.onLine===false)throw Error("Cloud archive verification requires internet access.");
  if(!client?.from)throw Error("Cloud client unavailable.");
  const [batches,entries,addenda,records]=await Promise.all([
   readTable(client,owner,"helilog_print_archives","id,kind,first_page,page_count,payload,confirmed_at"),
   readTable(client,owner,"helilog_archive_entries","archive_id,record_kind,record_id,snapshot"),
   readTable(client,owner,"helilog_archive_addenda","id,record_kind,record_id,reason,before_snapshot,after_snapshot,signature_metadata"),
   readTable(client,owner,"helilog_records","kind,record_id,payload,revision,sealed_at",true)
  ]);
  // Fail closed if the user changed accounts during the request.
  if(root.HeliLogCloud?.snapshot?.().userId!==owner)
   throw Error("Account changed while cloud archives were being checked.");
  const report=evaluate({batches,entries,addenda,records});
  const stored=previousEvidence??(root.localStorage?
   JSON.parse(root.localStorage.getItem(baselineKey(owner))||"{}"):{});
  if(!stored||typeof stored!=="object"||Array.isArray(stored))
   throw Error("Previous local archive evidence is invalid; preserve device data.");
  const next={};
  for(const [id,raw] of Object.entries(report.evidence))next[id]=await sha256(raw);
  for(const [id,digest] of Object.entries(stored)){
   if(!next[id])report.errors.push("A previously checked cloud archive item is missing: "+id);
   else if(next[id]!==digest)report.errors.push("Previously checked cloud archive content changed: "+id);
  }
  report.ok=report.errors.length===0;
  report.fingerprint=await sha256(canonical(next));
  if(report.ok&&storeEvidence&&root.localStorage){
   const json=JSON.stringify(next);
   root.localStorage.setItem(baselineKey(owner),json);
   if(root.localStorage.getItem(baselineKey(owner))!==json)
    throw Error("Archive evidence was not retained on this device.");
  }
  return report;
 }
 return Object.freeze({evaluate,auditCloud,sha256,canonical,baselineKey});
});
