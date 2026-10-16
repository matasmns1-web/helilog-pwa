/* HeliLog V2.2 — Cloud Account screen.
 * Access from the existing interface. No flights or local records are
 * read/written to the cloud. Signup is disabled: invite-only accounts.
 */
let v22CloudNotice="",v22CloudBusy=false;
let v24PilotConflictPreview=null,v24PilotConflictBusy=false;
let v27RecordPreview=null,v27RecordBusy=false;
function v24FlattenProfile(data,prefix="",out={}){
 for(const [key,value] of Object.entries(data&&typeof data==="object"?data:{})){
  const field=prefix?prefix+"."+key:key;
  if(value&&typeof value==="object"&&!Array.isArray(value))v24FlattenProfile(value,field,out);
  else out[field]=typeof value==="string"?value:JSON.stringify(value);
 }
 return out;
}
function v24PilotDiffMarkup(){
 const p=v24PilotConflictPreview;
 if(!p)return '';
 const local=v24FlattenProfile(p.local),cloud=v24FlattenProfile(p.cloud);
 const keys=[...new Set([...Object.keys(local),...Object.keys(cloud)])].sort();
 const rows=keys.filter(k=>local[k]!==cloud[k]);
 const value=v=>v===undefined?'<span class="muted">Not set</span>':v22CloudEscape(v);
 return '<div class="card" style="margin-top:16px"><div class="head"><h2>Review pilot profile conflict</h2></div>'+
  '<p>This web browser and the cloud have different copies of the pilot profile. <b>No version has been overwritten.</b> Only the pilot profile is affected; flight records and signed endorsements are not changed by this action.</p>'+
  (rows.length?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Field</th><th style="text-align:left">This web browser</th><th style="text-align:left">Current cloud</th></tr></thead><tbody>'+
   rows.map(k=>'<tr><td style="padding:8px;border-top:1px solid var(--line)">'+v22CloudEscape(k)+'</td>'+
    '<td style="padding:8px;border-top:1px solid var(--line)">'+value(local[k])+'</td>'+
    '<td style="padding:8px;border-top:1px solid var(--line)">'+value(cloud[k])+'</td></tr>').join('')+
   '</tbody></table></div>':
   '<div class="note">Both copies contain the same fields. Only the saved sync baseline needs repair.</div>')+
  '<div class="note" style="margin-top:12px">A separate safety backup of this browser\'s full test workspace and the current cloud pilot profile will be saved locally before either choice. Keeping the web copy updates only the pilot profile in Supabase; choosing the cloud copy updates only this browser\'s pilot profile.</div>'+
  '<div class="actions" style="margin-top:12px">'+
  '<button class="btn primary" type="button" onclick="v24ResolvePilotConflict(\'local\')"'+(v24PilotConflictBusy?' disabled':'')+'>Keep this web profile</button>'+
  '<button class="btn" type="button" onclick="v24ResolvePilotConflict(\'cloud\')"'+(v24PilotConflictBusy?' disabled':'')+'>Use cloud profile on this device</button>'+
  '</div></div>';
}

