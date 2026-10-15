/* HeliLog V2.3 — initial, revision-checked aircraft/flight cloud sync.
 * Cloud workspace is isolated per authenticated Supabase UUID. Legacy local
 * V2.2 data is NEVER automatically imported. Only aircraft and flight rows
 * are included. Other records/print archives are deliberately local-only.
 * This is a TEST release. Offline login and automatic conflict resolution
 * are deferred; pending operations are persisted and never silently dropped.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV23Sync=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 const coreKinds=["aircraft","flight"];
 const extraKinds=["person","qualification","endorsement","settings"];
 let types=[...coreKinds],extended=false;
 const plural={aircraft:"aircraft",flight:"flights",person:"people",qualification:"qualifications",endorsement:"endorsements"};
 const settingNames=["pilot","broughtForward","broughtForwardByType","broughtForwardImported","broughtForwardImportedAt"];
 function items(data,kind){
  if(kind==="settings")return settingNames.map(name=>({id:name,data:clone(data?.[name]??(
   name==="pilot"?{}:name==="broughtForward"?{}:name==="broughtForwardByType"?[]:name==="broughtForwardImported"?false:""))}));
  return data?.[plural[kind]]||[];
 }
 function putItems(data,kind,arr){
  if(kind==="settings"){
   for(const item of arr){
    if(settingNames.includes(item.id))data[item.id]=clone(item.data);
   }
  }else data[plural[kind]]=arr;
 }
 let owner="",db=null,pending=[],versions={},mirror={},baseline={},state="inactive",problem="",
  running=false,paused=false,reconciling=false,pilotPreview=null,recordPreview=null,snapshotFn=null,replaceFn=null,listener=null;
 const clone=x=>JSON.parse(JSON.stringify(x));
 // PostgreSQL JSONB may reorder object keys. Compare canonical values,
 // otherwise harmless key ordering could produce false sync conflicts.
 const canonical=value=>JSON.stringify((function order(v){
  if(Array.isArray(v))return v.map(order);
  if(v&&typeof v==="object"){
   const out={};
   for(const k of Object.keys(v).sort())out[k]=order(v[k]);
   return out;
  }
  return v;
 })(value));
 const ident=(kind,id)=>kind+":"+id;
 const queueKey=u=>"helilog_v23_queue_"+u;
 const versionKey=u=>"helilog_v23_versions_"+u;
 const mirrorKey=u=>"helilog_v23_mirror_"+u;
 const recordKey=u=>"helilog_v23_account_"+u;
 const extKey=u=>"helilog_v24_ext_"+u;
 const savedPreMigration=u=>"helilog_v24_pre_extension_"+u;
 const read=(key,otherwise)=>{
  const raw=root.localStorage.getItem(key);
  if(raw===null)return otherwise;
  try{return JSON.parse(raw);}
  catch{throw Error("Cloud sync metadata is unreadable: "+key+". No pending changes were erased.");}
 };
 const persist=()=>{if(!owner)return;root.localStorage.setItem(queueKey(owner),JSON.stringify(pending));root.localStorage.setItem(versionKey(owner),JSON.stringify(versions));root.localStorage.setItem(mirrorKey(owner),JSON.stringify(mirror));};
 function notify(){try{listener?.(status());}catch(e){root.console?.warn?.("Cloud status view failed",e)}}
 function status(){
  return {state,pending:pending.length,conflicts:pending.filter(q=>q.conflict).length,error:problem,owner,online:root.navigator?.onLine!==false};
 }
 function isActive(){return !!owner&&!paused;}
 function mapOf(data){
  const m={};
  for(const kind of types)for(const r of items(data,kind)){
   if(r && typeof r.id==="string" && r.id.length && r.id.length<=120)m[ident(kind,r.id)]=canonical(r);
  }
  return m;
 }
 function parseKey(k){const i=k.indexOf(":");return {kind:k.slice(0,i),id:k.slice(i+1)};}
 function stop(){
  owner="";db=null;pending=[];versions={};mirror={};baseline={};state="inactive";problem="";extended=false;types=[...coreKinds];
  running=false;paused=true;reconciling=false;pilotPreview=null;recordPreview=null;snapshotFn=null;replaceFn=null;notify();
 }
 function start({userId,client,getData,replaceData,onStatus}){
  if(!/^[0-9a-f-]{36}$/i.test(String(userId)))throw Error("A verified Supabase user ID is required.");
  if(!client?.from||typeof getData!=="function"||typeof replaceData!=="function")throw Error("Cloud workspace configuration is incomplete.");
  if(owner&&owner!==userId)stop();
  owner=userId;db=client;snapshotFn=getData;replaceFn=replaceData;listener=onStatus||null;
  extended=read(extKey(owner),false)===true;
  types=extended?[...coreKinds,...extraKinds]:[...coreKinds];
  paused=false;running=false;reconciling=false;pilotPreview=null;recordPreview=null;pending=read(queueKey(owner),[]);
  versions=read(versionKey(owner),{});mirror=read(mirrorKey(owner),{});
  if(!Array.isArray(pending)||!versions||typeof versions!=="object"||Array.isArray(versions)||!mirror||typeof mirror!=="object"||Array.isArray(mirror))throw Error("Saved sync state is invalid. Preserve local data; do not reset.");
  if(pending.some(q=>![...coreKinds,...extraKinds].includes(q.kind)||typeof q.id!=="string"||!["put","delete"].includes(q.action)))throw Error("Saved sync queue contains invalid operations.");
  // An interrupted activation must not lose queued records, even if the
  // extension-enable marker was not durably committed yet.
  if(pending.some(q=>extraKinds.includes(q.kind))&&!extended){
   extended=true;types=[...coreKinds,...extraKinds];root.localStorage.setItem(extKey(owner),"true");
  }
  baseline=mapOf(snapshotFn());state=pending.length?"pending":"connecting";problem="";notify();
 }
 function track(data){
  if(!isActive()||!snapshotFn)return;
  const next=mapOf(data),keys=new Set([...Object.keys(baseline),...Object.keys(next)]);
  const changed=[...keys].filter(k=>baseline[k]!==next[k]);
  if(!changed.length)return;
  const old=clone(pending);
  const oldBaseline={...baseline};
  try{
   for(const k of changed){
    const {kind,id}=parseKey(k),value=next[k];
    const existing=pending.find(q=>q.kind===kind&&q.id===id);
    if(!value&&existing?.action==="put"&&existing.baseRevision===null){
     pending=pending.filter(q=>q!==existing);continue;
    }
    const action=value?"put":"delete";
    const payload=value?JSON.parse(value):null;
    if(existing){existing.action=action;existing.payload=payload;existing.generation=(existing.generation||0)+1;}
    else pending.push({kind,id,action,payload,baseRevision:Number.isInteger(versions[k])?versions[k]:null,generation:1});
   }
   baseline=next;persist();state="pending";problem="";notify();
   Promise.resolve().then(()=>flush());
  }catch(e){pending=old;baseline=oldBaseline;problem="Could not queue the change safely: "+e.message;state="error";notify();throw e;}
 }
 async function listRemote(sessionOwner){
  const all=[];
  let from=0;
  for(;;){
   const {data,error}=await db.from("helilog_records")
     .select("kind,record_id,payload,revision")
     .eq("owner_id",sessionOwner).in("kind",types)
     .order("record_id",{ascending:true}).order("kind",{ascending:true})
     .range(from,from+499);
   if(error)throw Error(error.message||"Unable to read your private cloud workspace");
   if(!isActive()||owner!==sessionOwner)return [];
   all.push(...(data||[]));
   if(!data||data.length<500)return all;
   from+=500;
   if(from>=50000)throw Error("Cloud workspace is too large to load safely.");
  }
 }
 async function pull(){
  if(!isActive()||running||reconciling)return false;
  if(root.navigator?.onLine===false){state="offline";notify();return false;}
  if(root.HeliLogCloud?.snapshot?.().userId!==owner){state="error";problem="Your cloud session has changed. Sign in again.";notify();return false;}
  const sessionOwner=owner;
  try{
   const remote=await listRemote(sessionOwner);
   if(!isActive()||owner!==sessionOwner||reconciling)return false;
   const rmap=new Map(remote.map(row=>[ident(row.kind,row.record_id),row]));
   // Recover an upload committed by the server when the device lost its
   // response (e.g. network changed just before the acknowledgement).
   for(const q of [...pending]){
    const k=ident(q.kind,q.id),row=rmap.get(k);
    const ackPut=q.action==="put"&&row&&canonical(row.payload)===canonical(q.payload)
      &&(q.baseRevision===null||row.revision===q.baseRevision+1);
    const ackDelete=q.action==="delete"&&!row;
    if(ackPut||ackDelete){
     pending=pending.filter(x=>x!==q);
     if(ackPut){versions[k]=row.revision;mirror[k]=canonical(row.payload);}
     else{delete versions[k];delete mirror[k];}
    }
   }
   const local=clone(snapshotFn());
   const pendingKeys=new Set(pending.map(q=>ident(q.kind,q.id)));
   // Recover an account-local entry that was saved before its queue write
   // completed (e.g. a quota/interruption). Never declare it cloud-synced.
   for(const kind of types)for(const entry of items(local,kind)){
    const k=ident(kind,String(entry.id));
    if(!rmap.has(k)&&!pendingKeys.has(k)&&versions[k]===undefined&&entry.id){
     pending.push({kind,id:String(entry.id),action:"put",payload:clone(entry),
       baseRevision:null,generation:1});
     pendingKeys.add(k);
    }
   }
   let changed=false,conflicts=0;
   for(const kind of types){
    const arr=items(local,kind);
    const byId=new Map(arr.map(x=>[String(x.id),x]));
    for(const [k,row] of rmap){
     if(row.kind!==kind)continue;
     if(pendingKeys.has(k)){
      const q=pending.find(x=>ident(x.kind,x.id)===k);
      if(q.baseRevision!==null&&q.baseRevision!==row.revision){q.conflict=true;conflicts++;}
      continue;
     }
     const current=byId.get(row.record_id);
     const localValue=current===undefined?null:canonical(current);
     const original=mirror[k];
     // Cross-device safety: compare against the LAST VERIFIED CLOUD COPY,
     // not today's startup snapshot (which could contain unsent local edits).
     if(current && (original===undefined?
         (versions[k]!==undefined?localValue!==canonical(row.payload):true):
         localValue!==original)){
      problem="A local record differs from the last verified cloud copy: "+k+". Nothing was overwritten.";
      state="conflict";notify();return false;
     }
     if(!current||canonical(current)!==canonical(row.payload)){
      byId.set(row.record_id,clone(row.payload));changed=true;
     }
     versions[k]=row.revision;mirror[k]=canonical(row.payload);
    }
    for(const entry of arr){
     const k=ident(kind,String(entry.id));
     if(!rmap.has(k)&&!pendingKeys.has(k)&&Number.isInteger(versions[k])){
      if(mirror[k]!==canonical(entry)){
       state="conflict";problem="A locally changed record was removed remotely: "+k+". No changes were discarded.";notify();return false;
      }
      byId.delete(String(entry.id));delete versions[k];delete mirror[k];changed=true;
     }
    }
    putItems(local,kind,[...byId.values()]);
   }
   if(changed){replaceFn(local);baseline=mapOf(snapshotFn());}
   persist();
   if(conflicts){state="conflict";problem="Some changes were also edited on another device. Neither version was overwritten.";}
   else{state=pending.length?"pending":"synced";problem="";}
   notify();return true;
  }catch(e){problem=String(e.message||e);state=root.navigator?.onLine===false?"offline":"error";notify();return false;}
 }
 async function flush(){
  if(!isActive()||running||reconciling)return false;
  if(root.navigator?.onLine===false){state="offline";notify();return false;}
  if(root.HeliLogCloud?.snapshot?.().userId!==owner){state="error";problem="Sign in again before syncing.";notify();return false;}
  running=true;state=pending.length?"syncing":"connecting";problem="";notify();
  try{
   while(pending.length){
    if(!isActive())return false;
    const q=[...pending].filter(x=>!x.conflict).sort((a,b)=>{
      const rank=x=>x.action==="delete"?(x.kind==="flight"?0:1):(x.kind==="aircraft"?0:1);
      return rank(a)-rank(b);
    })[0];
    if(!q)break;
    const k=ident(q.kind,q.id),generation=q.generation,ownerAtStart=owner;
    let result;
    if(q.baseRevision===null){
     if(q.action==="delete"){pending=pending.filter(x=>x!==q);persist();continue;}
     result=await db.from("helilog_records")
      .insert({owner_id:owner,kind:q.kind,record_id:q.id,payload:q.payload})
      .select("revision");
    }else{
     const query=db.from("helilog_records");
     result=q.action==="delete"?
      await query.delete().eq("owner_id",owner).eq("kind",q.kind).eq("record_id",q.id).eq("revision",q.baseRevision).select("revision"):
      await query.update({payload:q.payload,revision:q.baseRevision+1})
       .eq("owner_id",owner).eq("kind",q.kind).eq("record_id",q.id).eq("revision",q.baseRevision).select("revision");
    }
    if(!isActive()||owner!==ownerAtStart)return false;
    if(result.error){
     if(result.error.code==="23505" || result.error.code==="23503"){
      q.conflict=true;state="conflict";problem="Cloud record conflict for "+k+". Local changes were preserved.";persist();notify();continue;
     }
     throw Error("Sync "+k+": "+result.error.message);
    }
    if(!result.data||result.data.length!==1){
     q.conflict=true;state="conflict";problem="Cloud version changed for "+k+". Local changes were preserved.";persist();notify();continue;
    }
    const next=Number(result.data[0].revision),still=pending.find(x=>x.kind===q.kind&&x.id===q.id);
    if(still===q && still.generation===generation){
     pending=pending.filter(x=>x!==q);
     if(q.action==="delete"){delete versions[k];delete mirror[k];}
     else{versions[k]=next;mirror[k]=canonical(q.payload);}
    }else if(still===q){q.baseRevision=q.action==="delete"?null:next;q.conflict=false;}
    persist();notify();
   }
   state=pending.some(x=>x.conflict)?"conflict":"synced";
   if(state==="synced")problem="";notify();
  }catch(e){problem=e.message||String(e);state=root.navigator?.onLine===false?"offline":"error";notify();}
  finally{running=false;}
  if(isActive()&&state==="synced")await pull();
  return state==="synced";
 }
 async function refresh(){
  if(!isActive())return false;
  const completed=await pull();
  if(!completed||state==="conflict")return false;
  if(pending.length)return flush();
  return state==="synced";
 }

 // V2.7: user-reviewed conflicts for ordinary records only. Signed endorsements,
 // archived flights and pilot settings keep their existing protected workflows.
 const reviewableKinds=["aircraft","flight","person","qualification"];
 function conflicts(){
  return pending.filter(q=>q.conflict).map(q=>({
   kind:q.kind,id:q.id,action:q.action,
   reviewable:reviewableKinds.includes(q.kind) && !isProtectedRecord(q.kind,q.id),
   note:q.kind==="endorsement"?"Signed endorsements need archive-safe recovery.":
    q.kind==="settings"?"Use the separate pilot-profile workflow or preserve both copies for support.":
    isProtectedRecord(q.kind,q.id)?"Archived records require a separate integrity review.":""
  }));
 }
 function isProtectedRecord(kind,id){
  if(kind==="endorsement"||kind==="settings")return true;
  if(kind==="flight" && typeof root.isArchivedFlight==="function")return !!root.isArchivedFlight(id);
  if(kind==="aircraft" && typeof root.archivedFlightIdsForAircraft==="function")
   return !!root.archivedFlightIdsForAircraft(id);
  return false;
 }
 function conflictQueueEntry(kind,id){
  return pending.find(q=>q.kind===kind&&q.id===id&&q.conflict===true);
 }
 function requireRecordReview(kind,id){
  if(!isActive()||root.HeliLogCloud?.snapshot?.().userId!==owner)
   throw Error("Sign in to the correct HeliLog account.");
  if(root.navigator?.onLine===false)throw Error("Reconnect to review both record copies.");
  if(running||reconciling)throw Error("Wait until synchronization finishes.");
  if(!reviewableKinds.includes(kind)||isProtectedRecord(kind,id))
   throw Error("This record cannot be resolved here. Preserve both copies and use protected archive recovery.");
  const q=conflictQueueEntry(kind,id);
  if(!q)throw Error("No pending conflict remains for this record. Check sync again.");
  return q;
 }
 async function remoteRecord(kind,id){
  const result=await db.from("helilog_records")
   .select("kind,record_id,revision,payload")
   .eq("owner_id",owner).eq("kind",kind).eq("record_id",id).maybeSingle();
  if(result.error)throw Error("Cloud record could not be read: "+result.error.message);
  if(result.data&&(!Number.isInteger(Number(result.data.revision))||
    result.data.kind!==kind||result.data.record_id!==id))
   throw Error("Cloud record response was invalid. Both copies remain unchanged.");
  return result.data?clone(result.data):null;
 }
 function localRecord(data,kind,id){
  return items(data,kind).find(x=>String(x.id)===id)??null;
 }
 async function previewRecordConflict(kind,id){
  const q=requireRecordReview(kind,id),sessionOwner=owner;
  const generation=q.generation,action=q.action;
  const row=await remoteRecord(kind,id);
  if(!isActive()||owner!==sessionOwner||root.HeliLogCloud?.snapshot?.().userId!==owner)
   throw Error("Account changed during conflict review.");
  if(conflictQueueEntry(kind,id)!==q ||q.generation!==generation)
   throw Error("Local record changed; restart the review.");
  const local=localRecord(snapshotFn(),kind,id);
  if((action==="delete")!== (local===null))
   throw Error("Local queue differs from the saved record. Preserve data and restart review.");
  recordPreview={owner,kind,id,generation,action,
   localHash:canonical(local),remoteHash:canonical(row),
   cloudRevision:row?Number(row.revision):null};
  return {kind,id,local:clone(local),cloud:row?clone(row.payload):null,
   localDeleted:local===null,cloudDeleted:row===null,
   cloudRevision:recordPreview.cloudRevision};
 }
 async function resolveRecordConflict(choice){
  if(!["local","cloud"].includes(choice))throw Error("Choose device or cloud copy.");
  if(!recordPreview)throw Error("Review both copies before resolving.");
  const reviewed=recordPreview;
  const q=requireRecordReview(reviewed.kind,reviewed.id);
  if(reviewed.owner!==owner||q.generation!==reviewed.generation||q.action!==reviewed.action)
   throw Error("Pending edits changed since review. Review both copies again.");
  reconciling=true;
  const sessionOwner=owner;
  try{
   const row=await remoteRecord(reviewed.kind,reviewed.id);
   if(!isActive()||owner!==sessionOwner||root.HeliLogCloud?.snapshot?.().userId!==owner)
    throw Error("Cloud account changed. No data was modified.");
   const before=clone(snapshotFn()),local=localRecord(before,reviewed.kind,reviewed.id);
   if(canonical(row)!==reviewed.remoteHash||canonical(local)!==reviewed.localHash||
      q.generation!==reviewed.generation||!q.conflict)
    throw Error("One of the records changed since review. Review again; nothing was overwritten.");
   if(isProtectedRecord(reviewed.kind,reviewed.id))
    throw Error("Record was archived during review. Preserve both copies.");
   const backupKey="helilog_v27_conflict_backup_"+owner+"_"+Date.now()+"_"+reviewed.kind+"_"+reviewed.id;
   if(root.localStorage.getItem(backupKey)!==null)
    throw Error("A backup with that identifier already exists. Try again without deleting it.");
   const backup=JSON.stringify({reason:"V2.7 manual conflict review",
    createdAt:new Date().toISOString(),choice,
    workspace:before,cloudRow:row,
    pending:clone(pending),versions:clone(versions),mirror:clone(mirror)});
   root.localStorage.setItem(backupKey,backup);
   if(root.localStorage.getItem(backupKey)!==backup)
    throw Error("Safety backup verification failed. No data was changed.");
   const previous={versions:{...versions},mirror:{...mirror},
    baseline:{...baseline},pending:clone(pending)};
   const k=ident(reviewed.kind,reviewed.id);
   try{
    if(row){versions[k]=Number(row.revision);mirror[k]=canonical(row.payload);}
    else{delete versions[k];delete mirror[k];}
    if(choice==="cloud"){
     const next=clone(before);
     const records=items(next,reviewed.kind).filter(x=>String(x.id)!==reviewed.id);
     if(row)records.push(clone(row.payload));
     putItems(next,reviewed.kind,records);
     replaceFn(next); // Account cache is written atomically by the host.
     pending=pending.filter(entry=>entry!==q);
    }else{
     // Rebase ONLY the reviewed item against the version that was just checked.
     // The next cloud write still uses revision-based compare-and-swap.
     q.baseRevision=row?Number(row.revision):null;
     q.conflict=false;
    }
    baseline=mapOf(snapshotFn());
    persist();
    recordPreview=null;
    state=pending.some(x=>x.conflict)?"conflict":pending.length?"pending":"connecting";
    problem=state==="conflict"?"Other sync conflicts still need review.":"";
    notify();
   }catch(e){
    versions=previous.versions;mirror=previous.mirror;
    baseline=previous.baseline;pending=previous.pending;
    if(choice==="cloud")try{replaceFn(before);}catch(rollbackError){
     root.console?.error?.("Could not restore local workspace after failed resolution",rollbackError);
    }
    state="error";
    problem="Recovery interrupted; the independent local safety copy was retained.";
    notify();throw e;
   }
   return {choice,kind:reviewed.kind,id:reviewed.id,backupKey,pending:pending.length};
  }finally{reconciling=false;}
 }

 function requirePilotConflict(){
  if(!isActive()||!extended||root.HeliLogCloud?.snapshot?.().userId!==owner)
   throw Error("Sign in to your original HeliLog account first.");
  if(root.navigator?.onLine===false)throw Error("Connect to the internet before reviewing your pilot profile.");
  if(running||reconciling)throw Error("Wait for the current synchronization to finish.");
  if(state!=="conflict"||!problem.includes("settings:pilot"))
   throw Error("The pilot-profile conflict is no longer current. Check cloud sync.");
  if(pending.some(q=>q.kind==="settings"&&q.id==="pilot"))
   throw Error("There is already a pending pilot-profile edit. Do not overwrite it; preserve the device and contact support.");
 }
 async function getRemotePilot(){
  const result=await db.from("helilog_records")
   .select("kind,record_id,revision,payload")
   .eq("owner_id",owner).eq("kind","settings").eq("record_id","pilot").maybeSingle();
  if(result.error)throw Error("Cloud profile could not be read: "+result.error.message);
  if(!result.data||result.data.payload?.id!=="pilot"||
     typeof result.data.payload.data!=="object"||result.data.payload.data===null||
     !Number.isInteger(Number(result.data.revision)))
   throw Error("The cloud pilot profile is missing or incomplete. No local changes were made.");
  return result.data;
 }
 async function previewPilotConflict(){
  requirePilotConflict();
  const sessionOwner=owner;
  const row=await getRemotePilot();
  if(owner!==sessionOwner||!isActive())throw Error("Your cloud account changed; restart the review.");
  const local=clone(snapshotFn().pilot||{});
  const remote=clone(row.payload.data);
  pilotPreview={owner:sessionOwner,
    localHash:canonical(local),remoteHash:canonical(row.payload),
    remoteRevision:Number(row.revision)};
  return {local,cloud:remote,matching:canonical(local)===canonical(remote),
   cloudRevision:pilotPreview.remoteRevision};
 }
 async function resolvePilotConflict(choice){
  requirePilotConflict();
  if(!["local","cloud"].includes(choice))throw Error("Choose the web device or cloud profile.");
  if(!pilotPreview||pilotPreview.owner!==owner)
   throw Error("Review both versions before choosing one.");
  // Prevent refresh and upload from racing with an explicit decision.
  reconciling=true;
  let ownerAtStart=owner;
  try{
   const row=await getRemotePilot();
   if(owner!==ownerAtStart||!isActive()||root.HeliLogCloud?.snapshot?.().userId!==ownerAtStart)
    throw Error("Cloud account changed. No data was modified.");
   if(canonical(snapshotFn().pilot||{})!==pilotPreview.localHash||
     canonical(row.payload)!==pilotPreview.remoteHash||
     Number(row.revision)!==pilotPreview.remoteRevision)
    throw Error("Either the web or cloud profile changed since review. Review both versions again.");
   const current=clone(snapshotFn());
   // Fail CLOSED if the device cannot save an independent safety copy.
   const backupKey="helilog_v24_pilot_conflict_backup_"+owner+"_"+Date.now();
   root.localStorage.setItem(backupKey,JSON.stringify({
    reason:"V2.4 explicit pilot conflict resolution",
    chosen:choice,createdAt:new Date().toISOString(),
    localWorkspace:current,cloudPilot:clone(row.payload.data),
    cloudRevision:Number(row.revision)
   }));
   if(!root.localStorage.getItem(backupKey))
    throw Error("Safety backup could not be verified. No data was changed.");
   const key=ident("settings","pilot");
   const oldVersions={...versions},oldMirror={...mirror},oldBaseline={...baseline};
   const oldPending=clone(pending);
   try{
    versions[key]=Number(row.revision);
    mirror[key]=canonical(row.payload);
    if(choice==="cloud"){
     const next=clone(current);
     next.pilot=clone(row.payload.data);
     // The caller writes the whole workspace atomically to localStorage.
     replaceFn(next);
    }else{
     pending.push({kind:"settings",id:"pilot",action:"put",
       payload:{id:"pilot",data:clone(current.pilot)},
       baseRevision:Number(row.revision),generation:1});
    }
    baseline=mapOf(snapshotFn());
    persist();
    state=choice==="local"?"pending":"connecting";
    problem="";pilotPreview=null;notify();
   }catch(e){
    versions=oldVersions;mirror=oldMirror;baseline=oldBaseline;pending=oldPending;
    if(choice==="cloud"){
     try{replaceFn(current);}catch(rollbackError){
      root.console?.error?.("Could not roll back the local profile change",rollbackError);
     }
    }
    // Local storage writes are not atomic across separate keys; the complete
    // preserved copy remains available under the separate safety-backup key.
    state="error";problem="Resolution interrupted. Your pre-change test data was backed up locally.";
    notify();
    throw e;
   }
   return {choice,backupKey,pending:pending.length};
  }finally{
   reconciling=false;
  }
 }
  function ignoreNoChanges(){if(isActive())baseline=mapOf(snapshotFn());}
 async function extensionPreview(){
  if(!isActive())throw Error("Sign in first.");
  if(root.navigator?.onLine===false)throw Error("Connect to the internet to initialize extended synchronization.");
  const old=[...types];types=[...coreKinds,...extraKinds];
  try{
   const remote=await listRemote(owner);
   const extras=remote.filter(r=>extraKinds.includes(r.kind));
   return {remoteRecords:extras.length,
     localRecords:extraKinds.reduce((n,k)=>n+items(snapshotFn(),k).length,0),
     hasCloud:extras.length>0,enabled:extended};
  }finally{types=old;}
 }
 async function activateExtension(mode){
  if(!isActive())throw Error("Sign in first.");
  if(extended)return {enabled:true,alreadyEnabled:true};
  if(!["upload","cloud"].includes(mode))throw Error("Choose this device or existing cloud data.");
  if(root.navigator?.onLine===false)throw Error("Connect to the internet first.");
  const before=snapshotFn(),preview=await extensionPreview();
  if(mode==="upload"&&preview.hasCloud)
    throw Error("This account already has extended cloud records. Choose existing cloud data on this device to avoid overwriting another device.");
  if(mode==="cloud"&&!preview.hasCloud)
    throw Error("No extended records exist in the cloud yet. Upload a primary device first.");
  // A durable safety snapshot is created BEFORE switching mode or replacing.
  const backupKey=savedPreMigration(owner);
  if(root.localStorage.getItem(backupKey)===null)
   root.localStorage.setItem(backupKey,JSON.stringify(before));
  if(mode==="cloud"&&preview.hasCloud){
   const previousKinds=types;
   types=[...coreKinds,...extraKinds];
   let r;
   try{r=await listRemote(owner);}
   finally{types=previousKinds;}
   const next=clone(before);
   for(const kind of extraKinds){
    const records=r.filter(row=>row.kind===kind);
    const fromCloud=records.map(row=>clone(row.payload));
    if(kind==="settings"){
     for(const item of fromCloud)if(settingNames.includes(item.id))next[item.id]=clone(item.data);
    }else next[plural[kind]]=fromCloud;
    for(const row of records){
     const k=ident(row.kind,row.record_id);
     versions[k]=row.revision;mirror[k]=canonical(row.payload);
    }
   }
   replaceFn(next);
  }
  extended=true;types=[...coreKinds,...extraKinds];
  root.localStorage.setItem(extKey(owner),"true");
  baseline=mapOf(snapshotFn());
  if(mode==="upload"){
   for(const kind of extraKinds)for(const item of items(snapshotFn(),kind)){
    const k=ident(kind,String(item.id));
    pending.push({kind,id:String(item.id),action:"put",payload:clone(item),
      baseRevision:null,generation:1});
   }
   persist();state="pending";notify();
   await flush();
  }else await refresh();
  return {enabled:true,status:status(),backupKey};
 }
 return Object.freeze({recordKey,start,stop,track,refresh,flush,pull,status,ignoreNoChanges,
  extended:()=>extended,extensionPreview,activateExtension,
  previewPilotConflict,resolvePilotConflict,conflicts,previewRecordConflict,resolveRecordConflict});
});
