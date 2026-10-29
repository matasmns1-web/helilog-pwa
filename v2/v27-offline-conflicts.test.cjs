/* HeliLog V2.7 - offline edits and explicit ordinary-record conflicts
 * Run: node --test v2/v27-offline-conflicts.test.cjs
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"cloud-sync.js"),"utf8");
const USER="11111111-1111-4111-a111-111111111111";
const copy=x=>JSON.parse(JSON.stringify(x));
const tick=async()=>{for(let i=0;i<120;i++)await Promise.resolve()};
function server(){
 const rows=[];
 let writes=0;
 class Query{
  constructor(){this.op="read";this.filters={}}
  select(){return this}
  eq(k,v){this.filters[k]=v;return this}
  in(k,values){this.inFilter=[k,values];return this}
  range(){return this}
  order(){return this}
  insert(x){this.op="insert";this.val=x;return this}
  update(x){this.op="update";this.val=x;return this}
  delete(){this.op="delete";return this}
  async maybeSingle(){
   const matched=rows.filter(row=>this.match(row));
   return {data:matched[0]?copy(matched[0]):null,error:null};
  }
  match(row){return Object.entries(this.filters).every(([k,v])=>row[k]===v)&&
   (!this.inFilter||this.inFilter[1].includes(row[this.inFilter[0]]));}
  then(ok,bad){
   let data=[],error=null;
   if(this.op==="read")data=rows.filter(row=>this.match(row)).map(copy);
   else if(this.op==="insert"){
    if(rows.some(r=>r.owner_id===this.val.owner_id&&r.kind===this.val.kind&&r.record_id===this.val.record_id))
     error={code:"23505",message:"Duplicate"};
    else{rows.push({...copy(this.val),revision:1});writes++;data=[{revision:1}];}
   }else{
    const pos=rows.findIndex(r=>this.match(r));
    if(pos>=0){
     const row=rows[pos];
     if(this.op==="update")Object.assign(row,copy(this.val));
     else rows.splice(pos,1);
     writes++;data=[{revision:row.revision}];
    }
   }
   return Promise.resolve({data,error}).then(ok,bad);
  }
 }
 return {rows,get writes(){return writes},client:{from:()=>new Query()}};
}
function device(s,keep){
 const store=keep?.store||new Map();
 let data=keep?.data||{aircraft:[],flights:[]};
 let failBackup=false,archive=false;
 const root={navigator:{onLine:true},console:{warn(){},error(){}},
  localStorage:{
   getItem:k=>store.has(k)?store.get(k):null,
   setItem:(k,v)=>{if(failBackup&&k.startsWith("helilog_v27_conflict_backup_"))throw Error("No space for backup");store.set(k,String(v));}
  },
  HeliLogCloud:{snapshot:()=>({userId:USER})},
  isArchivedFlight:()=>archive,
  archivedFlightIdsForAircraft:()=>archive
 };
 root.window=root;
 const api=new Function("window","module",source+";return window.HeliLogV23Sync;")(root,undefined);
 api.start({userId:USER,client:s.client,getData:()=>data,replaceData:next=>{
  data=next;store.set("workspace",JSON.stringify(data));
 }});
 return {api,root,store,get data(){return data},
  failBackup(){failBackup=true},protected(){archive=true},
  restart(){api.stop();return device(s,{store,data});}};
}
async function conflict(){
 const s=server(),a=device(s),b=device(s);
 await a.api.refresh();
 a.data.aircraft.push({id:"a1",reg:"LY-START",icao:"G2CA"});
 a.api.track(a.data);await tick();await b.api.refresh();
 b.root.navigator.onLine=false;
 b.data.aircraft[0].reg="LY-OFFLINE";b.api.track(b.data);await tick();
 assert.equal(b.api.status().pending,1);
 a.data.aircraft[0].reg="LY-CLOUD";a.api.track(a.data);await tick();
 b.root.navigator.onLine=true;await b.api.refresh();
 assert.equal(b.api.status().state,"conflict");
 return {s,a,b};
}
test("offline edits remain queued and are transmitted after reconnect when uncontested",async()=>{
 const s=server(),a=device(s);await a.api.refresh();
 a.root.navigator.onLine=false;
 a.data.aircraft.push({id:"a1",reg:"LY-OFFLINE"});
 a.api.track(a.data);await tick();
 assert.equal(s.rows.length,0);
 assert.equal(a.api.status().pending,1);
 assert.ok(a.store.get("helilog_v23_queue_"+USER));
 const restored=a.restart();
 assert.equal(restored.api.status().pending,1);
 restored.root.navigator.onLine=true;
 await restored.api.refresh();await tick();
 assert.equal(s.rows[0].payload.reg,"LY-OFFLINE");
 assert.equal(restored.api.status().pending,0);
});
test("two-device conflict previews both copies without changing server or local record",async()=>{
 const {s,b}=await conflict();const writes=s.writes;
 const row=b.api.conflicts().find(x=>x.id==="a1");
 assert.equal(row.reviewable,true);
 const p=await b.api.previewRecordConflict("aircraft","a1");
 assert.equal(p.local.reg,"LY-OFFLINE");
 assert.equal(p.cloud.reg,"LY-CLOUD");
 assert.equal(s.writes,writes);
 assert.equal(b.data.aircraft[0].reg,"LY-OFFLINE");
});
test("choosing cloud keeps a verified backup and changes only reviewed item",async()=>{
 const {s,b}=await conflict(),writes=s.writes;
 await b.api.previewRecordConflict("aircraft","a1");
 const r=await b.api.resolveRecordConflict("cloud");
 assert.ok(b.store.get(r.backupKey));
 const backup=JSON.parse(b.store.get(r.backupKey));
 assert.equal(backup.workspace.aircraft[0].reg,"LY-OFFLINE");
 assert.equal(backup.cloudRow.payload.reg,"LY-CLOUD");
 assert.equal(b.data.aircraft[0].reg,"LY-CLOUD");
 assert.equal(s.writes,writes);
 await b.api.refresh();assert.equal(b.api.status().state,"synced");
});
test("choosing device rebases exactly one queued record onto cloud revision",async()=>{
 const {s,b}=await conflict();
 await b.api.previewRecordConflict("aircraft","a1");
 const r=await b.api.resolveRecordConflict("local");
 assert.ok(b.store.get(r.backupKey));
 assert.equal(s.rows[0].payload.reg,"LY-CLOUD");
 await b.api.refresh();await tick();
 assert.equal(s.rows[0].payload.reg,"LY-OFFLINE");
 assert.equal(s.rows[0].revision,3);
 assert.equal(b.api.status().pending,0);
});
test("stale review refuses both keep-device and use-cloud",async()=>{
 for(const choice of ["local","cloud"]){
  const {s,a,b}=await conflict();
  await b.api.previewRecordConflict("aircraft","a1");
  a.data.aircraft[0].reg="LY-NEWER";a.api.track(a.data);await tick();
  await assert.rejects(()=>b.api.resolveRecordConflict(choice),/changed since review/);
  assert.equal(s.rows[0].payload.reg,"LY-NEWER");
  assert.equal(b.data.aircraft[0].reg,"LY-OFFLINE");
 }
});
test("failed local safety backup blocks changes to both copies",async()=>{
 const {s,b}=await conflict();
 await b.api.previewRecordConflict("aircraft","a1");
 b.failBackup();const writes=s.writes;
 await assert.rejects(()=>b.api.resolveRecordConflict("cloud"),/No space for backup/);
 assert.equal(b.data.aircraft[0].reg,"LY-OFFLINE");
 assert.equal(s.writes,writes);
 assert.equal(b.api.status().pending,1);
});
test("archived records cannot be resolved through ordinary conflict controls",async()=>{
 const {b}=await conflict();
 b.protected();
 assert.equal(b.api.conflicts()[0].reviewable,false);
 await assert.rejects(()=>b.api.previewRecordConflict("aircraft","a1"),/protected archive recovery/);
});
test("V2.49: stale pending queue opens three-way review without uploading anything",async()=>{
 const {s,b}=await conflict(),writes=s.writes;
 b.data.aircraft[0].reg="LY-NOT-QUEUED";
 const preview=await b.api.previewRecordConflict("aircraft","a1");
 assert.equal(preview.local.reg,"LY-NOT-QUEUED");
 assert.equal(preview.queued.reg,"LY-OFFLINE");
 assert.equal(preview.cloud.reg,"LY-CLOUD");
 assert.equal(preview.queueDiverged,true);
 assert.equal(s.writes,writes);
 assert.equal(b.api.status().pending,1);
});
test("V2.49: keeping current device copy safely updates queued payload and sends only after explicit choice",async()=>{
 const {s,b}=await conflict(),writes=s.writes;
 b.data.aircraft[0].reg="LY-NOT-QUEUED";
 await b.api.previewRecordConflict("aircraft","a1");
 const result=await b.api.resolveRecordConflict("local");
 const backup=JSON.parse(b.store.get(result.backupKey));
 assert.equal(backup.workspace.aircraft[0].reg,"LY-NOT-QUEUED");
 assert.equal(backup.pending[0].payload.reg,"LY-OFFLINE");
 assert.equal(backup.cloudRow.payload.reg,"LY-CLOUD");
 assert.equal(s.writes,writes);
 const queue=JSON.parse(b.store.get("helilog_v23_queue_"+USER));
 assert.equal(queue[0].payload.reg,"LY-NOT-QUEUED");
 assert.equal(queue[0].baseRevision,2);
 await b.api.refresh();await tick();
 assert.equal(s.rows[0].payload.reg,"LY-NOT-QUEUED");
 assert.equal(b.api.status().state,"synced");
});
test("V2.49: choosing the older unsent copy safely restores it and syncs it only after approval",async()=>{
 const {s,b}=await conflict(),writes=s.writes;
 b.data.aircraft[0].reg="LY-NOT-QUEUED";
 await b.api.previewRecordConflict("aircraft","a1");
 const result=await b.api.resolveRecordConflict("queued");
 const backup=JSON.parse(b.store.get(result.backupKey));
 assert.equal(backup.workspace.aircraft[0].reg,"LY-NOT-QUEUED");
 assert.equal(backup.pending[0].payload.reg,"LY-OFFLINE");
 assert.equal(b.data.aircraft[0].reg,"LY-OFFLINE");
 assert.equal(s.writes,writes);
 await b.api.refresh();await tick();
 assert.equal(s.rows[0].payload.reg,"LY-OFFLINE");
 assert.equal(b.api.status().state,"synced");
});
test("V2.49: choosing cloud preserves both device copies, no upload",async()=>{
 const {s,b}=await conflict(),writes=s.writes;
 b.data.aircraft[0].reg="LY-NOT-QUEUED";
 await b.api.previewRecordConflict("aircraft","a1");
 const result=await b.api.resolveRecordConflict("cloud");
 const backup=JSON.parse(b.store.get(result.backupKey));
 assert.equal(backup.workspace.aircraft[0].reg,"LY-NOT-QUEUED");
 assert.equal(backup.pending[0].payload.reg,"LY-OFFLINE");
 assert.equal(b.data.aircraft[0].reg,"LY-CLOUD");
 assert.equal(s.writes,writes);
 await b.api.refresh();
 assert.equal(b.api.status().state,"synced");
});
test("V2.49: stale preview or missing verified backup never changes current, queued, or cloud data",async()=>{
 const {s,b}=await conflict(),writes=s.writes;
 b.data.aircraft[0].reg="LY-UNQUEUED";
 await b.api.previewRecordConflict("aircraft","a1");
 b.data.aircraft[0].reg="LY-CHANGED-AFTER-PREVIEW";
 await assert.rejects(()=>b.api.resolveRecordConflict("local"),/changed since review/);
 assert.equal(s.writes,writes);
 const current=await b.api.previewRecordConflict("aircraft","a1");
 assert.equal(current.local.reg,"LY-CHANGED-AFTER-PREVIEW");
 b.failBackup();
 await assert.rejects(()=>b.api.resolveRecordConflict("queued"),/No space for backup/);
 assert.equal(b.data.aircraft[0].reg,"LY-CHANGED-AFTER-PREVIEW");
 assert.equal(s.rows[0].payload.reg,"LY-CLOUD");
 const queue=JSON.parse(b.store.get("helilog_v23_queue_"+USER));
 assert.equal(queue[0].payload.reg,"LY-OFFLINE");
});
test("V2.49: queued choice is not offered when queue and current device already match",async()=>{
 const {b}=await conflict();
 const p=await b.api.previewRecordConflict("aircraft","a1");
 assert.equal(p.queueDiverged,false);
 assert.equal(p.queued,null);
 await assert.rejects(()=>b.api.resolveRecordConflict("queued"),/changed since review|Pending edits changed/);
});

test("adopting remote aircraft deletion cannot orphan local flights",async()=>{
 const {s,b}=await conflict();
 b.data.flights.push({id:"f-local",aid:"a1"});
 s.rows.splice(0,s.rows.length);
 await b.api.previewRecordConflict("aircraft","a1");
 await assert.rejects(()=>b.api.resolveRecordConflict("cloud"),/orphan existing local flights/);
 assert.equal(b.data.aircraft[0].reg,"LY-OFFLINE");
 assert.equal(b.data.flights[0].aid,"a1");
});

/* V2.39.1 — an interrupted queue write must not leave an unreviewable edit
 * or silently resurrect an unqueued deletion. */
