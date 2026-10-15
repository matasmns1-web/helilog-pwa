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
 const types=["aircraft","flight"],plural={aircraft:"aircraft",flight:"flights"};
 let owner="",db=null,pending=[],versions={},mirror={},baseline={},state="inactive",problem="",
  running=false,paused=false,snapshotFn=null,replaceFn=null,listener=null;
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
  for(const kind of types)for(const r of (data?.[plural[kind]]||[])){
   if(r && typeof r.id==="string" && r.id.length && r.id.length<=120)m[ident(kind,r.id)]=canonical(r);
  }
  return m;
 }
 function parseKey(k){const i=k.indexOf(":");return {kind:k.slice(0,i),id:k.slice(i+1)};}
 function stop(){
  owner="";db=null;pending=[];versions={};mirror={};baseline={};state="inactive";problem="";
  running=false;paused=true;snapshotFn=null;replaceFn=null;notify();
 }
 function start({userId,client,getData,replaceData,onStatus}){
  if(!/^[0-9a-f-]{36}$/i.test(String(userId)))throw Error("A verified Supabase user ID is required.");
  if(!client?.from||typeof getData!=="function"||typeof replaceData!=="function")throw Error("Cloud workspace configuration is incomplete.");
  if(owner&&owner!==userId)stop();
  owner=userId;db=client;snapshotFn=getData;replaceFn=replaceData;listener=onStatus||null;
  paused=false;running=false;pending=read(queueKey(owner),[]);
  versions=read(versionKey(owner),{});mirror=read(mirrorKey(owner),{});
  if(!Array.isArray(pending)||!versions||typeof versions!=="object"||Array.isArray(versions)||!mirror||typeof mirror!=="object"||Array.isArray(mirror))throw Error("Saved sync state is invalid. Preserve local data; do not reset.");
  if(pending.some(q=>!types.includes(q.kind)||typeof q.id!=="string"||!["put","delete"].includes(q.action)))throw Error("Saved sync queue contains invalid operations.");
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
  if(!isActive()||running)return false;
  if(root.navigator?.onLine===false){state="offline";notify();return false;}
  if(root.HeliLogCloud?.snapshot?.().userId!==owner){state="error";problem="Your cloud session has changed. Sign in again.";notify();return false;}
  const sessionOwner=owner;
  try{
   const remote=await listRemote(sessionOwner);
   if(!isActive()||owner!==sessionOwner)return false;
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
   for(const kind of types)for(const entry of (local[plural[kind]]||[])){
    const k=ident(kind,String(entry.id));
    if(!rmap.has(k)&&!pendingKeys.has(k)&&versions[k]===undefined&&entry.id){
     pending.push({kind,id:String(entry.id),action:"put",payload:clone(entry),
       baseRevision:null,generation:1});
     pendingKeys.add(k);
    }
   }
   let changed=false,conflicts=0;
   for(const kind of types){
    const key=plural[kind],arr=local[key]||[];
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
    local[key]=[...byId.values()];
   }
   if(changed){replaceFn(local);baseline=mapOf(snapshotFn());}
   persist();
   if(conflicts){state="conflict";problem="Some changes were also edited on another device. Neither version was overwritten.";}
   else{state=pending.length?"pending":"synced";problem="";}
   notify();return true;
  }catch(e){problem=String(e.message||e);state=root.navigator?.onLine===false?"offline":"error";notify();return false;}
 }
 async function flush(){
  if(!isActive()||running)return false;
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
 function ignoreNoChanges(){if(isActive())baseline=mapOf(snapshotFn());}
 return Object.freeze({recordKey,start,stop,track,refresh,flush,pull,status,ignoreNoChanges});
});
