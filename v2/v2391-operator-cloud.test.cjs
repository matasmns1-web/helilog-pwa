'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'cloud-sync.js'),'utf8');
const auth=fs.readFileSync(path.join(__dirname,'auth-gate.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'operator-rules-ui.js'),'utf8');
const USER='11111111-1111-4111-a111-111111111111';
const clone=x=>JSON.parse(JSON.stringify(x));
const tick=async()=>{for(let i=0;i<130;i++)await Promise.resolve()};
function backend(){
 const rows=[];
 class Query{
  constructor(){this.op='select';this.filters={};}
  select(){return this}eq(k,v){this.filters[k]=v;return this}in(k,ids){this.ins=[k,ids];return this}
  order(){return this}range(){return this}
  insert(v){this.op='insert';this.val=v;return this}
  update(v){this.op='update';this.val=v;return this}
  delete(){this.op='delete';return this}
  match(row){return Object.entries(this.filters).every(([k,v])=>row[k]===v)&&(!this.ins||this.ins[1].includes(row[this.ins[0]]));}
  async maybeSingle(){return {data:clone(rows.find(x=>this.match(x))||null),error:null};}
  then(ok,bad){
   let data=[],error=null;
   if(this.op==='select')data=rows.filter(x=>this.match(x)).map(clone);
   else if(this.op==='insert'){
    if(rows.some(x=>x.owner_id===this.val.owner_id&&x.kind===this.val.kind&&x.record_id===this.val.record_id))
     error={code:'23505',message:'Record exists'};
    else{rows.push({...clone(this.val),revision:1});data=[{revision:1}];}
   }else{
    const i=rows.findIndex(x=>this.match(x));
    if(i>=0){const old=rows[i];if(this.op==='update')Object.assign(old,clone(this.val));
      else rows.splice(i,1);data=[{revision:old.revision}];}
   }
   return Promise.resolve({data,error}).then(ok,bad);
  }
 }
 return {rows,client:{from(){return new Query()}}};
}
function device(server,name,initialRules){
 const store=new Map(),local={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};
 let data={aircraft:[],flights:[],people:[],qualifications:[],endorsements:[],
  pilot:{name},broughtForward:{},broughtForwardByType:[],broughtForwardImported:false,broughtForwardImportedAt:'',
  siteLocations:[]};
 if(initialRules)data.operatorProfiles=clone(initialRules);
 const root={navigator:{onLine:true},console,localStorage:local,
  HeliLogCloud:{snapshot:()=>({userId:USER})}};root.window=root;
 const api=new Function('window','module',source+';return window.HeliLogV23Sync;')(root,undefined);
 api.start({userId:USER,client:server.client,getData:()=>data,replaceData:next=>{data=next;local.setItem('workspace',JSON.stringify(data));}});
 return {api,root,store,get data(){return data}};
}
const sample=(name='Helicopter Operator')=>({version:1,ownerId:USER,activeId:'op_1',
 profiles:[{schema:1,id:'op_1',ownerId:USER,operator:name,rules:[]}]});
test('account-scoped operator rules sync, including the active operator, across devices',async()=>{
 const server=backend(),web=device(server,'Web',sample()),app=device(server,'App');
 await web.api.refresh();await app.api.refresh();
 await web.api.activateExtension('upload');await tick();
 assert.equal(web.api.status().state,'synced');
 const row=server.rows.find(x=>x.kind==='settings'&&x.record_id==='operatorProfiles');
 assert.ok(row,'operator rules uploaded under existing private settings kind');
 assert.equal(row.owner_id,USER);
 assert.equal(row.payload.data.activeId,'op_1');
 await app.api.activateExtension('cloud');await tick();
 assert.deepEqual(app.data.operatorProfiles,sample());
 assert.equal(app.api.status().state,'synced');
 web.data.operatorProfiles.profiles[0].operator='Updated operator';
 web.api.track(web.data);await tick();await app.api.refresh();
 assert.equal(app.data.operatorProfiles.profiles[0].operator,'Updated operator');
});
test('competing offline operator edits are kept for explicit conflict review',async()=>{
 const server=backend(),a=device(server,'Web',sample()),b=device(server,'App');
 await a.api.refresh();await a.api.activateExtension('upload');await tick();
 await b.api.activateExtension('cloud');await tick();
 b.root.navigator.onLine=false;
 b.data.operatorProfiles.profiles[0].operator='App local copy';
 b.api.track(b.data);await tick();
 a.data.operatorProfiles.profiles[0].operator='Web cloud copy';
 a.api.track(a.data);await tick();
 b.root.navigator.onLine=true;
 await b.api.refresh();
 assert.equal(b.api.status().state,'conflict');
 const c=b.api.conflicts().find(x=>x.kind==='settings'&&x.id==='operatorProfiles');
 assert.ok(c&&c.reviewable,'custom operator settings must be reviewable');
 assert.equal(b.data.operatorProfiles.profiles[0].operator,'App local copy');
 const preview=await b.api.previewRecordConflict('settings','operatorProfiles');
 assert.equal(preview.cloud.data.profiles[0].operator,'Web cloud copy');
 assert.equal(preview.local.data.profiles[0].operator,'App local copy');
 await b.api.resolveRecordConflict('cloud');await b.api.refresh();
 assert.equal(b.data.operatorProfiles.profiles[0].operator,'Web cloud copy');
 assert.ok([...b.store.keys()].some(k=>k.startsWith('helilog_v27_conflict_backup_')));
});
test('missing local operator profiles do not create empty competing cloud settings',async()=>{
 const server=backend(),fresh=device(server,'Fresh');
 await fresh.api.refresh();await fresh.api.activateExtension('upload');
 assert.equal(server.rows.some(x=>x.kind==='settings'&&x.record_id==='operatorProfiles'),false);
});
test('legacy operator cache is non-destructive and cloud adoption is guarded',()=>{
 assert.match(ui,/function legacyForAccount\(ownerId\)/);
 assert.match(ui,/return validate\(data,ownerId\)/);
 assert.match(auth,/legacyForAccount\?\.\(id\)/);
 assert.match(auth,/legacyRules && workspace.operatorProfiles===undefined/);
 assert.match(auth,/setup.hasCloud && legacyRules/);
 assert.match(auth,/operatorProfiles:next.operatorProfiles/);
});
