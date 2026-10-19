/* HeliLog V2.8.4 — safe recovery of stranded V2.8.2 local confirmations. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"cloud-archives.js"),"utf8");
const UID="11111111-1111-4111-a111-111111111111";
const clone=x=>JSON.parse(JSON.stringify(x));
const pending=()=>({
 id:"COR-TEST-1",flightId:"flight-1",sourceBatch:"HL-1",sourcePage:1,sourceRow:1,
 before:{id:"flight-1",mins:40},after:{id:"flight-1",mins:45},
 reason:"Correct simulator hours",createdAt:"2026-10-15T12:00:00Z",confirmedAt:""
});
function fixture(mode="stranded"){
 let local=clone({pilot:{name:"TEST"},flights:[{id:"flight-1",mins:40}],
  printArchive:{firstPage:1,batches:[{id:"HL-1",kind:"flight",firstPage:1,
    pageCount:1,flightIds:["flight-1"],confirmedAt:"2026-10-15T11:00:00Z"}],
   corrections:[{...pending(),confirmedAt:"2026-10-15T13:00:00Z"}]},
  endorsementV2Archive:{batches:[],amendments:[]}});
 const rows={
  helilog_print_archives:[{kind:"flight",payload:clone(local.printArchive.batches[0]),
   owner_id:UID,first_page:1,confirmed_at:"2026-10-15T11:00:00Z"}],
  helilog_archive_addenda:[],
  helilog_records:[{kind:"correction_proposal",record_id:"COR-TEST-1",
   owner_id:UID,revision:1,payload:pending()}]
 };
 const storage=new Map(),flags={failStorage:false,offline:false,failRead:false,accountChanged:false,
   status:"synced",pending:0,conflicts:0, writes:0,commitCount:0};
 const client={from(table){
  const query={conditions:[],select(){return this},eq(k,v){this.conditions.push([k,v]);return this},
   filtered(){return rows[table].filter(row=>this.conditions.every(([k,v])=>row[k]===v))},
   then(resolve,reject){if(flags.failRead)return Promise.resolve({data:null,error:{message:"Read unavailable"}}).then(resolve,reject);
    return Promise.resolve({data:clone(this.filtered()),error:null}).then(resolve,reject)},
   async maybeSingle(){if(flags.failRead)return {data:null,error:{message:"Read unavailable"}};
    return {data:clone(this.filtered()[0]||null),error:null};}
  };return query;
 },rpc(){flags.writes++;return Promise.resolve({data:true,error:null})}};
 const root={window:null,navigator:{get onLine(){return !flags.offline}},console:{warn(){}},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{
   if(flags.failStorage)throw Error("Quota prevented independent backup");
   storage.set(key,String(value));
  }},
  matchMedia:()=>({matches:false}),
  HeliLogCloud:{snapshot:()=>({userId:flags.accountChanged?"22222222-2222-4222-a222-222222222222":UID})},
  HeliLogV23Sync:{extended:()=>true,status:()=>({state:flags.status,owner:UID,pending:flags.pending,conflicts:flags.conflicts})}
 };
 root.window=root;
 const api=new Function("window","module",source+";return window.HeliLogV24Archive;")(root,undefined);
 api.start({userId:UID,db:client});
 const commit=next=>{flags.commitCount++;local=clone(next)};
 const refresh=()=>api.refresh(()=>local,commit);
 if(mode==="genuine")rows.helilog_archive_addenda.push({
  owner_id:UID,record_kind:"flight",record_id:"flight-1",
  signature_metadata:clone(local.printArchive.corrections[0])});
 if(mode==="no-proposal")rows.helilog_records.length=0;
 if(mode==="changed")rows.helilog_records[0].payload.after.mins=50;
 if(mode==="other-archive-discrepancy")rows.helilog_print_archives[0].payload.id="ANOTHER-BATCH";
 if(mode==="two")local.printArchive.corrections.push({...pending(),id:"COR-TEST-2",
  confirmedAt:"2026-10-15T14:00:00Z"});
 if(mode==="other-correction")rows.helilog_archive_addenda.push({
  owner_id:UID,record_kind:"flight",record_id:"flight-1",
  signature_metadata:{...pending(),confirmedAt:"2026-10-15T13:01:00Z"}});
 return {api,rows,storage,flags,client,refresh,get local(){return local}};
}
test("legacy phantom signed item is reverted to identical cloud draft, with verified independent backup",async()=>{
 const f=fixture();
 assert.equal(await f.refresh(),true,f.api.error());
 assert.equal(f.local.printArchive.corrections[0].confirmedAt,"");
 assert.deepEqual(f.local.printArchive.corrections[0],pending());
 assert.equal(f.local.flights[0].mins,40);
 assert.equal(f.flags.writes,0);
 assert.equal(f.flags.commitCount,1);
 assert.equal(f.api.available(),true);
 assert.match(f.api.recoveryNotice(),/recovered/i);
 const backups=[...f.storage].filter(([k])=>k.includes("helilog_v284_stranded_correction_backup_"));
 assert.equal(backups.length,1);
 const saved=JSON.parse(backups[0][1]);
 assert.equal(saved.originalWorkspace.printArchive.corrections[0].confirmedAt,"2026-10-15T13:00:00Z");
 assert.deepEqual(saved.verifiedCloudProposal,pending());
 assert.equal(saved.originalWorkspace.flights[0].mins,40);
 assert.equal(await f.refresh(),true);
 assert.equal([...f.storage.keys()].filter(k=>k.includes("stranded_correction_backup")).length,1);
});
test("stale discrepancy from a previous refresh clears only after cloud-backed recovery",async()=>{
 const f=fixture();
 f.rows.helilog_records.length=0;
 assert.equal(await f.refresh(),false);
 assert.match(f.api.error(),/identical unconfirmed proposal/);
 f.rows.helilog_records.push({owner_id:UID,kind:"correction_proposal",
   record_id:"COR-TEST-1",revision:1,payload:pending()});
 assert.equal(await f.refresh(),true);
 assert.equal(f.api.error(),"");
});
test("no cloud proposal leaves confirmed local copy and source records unchanged",async()=>{
 const f=fixture("no-proposal"),before=clone(f.local);
 assert.equal(await f.refresh(),false);
 assert.deepEqual(f.local,before);
 assert.equal(f.storage.size,0);
 assert.match(f.api.error(),/does not contain an identical unconfirmed proposal/);
 assert.equal(f.flags.commitCount,0);
});
test("different cloud proposed flight values are never accepted as identical",async()=>{
 const f=fixture("changed"),before=clone(f.local);
 assert.equal(await f.refresh(),false);
 assert.deepEqual(f.local,before);
 assert.equal(f.storage.size,0);
 assert.equal(f.flags.commitCount,0);
});
test("real signed cloud addendum with matching metadata stays confirmed",async()=>{
 const f=fixture("genuine");
 assert.equal(await f.refresh(),true,f.api.error());
 assert.equal(f.local.printArchive.corrections[0].confirmedAt,"2026-10-15T13:00:00Z");
 assert.equal(f.storage.size,0);
 assert.equal(f.api.recoveryNotice(),"");
});
test("a real signed cloud addendum that differs still blocks",async()=>{
 const f=fixture("other-correction");
 assert.equal(await f.refresh(),false);
 assert.equal(f.storage.size,0);
 assert.equal(f.flags.commitCount,0);
 assert.match(f.api.error(),/Archive discrepancy/);
});
test("missing or changed source archive batch never triggers recovery",async()=>{
 const f=fixture("other-archive-discrepancy");
 assert.equal(await f.refresh(),false);
 assert.equal(f.storage.size,0);
 assert.equal(f.flags.commitCount,0);
});
test("more than one stranded confirmation requires manual review",async()=>{
 const f=fixture("two");
 assert.equal(await f.refresh(),false);
 assert.equal(f.storage.size,0);
 assert.equal(f.flags.commitCount,0);
 assert.match(f.api.error(),/Multiple locally confirmed/);
});
test("failed safety backup blocks all modifications",async()=>{
 const f=fixture();f.flags.failStorage=true;
 assert.equal(await f.refresh(),false);
 assert.equal(f.local.printArchive.corrections[0].confirmedAt,"2026-10-15T13:00:00Z");
 assert.equal(f.flags.commitCount,0);
 assert.match(f.api.error(),/Quota prevented independent backup/);
});
test("account change during recovery cannot overwrite a signed record",async()=>{
 const f=fixture();f.flags.accountChanged=true;
 assert.equal(await f.refresh(),false);
 assert.equal(f.flags.commitCount,0);
 assert.equal(f.storage.size,0);
});
test("this device's own unsent changes prevent recovery",async()=>{
 const f=fixture();f.flags.pending=1;f.flags.status="pending";
 assert.equal(await f.refresh(),false);
 assert.equal(f.flags.commitCount,0);
 assert.equal(f.storage.size,0);
});
test("a read failure never silently alters local archive status",async()=>{
 const f=fixture();f.flags.failRead=true;
 assert.equal(await f.refresh(),false);
 assert.equal(f.storage.size,0);
 assert.equal(f.flags.commitCount,0);
});
