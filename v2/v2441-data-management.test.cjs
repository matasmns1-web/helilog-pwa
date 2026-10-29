'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('v2/source/app/11-sandbox-and-backups.js');
const settings=read('v2/source/app/10-settings-and-locations.js');
const routing=read('v2/source/app/13-routing-and-boot.js');
const app=read('v2/index.html');
const start=source.indexOf("let v244Prepared="), end=source.indexOf("function v244FreshWorkspace(){",start);
assert.ok(start>0&&end>start);
const target=source.slice(start,end);

function harness(){
 const pilot={name:'Test Pilot'};
 const S={pilot,aircraft:[{id:'a1',reg:'DEMO'}],flights:[{id:'f1',mins:30}],people:[],endorsements:[]};
 const accountId='11111111-1111-4111-a111-111111111111';
 const app={innerHTML:''},location={hash:'#datamanagement'};
 let exports=0,downloaded=null;
 const data={app:'HeliLog',format:'helilog-full-backup',integrity:{algorithm:'SHA-256',sha256:'mock-hash'},data:JSON.parse(JSON.stringify(S))};
 const deps={
  app,location,S,window:{HeliLogCloud:{snapshot:()=>({userId:accountId})},
   HeliLogV23Sync:{status:()=>({owner:accountId,state:'synced',pending:0,conflicts:0,resetSupported:false,resetGeneration:null})}},
  v23AccountWorkspace:()=>true,header:()=>'<div>Data management header</div>',v23Escape:x=>String(x),
  makeFullBackup:async()=>JSON.parse(JSON.stringify(data)),
  offerBackupFile:(file,prefix)=>{downloaded=file;exports++;},
  sha256Hex:async text=>text===JSON.stringify(S)?'mock-hash':'invalid-hash'
 };
 const script="const {app,location,S,window,v23AccountWorkspace,header,v23Escape,makeFullBackup,offerBackupFile,sha256Hex}=deps;"+
  target+";return {panel:v244ResetPanel,page:v244DataManagementPage,download:v244DownloadSafetyCopy,verify:v244VerifyBackupFile,notice:()=>v244Notice,safety:()=>v244SafetyCopy};";
 const api=new Function('deps',script)(deps);
 return {api,app,S,data,get exports(){return exports},get downloaded(){return downloaded}};
}
test('Data management is a dedicated Settings route, not an inline destructive panel',()=>{
 assert.match(settings,/go\('datamanagement'\)/);
 assert.doesNotMatch(settings,/\$\{v244ResetPanel\(\)\}/);
 assert.match(routing,/datamanagement:v244DataManagementPage/);
 assert.match(routing,/v==='datamanagement'/);
 assert.match(app,/V2\.47\.1 · TEST ENVIRONMENT/);
});
test('backup download works independently of disabled cloud deletion',async()=>{
 const h=harness();const before=JSON.stringify(h.S);
 h.api.page();
 assert.match(h.app.innerHTML,/Download logbook backup/);
 assert.match(h.app.innerHTML,/Deletion unavailable on this test server/);
 assert.doesNotMatch(h.app.innerHTML,/onclick="v244DownloadSafetyCopy\(\)" disabled/);
 assert.match(h.app.innerHTML,/onclick="v244PrepareReset\(\)" disabled/);
 await h.api.download();
 assert.equal(h.exports,1);
 assert.deepEqual(h.downloaded,h.data);
 assert.equal(JSON.stringify(h.S),before);
 assert.match(h.api.notice(),/download requested/i);
});
test('a downloaded matching backup is verified locally without allowing unsupported deletion',async()=>{
 const h=harness();await h.api.download();
 const field={value:'backup.json',files:[{size:100,text:async()=>JSON.stringify(h.data)}]};
 await h.api.verify({target:field});
 assert.equal(field.value,'');
 assert.equal(h.api.safety().verified,true);
 assert.match(h.api.notice(),/Backup VERIFIED/);
 assert.match(h.app.innerHTML,/Backup verified/);
 assert.match(h.app.innerHTML,/onclick="v244PrepareReset\(\)" disabled/);
});
test('mismatched or altered backups are refused',async()=>{
 const h=harness();await h.api.download();
 const damaged=JSON.parse(JSON.stringify(h.data));damaged.data.flights[0].mins=99;
 const field={value:'damaged.json',files:[{size:100,text:async()=>JSON.stringify(damaged)}]};
 await h.api.verify({target:field});
 assert.equal(h.api.safety().verified,false);
 assert.match(h.api.notice(),/NOT verified/);
});
