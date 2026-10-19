/* V2.13 — account-scoped backup UI and recovery readiness regressions. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const gate=fs.readFileSync(path.join(__dirname,"auth-gate.js"),"utf8");
const cloud=fs.readFileSync(path.join(__dirname,"cloud-view.js"),"utf8");
const page=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const idA="11111111-1111-4111-a111-111111111111",idB="22222222-2222-4222-b222-222222222222";
const between=(s,start,end)=>{
 const a=s.indexOf(start),b=s.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,"Missing source section "+start);
 return s.slice(a,b);
};
const declarations=between(gate,
 "let v29Snapshots=[],v29SelectedId=",
 "function v29RequireOwner(){");
const runnerSource=between(gate,
 "async function v29Run(label,action){",
 "async function v29LoadCloudSnapshots(){");
function fixture(){
 const resetCloud=[],rerenders=[],ctx={userId:idA};
 const source=[
 'let v28LastAudit={owner:"OLD"},v28Busy=true,v28Notice="OLD";',
 'let v210Health={snapshotCount:6},v210Retention={daily:4},v210DrillMessage="OLD";',
 declarations,runnerSource,
 'v29Snapshots=[{id:"old-private-snapshot"}];',
 'v29SelectedId="old-private-snapshot";',
 'v29BackupMessage="OLD";v29RestorePlan={id:"old-private-snapshot"};',
 'return {reset:v213ResetPrivateViews,assertOwner:v213AssertPrivateView,run:v29Run,',
 'state:()=>({owner:v213PrivateViewOwner,epoch:v213PrivateViewEpoch,',
 'snapshots:v29Snapshots,selected:v29SelectedId,busy:v29BackupBusy,',
 'message:v29BackupMessage,restorePlan:v29RestorePlan,',
 'health:v210Health,retention:v210Retention,drill:v210DrillMessage,',
 'audit:v28LastAudit,notice:v28Notice})};'
 ].join("\n");
 const scope=new Function("v23AccountWorkspace","window","v213ResetCloudViewState","location","backups",source)(
  ()=>!!ctx.userId,{HeliLogCloud:{snapshot:()=>({userId:ctx.userId})}},
  ()=>resetCloud.push(true),{hash:"#backups"},()=>rerenders.push(true));
 return {scope,ctx,resetCloud,rerenders};
}
test("switching accounts erases previous private backup and archive UI metadata",()=>{
 const f=fixture(),api=f.scope;
 const before=api.state();
 assert.equal(before.snapshots[0].id,"old-private-snapshot");
 assert.equal(before.health.snapshotCount,6);
 api.reset(idB);f.ctx.userId=idB;
 const after=api.state();
 assert.equal(after.owner,idB);
 assert.deepEqual(after.snapshots,[]);
 assert.equal(after.selected,"");
 assert.equal(after.message,"");
 assert.equal(after.restorePlan,null);
 assert.equal(after.health,null);
 assert.equal(after.retention,null);
 assert.equal(after.drill,"");
 assert.equal(after.audit,null);
 assert.equal(after.notice,"");
 assert.equal(f.resetCloud.length,1);
});
test("a pending backup callback cannot overwrite another account after logout",async()=>{
 const f=fixture(),api=f.scope;
 api.reset(idA);
 let release;
 const pending=new Promise(resolve=>release=resolve);
 const running=api.run("Old account",async()=>{await pending;throw Error("OLD PRIVATE ERROR");});
 assert.equal(api.state().busy,true);
 api.reset(idB);f.ctx.userId=idB;
 release();await running;
 assert.equal(api.state().message,"");
 assert.equal(api.state().busy,false);
 assert.equal(api.state().owner,idB);
 assert.equal(f.rerenders.length,0);
});
test("a stale account or generation cannot show backup information",()=>{
 const f=fixture(),api=f.scope;api.reset(idA);
 const epoch=api.state().epoch;
 api.assertOwner(idA,epoch);
 f.ctx.userId=idB;
 assert.throws(()=>api.assertOwner(idA,epoch),/Cloud account changed/);
 api.reset(idB);
 assert.throws(()=>api.assertOwner(idA,epoch),/Cloud account changed/);
 api.assertOwner(idB,api.state().epoch);
});
test("signout, new login and cloud view reset private previews",()=>{
 assert.match(gate,/v213ResetPrivateViews\(id\);\s*const key=window\.HeliLogV23Sync\.recordKey/);
 assert.match(gate,/v23AuthBusy=true;v23Unlocked=false;\s*v213ResetPrivateViews\(\)/);
 assert.match(gate,/v213AssertPrivateView\(owner,epoch\)/);
 assert.match(gate,/const snapshots=await window\.HeliLogV29Backup\.list\(db,owner\);\s*v213AssertPrivateView/);
 assert.match(gate,/const encrypted=await window\.HeliLogV29Backup\.encryptSnapshot\(source,password\);\s*v213AssertPrivateView/);
 assert.match(gate,/const result=await window\.HeliLogV29Backup\.restore\(db,owner,plan,phrase\);\s*v213AssertPrivateView/);
 assert.match(cloud,/function v213ResetCloudViewState\(\)/);
 assert.match(cloud,/v24PilotConflictPreview=null/);
 assert.match(cloud,/v27RecordPreview=null/);
});
test("backup health and first manual snapshot refresh only for the active pilot",()=>{
 assert.match(gate,/v210Health=health;v210Retention=retention;/);
 assert.match(gate,/v213AssertPrivateView\(owner,epoch\);\s*v210Health=health/);
 assert.match(page,/function backups\(\)/);
 assert.doesNotMatch(gate,/<h2>V2\.10 · Backup reliability/);
});
