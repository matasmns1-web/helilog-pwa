/* HeliLog V2.4 TEST — protected browser-only paper archive cloud adapter.
 * Originals and correction addenda are committed with owner-checked RPCs.
 * The cloud's immutable rows are the source of truth; do not call the
 * local archive confirmation before the corresponding RPC succeeds.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV24Archive=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 let owner="",client=null,reading=false,readPromise=null,error="",recoveryNotice="",sessionGeneration=0;
 const clone=v=>JSON.parse(JSON.stringify(v));
 const normalized=value=>JSON.stringify((function order(v){
  if(Array.isArray(v))return v.map(order);
  if(v&&typeof v==="object"){
   const out={};for(const k of Object.keys(v).sort())out[k]=order(v[k]);return out;
  }
  return v;
 })(value));
 const same=(a,b)=>normalized(a)===normalized(b);
 function start({userId,db}){
  if(!/^[0-9a-f-]{36}$/i.test(userId)||!db?.from||!db?.rpc)throw Error("Cloud archive requires an authenticated Supabase client.");
  // Repeated sync checks must not erase a prior archive discrepancy or
  // cancel an in-progress archive read for this same authenticated account.
  if(owner===userId&&client===db)return;
  sessionGeneration++;
  owner=userId;client=db;reading=false;readPromise=null;error="";recoveryNotice="";
 }
 function stop(){sessionGeneration++;owner="";client=null;reading=false;readPromise=null;error="";recoveryNotice="";}
 function blockReason(){
  if(root.matchMedia?.("(display-mode: standalone)")?.matches||root.navigator?.standalone)
   return "Paper archives must be printed and confirmed from a web browser.";
  if(!owner||!client||root.HeliLogCloud?.snapshot?.().userId!==owner)
   return "This browser's cloud archive account has not been verified. Sign in and try again.";
  if(root.navigator?.onLine===false)
   return "This browser is offline. Reconnect it to confirm printed pages; other devices may synchronize later.";
  if(!root.HeliLogV23Sync?.extended?.())
   return "Enable extended synchronization for this account before confirming printed archives.";
  const sync=root.HeliLogV23Sync?.status?.();
  if(!sync||sync.owner!==owner)
   return "The cloud account and this browser's sync workspace differ. Sign in again.";
  if(sync.state==="conflict"||sync.conflicts>0)
   return "This browser has an unresolved cloud record conflict. Review it in Cloud account before archiving.";
  if(sync.pending>0||sync.state==="pending"||sync.state==="syncing")
   return "This browser still has "+(sync.pending||"")+" unsent change(s). Synchronize these records before confirming pages; other devices do not need to be online.";
  if(sync.state!=="synced")
   return "This browser is not ready to archive (cloud status: "+sync.state+
    (sync.error?"; "+sync.error:"")+"). Open Cloud account and check / sync now.";
  if(error)
   return "This browser's cloud archive refresh found a discrepancy: "+error+
    ". Do not clear stored records; use Cloud account to review and retry the archive check.";
  return "";
 }
 function available(){return blockReason()==="";}
 function assertReady(){
  const reason=blockReason();
  if(reason)throw Error(reason);
 }
 function queryRows(table,columns){
  return client.from(table).select(columns).eq("owner_id",owner);
 }
 async function refresh(snapshot,commit){
  if(!owner || !root.HeliLogV23Sync?.extended?.())return false;
  if(root.HeliLogCloud?.snapshot?.().userId!==owner)return false;
  if(root.navigator?.onLine===false)return false;
  if(readPromise)return readPromise;
  reading=true;const sessionOwner=owner,sessionClient=client,sessionAtStart=sessionGeneration;
  const operation=(async()=>{
  try{
   const [b,a]=await Promise.all([
    queryRows("helilog_print_archives","kind,payload,first_page,confirmed_at"),
    queryRows("helilog_archive_addenda","record_kind,signature_metadata,confirmed_at")
   ]);
   if(b.error)throw Error(b.error.message||"Could not retrieve cloud print archives");
   if(a.error)throw Error(a.error.message||"Could not retrieve correction history");
   if(owner!==sessionOwner||client!==sessionClient||sessionGeneration!==sessionAtStart)return false;
   const originalSnapshot=clone(snapshot());
   const data=clone(originalSnapshot);
   const flight=(b.data||[]).filter(x=>x.kind==="flight").map(x=>x.payload);
   const endors=(b.data||[]).filter(x=>x.kind==="endorsement").map(x=>x.payload);
   const fcor=(a.data||[]).filter(x=>x.record_kind==="flight").map(x=>x.signature_metadata);
   const ecor=(a.data||[]).filter(x=>x.record_kind==="endorsement").map(x=>x.signature_metadata);
   flight.sort((x,y)=>x.firstPage-y.firstPage);
   endors.sort((x,y)=>x.firstPage-y.firstPage);
   if(!data.printArchive)data.printArchive={firstPage:1,paperReference:"",batches:[],corrections:[]};
   if(!data.endorsementV2Archive)data.endorsementV2Archive={batches:[],amendments:[]};
   const compare=(local,remote,name)=>{
    for(const x of local){
     const found=remote.find(y=>y.id===x.id);
     if(!found)throw Error("Unsynchronized "+name+" remains on this device. The cloud copy was not substituted.");
     if(!same(x,found))throw Error("Archive discrepancy for "+x.id+"; local copy was preserved.");
    }
   };
   compare(data.printArchive.batches||[],flight,"flight batch");
   compare(data.endorsementV2Archive.batches||[],endors,"endorsement batch");
   compare(data.endorsementV2Archive.amendments||[],ecor,"endorsement addendum");
   const confirmedLocally=(data.printArchive.corrections||[]).filter(x=>x.confirmedAt);
   const missing=confirmedLocally.filter(x=>!fcor.some(y=>y.id===x.id));
   // Existing confirmed addenda with the same ID must match byte-for-byte
   // after canonical JSONB ordering. Never "repair" a genuine mismatch.
   compare(confirmedLocally.filter(x=>!missing.includes(x)),fcor,"flight correction");
   if(missing.length>1)
    throw Error("Multiple locally confirmed flight corrections are absent from the cloud. A manual archive review is required; no records were changed.");
   let recovered=null;
   if(missing.length===1){
    const orphan=missing[0],sessionOwner=owner;
    // Only V2.8.2's known premature-confirmation case is recoverable:
    // the EXACT SAME correction is still an unconfirmed record in the
    // user's cloud account, and the referenced immutable batch exists.
    if(!orphan.id||!orphan.flightId||!orphan.confirmedAt||
       !flight.some(batch=>batch.id===orphan.sourceBatch&&
         Array.isArray(batch.flightIds)&&batch.flightIds.includes(orphan.flightId)))
     throw Error("A locally confirmed correction lacks a valid cloud archive original. No data was changed.");
    const proposalResult=await queryRows("helilog_records","record_id,kind,payload,revision")
      .eq("kind","correction_proposal").eq("record_id",String(orphan.id)).maybeSingle();
    if(proposalResult.error)throw Error("Could not verify the cloud correction proposal: "+proposalResult.error.message);
    const proposal=proposalResult.data?.payload;
    const localPending={...orphan,confirmedAt:""};
    if(!proposal||proposalResult.data.record_id!==orphan.id||
       proposal.id!==orphan.id||proposal.flightId!==orphan.flightId||
       proposal.sourceBatch!==orphan.sourceBatch||proposal.confirmedAt||
       !same(localPending,proposal))
     throw Error("The cloud does not contain an identical unconfirmed proposal for the locally marked correction. No data was changed.");
    // Double-check that no signed addendum appeared while we were looking up
    // the draft. A concurrently confirmed cloud addendum wins on next refresh.
    const recheck=await queryRows("helilog_archive_addenda","record_kind,record_id,signature_metadata")
      .eq("record_kind","flight").eq("record_id",orphan.flightId);
    if(recheck.error)throw Error("Could not recheck signed correction history: "+recheck.error.message);
    if((recheck.data||[]).some(row=>String(row.signature_metadata?.id)===String(orphan.id)))
     throw Error("Cloud addendum changed during recovery. Synchronize again; nothing was overwritten.");
    if(owner!==sessionOwner||client!==sessionClient||sessionGeneration!==sessionAtStart||
       root.HeliLogCloud?.snapshot?.().userId!==owner)
     throw Error("Account changed during safe recovery. No records were changed.");
    const current=snapshot();
    if(!same(current,originalSnapshot))
     throw Error("Logbook changed while the correction was being checked. Refresh again without discarding data.");
    if(root.HeliLogV23Sync?.status?.().state!=="synced"||
       root.HeliLogV23Sync.status().pending>0||
       root.HeliLogV23Sync.status().conflicts>0)
     throw Error("A local sync change or conflict prevents archive recovery. Finish syncing before retrying.");
    // Keep a separate full pre-repair snapshot; if browser quota/storage is
    // unavailable, fail CLOSED. The server record remains untouched.
    const storage=root.localStorage;
    if(!storage)throw Error("Secure local recovery storage is unavailable; nothing was modified.");
    const key="helilog_v284_stranded_correction_backup_"+owner+"_"+Date.now()+"_"+orphan.id;
    if(storage.getItem(key)!==null)
     throw Error("The recovery backup key already exists; retry without clearing data.");
    const backup=JSON.stringify({purpose:"V2.8.4 premature correction confirmation recovery",
      createdAt:new Date().toISOString(),owner,originalWorkspace:data,
      verifiedCloudProposal:proposal,cloudRevision:proposalResult.data.revision});
    storage.setItem(key,backup);
    if(storage.getItem(key)!==backup)
     throw Error("Recovery backup could not be verified; no records were changed.");
    // Reclassify ONLY the prematurely confirmed local item, leaving all
    // previously signed archive records and other data untouched.
    const pos=data.printArchive.corrections.findIndex(x=>x.id===orphan.id);
    data.printArchive.corrections[pos]=clone(proposal);
    recovered={id:orphan.id,backupKey:key};
   }
   data.printArchive.batches=flight;
   // An addendum confirmed on the web replaces any stale unconfirmed copy
   // downloaded on another device. Never retain two entries for one ID.
   const cloudConfirmed=new Set(fcor.map(c=>String(c.id)));
   data.printArchive.corrections=[
    ...(data.printArchive.corrections||[]).filter(x=>!x.confirmedAt&&!cloudConfirmed.has(String(x.id))),
    ...fcor
   ];
   data.endorsementV2Archive.batches=endors;
   data.endorsementV2Archive.amendments=ecor;
   // One verified local commit, only after all protected archive comparisons
   // have passed. If persistence fails, the independent recovery backup stays.
   commit(data);
   if(recovered)recoveryNotice="Recovered a V2.8.2 prematurely marked correction ("+
     recovered.id+") as PENDING after verifying its identical cloud proposal. A device-local safety backup was saved. The signed original was not changed.";
   error="";return true;
  }catch(e){
   if(sessionGeneration===sessionAtStart){
    error=String(e.message||e);
    root.console?.warn?.("HeliLog archive pull stopped:",error);
   }
   return false;
  }
  finally{
   if(sessionGeneration===sessionAtStart){reading=false;readPromise=null;}
  }
  })();
  readPromise=operation;
  return operation;
 }
 async function waitForArchiveRefresh(){
  if(readPromise)await readPromise;
  assertReady();
 }
 async function verifyIntegrityBeforeWrite(){
  if(!root.HeliLogV28Integrity?.auditCloud)
   throw Error("The V2.8 archive-integrity module did not load. Reload while online.");
  const checkedOwner=owner;
  const report=await root.HeliLogV28Integrity.auditCloud({
   client,owner:checkedOwner,storeEvidence:true
  });
  if(!report.ok){
   error="Cloud archive integrity check failed: "+report.errors.slice(0,3).join(" | ");
   throw Error(error+" No new archive was confirmed.");
  }
  if(owner!==checkedOwner)throw Error("Account changed during integrity verification.");
  assertReady();
 }
 async function verifyPrintedFlights(batch,ids){
  const prints=Array.isArray(batch?.flights)?batch.flights:[];
  if(prints.length!==ids.length||prints.some((f,i)=>f?.id!==ids[i]))
   throw Error("Printed flight snapshots do not match the selected record IDs.");
  const sessionOwner=owner;
  const {data,error:err}=await client.from("helilog_records")
   .select("record_id,payload").eq("owner_id",owner).eq("kind","flight").in("record_id",ids);
  if(err)throw Error("Cannot validate printed flight originals: "+err.message);
  if(!Array.isArray(data)||data.length!==ids.length)
   throw Error("At least one printed flight is missing from the cloud.");
  const found=new Map(data.map(x=>[x.record_id,x.payload]));
  for(const flight of prints){
   if(!found.has(flight.id)||!same(flight,found.get(flight.id)))
    throw Error("Printed flight "+flight.id+" differs from its current cloud record. Sync and preview again.");
  }
  if(owner!==sessionOwner)throw Error("Account changed during flight archive validation.");
 }
 async function confirmBatch(kind,batch,ids){
  await waitForArchiveRefresh();
  if(!["flight","endorsement"].includes(kind)||!Array.isArray(ids)||!ids.length)
   throw Error("Invalid archive type or empty batch.");
  if(batch.confirmedAt===undefined)throw Error("Print batch must have confirmation time.");
  await verifyIntegrityBeforeWrite();
  if(kind==="flight")await verifyPrintedFlights(batch,ids);
  assertReady();
  const {data,error:err}=await client.rpc("helilog_confirm_print_batch",{
   p_kind:kind,p_batch:clone(batch),p_record_ids:ids
  });
  if(err)throw Error("Cloud archive was not confirmed: "+err.message);
  if(!data)throw Error("Cloud archive did not acknowledge the confirmed batch.");
  return data;
 }
 async function confirmAddendum(kind,recordId,correction){
  await waitForArchiveRefresh();
  if(!["flight","endorsement"].includes(kind)||!recordId||!correction?.confirmedAt)
   throw Error("Invalid signed correction.");
  await verifyIntegrityBeforeWrite();
  const {data,error:err}=await client.rpc("helilog_confirm_print_addendum",{
   p_kind:kind,p_record_id:recordId,p_addendum:clone(correction)
  });
  if(err)throw Error("Cloud correction was not confirmed: "+err.message);
  if(!data)throw Error("Cloud correction was not acknowledged.");
  return data;
 }
 return Object.freeze({start,stop,refresh,confirmBatch,confirmAddendum,available,blockReason,error:()=>error,recoveryNotice:()=>recoveryNotice});
});
