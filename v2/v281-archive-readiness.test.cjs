/* HeliLog V2.8.2: browser-scoped archive readiness and background refresh races. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"cloud-archives.js"),"utf8");
const uid="11111111-1111-4111-a111-111111111111";
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const flags={online:true,standalone:false,otherDeviceOffline:true,readError:false,delayed:false,
  status:{state:"synced",owner:uid,pending:0,conflicts:0,error:""}};
 let release=null,reads=0,writes=0,integrityCalls=0;
 const client={
  from(name){
   const query={
    select(){return this},eq(){return this},
    then(resolve,reject){
     reads++;
     const deliver=()=>flags.readError?{data:null,error:{message:"Archive cloud read failed"}}:{data:[],error:null};
     const wait=flags.delayed?new Promise(ok=>{const previous=release;release=previous?()=>{ok();previous();}:ok;}):Promise.resolve();
     return wait.then(deliver).then(resolve,reject);
    }
   };
   return query;
  },
  rpc(){writes++;return Promise.resolve({data:"server-ack",error:null});}
 };
 const root={
  navigator:{get onLine(){return flags.online},get standalone(){return flags.standalone}},
  matchMedia:()=>({matches:flags.standalone}),
  console:{warn(){}},
  HeliLogCloud:{snapshot:()=>({userId:uid})},
  HeliLogV23Sync:{extended:()=>true,status:()=>flags.status},
  HeliLogV28Integrity:{auditCloud:async()=>{
   integrityCalls++;return {ok:true,errors:[]};
  }}
 };
 root.window=root;
 const archive=new Function("window","module",source+";return window.HeliLogV24Archive;")(root,undefined);
 archive.start({userId:uid,db:client});
 return {archive,flags,client,get reads(){return reads},get writes(){return writes},
  get integrityCalls(){return integrityCalls},
  release(){if(!release)throw Error("Refresh has not requested data yet");const finish=release;release=null;finish();}};
}
test("another offline device does not block this browser from confirming an archive",async()=>{
 const f=fixture();
 assert.equal(f.flags.otherDeviceOffline,true);
 assert.equal(f.archive.available(),true);
 assert.equal(f.archive.blockReason(),"");
 const result=await f.archive.confirmBatch("endorsement",{confirmedAt:"2026-10-15T12:00:00Z"},["e-1"]);
 assert.equal(result,"server-ack");
 assert.equal(f.writes,1);
 assert.equal(f.integrityCalls,1);
});
test("an in-progress archive refresh does not block printing and confirmation waits for it",async()=>{
 const f=fixture();f.flags.delayed=true;
 let saved={printArchive:{batches:[],corrections:[]},endorsementV2Archive:{batches:[],amendments:[]}};
 const refresh=f.archive.refresh(()=>saved,updated=>{saved=clone(updated)});
 const second=f.archive.refresh(()=>saved,updated=>{saved=clone(updated)});
 assert.equal(f.archive.available(),true,"the browser is synced even while cloud archive history refreshes");
 const confirming=f.archive.confirmBatch("endorsement",{confirmedAt:"2026-10-15"},["e-1"]);
 await Promise.resolve();await Promise.resolve();
 assert.equal(f.writes,0,"confirmation must wait for archive refresh");
 assert.equal(f.reads,2,"overlapping refreshes must share one pair of reads");
 f.release();
 await Promise.all([refresh,second]);
 assert.equal(await confirming,"server-ack");
 assert.equal(f.writes,1);
});
test("a repeat account initialization cannot discard an ongoing refresh or a prior discrepancy",async()=>{
 const f=fixture();
 f.flags.readError=true;
 let workspace={printArchive:{batches:[],corrections:[]},endorsementV2Archive:{batches:[],amendments:[]}};
 assert.equal(await f.archive.refresh(()=>workspace,x=>workspace=x),false);
 assert.match(f.archive.blockReason(),/Archive cloud read failed/);
 f.archive.start({userId:uid,db:f.client});
 assert.match(f.archive.blockReason(),/Archive cloud read failed/);
 f.flags.readError=false;
 assert.equal(await f.archive.refresh(()=>workspace,x=>workspace=x),true);
 assert.equal(f.archive.available(),true);
});
test("this browser's own pending edits, conflict or offline state still stop confirmation",async()=>{
 const f=fixture();
 f.flags.status={state:"pending",owner:uid,pending:1,conflicts:0,error:""};
 await assert.rejects(()=>f.archive.confirmBatch("endorsement",{confirmedAt:"2026-10-15"},["e-1"]),/This browser still has 1 unsent change/);
 f.flags.status={state:"conflict",owner:uid,pending:0,conflicts:1,error:""};
 await assert.rejects(()=>f.archive.confirmBatch("endorsement",{confirmedAt:"2026-10-15"},["e-1"]),/unresolved cloud record conflict/);
 f.flags.status={state:"synced",owner:uid,pending:0,conflicts:0,error:""};
 f.flags.online=false;
 await assert.rejects(()=>f.archive.confirmBatch("endorsement",{confirmedAt:"2026-10-15"},["e-1"]),/This browser is offline/);
 assert.equal(f.writes,0);
});
test("installed app is still prohibited from browser-only archive confirmation",async()=>{
 const f=fixture();f.flags.standalone=true;
 assert.equal(f.archive.available(),false);
 await assert.rejects(()=>f.archive.confirmBatch("endorsement",{confirmedAt:"2026-10-15"},["e-1"]),/web browser/);
 assert.equal(f.writes,0);
});

test("refresh from a signed-out session cannot overwrite a newly initialized archive state",async()=>{
 const f=fixture();
 f.flags.delayed=true;
 const workspace={printArchive:{batches:[],corrections:[]},endorsementV2Archive:{batches:[],amendments:[]}};
 let committed=false;
 const pending=f.archive.refresh(()=>workspace,()=>{committed=true;});
 await Promise.resolve();await Promise.resolve();
 f.archive.stop();
 f.flags.delayed=false;
 f.archive.start({userId:uid,db:f.client});
 await Promise.resolve();await Promise.resolve();
 f.release();
 assert.equal(await pending,false);
 assert.equal(committed,false);
 assert.equal(f.archive.available(),true);
});
