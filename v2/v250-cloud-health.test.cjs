'use strict';
/* V2.50 TEST — health diagnostics must be accurate, private, and passive. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const source=read('cloud-sync.js'),ui=read('source/app/10-settings-and-locations.js');
const UID1='11111111-1111-4111-a111-111111111111';
const UID2='22222222-2222-4222-a222-222222222222';
function server(){
 const rows=[];
 let reads=0,mutations=0,broken=false,conflict=false;
 class Query{
  constructor(table){this.table=table;this.filter={};this.method='read';}
  select(){return this}eq(k,v){this.filter[k]=v;return this}
  async single(){return{data:{reset_generation:0},error:null}}
  in(k,values){this.inValues={k,values};return this}
  order(){return this}range(){return this}
  insert(x){this.method='insert';this.item=x;return this}
  update(x){this.method='update';this.item=x;return this}
  delete(){this.method='delete';return this}
  then(resolve,reject){
   reads++;
   if(broken)return Promise.resolve({data:null,error:{message:'Test cloud unavailable'}}).then(resolve,reject);
   const selected=rows.filter(r=>Object.entries(this.filter).every(([k,v])=>r[k]===v)
     &&(!this.inValues||this.inValues.values.includes(r[this.inValues.k])));
   return Promise.resolve({data:selected.map(x=>({...x})),error:null}).then(resolve,reject);
  }
 }
 return {rows,client:{from:table=>new Query(table),rpc:async(name,args)=>{
  if(name==='helilog_sync_mutation'){
   mutations++;
   if(conflict)return{data:null,error:{code:'PT409',message:'Cloud revision conflict'}};
   const record=rows.find(x=>x.owner_id===args.p_owner_id&&x.kind===args.p_kind&&x.record_id===args.p_record_id);
   return{data:record?.revision||1,error:null};
  }
  return{data:0,error:null};
 }},get reads(){return reads},get mutations(){return mutations},
 setBroken:v=>{broken=v},setConflict:v=>{conflict=v}};
}
function device(s,uid=UID1,storage=new Map()){
 let data={aircraft:[],flights:[]},online=true;
 const root={
  navigator:{get onLine(){return online}},
  console:{warn(){},error(){}},
  localStorage:{
   getItem:k=>storage.has(k)?storage.get(k):null,
   setItem:(k,v)=>storage.set(k,String(v))
  },
  HeliLogCloud:{snapshot:()=>({userId:uid})}
 };
 root.window=root;
 const api=new Function('window','module',source+';return window.HeliLogV23Sync;')(root,undefined);
 api.start({userId:uid,client:s.client,getData:()=>data,replaceData:v=>{data=v}});
 return{api,storage,uid,setOnline:v=>{online=v},
  setData:v=>{data=v},get data(){return data}};
}
function isStamp(value){return typeof value==='string'&&!Number.isNaN(Date.parse(value));}
test('first successful cloud read produces a local timestamp, and a clean sync records its own success',async()=>{
 const s=server(),d=device(s);
 assert.equal(d.api.status().lastCloudCheckAt,null);
 assert.equal(d.api.status().lastSyncedAt,null);
 assert.equal(await d.api.refresh(),true);
 const st=d.api.status();
 assert.equal(st.state,'synced');
 assert.equal(st.pending,0);
 assert.equal(st.conflicts,0);
 assert.equal(isStamp(st.lastCloudCheckAt),true);
 assert.equal(isStamp(st.lastSyncedAt),true);
 assert.equal(st.lastSyncedAt>=st.lastCloudCheckAt,true);
 assert.equal(s.mutations,0);
 const saved=JSON.parse(d.storage.get('helilog_v250_sync_health_'+UID1));
 assert.equal(saved.lastSyncedAt,st.lastSyncedAt);
});
test('reopening same account restores timestamps without an extra cloud request; other account never inherits them',async()=>{
 const s=server(),storage=new Map();
 const a=device(s,UID1,storage);await a.api.refresh();
 const previous=a.api.status(),reads=s.reads;
 a.api.stop();
 assert.equal(a.api.status().lastSyncedAt,null);
 const same=device(s,UID1,storage);
 assert.equal(same.api.status().lastSyncedAt,previous.lastSyncedAt);
 assert.equal(same.api.status().lastCloudCheckAt,previous.lastCloudCheckAt);
 assert.equal(s.reads,reads);
 const other=device(s,UID2,storage);
 assert.equal(other.api.status().lastSyncedAt,null);
 assert.equal(other.api.status().lastCloudCheckAt,null);
 assert.equal(s.reads,reads);
});
test('failing to contact the cloud does not claim a successful full sync and never resets pending records',async()=>{
 const s=server(),d=device(s);s.setBroken(true);
 assert.equal(await d.api.refresh(),false);
 assert.equal(d.api.status().state,'error');
 assert.equal(d.api.status().lastCloudCheckAt,null);
 assert.equal(d.api.status().lastSyncedAt,null);
 assert.equal(d.api.status().pending,0);
 s.setBroken(false);await d.api.refresh();
 const good=d.api.status().lastSyncedAt;
 s.setBroken(true);await d.api.refresh();
 assert.equal(d.api.status().lastSyncedAt,good);
 assert.equal(d.api.status().state,'error');
});
test('offline status does not invent a successful cloud check',async()=>{
 const d=device(server());d.setOnline(false);
 assert.equal(await d.api.refresh(),false);
 assert.equal(d.api.status().online,false);
 assert.equal(d.api.status().lastCloudCheckAt,null);
 assert.equal(d.api.status().lastSyncedAt,null);
});
test('bad health metadata fails open for diagnostics without clearing queued flight records',()=>{
 const s=server(),storage=new Map();
 storage.set('helilog_v250_sync_health_'+UID1,'{bad json');
 storage.set('helilog_v23_queue_'+UID1,JSON.stringify([{
  kind:'aircraft',id:'a1',action:'put',baseRevision:null,generation:1,
  payload:{id:'a1',icao:'G2CA',reg:'LY-TEST'},conflict:true
 }]));
 const d=device(s,UID1,storage);
 assert.equal(d.api.status().lastSyncedAt,null);
 assert.equal(d.api.status().pending,1);
 assert.equal(d.api.status().conflicts,1);
 assert.equal(d.api.status().state,'pending');
 assert.match(storage.get('helilog_v23_queue_'+UID1),/LY-TEST/);
});
test('Settings card remains passive, compact and escapes cloud errors',()=>{
 const start=ui.indexOf('/* V2.50 — compact, read-only device health.');
 const end=ui.indexOf('function settings(){',start);
 assert.ok(start>=0&&end>start);
 let status={state:'conflict',pending:2,conflicts:1,online:true,
  lastCloudCheckAt:'2026-10-29T13:00:00.000Z',lastSyncedAt:'2026-10-28T15:00:00.000Z',
  error:'<script>unsafe</script>'};
 let statusCalls=0,networkCalls=0;
 const ctx=vm.createContext({
  window:{HeliLogV23Sync:{
   status:()=>{statusCalls++;return status},
   extended:()=>true,
   refresh:()=>{networkCalls++;throw Error('unexpected sync')}
  }},
  v23AccountWorkspace:()=>true,
  htmlEscape:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  Date
 });
 vm.runInContext(ui.slice(start,end),ctx);
 const output=vm.runInContext('v250CloudHealthMarkup()',ctx);
 for(const token of ['Cloud health','Needs review','Pending changes','Unresolved conflicts',
  'Last successful cloud read','Last fully synced','This panel does not contact Supabase']){
  assert.match(output,new RegExp(token));
 }
 assert.match(output,/&lt;script&gt;unsafe&lt;\/script&gt;/);
 assert.doesNotMatch(output,/<script>unsafe<\/script>/);
 assert.match(output,/<details/);
 assert.equal(statusCalls,1);
 assert.equal(networkCalls,0);
 status={...status,state:'synced',pending:0,conflicts:0,error:''};
 assert.match(vm.runInContext('v250CloudHealthMarkup()',ctx),/Cloud health · Synced/);
});
test('unsigned and signed-out users receive no owner diagnostics',()=>{
 const start=ui.indexOf('/* V2.50 — compact, read-only device health.');
 const end=ui.indexOf('function settings(){',start);
 let touched=0;
 const ctx=vm.createContext({v23AccountWorkspace:()=>false,
  window:{HeliLogV23Sync:{status:()=>{touched++;throw Error('private state leaked')}}}});
 vm.runInContext(ui.slice(start,end),ctx);
 assert.match(vm.runInContext('v250CloudHealthMarkup()',ctx),/Sign in/);
 assert.equal(touched,0);
});
