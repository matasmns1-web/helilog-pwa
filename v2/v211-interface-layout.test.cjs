/* HeliLog V2.11 — expandable Profile, Settings and Backups regression. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const auth=fs.readFileSync(path.join(__dirname,"auth-gate.js"),"utf8");
const cloud=fs.readFileSync(path.join(__dirname,"cloud-view.js"),"utf8");
const worker=fs.readFileSync(path.join(__dirname,"service-worker.js"),"utf8");
const begin=html.indexOf("const profileExpanded=");
const end=html.indexOf("function freshLogbookData(",begin);
assert.ok(begin>=0&&end>begin,"Profile screen source exists");
const code=html.slice(begin,end);
function fixture(){
 const app={innerHTML:""},S={
  pilot:{firstName:"Pilot",lastName:"Test",licenceType:"CPL(H)",licenceNumber:"ABC-0001",
   authority:"TEST",medical:{class:"Class 1",number:"TEST-MED",issueDate:"2026-01-01",validUntil:"2027-01-01",notes:""}},
  qualifications:[{id:"q1",name:"Cabri G2",category:"Type rating",number:"TR-01",
   issueDate:"2026-01-01",validUntil:"2027-01-01",notes:"TEST",isPrimary:false}],
  broughtForwardImported:true,broughtForwardImportedAt:"2026-01-01T12:00:00Z"
 };
 let statusCalls=0;
 const deps={
  app,S,TEST_MODE:false,v28Notice:"",
  pilotNameParts:()=>({firstName:S.pilot.firstName,lastName:S.pilot.lastName}),
  header:(title,sub,actions)=>'<header data-screen="'+title+'"><h1>'+title+'</h1><p>'+sub+'</p>'+(actions||"")+'</header>',
  htmlEscape:s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;"),
  displayDate:s=>s||"—",formatDateTime:s=>String(s),
  v23AccountWorkspace:()=>true,
  v29BackupPanel:()=>'<section id="v29-backup-tools">Encrypted snapshots</section>',
  updatePWAStatus:()=>statusCalls++,
  statusCalls:()=>statusCalls
 };
 const wrapper=[
  'const {app,S,TEST_MODE,v28Notice,pilotNameParts,header,htmlEscape,displayDate,formatDateTime,v23AccountWorkspace,v29BackupPanel,updatePWAStatus}=deps;',
  'let editingQualificationId=null;',
  code,
  'return {profile,settings,backups,rememberProfileSection,profileExpanded};'
 ].join("\n");
 const pages=new Function("deps",wrapper)(deps);
 return {app,S,deps,pages};
}
test("Profile contains identity and two initially collapsed sections, not tools",()=>{
 const f=fixture();f.pages.profile();
 assert.match(f.app.innerHTML,/data-screen="Profile"/);
 assert.match(f.app.innerHTML,/Pilot Test/);
 assert.match(f.app.innerHTML,/CPL\(H\)/);
 assert.match(f.app.innerHTML,/id="medicalSection"/);
 assert.match(f.app.innerHTML,/id="qualificationsSection"/);
 assert.doesNotMatch(f.app.innerHTML,/id="medicalSection" open/);
 assert.doesNotMatch(f.app.innerHTML,/id="qualificationsSection" open/);
 assert.doesNotMatch(f.app.innerHTML,/id="v29-backup-tools"|Existing logbook import|Data integrity check/);
 assert.match(f.app.innerHTML,/v23SignOut\(\)/);
 assert.doesNotMatch(f.app.innerHTML,/go\('cloud'\)/);
});
test("Medical and Ratings can expand independently and retain editing actions",()=>{
 const f=fixture();f.pages.profile();
 f.pages.rememberProfileSection("medical",{isConnected:true,open:true});
 f.pages.profile();
 assert.match(f.app.innerHTML,/id="medicalSection" open/);
 assert.doesNotMatch(f.app.innerHTML,/id="qualificationsSection" open/);
 assert.match(f.app.innerHTML,/editMedical\(\)/);
 f.pages.rememberProfileSection("qualifications",{isConnected:true,open:true});
 f.pages.profile();
 assert.match(f.app.innerHTML,/id="qualificationsSection" open/);
 assert.match(f.app.innerHTML,/qualificationForm\('q1'\)/);
 assert.match(f.app.innerHTML,/deleteQualification\('q1'\)/);
 f.pages.rememberProfileSection("medical",{isConnected:true,open:false});
 f.pages.profile();
 assert.doesNotMatch(f.app.innerHTML,/id="medicalSection" open/);
 assert.match(f.app.innerHTML,/id="qualificationsSection" open/);
});
test("Settings holds prior totals, integrity, Test Mode and device tools",()=>{
 const f=fixture();f.pages.settings();
 assert.match(f.app.innerHTML,/data-screen="Settings"/);
 assert.match(f.app.innerHTML,/Existing logbook import/);
 assert.match(f.app.innerHTML,/editBroughtForwardTotals\(\)/);
 assert.match(f.app.innerHTML,/Data integrity check/);
 assert.match(f.app.innerHTML,/showIntegrityCheck\(\)/);
 assert.match(f.app.innerHTML,/id="settings-testmode-card"/);
 assert.match(f.app.innerHTML,/id="pwaStatus"/);
 assert.match(f.app.innerHTML,/go\('backups'\)/);
 assert.match(f.app.innerHTML,/go\('cloud'\)/);
 assert.match(f.app.innerHTML,/Manage cloud account/);
 assert.match(f.app.innerHTML,/Manage backups/);
 assert.match(f.app.innerHTML,/Manage locations/);
 assert.doesNotMatch(f.app.innerHTML,/id="v29-backup-tools"|id="medicalSection"/);
 assert.equal(f.deps.statusCalls(),1);
 assert.match(html,/helilog-cloud-workspace #settings-testmode-card/);
});
test("Settings cards fill the main content area without nesting",()=>{
 const f=fixture();f.pages.settings();
 const page=f.app.innerHTML;
 const start=page.indexOf('<div class="settings-grid">');
 assert.ok(start>=0,"Settings should use its own full-width grid");
 let depth=0,directCards=0,closed=false;
 for(const m of page.slice(start).matchAll(/<\/?div\b[^>]*>/g)){
  if(m[0].startsWith("</")){
   depth--;
   assert.ok(depth>=0,"Unmatched closing div");
   if(depth===0){closed=true;break;}
  }else{
   if(depth===1&&/\bclass="card(?: settings-wide)?"/.test(m[0]))directCards++;
   depth++;
  }
 }
 assert.ok(closed,"Settings grid should close before the next page");
 assert.equal(directCards,7,"All Settings cards should be siblings, including aerodromes, not nested");
 assert.match(page,/class="card settings-wide"[\s\S]*?App &amp; device/);
 assert.match(html,/\.settings-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\(max-width:1150px\)\{\.settings-grid\{grid-template-columns:1fr\}\}/);
});

test("Backup page retains encrypted cloud verification without legacy V2.8 controls",()=>{
 const f=fixture(),before=JSON.stringify(f.S);f.pages.backups();
 assert.match(f.app.innerHTML,/data-screen="Backup & Recovery"/);
 assert.match(f.app.innerHTML,/id="v29-backup-tools"/);
 for(const name of ["downloadFullBackup","v232VerifyOfflineFile"])assert.match(f.app.innerHTML,new RegExp(name+"\\("));
 assert.doesNotMatch(f.app.innerHTML,/handleBackupRestoreFile\(/,"Cloud-backed account must not offer local restore");
 assert.match(f.app.innerHTML,/Encrypted cloud snapshot/);
 assert.doesNotMatch(f.app.innerHTML,/Inspect V2.8 recovery package|Download verified cloud recovery package/);
 assert.match(f.app.innerHTML,/id="backupRestoreStatus"/);
 assert.equal(JSON.stringify(f.S),before);
 assert.doesNotMatch(f.app.innerHTML,/Existing logbook import|id="medicalSection"/);
});
test("Settings is the only Cloud/Backup top-level navigation entry and nested routes remain",()=>{
 const aside=html.slice(html.indexOf("<aside>"),html.indexOf("</aside>"));
 const more=html.slice(html.indexOf("function mobilemore(){"),html.indexOf("function compareFlightsOldest("));
 assert.match(aside,/data-v="settings"/);
 assert.doesNotMatch(aside,/data-v="cloud"|data-v="backups"/);
 assert.match(more,/onclick="go\('settings'\)"><span>⚙<\/span><b>Settings<\/b>/);
 assert.doesNotMatch(more,/onclick="go\('cloud'\)"|onclick="go\('backups'\)"/);
 assert.match(html,/totals,recency,profile,settings,locations:v219LocationsPage,backups,cloud,testmode,mobilemore/);
 assert.match(html,/moreViews=\[[^\]]*'settings','locations','backups','cloud'/);
 assert.match(html,/b.dataset.v==='settings' && \(v==='cloud'\|\|v==='backups'\|\|v==='locations'\)/);
 assert.match(cloud,/go\('settings'\)/);
 assert.match(cloud,/go\(\\'backups\\'\)/);
});
test("Moved actions return to their new screens",()=>{
 const portion=auth.slice(auth.indexOf("async function v28DownloadCloudRecovery"),auth.indexOf("function v23ExitOldTestMode"));
 assert.doesNotMatch(portion,/else profile\(\)|v29BackupBusy=false;profile\(\)/);
 assert.match(portion,/if\(location.hash==="#backups"\)backups\(\)/);
 const restore=html.slice(html.indexOf("function restoreCheckedBackup(){"),html.indexOf("function editOwnProfile(){"));
 assert.equal((restore.match(/backups\(\);/g)||[]).length,2);
 const imported=html.slice(html.indexOf("function saveBroughtForwardTotals("),html.indexOf("const profileExpanded="));
 assert.match(imported,/if\(!save\(\)\)\{/);
 assert.match(imported,/bfSpecialOpsDraft=null;\s*settings\(\);/);
 assert.match(html,/onsubmit="saveBroughtForwardTotals\(event\)"/);
});
test("The UI-only release retains archived-flight handlers and updates PWA cache",()=>{
 for(const name of ["confirmCorrectionAddendum","confirmPrintedArchive","saveBroughtForwardTotals",
  "downloadFullBackup","restoreCheckedBackup","showIntegrityCheck","editMedical",
  "saveMedical","saveQualification","deleteQualification"])
  assert.match(html,new RegExp("function "+name+"\\("));
 assert.match(html,/HeliLog V2\.33\.5 — Flight Recency · Test/);
 assert.match(worker,/helilog-v2-33-5-bold-recency-1/);
});
