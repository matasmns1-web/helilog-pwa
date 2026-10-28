'use strict';
/* V2.44: protected logbook reset, remote generation fence, and release safety. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migration=read('supabase/migrations/20261028120000_v244_account_logbook_reset.sql');
const sync=read('v2/cloud-sync.js');
const app=read('v2/index.html');
const cloud=read('v2/cloud-archives.js');
const uid='11111111-1111-4111-a111-111111111111';
test('reset RPC is isolated to authenticated owner, recent session, transaction-scoped and deletes all owned copies',()=>{
 assert.match(migration,/auth\.sessions s[\s\S]*created_at\s*>=/);
 assert.match(migration,/p_confirmation is distinct from 'DELETE MY LOGBOOK'/);
 assert.match(migration,/where user_id=v_owner for update/);
 for(const table of ['helilog_archive_addenda','helilog_archive_entries','helilog_print_archives','helilog_records','helilog_backup_snapshots'])
  assert.match(migration,new RegExp('delete from public\\.'+table+' where owner_id=v_owner'));
 assert.match(migration,/update public\.helilog_accounts set reset_generation=v_generation\+1/);
 assert.match(migration,/revoke insert,update,delete on public\.helilog_records from authenticated/);
 assert.match(migration,/revoke all on function public\.helilog_confirm_print_batch_legacy_internal/);
 assert.match(migration,/revoke all on function public\.helilog_confirm_print_addendum_legacy_internal/);
 assert.doesNotMatch(migration,/delete from auth\./);
});
test('reset screen requires backup, password, exact phrase, explicit final confirmation',()=>{
 assert.match(app,/Data management/);
 assert.match(app,/Download logbook backup/);
 assert.match(app,/DELETE MY LOGBOOK/);
 assert.match(app,/v244ResetPassword/);
 assert.match(app,/signInWithPassword/);
 assert.match(app,/v244ResetBackupVerified/);
 assert.match(app,/Permanently delete logbook data/);
 assert.match(app,/v244ResetRequiredView/);
 assert.match(app,/CLEAR THIS DEVICE/);
 assert.match(cloud,/if\(syncStatus\.resetSupported\)args\.p_reset_generation=syncStatus\.resetGeneration/g);
});
test('a previously active device is fenced after another device reset',async()=>{
 let serverGeneration=0,remoteWrites=0;
 const data={flights:[],aircraft:[]},store=new Map();
 const query=table=>({
  select(){return this},eq(){return this},in(){return this},order(){return this},range(){return this},
  async single(){return {data:{reset_generation:serverGeneration},error:null}},
  then(ok,bad){return Promise.resolve({data:[],error:null}).then(ok,bad)}
 });
 const client={from:query,async rpc(){remoteWrites++;return {data:1,error:null}}};
 const rootObj={navigator:{onLine:true},console,localStorage:{
  getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))
 },HeliLogCloud:{snapshot:()=>({userId:uid})}};
 rootObj.window=rootObj;
 const api=new Function('window','module',sync+';return window.HeliLogV23Sync;')(rootObj,undefined);
 api.start({userId:uid,client,getData:()=>data,replaceData:next=>Object.assign(data,next),freshAccountDevice:true});
 assert.equal(await api.refresh(),true);
 assert.equal(api.status().resetGeneration,0);
 serverGeneration=1;
 assert.equal(await api.refresh(),false);
 assert.equal(api.status().state,'reset_required');
 assert.equal(api.status().resetGeneration,null);
 assert.equal(remoteWrites,0);
 assert.throws(()=>api.track(data),/reset check incomplete|cannot be queued/i);
});
test('reset preparation fails unless device and cloud archive counts match',()=>{
 assert.match(app,/localArchiveBatches!==audit\.counts\.batches/);
 assert.match(app,/localSignedAddenda!==audit\.counts\.addenda/);
 assert.match(app,/Cloud archive refresh is not healthy/);
});

test('without TEST migration, logbook keeps legacy sync and deletion remains disabled',async()=>{
 const store=new Map(),remote=[];
 const data={aircraft:[],flights:[]};
 class Query {
  constructor(table){this.table=table;this.filters={};this.method='read';}
  select(){return this}eq(k,v){this.filters[k]=v;return this}
  in(){return this}order(){return this}range(){return this}
  async single(){return {data:null,error:{code:'42703',message:'column helilog_accounts.reset_generation does not exist'}};}
  insert(v){this.method='insert';this.payload=v;return this}
  then(ok,bad){
   let rows=[],error=null;
   if(this.method==='read')rows=remote.filter(row=>Object.entries(this.filters).every(([key,value])=>row[key]===value));
   else{remote.push({...this.payload,revision:1});rows=[{revision:1}];}
   return Promise.resolve({data:rows,error}).then(ok,bad);
  }
 }
 let rpcCalls=0;
 const client={from:table=>new Query(table),async rpc(){rpcCalls++;throw Error('RPC must not be used on old schema');}};
 const browser={navigator:{onLine:true},console,localStorage:{
  getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))
 },HeliLogCloud:{snapshot:()=>({userId:uid})}};
 browser.window=browser;
 const api=new Function('window','module',sync+';return window.HeliLogV23Sync;')(browser,undefined);
 api.start({userId:uid,client,getData:()=>data,replaceData:next=>Object.assign(data,next),freshAccountDevice:true});
 assert.equal(await api.refresh(),true);
 assert.equal(api.status().state,'synced');
 assert.equal(api.status().resetSupported,false);
 assert.equal(api.status().resetGeneration,null);
 data.aircraft.push({id:'demo',reg:'LY-TEST'});
 api.track(data);
 for(let i=0;i<100;i++)await Promise.resolve();
 assert.equal(remote.length,1);
 assert.equal(rpcCalls,0);
 assert.match(app,/Deletion unavailable on this test server/);
 assert.match(app,/sync\.resetSupported===true/);
});
test('production remains separate and test release has a distinct cache',()=>{
 assert.match(read('v2/service-worker.js'),/helilog-v2-44-1-data-management-1/);
 assert.match(app,/V2\.44\.1\.1 · TEST ENVIRONMENT/);
 assert.match(read('v2/manifest.webmanifest'),/V2\.44\.1\.1/);
});