function v27RecordDiffMarkup(){
 const p=v27RecordPreview;
 if(!p)return "";
 const display=value=>value===null?'<span class="muted">Record deleted / absent</span>':
  '<pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;font-size:12px">'+
  v22CloudEscape(JSON.stringify(value,null,2))+'</pre>';
 return '<div class="card" style="margin-top:16px"><div class="head"><h2>Review record conflict</h2></div>'+
  '<p><b>'+v22CloudEscape(p.kind)+': '+v22CloudEscape(p.id)+'</b></p>'+
  '<p>These copies differ. Nothing has been overwritten. Review both versions before choosing.</p>'+
  '<div class="profilegrid"><div><b>This device</b>'+display(p.local)+'</div>'+
  '<div><b>Current cloud</b>'+display(p.cloud)+'</div></div>'+
  '<div class="note" style="margin-top:12px">Before applying either choice, HeliLog saves a verified device-local safety snapshot of the complete workspace, both records and the pending queue. Keeping this device will attempt a revision-checked upload; if the cloud changes again, it will stop for a fresh review. This is not a remote backup.</div>'+
  '<div class="actions" style="margin-top:12px">'+
  '<button class="btn primary" type="button" onclick="v27ResolveRecordConflict(\'local\')"'+(v27RecordBusy?' disabled':'')+'>Keep this device copy</button>'+
  '<button class="btn" type="button" onclick="v27ResolveRecordConflict(\'cloud\')"'+(v27RecordBusy?' disabled':'')+'>Use current cloud copy</button></div></div>';
}
function v27ConflictsMarkup(){
 if(!v23AccountWorkspace())return "";
 const rows=window.HeliLogV23Sync.conflicts();
 const needsAttention=window.HeliLogV23Sync.status().state==="conflict";
 if(!needsAttention && !rows.length)return "";
 return '<div class="card" style="margin-top:16px"><div class="head"><h2>Offline edit conflicts</h2></div>'+
  '<p>Edits on different devices affected the same record. HeliLog will not choose a winner or overwrite either copy automatically.</p>'+
  (rows.length?rows.map(item=>'<div class="qual-item" style="margin-top:10px"><b>'+
   v22CloudEscape(item.kind)+' · '+v22CloudEscape(item.id)+'</b>'+
   '<div class="mini">Pending '+v22CloudEscape(item.action)+(item.note?' · '+v22CloudEscape(item.note):'')+'</div>'+
   (item.reviewable?'<button class="btn" type="button" style="margin-top:9px" onclick="v27ReviewRecordConflict('+
     v22CloudEscape(JSON.stringify(item.kind))+','+v22CloudEscape(JSON.stringify(item.id))+')">Compare copies</button>':
    '<div class="note" style="margin-top:8px">Not eligible for general conflict resolution. Preserve both copies; do not reset or force-upload.</div>')+
   '</div>').join(''):'<div class="note">The app detected an unqueued local difference or profile conflict. Your records remain on this device. Use the pilot-profile review below when available, or keep both devices intact for assisted recovery.</div>')+
  '</div>';
}
async function v27ReviewRecordConflict(kind,id){
 if(v27RecordBusy)return;
 v27RecordBusy=true;v22CloudNotice="";
 try{v27RecordPreview=await window.HeliLogV23Sync.previewRecordConflict(kind,id);}
 catch(e){v27RecordPreview=null;v22CloudNotice="Could not review record: "+(e.message||e);}
 finally{v27RecordBusy=false;cloud();}
}
async function v27ResolveRecordConflict(choice){
 if(v27RecordBusy||!v27RecordPreview)return;
 const local=choice==="local";
 const question=local?
  "Keep this DEVICE record and queue a revision-checked cloud update? A device-local safety backup will be saved first.":
  "Use the CURRENT CLOUD version on this device, including deletion if the cloud record was removed? A device-local safety backup will be saved first.";
 if(!confirm(question))return;
 v27RecordBusy=true;v22CloudNotice="";
 try{
  const result=await window.HeliLogV23Sync.resolveRecordConflict(choice);
  v27RecordPreview=null;
  v22CloudNotice="Decision saved. A local safety snapshot was preserved ("+result.kind+": "+result.id+"). Checking cloud synchronization…";
  await window.HeliLogV23Sync.refresh();
  const state=window.HeliLogV23Sync.status();
  if(state.state!=="synced")
   v22CloudNotice+=" Remaining sync status: "+state.state+". "+(state.error||"Review any further conflicts before printing.");
  else v22CloudNotice="Record conflict resolved. Cloud sync complete; a device-local safety snapshot was preserved.";
 }catch(e){v27RecordPreview=null;v22CloudNotice="Record conflict was not resolved: "+(e.message||e)+". Preserve both copies.";}
 finally{v27RecordBusy=false;cloud();}
}

