/* HeliLog V2.8 — independent cloud archive audit and checksum recovery tests */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const dir=__dirname;
const source=fs.readFileSync(path.join(dir,"archive-integrity.js"),"utf8");
const recoverySource=fs.readFileSync(path.join(dir,"recovery.js"),"utf8");
const adapterSource=fs.readFileSync(path.join(dir,"cloud-archives.js"),"utf8");
const html=fs.readFileSync(path.join(dir,"index.html"),"utf8");
const view=fs.readFileSync(path.join(dir,"cloud-view.js"),"utf8");
const U="11111111-1111-4111-a111-111111111111";
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const owner=U,storage=new Map(),rows={
  helilog_print_archives:[],helilog_archive_entries:[],
  helilog_archive_addenda:[],helilog_records:[]
 };
 let writes=0,online=true;
 const client={from(table){
  if(!Object.hasOwn(rows,table))throw Error("Unexpected table "+table);
  const q={conditions:[],filter:null,rangeStart:0,rangeEnd:499,
   select(){return this},
   eq(k,v){this.conditions.push([k,v]);return this},
   in(k,v){this.filter=[k,v];return this},
   order(k){this.sortBy=k;return this},
   range(a,b){this.rangeStart=a;this.rangeEnd=b;return this},
   then(resolve,reject){
    let r=rows[table].filter(row=>this.conditions.every(([k,v])=>row[k]===v)&&
      (!this.filter||this.filter[1].includes(row[this.filter[0]])));
    if(this.sortBy)r=[...r].sort((a,b)=>String(a[this.sortBy]).localeCompare(String(b[this.sortBy])));
    return Promise.resolve({data:clone(r.slice(this.rangeStart,this.rangeEnd+1)),error:null}).then(resolve,reject);
   }
  };return q;
 },rpc(){writes++;return Promise.resolve({data:true,error:null})}};
 const root={crypto:crypto.webcrypto,navigator:{get onLine(){return online}},localStorage:{
  getItem:key=>storage.get(key)??null,setItem:(key,val)=>storage.set(key,val)
 },console:{warn(){}},HeliLogCloud:{snapshot:()=>({userId:owner})},
  HeliLogV23Sync:{extended:()=>true,status:()=>({state:"synced"})},matchMedia:()=>({matches:false})};
 root.window=root;
 const integrity=new Function("window","module",source+";return window.HeliLogV28Integrity;")(root,undefined);
 root.HeliLogV28Integrity=integrity;
 const recovery=new Function("window","module",recoverySource+";return window.HeliLogV28Recovery;")(root,undefined);
 const archive=new Function("window","module",adapterSource+";return window.HeliLogV24Archive;")(root,undefined);
 archive.start({userId:owner,db:client});
 function signed(){
  const original={id:"e-1",title:"Flight endorsement",text:"Fictional training",
   signatureData:"data:image/png;base64,AAAA",signedName:"TEST",
   signatoryPersonId:"p1",signedAt:"2026-10-15T12:00:00Z"};
  const printed={id:"EN-1",kind:"endorsement",firstPage:1,pageCount:1,
   items:[{endorsementId:"e-1",snapshot:{...original,signature:{data:original.signatureData}}}],
   confirmedAt:"2026-10-15T12:15:00Z"};
  rows.helilog_print_archives.push({id:"archive-uuid-1",owner_id:owner,kind:"endorsement",
   first_page:1,page_count:1,payload:printed,confirmed_at:printed.confirmedAt});
  rows.helilog_archive_entries.push({owner_id:owner,archive_id:"archive-uuid-1",
   record_kind:"endorsement",record_id:"e-1",snapshot:clone(original)});
  rows.helilog_records.push({owner_id:owner,kind:"endorsement",record_id:"e-1",
   payload:clone(original),revision:1,sealed_at:"2026-10-15T12:00:00Z"});
 }
 return {integrity,recovery,archive,rows,storage,client,signed,get writes(){return writes},
  offline(){online=false},online(){online=true}};
}
test("empty cloud archive can be audited without writes",async()=>{
 const f=fixture();
 const report=await f.integrity.auditCloud({client:f.client,owner:U,storeEvidence:true});
 assert.equal(report.ok,true);
 assert.deepEqual(report.counts,{batches:0,entries:0,addenda:0});
 assert.match(report.fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(f.writes,0);
 assert.ok(f.storage.has(f.integrity.baselineKey(U)));
});
test("signed archived original, frozen entry and pages pass independent verification",async()=>{
 const f=fixture();f.signed();
 const report=await f.integrity.auditCloud({client:f.client,owner:U,storeEvidence:true});
 assert.equal(report.ok,true,report.errors.join("; "));
 assert.equal(report.counts.entries,1);
 assert.equal(Object.keys(report.evidence).length,1);
});
test("missing frozen entry, wrong original and broken pagination are reported",async()=>{
 for(const which of ["missing","original","pages"]){
  const f=fixture();f.signed();
  if(which==="missing")f.rows.helilog_archive_entries.length=0;
  if(which==="original")f.rows.helilog_records[0].payload.text="Modified behind the archive";
  if(which==="pages"){
   const extra=clone(f.rows.helilog_print_archives[0]);
   extra.id="archive-uuid-2";extra.first_page=4;extra.payload.id="EN-2";
   extra.payload.firstPage=4;extra.payload.items[0].endorsementId="e-2";
   f.rows.helilog_print_archives.push(extra);
  }
  const report=await f.integrity.auditCloud({client:f.client,owner:U});
  assert.equal(report.ok,false,which);
  assert.ok(report.errors.length>0);
 }
});
test("earlier verified archived content cannot be modified or deleted unnoticed",async()=>{
 const f=fixture();f.signed();
 assert.equal((await f.integrity.auditCloud({client:f.client,owner:U,storeEvidence:true})).ok,true);
 f.rows.helilog_archive_entries[0].snapshot.text="Changed behind backup";
 let report=await f.integrity.auditCloud({client:f.client,owner:U});
 assert.equal(report.ok,false);
 assert.match(report.errors.join(" "),/previously checked|differs/i);
 f.rows.helilog_archive_entries.length=0;
 report=await f.integrity.auditCloud({client:f.client,owner:U});
 assert.equal(report.ok,false);
});
test("signature metadata and before/after correction must agree",async()=>{
 const f=fixture();f.signed();
 const before={title:"Old"},after={title:"Corrected"};
 f.rows.helilog_archive_addenda.push({id:"corr-1",owner_id:U,
  record_kind:"endorsement",record_id:"e-1",reason:"Test correction",
  before_snapshot:before,after_snapshot:after,
  signature_metadata:{id:"C-1",confirmedAt:"2026-10-15T12:30:00Z",reason:"Test correction",
   before:clone(before),after:clone(after)}});
 assert.equal((await f.integrity.auditCloud({client:f.client,owner:U})).ok,true);
 f.rows.helilog_archive_addenda[0].after_snapshot.title="Tampered";
 const report=await f.integrity.auditCloud({client:f.client,owner:U});
 assert.equal(report.ok,false);
 assert.match(report.errors.join(" "),/Correction snapshot differs/);
});
test("archive confirmation checks cloud integrity before any RPC",async()=>{
 const f=fixture();f.signed();
 f.rows.helilog_archive_entries.length=0;
 await assert.rejects(()=>f.archive.confirmBatch("endorsement",{confirmedAt:"2026-10-15"},["e-1"]),/integrity check failed/i);
 assert.equal(f.writes,0);
});
test("verified recovery packages reject corruption, wrong owner and incomplete state",async()=>{
 const f=fixture();f.signed();
 const report=await f.integrity.auditCloud({client:f.client,owner:U,storeEvidence:true});
 assert.equal(report.ok,true);
 const data={pilot:{name:"TEST"},aircraft:[],flights:[],people:[],qualifications:[],
  endorsements:[],printArchive:{batches:[],corrections:[]},
  endorsementV2Archive:{batches:[],amendments:[]}};
 const pack=await f.recovery.create({data,owner:U,archiveReport:report});
 assert.equal((await f.recovery.verify(pack,U)).verified,true);
 await assert.rejects(()=>f.recovery.verify(pack,"22222222-2222-4222-a222-222222222222"),/another account/);
 pack.data.pilot.name="Tampered";
 await assert.rejects(()=>f.recovery.verify(pack,U),/checksum FAILED/);
 assert.equal(f.writes,0);
});
test("UI removes five dashboard cards and old Cloud Account information",()=>{
 const start=html.indexOf("function dashboard(){"),end=html.indexOf("function row(",start);
 assert.ok(start>=0&&end>start);
 const dashboard=html.slice(start,end);
 assert.doesNotMatch(dashboard,/dashboard-actions desktop-only/);
 assert.doesNotMatch(dashboard,/Bring in flight history/);
 assert.match(dashboard,/Flight-time overview/);
 assert.match(dashboard,/Recent flights/);
 assert.doesNotMatch(view,/Local logbook protection/);
 assert.match(view,/Verify archives/);
 assert.match(html,/Download verified cloud recovery package/);
 assert.match(html,/Inspect cloud recovery file/);
});

test("new flight print snapshots must exactly match synchronized cloud originals",async()=>{
 const f=fixture();
 const original={id:"f-1",aid:"a1",date:"2026-10-15",off:"10:00",on:"10:45",mins:45,role:"PIC",picName:"SELF"};
 f.rows.helilog_records.push({owner_id:U,kind:"flight",record_id:"f-1",
  revision:1,payload:clone(original),sealed_at:null});
 const bad=clone(original);bad.mins=50;
 await assert.rejects(()=>f.archive.confirmBatch("flight",
  {confirmedAt:"2026-10-15",flights:[bad]},["f-1"]),/differs from its current cloud record/);
 assert.equal(f.writes,0);
 const accepted=await f.archive.confirmBatch("flight",
  {confirmedAt:"2026-10-15",flights:[clone(original)]},["f-1"]);
 assert.equal(accepted,true);
 assert.equal(f.writes,1);
});
