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
 let owner="",client=null,reading=false,readPromise=null,error="",sessionGeneration=0;
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
  owner=userId;client=db;reading=false;readPromise=null;error="";
 }
 function stop(){sessionGeneration++;owner="";client=null;reading=false;readPromise=null;error="";}
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
   const data=clone(snapshot());
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
   compare((data.printArchive.corrections||[]).filter(x=>x.confirmedAt),fcor,"flight correction");
   compare(data.endorsementV2Archive.batches||[],endors,"endorsement batch");
   compare(data.endorsementV2Archive.amendments||[],ecor,"endorsement addendum");
   data.printArchive.batches=flight;
   data.printArchive.corrections=[...(data.printArchive.corrections||[]).filter(x=>!x.confirmedAt),...fcor];
   data.endorsementV2Archive.batches=endors;
   data.endorsementV2Archive.amendments=ecor;
   commit(data);
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
 return Object.freeze({start,stop,refresh,confirmBatch,confirmAddendum,available,blockReason,error:()=>error});
});
