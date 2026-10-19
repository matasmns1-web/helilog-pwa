/* HeliLog V2.7 — Cloud account conflict UI regression checks */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const folder=__dirname;
const code=fs.readFileSync(path.join(folder,"cloud-view.js"),"utf8");
const html=fs.readFileSync(path.join(folder,"index.html"),"utf8");
const auth=fs.readFileSync(path.join(folder,"auth-gate.js"),"utf8");
const worker=fs.readFileSync(path.join(folder,"service-worker.js"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.webmanifest"),"utf8"));
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const section=(a,b)=>{
 const start=code.indexOf(a),end=code.indexOf(b,start+1);
 assert.ok(start>=0&&end>start);
 return code.slice(start,end);
};
test("a recorded cloud conflict offers review only for eligible ordinary records",()=>{
 const api=new Function("v23AccountWorkspace","window","v22CloudEscape",section("function v27ConflictsMarkup(){","async function v27ReviewRecordConflict(")+";return v27ConflictsMarkup;")(
  ()=>true,{HeliLogV23Sync:{status:()=>({state:"conflict"}),conflicts:()=>[
   {kind:"aircraft",id:"a1",action:"put",reviewable:true,note:""},
   {kind:"endorsement",id:"e1",action:"put",reviewable:false,note:"Signed record"}
  ]}},escape);
 const markup=api();
 assert.match(markup,/Offline edit conflicts/);
 assert.match(markup,/Compare copies/);
 assert.match(markup,/a1/);
 assert.match(markup,/e1/);
 assert.equal((markup.match(/Compare copies/g)||[]).length,1);
 assert.match(markup,/Not eligible for general conflict resolution/);
});
test("conflict record IDs are safely encoded before entering onclick markup",()=>{
 const id='a1"><img src=x onerror=alert(1)>';
 const api=new Function("v23AccountWorkspace","window","v22CloudEscape",section("function v27ConflictsMarkup(){","async function v27ReviewRecordConflict(")+";return v27ConflictsMarkup;")(
  ()=>true,{HeliLogV23Sync:{status:()=>({state:"conflict"}),conflicts:()=>[
   {kind:"aircraft",id,action:"put",reviewable:true,note:""}
  ]}},escape);
 const markup=api();
 assert.doesNotMatch(markup,/<img/);
 assert.match(markup,/&lt;img/);
 assert.match(markup,/&quot;/);
});
test("conflict comparison is explicit and shows both copies without automatic action",()=>{
 const source=section("function v27RecordDiffMarkup(){","function v27ConflictsMarkup(){");
 const review={kind:"aircraft",id:"a1",local:{reg:"LY-OFF"},cloud:{reg:"LY-WEB"}};
 const api=new Function("v27RecordPreview","v27RecordBusy","v22CloudEscape",source+";return v27RecordDiffMarkup;")(review,false,escape);
 const markup=api();
 assert.match(markup,/LY-OFF/);
 assert.match(markup,/LY-WEB/);
 assert.match(markup,/Keep this device copy/);
 assert.match(markup,/Use current cloud copy/);
 assert.match(markup,/device-local safety snapshot/);
});
test("Cloud Account setup avoids obsolete release labels",()=>{
 assert.match(code,/One-time cloud sync setup/);
 assert.doesNotMatch(code,/V2\.4 — One-time setup/);
});
test("V2.7 remains Profile-only logout and ships coherent cache assets",()=>{
 assert.doesNotMatch(code,/onclick="v23SignOut\(\)"/);
 assert.match(html,/onclick="v23SignOut\(\)">Log out/);
 assert.match(html,/V2\.13 · TEST/);
 assert.match(auth,/HELILOG_TEST_VERSION='V2\.13'/);
 assert.equal(manifest.name,"HeliLog V2.13 — Test");
 assert.match(worker,/helilog-v2-13-security-1/);
 for(const name of ["cloud-view","cloud-sync","auth-gate"]){
  const url=name+".js?v=2.13-security-1";
  assert.ok(html.includes(url),name+" index");
  assert.ok(worker.includes(url),name+" cache");
 }
});
