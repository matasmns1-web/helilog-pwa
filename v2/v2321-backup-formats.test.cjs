'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=x=>fs.readFileSync(path.join(__dirname,x),'utf8');
const gate=read('auth-gate.js'),ui=read('source/app/10-settings-and-locations.js');
function fixture(format){
  const start=gate.indexOf('async function v28InspectCloudRecovery(ev){');
  const end=gate.indexOf('/* V2.9 private snapshots',start);
  assert.ok(start>=0&&end>start,'Recovery handler source is present');
  const calls={verify:0,render:0,cloud:0};
  const f={name:'encrypted-backup.json',size:4096,text:async()=>JSON.stringify(
    {app:'HeliLog',format,backupSchema:3})};
  const window={
    HeliLogCloud:{snapshot:()=>({userId:'user-test-1'})},
    HeliLogV28Recovery:{verify:async()=>{
      calls.verify++;
      return {counts:{flights:1,aircraft:1,endorsements:1,flightArchives:0,endorsementArchives:0}};
    }}
  };
  const ctx=vm.createContext({window,location:{hash:'#backups'},v23AccountWorkspace:()=>true,
    backups:()=>{calls.render++},cloud:()=>{calls.cloud++},String,JSON,Error});
  vm.runInContext('let v28Busy=false,v28Notice="";'+gate.slice(start,end),ctx);
  return {calls,ctx,f,inspect:()=>vm.runInContext('v28InspectCloudRecovery(event)',ctx)};
}
test('encrypted cloud snapshot selected in V2.8 slot explains the correct no-write verifier',async()=>{
  const f=fixture('encrypted-cloud-snapshot');
  f.ctx.event={target:{files:[f.f],value:'selected'}};
  await f.inspect();
  const message=vm.runInContext('v28Notice',f.ctx);
  assert.match(message,/ENCRYPTED cloud snapshot/);
  assert.match(message,/Verify encrypted backup offline/);
  assert.match(message,/passphrase/);
  assert.equal(f.calls.verify,0,'Must not call V2.8 verifier on encrypted format');
  assert.equal(f.calls.render,1);
  assert.equal(f.ctx.event.target.value,'');
});
test('full local backup is identified without any cloud restore or verification calls',async()=>{
  const f=fixture('helilog-full-backup');
  f.ctx.event={target:{files:[f.f],value:'selected'}};
  await f.inspect();
  assert.match(vm.runInContext('v28Notice',f.ctx),/FULL LOCAL HeliLog backup/);
  assert.equal(f.calls.verify,0);
});
test('valid V2.8 package continues to use the original read-only checksum verifier',async()=>{
  const f=fixture('helilog-cloud-recovery');
  f.ctx.event={target:{files:[f.f],value:'selected'}};
  await f.inspect();
  assert.equal(f.calls.verify,1);
  assert.match(vm.runInContext('v28Notice',f.ctx),/Recovery file SHA-256 verified/);
  assert.match(vm.runInContext('v28Notice',f.ctx),/READ-ONLY/);
});
test('signed-in backup screen verifies encrypted snapshots without legacy V2.8 controls',()=>{
  for(const s of [
    'Verify a saved backup — read-only','Encrypted cloud snapshot',
    'v232VerifyOfflineFile(event)','id="v232OfflineFile"','id="v232OfflinePass"',
    'id="v232OfflineResult"','id="v232OfflineButton"',
    'Verify encrypted backup offline','Download encrypted backup'
  ])assert.ok(ui.includes(s),s);
  for(const legacy of [
    'Verified cloud recovery package (V2.8)','Inspect V2.8 recovery package',
    'Download verified cloud recovery package','v28RecoveryInput','htmlEscape(v28Notice)'
  ])assert.ok(!ui.includes(legacy),'Legacy control still exposed: '+legacy);
  assert.match(ui,/v23AccountWorkspace\(\)\?[\s\S]*v232VerifyOfflineFile/);
  assert.match(gate,/const report=await window\.HeliLogV232OfflineCheck\.verifyText\(await file\.text\(\),password\)/);
});
test('error and verifier outputs do not expose signatures or persist a passphrase',()=>{
  const code=gate.slice(gate.indexOf('async function v232VerifyOfflineFile(event){'),
    gate.indexOf('/* V2.19: recovery'));
  assert.match(code,/if\(passInput\)passInput\.value="";/);
  assert.match(code,/if\(fileInput\)fileInput\.value="";/);
  assert.doesNotMatch(code,/localStorage|sessionStorage|fetch\(|\.rpc\(|\.from\(|replaceData|save\(/);
  assert.doesNotMatch(ui,/htmlEscape\(v28Notice\)/);
  assert.match(ui,/overflow-wrap:anywhere/);
});
test('release cache, version and production guards are not confused with data migration',()=>{
  assert.match(read('service-worker.js'),/helilog-v2-33-recency-phase1-1/);
  assert.match(gate,/HELILOG_TEST_VERSION='V2\.33'/);
  assert.match(read('source/index.template.html'),/HeliLog V2\.33/);
  assert.doesNotMatch(ui,/helilog_create_backup_now|helilog_restore_missing_records/);
});
