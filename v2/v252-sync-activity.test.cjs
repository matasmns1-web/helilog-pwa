'use strict';
/* V2.55 TEST — automatic private diagnostics independent of critical flight sync. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,x),'utf8');
const code=read('sync-activity.js');
const U1='11111111-1111-4111-a111-111111111111';
const U2='22222222-2222-4222-a222-222222222222';
async function settle(){await new Promise(resolve=>setImmediate(resolve));}
function harness({storage=new Map(),connected=true,fail=false}={}){
 const metrics={writes:[],reads:0},tables=[];
 const root={
  navigator:{onLine:connected,userAgent:'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',maxTouchPoints:5},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  crypto:{randomUUID:(()=>{let n=1;return()=> '00000000-0000-4000-8000-'+String(n++).padStart(12,'0');})()},
  console:{error(){},warn(){}}
 };
 root.window=root;
 const client={from(table){
  tables.push(table);
  return {
   async insert(row){metrics.writes.push(JSON.parse(JSON.stringify(row)));return{data:null,error:fail?{code:'42501',message:'private backend error'}:null}},
   select(){return this},eq(){return this},order(){return this},
   async limit(){metrics.reads++;return {data:metrics.writes.map(w=>({...w})),error:null}}
  };
 }};
 const api=new Function('window','module',code+';return window.HeliLogSyncActivity;')(root,undefined);
 const status=(owner=U1,state='synced',extras={})=>({owner,state,online:root.navigator.onLine,pending:0,conflicts:0,error:'Bearer A_SECRET! '+owner,...extras});
 return {root,client,api,storage,metrics,tables,status};
}
test('only allowlisted sync metadata goes to TEST Supabase, never raw errors or flight records',async()=>{
 const h=harness();h.api.start({userId:U1,client:h.client});
 h.api.observe(h.status(U1,'conflict',{pending:3,conflicts:1,flight:{id:'secret',pilot:'private'}}));
 await settle();
 assert.equal(h.metrics.writes.length,1);
 const row=h.metrics.writes[0];
 assert.equal(row.owner_id,U1);
 assert.equal(row.state,'conflict');
 assert.equal(row.event_type,'conflict_detected');
 assert.equal(row.pending_count,3);
 assert.equal(row.conflict_count,1);
 assert.equal(row.device_kind,'iPad');
 assert.deepEqual(Object.keys(row).sort(),['conflict_count','device_kind','event_id','event_type','owner_id','pending_count','recorded_at','state'].sort());
 assert.doesNotMatch(JSON.stringify(row),/Bearer|A_SECRET|pilot|flight|private backend error/);
 assert.equal(h.tables.every(n=>n==='helilog_sync_activity'),true);
});
test('periodic successful sync checks do not create a write storm or duplicate log events',async()=>{
 const h=harness();h.api.start({userId:U1,client:h.client});
 for(let i=0;i<40;i++)h.api.observe(h.status());
 await settle();
 assert.equal(h.api.local().length,1);
 assert.equal(h.metrics.writes.length,1);
 for(let i=0;i<40;i++)h.api.observe(h.status(U1,'conflict',{pending:2,conflicts:1}));
 await settle();
 assert.equal(h.api.local().length,2);
 assert.equal(h.metrics.writes.length,1,'only one upload per throttle interval');
});
test('offline/conflict/recovery are recorded locally without writing while offline',async()=>{
 const h=harness({connected:false});h.api.start({userId:U1,client:h.client});
 h.api.observe(h.status(U1,'offline'));
 assert.equal(h.metrics.writes.length,0);
 assert.equal(h.api.local()[0].state,'offline');
 h.root.navigator.onLine=true;
 h.api.observe(h.status(U1,'synced'));
 await settle();
 assert.equal(h.api.local().length,2);
 assert.equal(h.api.local()[0].event_type,'sync_recovered');
 assert.equal(h.metrics.writes.length,1);
 assert.equal(h.metrics.writes[0].state,'offline','first preserved event must not be silently skipped');
});
test('failed diagnostic uploads remain local and never retry in a tight loop',async()=>{
 const h=harness({fail:true});h.api.start({userId:U1,client:h.client});
 h.api.observe(h.status(U1,'error'));
 await settle();
 assert.equal(h.metrics.writes.length,1);
 assert.equal(h.api.local()[0].uploaded,false);
 for(let i=0;i<40;i++)h.api.observe(h.status(U1,'error'));
 await settle();
 assert.equal(h.metrics.writes.length,1);
 assert.equal(h.api.local().length,1);
});
test('account switching, signed-out status and saved preferences isolate diagnostic data',async()=>{
 const storage=new Map(),h=harness({storage});
 h.api.start({userId:U1,client:h.client});
 h.api.observe(h.status(U1,'synced'));await settle();
 const old=h.api.local()[0].event_id;
 h.api.start({userId:U2,client:h.client});
 assert.equal(h.api.local().length,0);
 h.api.observe(h.status(U1,'conflict',{conflicts:1}));
 assert.equal(h.api.local().length,0,'old account status cannot be logged under the new user');
 h.api.setEnabled(false);
 h.api.observe(h.status(U2,'error'));
 assert.equal(h.api.local().length,0);
 h.api.stop();
 assert.equal(h.api.local().length,0);
 h.api.start({userId:U2,client:h.client});
 assert.equal(h.api.isEnabled(),false);
 h.api.start({userId:U1,client:h.client});
 assert.equal(h.api.isEnabled(),true);
 assert.equal(h.api.local()[0].event_id,old);
});
test('recent history merges cloud and local events without uploading',async()=>{
 const h=harness();h.api.start({userId:U1,client:h.client});
 h.api.observe(h.status(U1,'synced'));await settle();
 const before=h.metrics.writes.length;
 const result=await h.api.recent();
 assert.equal(result.cloudAvailable,true);
 assert.equal(result.events.length,1,'deduplicate the same local and cloud event');
 assert.equal(h.metrics.writes.length,before,'opening activity log is read-only');
});
test('user can pause logging and resume without deleting previous events',async()=>{
 const h=harness();h.api.start({userId:U1,client:h.client});
 h.api.observe(h.status(U1,'synced'));await settle();
 h.api.setEnabled(false);
 h.api.observe(h.status(U1,'conflict',{conflicts:1}));
 assert.equal(h.api.local().length,1);
 h.api.setEnabled(true);
 h.api.observe(h.status(U1,'conflict',{conflicts:1}));
 assert.equal(h.api.local().length,2);
});
test('UI replaces clipboard button, and recorder cannot call the flight sync path',()=>{
 const ui=read('source/app/10-settings-and-locations.js'),
       gate=read('auth-gate.js'),
       template=read('source/index.template.html'),
       worker=read('service-worker.js'),
       sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261103074520_helilog_v252_test_private_sync_activity.sql'),'utf8');
 assert.match(ui,/id="v252ActivityPanel"/);
 assert.match(ui,/function v252ActivityOpened/);
 assert.doesNotMatch(ui,/id="v251CopyCloudDiagnostics"/);
 assert.match(gate,/HeliLogSyncActivity\?\.observe\(st\)/);
 assert.match(template,/sync-activity\.js\?v=2\.52/);
 assert.match(worker,/helilog-v2-56-3-clean-totals-1/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/30 days/);
 assert.doesNotMatch(code,/HeliLogV23Sync\.flush|HeliLogV23Sync\.refresh|helilog_records|printArchive/);
});
