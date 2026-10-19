/* HeliLog V2.16 — backup health and no-write isolated recovery drill */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {webcrypto}=require("node:crypto");
const base=__dirname;
const moduleSrc=fs.readFileSync(path.join(base,"disaster-recovery.js"),"utf8");
const cloudSrc=fs.readFileSync(path.join(base,"cloud-backups.js"),"utf8");
const sql=fs.readFileSync(path.join(base,"..","supabase","migrations",
 "20261016050000_v210_backup_health_retention.sql"),"utf8");
const html=fs.readFileSync(path.join(base,"index.html"),"utf8");
const gate=fs.readFileSync(path.join(base,"auth-gate.js"),"utf8");
const sw=fs.readFileSync(path.join(base,"service-worker.js"),"utf8");
const owner="11111111-1111-4111-a111-111111111111";
const backupId="22222222-2222-4222-a222-222222222222";
const copy=x=>JSON.parse(JSON.stringify(x));
function payload(){
 const flight={id:"flight-1",date:"2026-10-15",mins:45,role:"PIC"};
 const endorsement={id:"end-1",title:"TEST",signatureData:"fictional-only"};
 const correction={id:"COR-1",confirmedAt:"2026-10-16T12:00:00Z",
  reason:"Fictional correction",before:flight,after:{...flight,mins:50}};
 return {owner,backupId,serverHash:"a".repeat(64),createdAt:"2026-10-16T12:30:00Z",
  content:{schema:1,account:{display_name:"Fictional Pilot"},records:[
   {kind:"flight",record_id:"flight-1",payload:flight},
   {kind:"endorsement",record_id:"end-1",payload:endorsement,sealed_at:"2026-10-15T12:00:00Z"}
  ],archives:[
   {id:"batch-1",kind:"flight",payload:{id:"HL-1",flightIds:["flight-1"]}},
   {id:"batch-2",kind:"endorsement",payload:{id:"EN-1",items:[{endorsementId:"end-1"}]}}
  ],frozen:[
   {archive_id:"batch-1",record_kind:"flight",record_id:"flight-1",snapshot:flight},
   {archive_id:"batch-2",record_kind:"endorsement",record_id:"end-1",snapshot:endorsement}
  ],addenda:[{id:"signed-addon-1",record_kind:"flight",record_id:"flight-1",
   reason:correction.reason,before_snapshot:flight,after_snapshot:correction.after,
   signature_metadata:correction}]}
 };
}
function setup(){
 let ownerInSession=owner,online=true,invocations=0,healthy=true;
 const root={crypto:webcrypto,isSecureContext:true,
  navigator:{get onLine(){return online}},
  HeliLogCloud:{snapshot:()=>({userId:ownerInSession})},
  btoa:text=>Buffer.from(text,"binary").toString("base64"),
  atob:text=>Buffer.from(text,"base64").toString("binary")};
 root.window=root;
 const drill=new Function("window","module",moduleSrc+";return window.HeliLogV210Drill;")(root,undefined);
 const backup=new Function("window","module",cloudSrc+";return window.HeliLogV29Backup;")(root,undefined);
 const client={rpc:async(name)=>{
  invocations++;
  if(name==="helilog_backup_health")return {data:healthy?{
    status:"healthy",scheduleActive:true,snapshotCount:3,checksumVerified:true,
    failedJobRuns7d:0}:{status:"checksum_mismatch",scheduleActive:true,
    snapshotCount:3,checksumVerified:false,failedJobRuns7d:0},error:null};
  if(name==="helilog_backup_retention_preview")return {data:{
   mode:"preview_only",daily:2,manual:1,preRestore:0,eligibleForFuturePruning:0
  },error:null};
  throw Error("Unexpected RPC "+name);
 }};
 return {drill,backup,client,
  changeAccount(x){ownerInSession=x},
  setHealthy(x){healthy=x},
  offline(){online=false},
  get invocations(){return invocations}};
}
test("complete printed/signed backup reconstructs only in memory with matching digest",async()=>{
 const f=setup(),source=payload();
 const before=copy(source);
 const result=await f.drill.drill(source,owner);
 assert.equal(result.ok,true,result.problems.join("; "));
 assert.equal(result.isolated,true);
 assert.equal(result.restored,true);
 assert.deepEqual(result.counts,{records:2,archives:2,frozen:2,addenda:1});
 assert.match(result.sourceFingerprint,/^[0-9a-f]{64}$/);
 assert.equal(result.sourceFingerprint,result.recoveryFingerprint);
 assert.deepEqual(source,before,"Sandbox must never mutate the decrypted source");
});
test("fingerprint protects immutable cloud originals",async()=>{
 const f=setup(),source=payload();
 source.content.records[0].payload={...source.content.records[0].payload,mins:52};
 const result=await f.drill.drill(source,owner);
 assert.equal(result.ok,false);
 assert.match(result.problems.join(" "),/Archived original differs/);
});
test("missing frozen original or duplicate record fails closed",async()=>{
 const f=setup(),missing=payload(),duplicate=payload();
 missing.content.frozen.pop();
 duplicate.content.records.push(copy(duplicate.content.records[0]));
 assert.equal((await f.drill.drill(missing,owner)).ok,false);
 assert.match((await f.drill.drill(missing,owner)).problems.join(" "),/frozen original/i);
 assert.equal((await f.drill.drill(duplicate,owner)).ok,false);
 assert.match((await f.drill.drill(duplicate,owner)).problems.join(" "),/Duplicate cloud record/);
});
test("signed correction metadata tampering and cross-account exports are rejected",async()=>{
 const f=setup(),tampered=payload(),other=payload();
 tampered.content.addenda[0].after_snapshot={...tampered.content.addenda[0].after_snapshot,mins:60};
 assert.equal((await f.drill.drill(tampered,owner)).ok,false);
 assert.match((await f.drill.drill(tampered,owner)).problems.join(" "),/Signed addendum metadata/);
 other.owner="33333333-3333-4333-a333-333333333333";
 assert.throws(()=>f.drill.validate(other,owner),/owner or schema/);
});
test("AES encrypted backup decrypts and passes full sandbox drill without cloud writes",async()=>{
 const f=setup(),source=payload();
 const pass="this is a fictional test passphrase";
 const envelope=await f.backup.encryptSnapshot(source,pass);
 assert.doesNotMatch(JSON.stringify(envelope),/Fictional Pilot/);
 const unlocked=await f.backup.decryptSnapshot(envelope,pass,owner);
 const report=await f.drill.drill(unlocked.data,owner);
 assert.equal(report.ok,true);
 assert.equal(f.invocations,0);
});
test("scheduled backup status and retention are account-scoped read-only calls",async()=>{
 const f=setup();
 const health=await f.backup.health(f.client,owner);
 const retention=await f.backup.retention(f.client,owner);
 assert.equal(health.status,"healthy");
 assert.equal(retention.mode,"preview_only");
 assert.equal(f.invocations,2);
 f.setHealthy(false);
 assert.equal((await f.backup.health(f.client,owner)).status,"checksum_mismatch");
 f.changeAccount("44444444-4444-4444-a444-444444444444");
 await assert.rejects(()=>f.backup.health(f.client,owner),/correct cloud account/);
 assert.equal(f.invocations,3);
});
test("monitoring SQL has authenticated owner-only checks and cannot delete backups",()=>{
 assert.match(sql,/function public\.helilog_backup_health\(\)/);
 assert.match(sql,/function public\.helilog_backup_retention_preview\(\)/);
 assert.match(sql,/select auth\.uid\(\)/);
 assert.match(sql,/cron\.job_run_details/);
 assert.match(sql,/public\.helilog_backup_hash\(v_snapshot\.content\)/);
 assert.match(sql,/source='manual'/);
 assert.match(sql,/source='pre_restore'/);
 assert.match(sql,/90 days/);
 assert.match(sql,/12 months/);
 assert.match(sql,/mode','preview_only'/);
 assert.doesNotMatch(sql,/\bdelete\s+from\s+public\.helilog_backup_snapshots\b/i);
});
test("PWA V2.16 release includes recovery sandbox and monitoring entry",()=>{
 assert.match(html,/cloud-backups\.js\?v=2\.16-google-1/);
 assert.match(html,/disaster-recovery\.js\?v=2\.16-google-1/);
 assert.match(sw,/disaster-recovery\.js\?v=2\.16-google-1/);
 assert.match(gate,/v210CheckBackupHealth/);
 assert.match(gate,/v210TestEncryptedRecovery/);
 assert.match(gate,/Run isolated recovery drill/);
});
