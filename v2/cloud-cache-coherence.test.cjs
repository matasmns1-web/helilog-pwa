/* node --test v2/cloud-cache-coherence.test.cjs */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=__dirname;
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const worker=fs.readFileSync(path.join(dir,'service-worker.js'),'utf8');
const cloud=fs.readFileSync(path.join(dir,'cloud-foundation.js'),'utf8');
const gate=fs.readFileSync(path.join(dir,'auth-gate.js'),'utf8');

test('every cloud script URL matches the offline shell and has a versioned URL',()=>{
 for(const file of ['cloud-config.js','cloud-foundation.js','cloud-view.js','cloud-sync.js','auth-gate.js']){
  const url='./'+file+'?v=2.8-archive-recovery-1';
  assert.ok(html.includes('<script src="'+url+'"></script>'),file+' HTML');
  assert.ok(worker.includes("'"+url+"'"),file+' SW');
 }
 assert.match(cloud,/client:verifiedClient/);
 assert.match(gate,/outdated cached cloud module/);
});
test('service worker gets online JS first instead of an incompatible cached module',async()=>{
 const handlers={};const versions=new Map();let downloads=0,cacheReads=0;
 const self={location:{origin:'https://helilog-v2-test.onrender.com'},addEventListener(type,callback){handlers[type]=callback}};
 const caches={
  match:async req=>{cacheReads++;return versions.get(req.url)},
  open:async()=>({put:async(req,response)=>versions.set(req.url,response.clone())})
 };
 const fetch=async()=>{downloads++;return {ok:true,version:'V2.7',clone(){return this}}};
 const response={error(){return {ok:false}}};
 new Function('self','caches','fetch','Response','URL',worker)(self,caches,fetch,response,URL);
 const url='https://helilog-v2-test.onrender.com/cloud-foundation.js?v=2.8-archive-recovery-1';
 versions.set(url,{ok:true,version:'V2.2',clone(){return this}});
 let out;
 handlers.fetch({request:{method:'GET',mode:'cors',url},respondWith(p){out=p},waitUntil(){}});
 const result=await out;
 assert.equal(result.version,'V2.7');
 assert.equal(downloads,1);
 assert.equal(cacheReads,0);
});
