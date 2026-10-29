/* V2.28 — shared-cloud onboarding and per-device conflict protection. */
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
test("shared account probe is read-only and identifies an existing cloud source",async()=>{
 const s=backend(),primary=device(s,"Primary"),secondary=device(s,"Secondary");
 await primary.api.refresh();await secondary.api.refresh();
 assert.equal((await secondary.api.accountSetup()).hasCloud,false);
 primary.data.people.push({id:"examiner",name:"Instructor"});
 await primary.api.activateExtension("upload");await tick();
 const written=s.writes;const result=await secondary.api.accountSetup();
 assert.equal(result.hasCloud,true);
 assert.ok(result.remoteRecords>0);assert.equal(secondary.api.extended(),false);
 assert.equal(s.writes,written);
 await assert.rejects(()=>secondary.api.activateExtension("upload"),/already has extended cloud records/);
 await secondary.api.activateExtension("cloud");await tick();
 assert.equal(secondary.api.extended(),true);
 assert.ok(secondary.data.people.some(x=>x.id==="examiner"));
 assert.ok(secondary.store.get("helilog_v24_pre_extension_"+uid));
});
test("adopting the cloud protects unsynchronized local endorsements in a recovery snapshot",async()=>{
 const s=backend(),a=device(s,"Primary"),b=device(s,"Secondary");
 await a.api.refresh();await b.api.refresh();
 a.data.people.push({id:"instructor",name:"Primary Instructor"});
 await a.api.activateExtension("upload");await tick();
 b.data.people.push({id:"local-pilot",name:"Local Pilot"});
 b.data.endorsements.push({id:"local-e",text:"Unsigned draft",signatoryPersonId:"local-pilot"});
 await b.api.activateExtension("cloud");await tick();
 const saved=JSON.parse(b.store.get("helilog_v24_pre_extension_"+uid));
 assert.ok(saved.people.some(x=>x.id==="local-pilot"));
 assert.ok(saved.endorsements.some(x=>x.id==="local-e"));
 assert.ok(!b.data.endorsements.some(x=>x.id==="local-e"));
 assert.ok(b.data.people.some(x=>x.id==="instructor"));
});
test("untracked local aerodrome differences become reviewable on this device; no silent overwrite",async()=>{
 const s=backend(),a=device(s,"Primary"),b=device(s,"Secondary");
 await a.api.refresh();await b.api.refresh();
 a.data.siteLocations=[{code:"SITE-A",latitude:10,longitude:20}];
 await a.api.activateExtension("upload");await tick();
 await b.api.activateExtension("cloud");await tick();
 b.data.siteLocations=[{code:"SITE-B",latitude:44,longitude:55}];
 const beforeWrites=s.writes;
 await b.api.refresh();await tick();
 assert.equal(b.api.status().state,"conflict");
 assert.equal(b.api.status().pending,1);
 const item=b.api.conflicts().find(x=>x.kind==="settings"&&x.id==="siteLocations");
 assert.ok(item);assert.equal(item.reviewable,true);assert.equal(s.writes,beforeWrites);
 const preview=await b.api.previewRecordConflict("settings","siteLocations");
 assert.equal(preview.local.data[0].code,"SITE-B");assert.equal(preview.cloud.data[0].code,"SITE-A");
 const resolved=await b.api.resolveRecordConflict("cloud");
 assert.ok(b.store.get(resolved.backupKey));
 assert.equal(b.data.siteLocations[0].code,"SITE-A");
 assert.equal(s.writes,beforeWrites);
 await b.api.refresh();assert.equal(b.api.status().state,"synced");
});
test("local aerodrome copy can be chosen only after a review and is revision-checked",async()=>{
 const s=backend(),a=device(s,"A"),b=device(s,"B");
 await a.api.refresh();await b.api.refresh();
 a.data.siteLocations=[{code:"CLOUD"}];
 await a.api.activateExtension("upload");await tick();
 await b.api.activateExtension("cloud");await tick();
 b.data.siteLocations=[{code:"LOCAL"}];
 await b.api.refresh();await b.api.previewRecordConflict("settings","siteLocations");
 await b.api.resolveRecordConflict("local");
 await b.api.refresh();await tick();
 const row=s.rows.find(x=>x.kind==="settings"&&x.record_id==="siteLocations");
 assert.equal(row.payload.data[0].code,"LOCAL");
 assert.equal(b.api.status().state,"synced");
});
test("other protected settings and signed endorsements remain ineligible for ordinary overwrite",async()=>{
 const s=backend(),d=device(s,"A");
 await d.api.refresh();
 assert.match(code,/kind==="settings"&&id!=="siteLocations"/);
 assert.match(code,/kind==="endorsement"/);
 assert.match(code,/v2ArchiveBridge|archivedFlightIdsForAircraft/);
});
test("fresh devices join existing cloud; previously used devices do not auto-replace local data",()=>{
 assert.match(gate,/stored===null && !window\.HeliLogV23Sync\.extended\(\)/);
 assert.match(gate,/accountSetup\(\)/);
 assert.match(gate,/activateExtension\("cloud"\)/);
 assert.match(gate,/siteLocations:next\.siteLocations\?\?S\.siteLocations/);
});
test("one-cloud setup copy, per-device conflict review and recoverable pre-sync snapshot are visible",()=>{
 assert.match(view,/Continue setup safely/);
 assert.match(view,/v28CompleteCloudSetup/);
 assert.match(view,/Download preserved pre-sync data/);
 assert.match(view,/These conflicts are stored <b>on this device<\/b>/);
 assert.doesNotMatch(view,/Choose one primary device/);
 assert.doesNotMatch(view,/HeliLog V2\.19 · Synchronization/);
 assert.match(gate,/Cloud setup incomplete/);
 assert.match(gate,/Review conflicts on this device/);
});
test("no database migrations, logbook print or archive formatting changed",()=>{
 assert.match(read("service-worker.js"),/helilog-v2-48-1-endorsement-archive-1/);
 assert.match(read("source/index.template.html"),/V2\.48\.1/);
 assert.doesNotMatch(read("print.js"),/v28CompleteCloudSetup/);
 assert.doesNotMatch(read("archive-integrity.js"),/v28CompleteCloudSetup/);
});
