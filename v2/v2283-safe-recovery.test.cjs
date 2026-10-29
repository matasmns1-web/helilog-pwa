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


async function totalsConflict(){
 const server=backend(),primary=device(server,"Web"),phone=device(server,"iPhone");
 await primary.api.refresh();await phone.api.refresh();
 primary.data.broughtForward={total:8100,pic:6000};
 primary.data.people.push({id:"cloud-instructor",name:"Cloud Instructor"});
 primary.data.endorsements.push({id:"cloud-endorsed",title:"Signed training",signatoryPersonId:"cloud-instructor",signatureData:""});
 await primary.api.activateExtension("upload");await tick();
 await phone.api.activateExtension("cloud");await tick();
 phone.data.broughtForward={total:9000,pic:7000}; // Was saved without track(), matching iPhone
 const writes=server.writes;
 await phone.api.refresh();await tick();
 return {server,primary,phone,writes};
}
test("settings:broughtForward with zero queued edits becomes a blocked comparison, never an upload",async()=>{
 const {server,phone,writes}=await totalsConflict();
 assert.equal(server.writes,writes);
 assert.equal(phone.api.status().state,"conflict");
 assert.equal(phone.api.status().pending,1);
 const item=phone.api.conflicts().find(c=>c.kind==="settings"&&c.id==="broughtForward");
 assert.ok(item&&item.reviewable&&item.unqueuedRecovery);
 const copies=await phone.api.previewRecordConflict("settings","broughtForward");
 assert.equal(copies.local.data.total,9000);
 assert.equal(copies.cloud.data.total,8100);
 assert.equal(server.writes,writes);
 assert.equal(phone.data.broughtForward.total,9000);
});
test("adopting cloud opening totals preserves device totals in verified snapshot",async()=>{
 const {server,phone,writes}=await totalsConflict();
 await phone.api.previewRecordConflict("settings","broughtForward");
 const result=await phone.api.resolveRecordConflict("cloud");
 const backup=JSON.parse(phone.store.get(result.backupKey));
 assert.equal(backup.workspace.broughtForward.total,9000);
 assert.equal(phone.data.broughtForward.total,8100);
 assert.equal(server.writes,writes);
 await phone.api.refresh();await tick();
 assert.equal(phone.api.status().state,"synced");
 assert.ok(phone.data.people.some(p=>p.id==="cloud-instructor"));
 assert.ok(phone.data.endorsements.some(e=>e.id==="cloud-endorsed"));
});
test("keeping the device totals requires explicit review and revision-checked upload",async()=>{
 const {server,phone,writes}=await totalsConflict();
 await phone.api.previewRecordConflict("settings","broughtForward");
 const result=await phone.api.resolveRecordConflict("local");
 assert.ok(phone.store.get(result.backupKey));
 assert.equal(server.writes,writes);
 await phone.api.refresh();await tick();
 assert.equal(server.rows.find(x=>x.kind==="settings"&&x.record_id==="broughtForward").payload.data.total,9000);
 assert.equal(phone.api.status().state,"synced");
});
test("a preserved local pilot and signed endorsement are inspectable but never automatically imported",async()=>{
 const server=backend(),web=device(server,"Web"),phone=device(server,"iPhone");
 await web.api.refresh();await phone.api.refresh();
 await web.api.activateExtension("upload");await tick();
 phone.data.people.push({id:"local-pilot",name:"My Instructor",savedSignatureData:"data:image/png;base64,PRIVATE"});
 phone.data.endorsements.push({id:"local-endorsement",title:"Original assessment",signatoryPersonId:"local-pilot",signatureData:"data:image/png;base64,SIGNATURE"});
 await phone.api.activateExtension("cloud");await tick();
 const before=server.writes,queue=phone.api.status().pending;
 const report=phone.api.preservedSetupSummary();
 assert.equal(report.available,true);
 assert.equal(report.missingPeople.length,1);
 assert.equal(report.missingPeople[0].name,"My Instructor");
 assert.equal(report.missingPeople[0].savedSignature,true);
 assert.equal(report.missingEndorsements.length,1);
 assert.equal(report.missingEndorsements[0].title,"Original assessment");
 assert.equal(report.missingEndorsements[0].signed,true);
 assert.doesNotMatch(JSON.stringify(report),/base64|SIGNATURE|PRIVATE/);
 assert.ok(!phone.data.people.some(p=>p.id==="local-pilot"));
 assert.ok(!phone.data.endorsements.some(e=>e.id==="local-endorsement"));
 assert.equal(server.writes,before);
 assert.equal(phone.api.status().pending,queue);
});
test("read-only pre-sync inspection reports collisions and an absent snapshot safely",async()=>{
 const server=backend(),web=device(server,"Web"),phone=device(server,"iPhone");
 await web.api.refresh();await phone.api.refresh();
 assert.throws(()=>web.api.preservedSetupSummary(),/complete cloud setup/);
 web.data.people.push({id:"shared-pilot",name:"Cloud version"});
 await web.api.activateExtension("upload");await tick();
 phone.data.people.push({id:"shared-pilot",name:"Previous iPhone version"});
 await phone.api.activateExtension("cloud");await tick();
 const report=phone.api.preservedSetupSummary();
 assert.equal(report.missingPeople.length,0);
 assert.ok(report.differentPeople.some(p=>p.id==="shared-pilot"));
 assert.ok(report.differentPeople.length>=1);
 assert.equal(phone.data.people.find(p=>p.id==="shared-pilot").name,"Cloud version");
});
test("recovery UI is read-only, hides signature images and gives an explicit download option",()=>{
 const ui=read("cloud-view.js");
 assert.match(ui,/v283ReviewPreservedSetup/);
 assert.match(ui,/Review preserved pilots and endorsements/);
 assert.match(ui,/Preserved records on this device/);
 assert.match(ui,/This is a read-only inspection/);
 assert.match(ui,/Download preserved pre-sync data/);
 assert.doesNotMatch(ui,/v283RestorePreservedSetup/);
 assert.match(read("service-worker.js"),/helilog-v2-47-inactive-assets-1/);
});
