/* V2.28.4 — device-local unqueued person conflict recovery, with no automatic overwrite. */
"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,p),"utf8");
const code=read("cloud-sync.js"),gate=read("auth-gate.js"),view=read("cloud-view.js");
const uid="11111111-1111-4111-a111-111111111111",copy=x=>JSON.parse(JSON.stringify(x));
const tick=async()=>{for(let i=0;i<150;i++)await Promise.resolve()};
function backend(){
 const rows=[];let writes=0;
 class Query{
  constructor(){this.filters={};this.op="read";}
  select(){return this}eq(k,v){this.filters[k]=v;return this}
  in(k,v){this.inPair=[k,v];return this}order(){return this}range(){return this}
  insert(x){this.op="insert";this.value=x;return this}
  update(x){this.op="update";this.value=x;return this}
  delete(){this.op="delete";return this}
  match(row){return Object.entries(this.filters).every(([k,v])=>row[k]===v)&&(!this.inPair||this.inPair[1].includes(row[this.inPair[0]]));}
  async maybeSingle(){return{data:copy(rows.find(x=>this.match(x))||null),error:null};}
  then(ok,bad){
   let data=[],error=null;
   if(this.op==="read")data=rows.filter(x=>this.match(x)).map(copy);
   else if(this.op==="insert"){
    if(rows.some(x=>x.owner_id===this.value.owner_id&&x.kind===this.value.kind&&x.record_id===this.value.record_id))
     error={code:"23505",message:"Duplicate"};
    else{rows.push({...copy(this.value),revision:1});writes++;data=[{revision:1}];}
   }else{
    const ix=rows.findIndex(x=>this.match(x));
    if(ix!==-1){
     if(this.op==="update")Object.assign(rows[ix],copy(this.value));
     else rows.splice(ix,1);
     writes++;data=[{revision:rows[ix]?.revision||2}];
    }
   }
   return Promise.resolve({data,error}).then(ok,bad);
  }
 }
 return {rows,get writes(){return writes},client:{from:()=>new Query()}};
}
function device(server,name){
 const store=new Map();let data={pilot:{name},aircraft:[],flights:[],
  people:[{id:"owner",name}],qualifications:[],endorsements:[],
  broughtForward:{total:0},broughtForwardByType:[],broughtForwardImported:false,
  broughtForwardImportedAt:"",siteLocations:[]};
 const root={navigator:{onLine:true},console:{warn(){},error(){}},
   localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))},
   HeliLogCloud:{snapshot:()=>({userId:uid})}};
 root.window=root;
 const api=new Function("window","module",code+";return window.HeliLogV23Sync;")(root,undefined);
 api.start({userId:uid,client:server.client,getData:()=>data,replaceData:next=>{data=next;}});
 return {api,store,root,get data(){return data}};
}

