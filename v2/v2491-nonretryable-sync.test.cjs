'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'cloud-sync.js'),'utf8');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261029131813_helilog_test_sync_conflict_nonretryable_http409.sql'),'utf8');
const uid='11111111-1111-4111-a111-111111111111';
const tick=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function env(errorCode){
 const storage=new Map();
 const state={aircraft:[],flights:[]};
 let calls=0;
 const db={rpc:async(name,args)=>{
  assert.equal(name,'helilog_sync_mutation');
  assert.equal(args.p_kind,'aircraft');
  calls++;
  return{data:null,error:{code:errorCode,message:'Cloud record revision changed, review the conflict'}};
 },from:table=>{
  assert.equal(table,'helilog_accounts');
  return{select(){return this},eq(){return this},single:async()=>({data:{reset_generation:0},error:null})};
 }};
 const root={navigator:{onLine:true},console:{warn(){},error(){}},
  localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))},
  HeliLogCloud:{snapshot:()=>({userId:uid})}};
 root.window=root;
 const api=new Function('window','module',src+';return window.HeliLogV23Sync;')(root,undefined);
 api.start({userId:uid,client:db,getData:()=>state,replaceData:()=>{}});
 return {api,state,storage,get calls(){return calls}};
}
test('PT409 is a normal conflict: preserves queued aircraft and stops after one request',async()=>{
 const e=env('PT409');
 await e.api.ensureGeneration();
 e.state.aircraft.push({id:'a1',icao:'G2CA',reg:'LY-TEST'});
 e.api.track(e.state);
 await tick();
 const current=e.api.status();
 assert.equal(current.state,'conflict');
 assert.equal(current.pending,1);
 assert.equal(current.conflicts,1);
 assert.equal(e.calls,1);
 assert.equal(e.api.conflicts()[0].id,'a1');
 const saved=JSON.parse(e.storage.get('helilog_v23_queue_'+uid));
 assert.equal(saved[0].conflict,true);
 assert.equal(saved[0].payload.reg,'LY-TEST');
});
test('legacy SQLSTATE 40001 remains backward-compatible and stops after one request',async()=>{
 const e=env('40001');await e.api.ensureGeneration();e.state.aircraft.push({id:'a2',icao:'G2CA',reg:'LY-OLD'});
 e.api.track(e.state);await tick();
 assert.equal(e.api.status().state,'conflict');
 assert.equal(e.calls,1);
 assert.equal(e.api.status().pending,1);
});
test('migration documents a targeted substitution and does not alter archive or data',()=>{
 assert.match(sql,/errcode=''40001''/);
 assert.match(sql,/errcode=''PT409''/);
 assert.match(sql,/pg_get_functiondef/);
 assert.match(sql,/Expected exactly one legacy retryable error/);
 assert.doesNotMatch(sql,/\bDELETE FROM\b|\bTRUNCATE\b|\bDROP TABLE\b|\bUPDATE public\.helilog_records\b/i);
 assert.match(src,/result\.error\.code==="PT409"/);
});
