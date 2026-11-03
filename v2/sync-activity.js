/* HeliLog V2.52 TEST — bounded, private, best-effort sync activity history.
 * Never logs account/profile/flight IDs, raw errors, record payloads or signatures.
 * Independent of the critical flight sync queue: failures cannot block a flight.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogSyncActivity=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 const TABLE="helilog_sync_activity",PREFIX="helilog_v252_activity_";
 const VALID_STATES=new Set(["synced","pending","conflict","error","offline","reset_required"]);
 const TYPE_BY_STATE={synced:"sync_ok",pending:"changes_pending",conflict:"conflict_detected",
  error:"sync_error",offline:"offline",reset_required:"reset_review_required"};
 const VALID_TYPES=new Set(Object.values(TYPE_BY_STATE).concat("sync_recovered"));
 const VALID_DEVICES=new Set(["iPad","iPhone","Android","Desktop","Other"]);
 const MAX_LOCAL=60,MAX_REMOTE=30,MIN_SEND_INTERVAL=15000;
 let owner="",db=null,entries=[],enabled=true,busy=false,lastAttempt=0,epoch=0,signature="";
 const store=(suffix,u)=>PREFIX+suffix+"_"+u;
 const clamp=v=>Number.isFinite(Number(v))?Math.max(0,Math.min(9999,Math.trunc(Number(v)))):0;
 const date=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
 const device=()=>{
  const ua=String(root.navigator?.userAgent||"");
  if(/iPad/i.test(ua)||(/Macintosh/i.test(ua)&&Number(root.navigator?.maxTouchPoints)>1))return "iPad";
  if(/iPhone|iPod/i.test(ua))return "iPhone";
  if(/Android/i.test(ua))return "Android";
  if(/Windows|Macintosh|Linux/i.test(ua))return "Desktop";
  return "Other";
 };
 function uuid(){
  if(typeof root.crypto?.randomUUID==="function")return root.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
   const r=Math.floor(Math.random()*16);
   return (c==="x"?r:(r&3|8)).toString(16);
  });
 }
 function clean(raw){
  if(!raw||typeof raw!=="object"||!VALID_STATES.has(raw.state)||!VALID_TYPES.has(raw.event_type)||
     !VALID_DEVICES.has(raw.device_kind)||!/^[0-9a-f-]{36}$/i.test(String(raw.event_id)))return null;
  const at=date(raw.recorded_at);
  if(!at)return null;
  return {event_id:raw.event_id,recorded_at:at,state:raw.state,
   event_type:raw.event_type,device_kind:raw.device_kind,
   pending_count:clamp(raw.pending_count),conflict_count:clamp(raw.conflict_count),
   uploaded:raw.uploaded===true};
 }
 function readSaved(u){
  try{
   const list=JSON.parse(root.localStorage?.getItem(store("events",u))||"[]");
   return Array.isArray(list)?list.map(clean).filter(Boolean).slice(-MAX_LOCAL):[];
  }catch{return [];}
 }
 function save(){
  if(!owner)return;
  try{root.localStorage?.setItem(store("events",owner),JSON.stringify(entries.slice(-MAX_LOCAL)));}
  catch(_error){} // Never break cloud sync because a storage quota is full.
 }
 function start(args){
  const u=String(args?.userId||"");
  if(!/^[0-9a-f-]{36}$/i.test(u)||!args?.client?.from)throw Error("Signed-in diagnostics require a valid cloud client.");
  if(owner!==u){epoch++;entries=readSaved(u);signature=entries.length?
    [entries[entries.length-1].state,entries[entries.length-1].pending_count,entries[entries.length-1].conflict_count].join("|"):"";
  }
  owner=u;db=args.client;busy=false;lastAttempt=0;
  try{enabled=root.localStorage?.getItem(store("enabled",u))!=="false";}catch{enabled=true;}
 }
 function stop(){epoch++;owner="";db=null;entries=[];signature="";busy=false;lastAttempt=0;enabled=true;}
 function isEnabled(){return !!owner&&enabled;}
 function setEnabled(value){
  if(!owner)return false;
  enabled=!!value;
  try{root.localStorage?.setItem(store("enabled",owner),enabled?"true":"false");}catch(_error){}
  if(enabled)void upload();
  return enabled;
 }
 function local(){return owner?entries.slice().reverse().map(x=>({...x})):[];}
 function observe(st){
  if(!owner||!st||st.owner!==owner)return;
  if(!enabled)return;
  const state=String(st.state||"");
  if(!VALID_STATES.has(state))return;
  const p=clamp(st.pending),c=clamp(st.conflicts),sig=[state,p,c].join("|");
  if(sig!==signature){
   const previous=entries.length?entries[entries.length-1].state:null;
   const event_type=state==="synced"&&["error","offline","conflict","reset_required"].includes(previous)
    ?"sync_recovered":TYPE_BY_STATE[state];
   entries.push({event_id:uuid(),recorded_at:new Date().toISOString(),state,event_type,
    pending_count:p,conflict_count:c,device_kind:device(),uploaded:false});
   entries=entries.slice(-MAX_LOCAL);
   signature=sig;save();
  }
  if(st.online!==false)void upload();
 }
 async function upload(){
  if(!owner||!enabled||busy||!db||root.navigator?.onLine===false)return false;
  const now=Date.now();
  if(now-lastAttempt<MIN_SEND_INTERVAL)return false;
  const item=entries.find(x=>!x.uploaded);
  if(!item)return false;
  const account=owner,revision=epoch;
  lastAttempt=now;busy=true;
  try{
   const {error}=await db.from(TABLE).insert({
    owner_id:account,event_id:item.event_id,recorded_at:item.recorded_at,
    state:item.state,event_type:item.event_type,pending_count:item.pending_count,
    conflict_count:item.conflict_count,device_kind:item.device_kind
   });
   if(account!==owner||revision!==epoch)return false;
   // Duplicate event IDs can occur after a server commit whose response was lost.
   // Treat them as acknowledged, never spin on retries.
   if(!error||error.code==="23505"){
    const found=entries.find(x=>x.event_id===item.event_id);
    if(found)found.uploaded=true;
    save();return true;
   }
  }catch(_error){} // Quietly keep local diagnostics for the next status change.
  finally{if(account===owner&&revision===epoch)busy=false;}
  return false;
 }
 async function recent(){
  const own=owner,revision=epoch,localRows=local();
  if(!own||!enabled||!db||root.navigator?.onLine===false)
   return {events:localRows.slice(0,MAX_REMOTE),cloudAvailable:false};
  try{
   const {data,error}=await db.from(TABLE)
    .select("event_id,recorded_at,state,event_type,pending_count,conflict_count,device_kind")
    .eq("owner_id",own).order("recorded_at",{ascending:false}).limit(MAX_REMOTE);
   if(owner!==own||epoch!==revision)return {events:[],cloudAvailable:false};
   if(error)return {events:localRows.slice(0,MAX_REMOTE),cloudAvailable:false};
   const byId=new Map();
   for(const row of (Array.isArray(data)?data:[]).map(clean).filter(Boolean))
    byId.set(row.event_id,row);
   for(const row of localRows)if(!byId.has(row.event_id))byId.set(row.event_id,row);
   const events=[...byId.values()].sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at)).slice(0,MAX_REMOTE);
   return {events,cloudAvailable:true};
  }catch{return {events:localRows.slice(0,MAX_REMOTE),cloudAvailable:false};}
 }
 return Object.freeze({start,stop,observe,local,recent,isEnabled,setEnabled,upload});
});