function v22CloudEscape(s){
 return String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function cloud(){
 const st=window.HeliLogCloud.snapshot();
 const state=st.status;
 let action='';
 if(!st.configured){
  action='<div class="note"><b>Not connected yet.</b> The Supabase test project must be connected and its private account schema must be applied before login can be enabled. HeliLog is currently local-only.</div>'+
    '<p class="muted">No cloud database has been activated, and no flights, signatures or endorsements have been uploaded.</p>';
 }else if(state==="signed_in"){
  action='<div class="card"><div class="head"><h2>Cloud account</h2></div>'+
   '<p><b>Signed in:</b> '+v22CloudEscape(st.email)+'</p>'+
   '<p><b>Cloud profile:</b> '+(st.hasProfile?v22CloudEscape(st.displayName):'Not created yet')+'</p>'+
   (st.hasProfile?'':'<form onsubmit="v22CloudCreateProfile(event)" class="form">'+
    '<div class="field"><label for="cloudDisplayName">Display name</label>'+
    '<input id="cloudDisplayName" name="cloudDisplayName" autocomplete="name" maxlength="120" required value="'+v22CloudEscape(S.pilot?.name||'')+'"></div>'+
    '<button class="btn primary" type="submit">Create my private cloud profile</button></form>')+
   '</div>';
 }else{
  action='<div class="card"><div class="head"><h2>Sign in to HeliLog Cloud</h2></div>'+
   '<p class="muted">Initially, only accounts invited to this private test project can sign in. Public registration is disabled.</p>'+
   '<form id="v22CloudLogin" onsubmit="v22CloudSignIn(event)" class="form">'+
   '<div class="formgrid"><div class="field"><label for="cloudEmail">Email</label>'+
   '<input id="cloudEmail" name="cloudEmail" type="email" autocomplete="username" required></div>'+
   '<div class="field"><label for="cloudPassword">Password</label>'+
   '<input id="cloudPassword" name="cloudPassword" type="password" autocomplete="current-password" required></div></div>'+
   '<div class="actions"><button class="btn primary" type="submit">Sign in</button></div></form></div>';
 }
 const stateText=st.configured?(state==="signed_in"?"Signed in":state==="error"?"Connection needs attention":
   state==="connecting"?"Connecting…":"Ready for private sign-in"):"Cloud not configured";
 app.innerHTML=header('Cloud account','HeliLog V2.10 · Synchronization and archive integrity',
  `<button class="btn" onclick="go('profile')">← Profile</button>`)+
  '<div class="card" style="margin-bottom:16px"><div class="head"><h2>Connection status</h2></div>'+
  '<div class="pwa-state"><b>'+v22CloudEscape(stateText)+'</b></div>'+
  (st.configured?'<div class="mini">Test environment · Invitation-only accounts</div>':'<div class="mini">Test project is not configured yet.</div>')+
  (st.error?'<div class="note" role="alert">'+v22CloudEscape(st.error)+'</div>':'')+
  (v22CloudNotice?'<div class="note" role="status">'+v22CloudEscape(v22CloudNotice)+'</div>':'')+
  (st.configured?'<button class="btn" type="button" onclick="v22CloudRefresh()"'+(v22CloudBusy?' disabled':'')+'>Check cloud connection</button>':'')+
  '</div>'+
  action+
  '<div class="card" style="margin-top:16px"><div class="head"><h2>Aircraft & flight cloud sync</h2></div>'+
  (v23AccountWorkspace()?v23SyncInfo()+'<div class="actions" style="margin-top:14px"><button class="btn primary" type="button" onclick="v23RefreshSync()">Check / sync now</button></div>':
  '<p class="muted">Sign in to synchronize a private cloud workspace.</p>')+
  (v23AccountWorkspace()&&!window.HeliLogV23Sync.extended()?
   `<div class="note" style="margin-top:12px"><b>V2.4 — One-time setup</b><p>Choose one primary device for your instructor profiles, medical and licence details, endorsements and previous totals. Other devices can then use the cloud copies. A safety snapshot will preserve this device's previous records.</p>
   <div class="actions"><button class="btn primary" onclick="v24ActivateExtended('upload')">Upload this device's remaining records</button>
   <button class="btn" onclick="v24ActivateExtended('cloud')">Use existing cloud records</button></div></div>`:
   '<p class="mini">Extended cloud synchronization '+(v23AccountWorkspace()?'enabled.':'available after sign-in.')+'</p>')+
  (v23AccountWorkspace()&&window.HeliLogV23Sync.status().state==='conflict'?'<p class="mini">Unresolved conflicts are preserved for review; archives must not be confirmed until synchronized.</p>':'')+
  (v23AccountWorkspace()&&window.HeliLogV23Sync.status().state==="conflict"&&
   window.HeliLogV23Sync.status().error.includes("settings:pilot")?
   '<div class="actions" style="margin-top:12px"><button class="btn primary" type="button" onclick="v24ReviewPilotConflict()"'+
   (v24PilotConflictBusy?' disabled':'')+'>Review pilot profile conflict</button></div>':'')+
  '</div>'+
  (v23AccountWorkspace()?v27ConflictsMarkup()+v27RecordDiffMarkup()+v24PilotDiffMarkup():'')+
  (v23AccountWorkspace()?'<div class="card" style="margin-top:16px">'+
   '<div class="head"><div><h2>Cloud archive integrity</h2><div class="muted">Read-only check of confirmed pages, frozen originals and signed corrections.</div></div>'+
   '<button class="btn primary" type="button" onclick="v28VerifyCloudArchives()"'+(v28Busy?' disabled':'')+'>Verify archives</button></div>'+
   (window.HeliLogV24Archive?.recoveryNotice?.()?'<div class="note" role="status">'+
      v22CloudEscape(window.HeliLogV24Archive.recoveryNotice())+'</div>':'')+
   (v28Notice?'<div class="note" role="status">'+v22CloudEscape(v28Notice)+'</div>':
     '<div class="mini">A successful check is recorded as a device-local evidence baseline. Save a separate recovery package under Profile → Backup &amp; restore.</div>')+
   '</div>':'');
}
function v22CloudError(error){
 v22CloudNotice=String(error?.message||error||'Unknown cloud error');
 cloud();
}
async function v22CloudRefresh(){
 if(v22CloudBusy)return;
 v22CloudBusy=true;v22CloudNotice='';
 try{const state=await window.HeliLogCloud.refresh();
  if(state.status==="signed_in")v22CloudNotice="Authenticated cloud account found. Local logbook records are still not synchronized.";
 }catch(e){v22CloudNotice=e.message||String(e)}
 finally{v22CloudBusy=false;cloud()}
}
async function v22CloudSignIn(ev){
 ev.preventDefault();
 if(v22CloudBusy)return;
 const email=document.getElementById('cloudEmail')?.value||'';
 const passwordInput=document.getElementById('cloudPassword');
 const password=passwordInput?.value||'';
 if(passwordInput)passwordInput.value='';
 v22CloudBusy=true;v22CloudNotice='';
 try{const state=await window.HeliLogCloud.signIn(email,password);
  if(state.status!=="signed_in")throw Error(state.error||'Unable to authenticate.');
  v22CloudNotice="Signed in. Your local flight logbook has NOT been uploaded.";
 }catch(e){v22CloudNotice=e.message||String(e)}
 finally{v22CloudBusy=false;cloud()}
}
async function v22CloudCreateProfile(ev){
 ev.preventDefault();
 if(v22CloudBusy)return;
 v22CloudBusy=true;v22CloudNotice='';
 try{
  const name=document.getElementById('cloudDisplayName')?.value||'';
  const state=await window.HeliLogCloud.initializeProfile(name);
  if(!state.hasProfile)throw Error(state.error||'Could not confirm cloud profile.');
  v22CloudNotice="Private cloud profile created. Flight and endorsement syncing is not enabled.";
 }catch(e){v22CloudNotice=e.message||String(e)}
 finally{v22CloudBusy=false;cloud()}
}
async function v22CloudSignOut(){
 if(v22CloudBusy)return;
 v22CloudBusy=true;v22CloudNotice='';
 try{await window.HeliLogCloud.signOut();v22CloudNotice="Signed out of cloud. Local test logbook is unchanged."}
 catch(e){v22CloudNotice=e.message||String(e)}
 finally{v22CloudBusy=false;cloud()}
}

async function v24ReviewPilotConflict(){
 if(v24PilotConflictBusy)return;
 v24PilotConflictBusy=true;v22CloudNotice='';
 try{
  v24PilotConflictPreview=await window.HeliLogV23Sync.previewPilotConflict();
 }catch(error){
  v24PilotConflictPreview=null;
  v22CloudNotice='Could not review the pilot profile: '+(error.message||error);
 }finally{v24PilotConflictBusy=false;cloud();}
}
async function v24ResolvePilotConflict(choice){
 if(v24PilotConflictBusy||!v24PilotConflictPreview)return;
 const local=choice==='local';
 if(!confirm(local?
  'Keep this WEB browser pilot profile and upload it to the cloud? Other devices will then receive the web profile. HeliLog will save a local safety backup first.':
  'Replace this browser pilot profile with the CURRENT CLOUD profile? The existing browser profile will be included in a local safety backup first.'))return;
 v24PilotConflictBusy=true;v22CloudNotice='';
 try{
  const result=await window.HeliLogV23Sync.resolvePilotConflict(choice);
  v24PilotConflictPreview=null;
  v22CloudNotice='Your profile decision was saved with a local safety backup. Verifying cloud synchronization…';
  await window.HeliLogV23Sync.refresh();
  const status=window.HeliLogV23Sync.status();
  if(status.state==='synced')
   v22CloudNotice='Pilot profile conflict resolved. Cloud sync is complete. A local safety backup was preserved.';
  else
   v22CloudNotice='Your choice was preserved, but cloud sync is '+status.state+'. Do not delete local data; '+(status.error||'try syncing again.');
 }catch(error){
  v24PilotConflictPreview=null;
  v22CloudNotice='Profile conflict was not resolved: '+(error.message||error)+'. No cloud data was intentionally overwritten.';
 }finally{v24PilotConflictBusy=false;cloud();}
}