async function localPersonConflict(){
 const s=backend(),a=device(s,"Owner"),b=device(s,"Secondary");
 await a.api.refresh();await b.api.refresh();
 a.data.people.find(p=>p.id==="owner").name="Cloud Owner";
 await a.api.activateExtension("upload");await tick();
 await b.api.activateExtension("cloud");await tick();
 const person=b.data.people.find(p=>p.id==="owner");
 person.name="iPhone Owner";
 person.savedSignatureData="data:image/png;base64,AA==";
 // The discrepancy was not queued by track(), matching a real existing PWA.
 const before=s.writes;
 await b.api.refresh();await tick();
 return {s,a,b,before};
}
test("unqueued person:p_owner-style change is blocked and reviewable without uploading",async()=>{
 const {s,b,before}=await localPersonConflict();
 assert.equal(s.writes,before);
 assert.equal(b.api.status().state,"conflict");
 assert.equal(b.api.status().pending,1);
 const row=b.api.conflicts().find(x=>x.kind==="person"&&x.id==="owner");
 assert.ok(row);
 assert.equal(row.reviewable,true);
 assert.equal(row.unqueuedRecovery,true);
 assert.match(row.note,/not previously queued/);
 assert.equal(b.data.people.find(p=>p.id==="owner").name,"iPhone Owner");
 assert.equal(s.rows.find(r=>r.kind==="person"&&r.record_id==="owner").payload.name,"Cloud Owner");
 assert.ok(JSON.parse(b.store.get("helilog_v23_queue_"+uid)).some(q=>q.kind==="person"&&q.conflict));
 const both=await b.api.previewRecordConflict("person","owner");
 assert.equal(both.local.name,"iPhone Owner");
 assert.equal(both.cloud.name,"Cloud Owner");
 assert.ok(both.local.savedSignatureData);
 assert.equal(s.writes,before);
});
test("restarting an unqueued conflict does not discard it",async()=>{
 const {b}=await localPersonConflict();
 const before=b.store.get("helilog_v23_queue_"+uid);
 b.api.stop();
 b.api.start({userId:uid,client:backend().client,getData:()=>b.data,replaceData:()=>{throw Error("No write expected");}});
 assert.equal(b.store.get("helilog_v23_queue_"+uid),before);
 assert.equal(b.api.conflicts().length,1);
 assert.equal(b.api.conflicts()[0].id,"owner");
});
test("adopting cloud pilot copy preserves the complete iPhone workspace in a verified backup",async()=>{
 const {s,b,before}=await localPersonConflict();
 await b.api.previewRecordConflict("person","owner");
 const out=await b.api.resolveRecordConflict("cloud");
 const backup=JSON.parse(b.store.get(out.backupKey));
 assert.ok(backup.workspace.people.some(p=>p.id==="owner"&&p.name==="iPhone Owner"));
 assert.ok(backup.workspace.people.find(p=>p.id==="owner").savedSignatureData);
 assert.equal(b.data.people.find(p=>p.id==="owner").name,"Cloud Owner");
 assert.equal(s.writes,before);
 await b.api.refresh();assert.equal(b.api.status().state,"synced");
});
test("choosing iPhone pilot copy requires explicit review and revision-checked upload",async()=>{
 const {s,b,before}=await localPersonConflict();
 await b.api.previewRecordConflict("person","owner");
 const out=await b.api.resolveRecordConflict("local");
 assert.ok(b.store.get(out.backupKey));
 assert.equal(s.writes,before);
 await b.api.refresh();await tick();
 assert.equal(s.rows.find(r=>r.kind==="person"&&r.record_id==="owner").payload.name,"iPhone Owner");
 assert.equal(s.rows.find(r=>r.kind==="person"&&r.record_id==="owner").revision,2);
 assert.equal(b.api.status().state,"synced");
});
test("blocked backup write prevents any resolution or cloud writes",async()=>{
 const {s,b,before}=await localPersonConflict();
 await b.api.previewRecordConflict("person","owner");
 const old=b.root.localStorage.setItem;
 b.root.localStorage.setItem=(k,v)=>{if(k.startsWith("helilog_v27_conflict_backup_"))throw Error("Storage full");old(k,v);};
 await assert.rejects(()=>b.api.resolveRecordConflict("cloud"),/Storage full/);
 assert.equal(s.writes,before);
 assert.equal(b.data.people.find(p=>p.id==="owner").name,"iPhone Owner");
 assert.equal(b.api.conflicts().length,1);
});
test("pilot signature comparison never displays raw PNGs and remains explicit",()=>{
 const v=read("cloud-view.js");
 assert.match(v,/const personSignatures=p.kind==="person"/);
 assert.match(v,/savedSignatureData/);
 assert.match(v,/Signature images are hidden/);
 assert.match(v,/Unsent local difference — review required/);
 assert.match(v,/v27ReviewRecordConflict/);
 assert.match(read("service-worker.js"),/helilog-v2-28-4-selective-recovery-1/);
 assert.match(read("source/index.template.html"),/V2\.28\.4/);
});
