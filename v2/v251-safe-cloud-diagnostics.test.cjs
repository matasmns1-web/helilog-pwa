'use strict';
/* V2.51 TEST — copy sync diagnostics must be explicit, read-only and private. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=pathInV2=>fs.readFileSync(path.join(__dirname,pathInV2),'utf8');
const src=read('source/app/10-settings-and-locations.js');
const start=src.indexOf('/* V2.50 — compact, read-only device health.');
const end=src.indexOf('function settings(){',start);
assert.ok(start!==-1&&end>start,'cloud health code must remain isolated and testable');
const chunk=src.slice(start,end);
const baseline={
 state:'conflict',online:true,pending:3,conflicts:1,
 lastCloudCheckAt:'2026-10-29T13:04:00.000Z',
 lastSyncedAt:'2026-10-28T10:00:00.000Z',
 error:'secret-account@example.org - LICENSE-123 - DB INTERNAL ERROR'
};
function fixture({signedIn=true,clipboard=true,throws=false,status=baseline}={}){
 const calls={reads:0,refreshes:0,copies:[],extended:0};
 const feedback={textContent:''};
 const sync={
  status(){calls.reads++;return status;},
  extended(){calls.extended++;return true;},
  refresh(){calls.refreshes++;throw Error('report must never request a cloud sync');}
 };
 const ctx={
  window:{HeliLogV23Sync:sync},
  v23AccountWorkspace:()=>signedIn,
  Date,
  document:{getElementById:id=>id==='v251CloudDiagnosticsStatus'?feedback:null},
  htmlEscape:txt=>String(txt??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
 };
 if(clipboard)ctx.navigator={clipboard:{async writeText(value){calls.copies.push(value);if(throws)throw Error('clipboard blocked');}}};
 else ctx.navigator={};
 vm.createContext(ctx);
 vm.runInContext(chunk,ctx);
 return {ctx,calls,feedback,
  report:()=>vm.runInContext('v251CloudHealthReport()',ctx),
  copy:()=>vm.runInContext('v251CopyCloudHealthSummary()',ctx),
  health:()=>vm.runInContext('v250CloudHealthMarkup()',ctx)};
}
test('Cloud Health exposes the passive activity log instead of an explicit copy action',()=>{
 const f=fixture();
 const html=f.health();
 assert.match(html,/id="v252ActivityPanel"/);
 assert.match(html,/ontoggle="v252ActivityOpened\(this\)"/);
 assert.match(html,/id="v252ActivityRows"/);
 assert.doesNotMatch(html,/id="v251CopyCloudDiagnostics"/);
 assert.equal(f.calls.copies.length,0);
 assert.equal(f.calls.refreshes,0);
});
test('only an allowlisted status summary is copied, never identifiers, records or raw errors',async()=>{
 const f=fixture();
 const report=f.report();
 for(const expected of [
  'HeliLog V2.51','Status: Needs review','Browser-reported network: Online',
  'Full cloud setup: Complete','Pending changes: 3','Unresolved conflicts: 1',
  'Last successful cloud read (UTC): 2026-10-29T13:04:00.000Z',
  'Last fully synced (UTC): 2026-10-28T10:00:00.000Z',
  'Sync error present: Yes'])assert.ok(report.includes(expected),expected);
 for(const secret of ['secret-account@example.org','LICENSE-123','DB INTERNAL ERROR'])assert.ok(!report.includes(secret),secret);
 assert.equal(await f.copy(),true);
 assert.equal(f.calls.copies.length,1);
 assert.equal(f.calls.copies[0],report);
 assert.match(f.feedback.textContent,/Safe sync summary copied/);
 assert.equal(f.calls.refreshes,0);
});
test('signed-out users cannot inspect or copy the previous account health',async()=>{
 const f=fixture({signedIn:false});
 assert.equal(f.report(),'');
 assert.match(f.health(),/Sign in/);
 assert.equal(await f.copy(),false);
 assert.match(f.feedback.textContent,/Sign in/);
 assert.equal(f.calls.reads,0);
 assert.equal(f.calls.copies.length,0);
});
test('unsupported clipboard and rejected permission fail safely without sync activity',async()=>{
 for(const options of [{clipboard:false},{throws:true}]){
  const f=fixture(options);
  assert.equal(await f.copy(),false);
  assert.match(f.feedback.textContent,/Clipboard unavailable|Could not copy/);
  assert.equal(f.calls.refreshes,0);
  if(options.clipboard===false)assert.equal(f.calls.copies.length,0);
 }
});
test('diagnostics convert invalid timestamps and negative counters without exposing raw status strings',()=>{
 const f=fixture({status:{
  ...baseline,state:'some secret owner token',pending:-9,conflicts:'bogus',
  lastCloudCheckAt:'not-a-date',lastSyncedAt:null,error:'MY-PRIVATE-DATA'
 }});
 const report=f.report();
 assert.match(report,/Status: Unknown/);
 assert.match(report,/Pending changes: 0/);
 assert.match(report,/Unresolved conflicts: 0/);
 assert.match(report,/Last successful cloud read \(UTC\): Not recorded/);
 assert.match(report,/Last fully synced \(UTC\): Not recorded/);
 assert.doesNotMatch(report,/secret owner token|MY-PRIVATE-DATA/);
});
test('the generated app, local TEST cache, and help guide contain the feature',()=>{
 const built=read('index.html');
 const template=read('source/index.template.html');
 const cache=read('service-worker.js');
 const guide=read('source/app/13-help-guide.js');
 assert.match(built,/function v251CloudHealthReport\(\)/);
 assert.match(built,/Sync activity log/);
 assert.match(built,/V2\.52 · TEST ENVIRONMENT/);
 assert.match(template,/V2\.52 · TEST ENVIRONMENT/);
 assert.match(cache,/helilog-v2-52-private-sync-activity-1/);
 assert.match(guide,/v:"V2\.52",name:"Private automatic sync activity log"/);
 assert.match(guide,/v:"V2\.51",name:"Copy private Cloud Health status"/);
});
