/* HeliLog V2.4 regression checks, run with node --test */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=__dirname;
const sync=fs.readFileSync(path.join(dir,'cloud-sync.js'),'utf8');
const archive=fs.readFileSync(path.join(dir,'cloud-archives.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const sql=fs.readFileSync(path.join(dir,'..','supabase','migrations','20261015000000_v24_complete_sync.sql'),'utf8');
const uid='11111111-1111-4111-a111-111111111111';
function mockBackend(){
 const rows=[];
 class Query{
  constructor(){this.method='read';this.filter={};}
  select(){return this}eq(k,v){this.filter[k]=v;return this}
  in(k,ids){this.ins={k,ids};return this}order(){return this}range(){return this}
  insert(x){this.method='insert';this.x=x;return this}
  update(x){this.method='update';this.x=x;return this}
  delete(){this.method='delete';return this}
  then(resolve,reject){
   const match=x=>Object.entries(this.filter).every(([k,v])=>x[k]===v)&&(!this.ins||this.ins.ids.includes(x[this.ins.k]));
   let data=[],error=null;
   if(this.method==='read')data=rows.filter(match).map(x=>({...x}));
   else if(this.method==='insert'){
    if(rows.some(x=>x.owner_id===this.x.owner_id&&x.kind===this.x.kind&&x.record_id===this.x.record_id))error={code:'23505',message:'duplicate'};
    else{rows.push({...this.x,revision:1});data=[{revision:1}];}
   }else{
    const i=rows.findIndex(match);
    if(i>=0){if(this.method==='update'){Object.assign(rows[i],this.x);data=[{revision:rows[i].revision}];}
     else{data=[{revision:rows[i].revision}];rows.splice(i,1);}}
   }
   return Promise.resolve({data,error}).then(resolve,reject);
  }
 }
 return {rows,client:{from(){return new Query()}}};
}
function device(server,name){
 const storage=new Map();
 const root={navigator:{onLine:true},console,localStorage:{
  getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,v)},HeliLogCloud:{snapshot:()=>({userId:uid})}};
 root.window=root;
 const api=new Function('window','module',sync+';return window.HeliLogV23Sync;')(root,undefined);
 let data={aircraft:[],flights:[],pilot:{name},people:[{id:'p_owner',name}],qualifications:[],
  endorsements:[],broughtForward:{total:0},broughtForwardByType:[],broughtForwardImported:false,broughtForwardImportedAt:''};
 api.start({userId:uid,client:server.client,getData:()=>data,replaceData:next=>{data=next}});
 return {api,storage,get data(){return data}};
}
const tick=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};
test('extended data stays opt-in and V2.3 aircraft/flight sync remains the default',async()=>{
 const server=mockBackend(),d=device(server,'First');
 await d.api.refresh();
 assert.equal(d.api.extended(),false);
 d.data.endorsements.push({id:'e1',text:'Signed test',signatureData:'data:image/png;base64,AA'});
 d.api.track(d.data);await tick();
 assert.equal(server.rows.filter(x=>x.kind==='endorsement').length,0);
});
test('explicit primary upload and second-device cloud adoption with safety snapshots',async()=>{
 const server=mockBackend(),a=device(server,'Primary'),b=device(server,'Secondary');
 await a.api.refresh();await b.api.refresh();
 a.data.people.push({id:'examiner',name:'Sample Examiner'});
 a.data.endorsements.push({id:'endorse1',signatoryPersonId:'examiner',signedName:'Sample Examiner',
  signatureData:'data:image/png;base64,AA',signedAt:'2026-10-15T10:00:00Z',text:'Fictional'});
 await a.api.activateExtension('upload');await tick();
 assert.equal(a.api.status().state,'synced');
 assert.equal(server.rows.filter(x=>x.kind==='endorsement').length,1);
 await b.api.activateExtension('cloud');await tick();
 assert.equal(b.data.pilot.name,'Primary');
 assert.equal(b.data.endorsements.length,1);
 assert.equal(b.data.people.some(p=>p.id==='examiner'),true);
 assert.ok(a.storage.get('helilog_v24_pre_extension_'+uid));
 assert.ok(b.storage.get('helilog_v24_pre_extension_'+uid));
});
test('second device cannot overwrite already existing extended cloud records with upload',async()=>{
 const server=mockBackend(),a=device(server,'Primary'),b=device(server,'Secondary');
 await a.api.refresh();await b.api.refresh();
 await a.api.activateExtension('upload');await tick();
 await assert.rejects(()=>b.api.activateExtension('upload'),/already has extended cloud records/i);
});
test('signed originals and archive confirmation are server-side protected',()=>{
 assert.match(sql,/new\.sealed_at\s*=\s*coalesce/);
 assert.match(sql,/Signed endorsement is immutable/);
 assert.match(sql,/revoke insert on public\.helilog_print_archives/);
 assert.match(sql,/helilog_confirm_print_batch/);
 assert.match(sql,/helilog_confirm_print_addendum/);
 assert.match(sql,/Printed endorsement snapshot does not match signed original/);
});
test('print confirmation stays web only and requires confirmed cloud synchronization',()=>{
 const root={navigator:{onLine:true},matchMedia:()=>({matches:false}),HeliLogCloud:{snapshot:()=>({userId:uid})},
  HeliLogV23Sync:{extended:()=>true,status:()=>({state:'pending',owner:uid,pending:1,conflicts:0})}};root.window=root;
 const api=new Function('window','module',archive+';return window.HeliLogV24Archive;')(root,undefined);
 api.start({userId:uid,db:{from(){return{}},rpc(){return{}}}});
 assert.equal(api.available(),false);
 root.HeliLogV23Sync.status=()=>({state:'synced',owner:uid,pending:0,conflicts:0});
 assert.equal(api.available(),true);
 root.navigator.standalone=true;
 assert.rejects(api.confirmBatch('flight',{confirmedAt:'2026-10-15'},['f1']),/web browser/);
});
test('V2.13 keeps the V2.4 cloud archive and sync modules versioned together',()=>{
 for(const file of ['cloud-config.js','cloud-foundation.js','cloud-view.js','cloud-sync.js','auth-gate.js','cloud-archives.js'])
  assert.match(html,new RegExp(file.replace('.','\\.')+'\\?v=2\\.13-security-1'));
 assert.match(html,/V2\.13 · TEST/);
});