async function previouslySyncedFlight(){
 const s=server(),a=device(s),b=device(s);
 await a.api.refresh();
 a.data.flights.push({id:"f1",date:"2026-10-27",mins:40,role:"PIC"});
 a.api.track(a.data);await tick();
 assert.equal(s.rows.length,1);
 await b.api.refresh();
 assert.equal(b.data.flights[0].mins,40);
 return {s,a,b};
}
test("unqueued flight edit creates reviewable conflict without uploading",async()=>{
 const {s,b}=await previouslySyncedFlight(),writes=s.writes;
 b.data.flights[0].mins=55;
 await b.api.refresh();
 assert.equal(b.api.status().state,"conflict");
 assert.equal(b.api.status().pending,1);
 assert.deepEqual(b.api.conflicts().map(x=>[x.kind,x.id,x.reviewable,x.unqueuedRecovery]),
  [["flight","f1",true,true]]);
 const review=await b.api.previewRecordConflict("flight","f1");
 assert.equal(review.local.mins,55);assert.equal(review.cloud.mins,40);
 assert.equal(s.writes,writes);
 await b.api.resolveRecordConflict("local");
 assert.equal(s.rows[0].payload.mins,40);
 await b.api.refresh();await tick();
 assert.equal(s.rows[0].payload.mins,55);
 assert.equal(b.api.status().state,"synced");
});
test("unqueued aircraft edit can be restored from cloud after a verified backup",async()=>{
 const s=server(),a=device(s),b=device(s);
 await a.api.refresh();a.data.aircraft.push({id:"a1",reg:"LY-ORIGINAL"});
 a.api.track(a.data);await tick();await b.api.refresh();
 b.data.aircraft[0].reg="LY-UNQUEUED";
 await b.api.refresh();
 assert.equal(b.api.conflicts()[0].reviewable,true);
 const p=await b.api.previewRecordConflict("aircraft","a1");
 assert.equal(p.local.reg,"LY-UNQUEUED");
 const result=await b.api.resolveRecordConflict("cloud");
 assert.ok(b.store.get(result.backupKey));
 assert.equal(b.data.aircraft[0].reg,"LY-ORIGINAL");
 assert.equal(s.rows[0].payload.reg,"LY-ORIGINAL");
 await b.api.refresh();assert.equal(b.api.status().state,"synced");
});
test("unqueued local flight deletion blocks silent resurrection and can be kept",async()=>{
 const {s,b}=await previouslySyncedFlight(),writes=s.writes;
 b.data.flights.splice(0,1);
 await b.api.refresh();
 assert.equal(b.api.status().state,"conflict");
 assert.equal(b.api.status().pending,1);
 assert.equal(b.data.flights.length,0);assert.equal(s.writes,writes);
 assert.equal(b.api.conflicts()[0].reviewable,true);
 const p=await b.api.previewRecordConflict("flight","f1");
 assert.equal(p.localDeleted,true);assert.equal(p.cloudDeleted,false);
 const result=await b.api.resolveRecordConflict("local");
 assert.ok(b.store.get(result.backupKey));
 await b.api.refresh();await tick();
 assert.equal(s.rows.length,0);assert.equal(b.data.flights.length,0);
 assert.equal(b.api.status().state,"synced");
});
test("unqueued local deletion can be explicitly reversed after review",async()=>{
 const {s,b}=await previouslySyncedFlight();
 b.data.flights.splice(0,1);await b.api.refresh();
 await b.api.previewRecordConflict("flight","f1");
 const r=await b.api.resolveRecordConflict("cloud");
 assert.ok(b.store.get(r.backupKey));
 assert.equal(b.data.flights[0].mins,40);
 assert.equal(s.rows[0].payload.mins,40);
 await b.api.refresh();assert.equal(b.api.status().state,"synced");
});
test("archived unqueued flight edit is preserved but not eligible for ordinary review",async()=>{
 const {s,b}=await previouslySyncedFlight(),writes=s.writes;
 b.protected();b.data.flights[0].mins=70;
 await b.api.refresh();
 assert.equal(b.api.status().state,"conflict");
 assert.equal(b.api.conflicts()[0].reviewable,false);
 await assert.rejects(()=>b.api.previewRecordConflict("flight","f1"),/protected archive recovery/);
 assert.equal(s.rows[0].payload.mins,40);assert.equal(s.writes,writes);
});
test("fresh device still imports unknown cloud records without false conflicts",async()=>{
 const {s}=await previouslySyncedFlight(),c=device(s);
 await c.api.refresh();
 assert.equal(c.api.status().state,"synced");
 assert.equal(c.api.status().pending,0);
 assert.equal(c.data.flights[0].mins,40);
});
