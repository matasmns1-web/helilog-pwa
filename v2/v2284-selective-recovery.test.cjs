/* V2.28.2 — device-local unqueued person conflict recovery, with no automatic overwrite. */
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



async function makeRecovery(){
 const server=backend(),web=device(server,"Web"),iphone=device(server,"iPhone");
 await web.api.refresh();await iphone.api.refresh();
 web.data.people.push({id:"cloud-instructor",name:"Web Instructor"});
 await web.api.activateExtension("upload");await tick();
 iphone.data.people.push({id:"saved-test-pilot",name:"Test",savedSignatureData:"data:image/png;base64,PRIVATE"});
 iphone.data.endorsements.push({id:"signed-test",title:"Test",date:"2026-10-21",
    signatoryPersonId:"saved-test-pilot",signatureData:"data:image/png;base64,SIGNED",signedAt:"2026-10-21T09:00:00Z"});
 await iphone.api.activateExtension("cloud");await tick();
 await iphone.api.refresh();await tick();
 return {server,web,iphone};
}
test("V2.34.1 heals a queued ghost conflict when local and cloud totals are literally identical",async()=>{
 const server=backend(),web=device(server,"Web"),iphone=device(server,"iPhone");
 await web.api.refresh();await iphone.api.refresh();
 await web.api.activateExtension("upload");await tick();
 await iphone.api.activateExtension("cloud");await tick();
 const record=server.rows.find(x=>x.kind==="settings"&&x.record_id==="broughtForward");
 const beforeWrites=server.writes,copyTotals=JSON.parse(JSON.stringify(record.payload));
 iphone.data.broughtForward=copyTotals.data;
 iphone.api.stop();
 iphone.store.set("helilog_v23_queue_"+uid,JSON.stringify([{
   kind:"settings",id:"broughtForward",action:"put",payload:copyTotals,
   baseRevision:record.revision,generation:1,conflict:true,unqueuedRecovery:true
 }]));
 iphone.api.start({userId:uid,client:server.client,getData:()=>iphone.data,
    replaceData:next=>Object.assign(iphone.data,next)});
 await iphone.api.refresh();await tick();
 assert.equal(iphone.api.status().state,"synced");
 assert.equal(iphone.api.status().pending,0);
 assert.equal(iphone.api.conflicts().length,0);
 assert.equal(server.writes,beforeWrites);
});
test("V2.34.1 restores only saved pilot and signed endorsement without modifying originals or totals",async()=>{
 const {server,iphone}=await makeRecovery();
 const original=JSON.stringify(iphone.data),previous=JSON.parse(iphone.store.get("helilog_v24_pre_extension_"+uid));
 const beforeWrites=server.writes;
 const plan=await iphone.api.previewPreservedRecovery();
 assert.equal(plan.people.length,1);
 assert.equal(plan.people[0].name,"Test");
 assert.equal(plan.people[0].hasSignature,true);
 assert.equal(plan.endorsements.length,1);
 assert.equal(plan.endorsements[0].signed,true);
 assert.doesNotMatch(JSON.stringify(plan),/base64|PRIVATE|SIGNED/);
 assert.equal(server.writes,beforeWrites);
 const result=await iphone.api.restorePreservedRecovery();
 const backup=JSON.parse(iphone.store.get(result.backupKey));
 assert.deepEqual(backup.workspace,JSON.parse(original));
 assert.deepEqual(backup.source,previous);
 assert.equal(result.people,1);
 assert.equal(result.endorsements,1);
 assert.equal(server.writes,beforeWrites);
 assert.equal(iphone.data.people.find(p=>p.id==="saved-test-pilot").savedSignatureData,"data:image/png;base64,PRIVATE");
 assert.equal(iphone.data.endorsements.find(e=>e.id==="signed-test").signatureData,"data:image/png;base64,SIGNED");
 assert.equal(iphone.data.endorsements.find(e=>e.id==="signed-test").signedAt,"2026-10-21T09:00:00Z");
 assert.ok(iphone.data.people.some(x=>x.id==="cloud-instructor"));
 assert.deepEqual(iphone.data.broughtForward,JSON.parse(original).broughtForward);
 await iphone.api.refresh();await tick();
 assert.equal(iphone.api.status().state,"synced");
 assert.equal(server.rows.find(r=>r.kind==="person"&&r.record_id==="saved-test-pilot").payload.savedSignatureData,
   "data:image/png;base64,PRIVATE");
 assert.equal(server.rows.find(r=>r.kind==="endorsement"&&r.record_id==="signed-test").payload.signatureData,
   "data:image/png;base64,SIGNED");
 assert.deepEqual(JSON.parse(iphone.store.get("helilog_v24_pre_extension_"+uid)),previous);
});
test("V2.34.1 preview refuses unresolved conflict and never forces an upload",async()=>{
 const {iphone,server}=await makeRecovery();
 const before=server.writes;
 iphone.data.broughtForward={total:1234};
 await iphone.api.refresh();await tick();
 assert.equal(iphone.api.status().state,"conflict");
 await assert.rejects(()=>iphone.api.previewPreservedRecovery(),/Resolve remaining sync conflicts/);
 assert.equal(server.writes,before);
});
test("V2.34.1 stale cloud revision blocks the restore before local changes",async()=>{
 const {server,iphone}=await makeRecovery();
 await iphone.api.previewPreservedRecovery();
 const local=JSON.stringify(iphone.data),before=server.writes;
 server.rows.push({owner_id:uid,kind:"person",record_id:"other",revision:1,
    payload:{id:"other",name:"Other"}});
 await assert.rejects(()=>iphone.api.restorePreservedRecovery(),/changed after preview/);
 assert.equal(JSON.stringify(iphone.data),local);
 assert.equal(server.writes,before);
});
test("V2.34.1 blocked independent safety backup refuses local restoration",async()=>{
 const {iphone,server}=await makeRecovery();
 await iphone.api.previewPreservedRecovery();
 const before=server.writes,local=JSON.stringify(iphone.data);
 const original=iphone.root.localStorage.setItem;
 iphone.root.localStorage.setItem=(k,v)=>{if(k.startsWith("helilog_v284_selective_recovery_"))
   throw Error("Storage full");original(k,v);};
 await assert.rejects(()=>iphone.api.restorePreservedRecovery(),/Storage full/);
 assert.equal(JSON.stringify(iphone.data),local);
 assert.equal(server.writes,before);
});
test("V2.34.1 recovery is explicit and cloud connection copy does not claim unsynchronized records",()=>{
 const view=read("cloud-view.js"),sync=read("cloud-sync.js");
 assert.match(view,/Preview safe restoration/);
 assert.match(view,/Restore these missing records/);
 assert.match(view,/v284ApplyPreservedRecovery/);
 assert.match(view,/This button checks authentication only/);
 assert.match(view,/Check sign-in connection/);
 assert.doesNotMatch(view,/Local logbook records are still not synchronized/);
 assert.match(sync,/verified no-op, NOT an upload/);
 assert.match(sync,/remoteFingerprint/);
 assert.match(read("service-worker.js"),/helilog-v2-40-evidence-1/);
});
