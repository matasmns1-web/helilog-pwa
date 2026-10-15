/* Run: node --test v2/profile-conflict.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"cloud-sync.js"),"utf8");
const user="11111111-1111-4111-a111-111111111111";
const clone=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(Object.keys(x).sort().reduce((a,k)=>(a[k]=x[k],a),{}));
function fixture(){
 const server=[{owner_id:user,kind:"settings",record_id:"pilot",revision:1,payload:{id:"pilot",data:{name:"Cloud pilot",licenceType:"CPL(H)",medical:{class:""}}}}];
 let cloudWrites=0,failBackups=false;
 const storage=new Map();
 const store={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem(key,val){
   if(failBackups&&String(key).startsWith("helilog_v24_pilot_conflict_backup_"))throw Error("Device storage unavailable");
   storage.set(key,String(val));
  }
 };
 const db={from(table){
  assert.equal(table,"helilog_records");
  const f={};let op="get",changes=null;
  const chain={
   select(){return this},eq(k,v){f[k]=v;return this},in(){return this},order(){return this},range(){return this},
   maybeSingle:async()=>{
    const record=server.find(row=>Object.entries(f).every(([k,v])=>row[k]===v));
    return {data:record?clone(record):null,error:null};
   },
   insert(x){op="insert";changes=x;return this},
   update(x){op="update";changes=x;return this},
   delete(){op="delete";return this},
   then(ok,bad){
    let data=[],error=null;
    const record=server.find(row=>Object.entries(f).every(([k,v])=>row[k]===v));
    if(op==="get")data=server.filter(row=>Object.entries(f).every(([k,v])=>row[k]===v)).map(clone);
    else if(op==="update"&&record){cloudWrites++;Object.assign(record,clone(changes));data=[{revision:record.revision}];}
    else if(op==="delete"&&record){cloudWrites++;data=[{revision:record.revision}];server.splice(server.indexOf(record),1);}
    else if(op==="insert"){cloudWrites++;server.push({...clone(changes),revision:1});data=[{revision:1}];}
    return Promise.resolve({data,error}).then(ok,bad);
   }
  };return chain;
 }};
 const local={pilot:{name:"Web pilot",licenceType:"CPL(H)",medical:{class:""}},people:[],aircraft:[],flights:[],qualifications:[],endorsements:[{id:"signed-one",signatureData:"PNG-KEEP"}],
  broughtForward:{},broughtForwardByType:[],broughtForwardImported:false,broughtForwardImportedAt:""};
 const root={navigator:{onLine:true},localStorage:store,console:{warn(){}},HeliLogCloud:{snapshot:()=>({userId:user})}};
 root.window=root;
 const key="settings:pilot";
 storage.set("helilog_v24_ext_"+user,"true");
 storage.set("helilog_v23_mirror_"+user,JSON.stringify({[key]:JSON.stringify({data:{licenceType:"CPL(H)",medical:{class:""},name:"Cloud pilot"},id:"pilot"})}));
 storage.set("helilog_v23_versions_"+user,JSON.stringify({[key]:1}));
 const api=new Function("window","module",code+";return window.HeliLogV23Sync;")(root,undefined);
 let data=clone(local);
 api.start({userId:user,client:db,getData:()=>data,replaceData:newData=>{data=clone(newData);store.setItem("account-data",JSON.stringify(data))}});
 return {api,storage,server,root,get data(){return data},get cloudWrites(){return cloudWrites},
  failBackups:()=>{failBackups=true},localValue:()=>data.pilot.name,serverValue:()=>server[0].payload.data.name};
}
test("pilot profile conflict protects both copies until explicit review",async()=>{
 const f=fixture();await f.api.refresh();
 assert.equal(f.api.status().state,"conflict");
 assert.match(f.api.status().error,/settings:pilot/);
 assert.equal(f.cloudWrites,0);
 const preview=await f.api.previewPilotConflict();
 assert.equal(preview.local.name,"Web pilot");
 assert.equal(preview.cloud.name,"Cloud pilot");
 assert.equal(f.serverValue(),"Cloud pilot");
});
test("keep web profile preserves backup, updates just pilot cloud revision and clears conflict",async()=>{
 const f=fixture();await f.api.refresh();await f.api.previewPilotConflict();
 const result=await f.api.resolvePilotConflict("local");
 assert.match(result.backupKey,/helilog_v24_pilot_conflict_backup_/);
 assert.equal(f.localValue(),"Web pilot");
 assert.equal(f.serverValue(),"Cloud pilot");
 assert.equal(f.data.endorsements[0].signatureData,"PNG-KEEP");
 assert.ok(f.storage.get(result.backupKey));
 await f.api.refresh();
 assert.equal(f.api.status().state,"synced");
 assert.equal(f.serverValue(),"Web pilot");
 assert.equal(f.server[0].revision,2);
 assert.equal(f.cloudWrites,1);
});
test("keep cloud profile changes only local profile and keeps signed endorsement intact",async()=>{
 const f=fixture();await f.api.refresh();await f.api.previewPilotConflict();
 const result=await f.api.resolvePilotConflict("cloud");
 assert.equal(f.localValue(),"Cloud pilot");
 assert.equal(f.serverValue(),"Cloud pilot");
 assert.equal(f.cloudWrites,0);
 assert.equal(f.data.endorsements[0].signatureData,"PNG-KEEP");
 const backup=JSON.parse(f.storage.get(result.backupKey));
 assert.equal(backup.localWorkspace.pilot.name,"Web pilot");
 await f.api.refresh();
 assert.equal(f.api.status().state,"synced");
});
test("stale preview cannot replace a remotely changed pilot record",async()=>{
 const f=fixture();await f.api.refresh();await f.api.previewPilotConflict();
 f.server[0].payload.data.name="Another device updated the cloud";
 f.server[0].revision=2;
 await assert.rejects(()=>f.api.resolvePilotConflict("local"),/changed since review/);
 assert.equal(f.cloudWrites,0);
 assert.equal(f.localValue(),"Web pilot");
 assert.equal(f.serverValue(),"Another device updated the cloud");
});
test("backup storage failures block all changes and preserve conflict",async()=>{
 const f=fixture();await f.api.refresh();await f.api.previewPilotConflict();
 f.failBackups();
 await assert.rejects(()=>f.api.resolvePilotConflict("cloud"),/storage unavailable/i);
 assert.equal(f.localValue(),"Web pilot");
 assert.equal(f.serverValue(),"Cloud pilot");
 assert.equal(f.cloudWrites,0);
});
