/* HeliLog V2.3 private login gate. No automatic import of V2.2 local data. */
const HELILOG_TEST_VERSION='V2.8';
let v23Unlocked=false,v23AuthBusy=false,v23AuthMessage="";
function v23Escape(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function v23AccountWorkspace(){return v23Unlocked && !!window.HeliLogV23Sync.status().owner;}
function v23SyncInfo(){
 const st=window.HeliLogV23Sync.status();
 const label=st.state==="synced"?"Cloud synced":st.state==="syncing"?"Syncing records…":
 st.state==="conflict"?"Conflict: needs attention":st.state==="offline"?"Offline: saved on device":
 st.state==="error"?"Sync error: saved on device":
 st.pending?"Pending upload: "+st.pending+" change(s)":"Checking cloud records…";
 return '<div class="note" role="status"><b>'+v23Escape(label)+'</b>'+
 (st.pending?' · '+st.pending+' pending':'')+
 (st.error?'<div class="mini">'+v23Escape(st.error)+'</div>':'')+
 '<div class="mini">'+(window.HeliLogV23Sync.extended()?
  'Aircraft, flights, pilot profiles, qualifications, endorsements, medical records and opening totals are included in cloud sync. Print archive snapshots and signed corrections require separate confirmation.':
  'Aircraft and flights sync. Enable extended data synchronization in Cloud account to include endorsements, pilot profiles, qualifications and brought-forward totals.')+'</div></div>';
}
function v23LoginView(){
 v23Unlocked=false;
 document.documentElement.classList.add("helilog-locked");
 const st=window.HeliLogCloud.snapshot(),profile=st.status==="signed_in"&&!st.hasProfile;
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card" contenteditable="false">'+
 '<div style="font-size:29px;font-weight:800">🚁 HeliLog</div>'+
 '<div class="muted">'+HELILOG_TEST_VERSION+' · Private pilot logbook test</div>'+
 '<h1 style="font-size:23px;margin-top:25px">'+(profile?'Create your pilot profile':'Sign in')+'</h1>'+
 '<p class="muted">'+(profile?'Complete your account before opening your logbook.':
 'Sign in to open your private cloud logbook. Registration is invitation-only.')+'</p>'+
 (v23AuthMessage?'<div class="note" role="alert">'+v23Escape(v23AuthMessage)+'</div>':'')+
 (st.error?'<div class="mini">'+v23Escape(st.error)+'</div>':'')+
 (profile?
 '<form class="form" onsubmit="v23CreateProfile(event)"><div class="field"><label for="v23PilotName">Your name</label>'+
 '<input id="v23PilotName" type="text" maxlength="120" required autocomplete="name"></div>'+
 '<button class="btn primary" type="submit">Create private profile</button></form>'+
 '<button class="btn" type="button" style="margin-top:15px" onclick="v23SignOut()">Switch account</button>':
 '<form class="form" onsubmit="v23SignIn(event)"><div class="field"><label for="v23Email">Email</label>'+
 '<input id="v23Email" type="email" required autocomplete="username"></div>'+
 '<div class="field"><label for="v23Password">Password</label>'+
 '<input id="v23Password" type="password" required autocomplete="current-password"></div>'+
 '<button class="btn primary" type="submit">Sign in</button></form>')+
 (TEST_MODE?'<div class="note" style="margin-top:15px">The previous local Test Mode is active. To use cloud login, exit the old sandbox first. Its data remains safely stored.</div>'+
 '<button class="btn" type="button" onclick="v23ExitOldTestMode()">Exit old Test Mode</button>':'')+
 '<p class="mini" style="margin-top:20px">Your cloud workspace starts empty. Existing V2.2 test records stay separately on this device and will not be uploaded automatically.</p>'+
 '</div></div>';
}
async function v23Boot(){
 if(v23AuthBusy)return;
 v23AuthBusy=true;v23AuthMessage="";
 document.documentElement.classList.add("helilog-locked");
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card" contenteditable="false"><h2>🚁 HeliLog '+HELILOG_TEST_VERSION+'</h2><p>Checking your account…</p></div></div>';
 try{
  const auth=await window.HeliLogCloud.refresh();
  if(auth.status==="signed_in"&&auth.hasProfile){
   if(TEST_MODE){v23AuthMessage="Exit the old local Test Mode and reload to enter your private cloud workspace. Your sandbox data is preserved.";v23LoginView();}
   else await v23EnterWorkspace(auth);
  }else v23LoginView();
 }catch(e){v23AuthMessage="Could not verify your session. Connect to the internet and try again: "+(e.message||e);v23LoginView();}
 finally{v23AuthBusy=false;}
}
async function v23EnterWorkspace(auth){
 if(TEST_MODE)throw Error("Exit the old local Test Mode before signing in to V2.3.");
 const id=auth.userId;
 if(!/^[0-9a-f-]{36}$/i.test(String(id)))throw Error("A verified account ID is required.");
 const key=window.HeliLogV23Sync.recordKey(id);
 const stored=localStorage.getItem(key);
 let workspace;
 if(stored!==null){
  try{workspace=JSON.parse(stored);}catch{throw Error("Your saved account data is unreadable; nothing was overwritten.");}
  if(!workspace||!workspace.pilot||!Array.isArray(workspace.aircraft)||!Array.isArray(workspace.flights)
   ||!Array.isArray(workspace.people)||!Array.isArray(workspace.endorsements))
   throw Error("Saved cloud workspace is malformed. Preserve device data before recovery.");
 }else{
  workspace=freshLogbookData({pilot:{name:auth.displayName||"HeliLog test pilot"}},false);
  workspace.cloudWorkspaceV23=true;
  workspace.pilot.name=auth.displayName||"HeliLog test pilot";
  if(workspace.people?.[0])workspace.people[0].name=workspace.pilot.name;
  localStorage.setItem(key,JSON.stringify(workspace));
 }
 KEY=key;S=workspace;
 if(typeof window.HeliLogCloud.client!=="function")
  throw Error("HeliLog loaded an outdated cached cloud module. Close and reopen the app, then reload the website while online. Your account and existing data are safe.");
 const client=await window.HeliLogCloud.client();
 window.HeliLogV23Sync.start({
  userId:id,client,getData:()=>S,
  replaceData:next=>{
   if(typeof hasUnsavedFlightChanges==='function'&&hasUnsavedFlightChanges())
    throw Error("A flight form has unsaved changes. Finish or cancel the edit before refreshing cloud records.");
   const updated={...S,
     aircraft:next.aircraft,flights:next.flights,
     people:next.people||S.people,endorsements:next.endorsements||S.endorsements,
     qualifications:next.qualifications||S.qualifications,
     pilot:next.pilot||S.pilot,
     broughtForward:next.broughtForward??S.broughtForward,
     broughtForwardByType:next.broughtForwardByType??S.broughtForwardByType,
     broughtForwardImported:next.broughtForwardImported??S.broughtForwardImported,
     broughtForwardImportedAt:next.broughtForwardImportedAt??S.broughtForwardImportedAt};
   // Commit one complete account state, or keep the old one on failure.
   localStorage.setItem(KEY,JSON.stringify(updated));
   S=updated;
  },
  onStatus:()=>v23UpdateSyncChip()
 });
 await window.HeliLogV23Sync.refresh();
 if(window.HeliLogV23Sync.extended()){
  window.HeliLogV24Archive.start({userId:id,db:client});
  if(window.HeliLogV23Sync.status().state==="synced")
   await window.HeliLogV24Archive.refresh(()=>S,v24CommitArchiveRefresh);
 }
 v23Unlocked=true;
 document.documentElement.classList.remove("helilog-locked");
 document.documentElement.classList.add("helilog-cloud-workspace");
 if(location.hash==="#login"||location.hash==="#cloud"||!location.hash)location.hash="#dashboard";
 render();
}
function v23UpdateSyncChip(){
 const el=document.getElementById("v23SyncStatus");
 if(el)el.innerHTML=v23SyncInfo();
}
async function v23SignIn(event){
 event.preventDefault();if(v23AuthBusy)return;
 const email=document.getElementById("v23Email")?.value||"";
 const field=document.getElementById("v23Password"),password=field?.value||"";
 if(field)field.value="";
 v23AuthBusy=true;v23AuthMessage="";
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card" contenteditable="false">Signing in…</div></div>';
 try{
  const auth=await window.HeliLogCloud.signIn(email,password);
  if(auth.status!=="signed_in")throw Error(auth.error||"Unable to verify your account.");
  if(auth.hasProfile)await v23EnterWorkspace(auth);
  else v23LoginView();
 }catch(e){v23AuthMessage=e.message||String(e);v23LoginView();}
 finally{v23AuthBusy=false;}
}
async function v23CreateProfile(event){
 event.preventDefault();if(v23AuthBusy)return;
 const name=document.getElementById("v23PilotName")?.value||"";
 v23AuthBusy=true;v23AuthMessage="";
 try{
  const auth=await window.HeliLogCloud.initializeProfile(name);
  if(!auth.hasProfile)throw Error(auth.error||"Could not create profile.");
  await v23EnterWorkspace(auth);
 }catch(e){v23AuthMessage=e.message||String(e);v23LoginView();}
 finally{v23AuthBusy=false;}
}
async function v23SignOut(){
 if(v23AuthBusy)return;
 if(typeof confirmLeaveFlightForm==="function"&&!confirmLeaveFlightForm())return;
 const pending=window.HeliLogV23Sync.status().pending;
 if(pending&&!confirm(pending+" unsynchronized change(s) remain saved on this device. Sign out anyway?"))return;
 v23AuthBusy=true;v23Unlocked=false;
 document.documentElement.classList.add("helilog-locked");
 document.documentElement.classList.remove("helilog-cloud-workspace");
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card" contenteditable="false">Signing out…</div></div>';
 window.HeliLogV24Archive.stop();
 window.HeliLogV23Sync.stop();
 try{await window.HeliLogCloud.signOut();v23AuthMessage="Signed out. Your account-specific cached records are preserved on this device.";}
 catch(e){v23AuthMessage=e.message||String(e);}
 finally{
  KEY=LIVE_KEY;S={pilot:{name:""},aircraft:[],flights:[],people:[],endorsements:[],qualifications:[]};
  v23AuthBusy=false;v23LoginView();
 }
}
async function v24ActivateExtended(mode){
 if(!v23AccountWorkspace())return;
 try{
  const preview=await window.HeliLogV23Sync.extensionPreview();
  if(mode==="upload"&&preview.hasCloud){
   alert('There are already '+preview.remoteRecords+' cloud profile/endorsement records. Upload was stopped to prevent overwriting them. Choose Use existing cloud records instead.');
   return;
  }
  if(mode==="cloud"&&!preview.hasCloud){
   alert('The cloud does not yet contain extended records. First enable Upload this device on the device containing the profile and endorsement records you want to keep.');
   return;
  }
  const warning=mode==="upload"?
    'Upload this device\'s pilot profile, instructors, licences, endorsements and brought-forward totals to your private cloud?\n\nThis should be done ONCE on the device containing the records you want to keep. Your existing local records are backed up first.':
    'Use existing cloud profiles and endorsements on this device?\n\nYour current local copies of those fields will be preserved in a separate safety snapshot before being replaced by the cloud copy.';
  if(!confirm(warning))return;
  const outcome=await window.HeliLogV23Sync.activateExtension(mode);
  if(outcome.status?.state==="error"||outcome.status?.state==="conflict"){
   alert('Data was preserved, but cloud synchronization needs attention: '+(outcome.status.error||"Check cloud status"));
  }
  await v24InitArchive();
  await v23RefreshSync();
 }catch(e){alert('Could not activate extended synchronization. Your local data was preserved: '+(e.message||e));}
}
function v24CommitArchiveRefresh(updated){
 localStorage.setItem(KEY,JSON.stringify(updated));
 S=updated;
}
async function v24InitArchive(){
 if(!v23AccountWorkspace()||!window.HeliLogV23Sync.extended())return;
 const client=await window.HeliLogCloud.client();
 window.HeliLogV24Archive.start({userId:window.HeliLogCloud.snapshot().userId,db:client});
 if(window.HeliLogV23Sync.status().state==="synced")
  await window.HeliLogV24Archive.refresh(()=>S,v24CommitArchiveRefresh);
}
async function v23RefreshSync(){
 if(!v23AccountWorkspace())return;
 await window.HeliLogV23Sync.refresh();
 if(window.HeliLogV23Sync.extended() && window.HeliLogV23Sync.status().state==="synced"){
  if(!window.HeliLogV24Archive.available())await v24InitArchive();
  else await window.HeliLogV24Archive.refresh(()=>S,v24CommitArchiveRefresh);
 }
 v23UpdateSyncChip();
 if(location.hash==="#cloud")cloud();
}
function v23PreventUnsupportedArchive(){
 if(!v23AccountWorkspace())return false;
 if(!isStandaloneApp()&&window.HeliLogV24Archive?.available?.())return false;
 alert(isStandaloneApp()?
  "Use the HeliLog web browser to print and archive records. The app supports signing and reviewing.":
  "Before printing, enable extended cloud sync in Cloud account and wait for Cloud synced. Signed and archived originals cannot be confirmed while synchronization is pending or offline.");
 return true;
}


/* V2.8: explicit integrity and external recovery checks. Never overwrite cloud data. */
let v28LastAudit=null,v28Busy=false,v28Notice="";
async function v28ReadAudit(storeEvidence=false){
 if(!v23AccountWorkspace())throw Error("Sign in to your private account first.");
 const owner=window.HeliLogCloud.snapshot().userId;
 const db=await window.HeliLogCloud.client();
 return window.HeliLogV28Integrity.auditCloud({
  client:db,owner,storeEvidence
 });
}
async function v28VerifyCloudArchives(){
 if(v28Busy)return;
 v28Busy=true;v28Notice="";
 try{
  const report=await v28ReadAudit(true);
  v28LastAudit=report;
  v28Notice=report.ok?
   "Cloud archive verification passed: "+report.counts.batches+" batches, "+
     report.counts.entries+" frozen originals and "+report.counts.addenda+
     " correction addenda checked. Previous device evidence was retained.":
   "Cloud archive integrity check FAILED: "+report.errors.slice(0,3).join(" | ")+
     ". The cloud was not changed. Preserve both copies and do not print or archive.";
 }catch(e){
  v28LastAudit=null;
  v28Notice="Archive verification could not finish: "+(e.message||e)+
   ". No cloud records were changed.";
 }finally{v28Busy=false;cloud();}
}
async function v28DownloadCloudRecovery(){
 if(v28Busy)return;
 v28Busy=true;v28Notice="";
 try{
  if(!v23AccountWorkspace()||window.HeliLogV23Sync.status().state!=="synced")
   throw Error("Wait for Cloud synced, with no pending or conflicting edits.");
  const owner=window.HeliLogCloud.snapshot().userId;
  const initial=JSON.stringify(S);
  const report=await v28ReadAudit(true);
  v28LastAudit=report;
  if(!report.ok)throw Error("Cloud archive audit failed: "+report.errors.slice(0,3).join(" | "));
  if(owner!==window.HeliLogCloud.snapshot().userId||
     window.HeliLogV23Sync.status().state!=="synced"||
     JSON.stringify(S)!==initial)
   throw Error("Your account changed while preparing the export. Save edits and retry.");
  const pack=await window.HeliLogV28Recovery.create({data:S,owner,archiveReport:report});
  if(JSON.stringify(S)!==initial)throw Error("Logbook changed before download. Retry.");
  offerBackupFile(pack,"HeliLog_V28_Cloud_Recovery");
  v28Notice="Verified recovery package download requested. Store the JSON securely outside this device. "+
   "It includes private records and signatures; a downloaded file is NOT an automatic cloud backup.";
 }catch(e){v28Notice="Recovery package was NOT prepared: "+(e.message||e);}
 finally{v28Busy=false;if(location.hash==="#cloud")cloud();else profile();}
}
async function v28InspectCloudRecovery(ev){
 if(v28Busy)return;
 const file=ev.target.files?.[0];
 ev.target.value="";
 if(!file)return;
 v28Busy=true;v28Notice="";
 try{
  if(!v23AccountWorkspace())throw Error("Sign in to the account that owns the backup.");
  if(file.size>100*1024*1024)throw Error("File exceeds the 100 MB read-only verification limit.");
  const parsed=JSON.parse(await file.text());
  const result=await window.HeliLogV28Recovery.verify(parsed,window.HeliLogCloud.snapshot().userId);
  const n=result.counts;
  v28Notice="Recovery file SHA-256 verified ("+n.flights+" flights, "+n.aircraft+" aircraft, "+
   n.endorsements+" endorsements, "+n.flightArchives+" flight archive batches and "+
   n.endorsementArchives+" endorsement archive batches). "+
   "This is a READ-ONLY inspection; neither the device nor the cloud was restored.";
 }catch(e){v28Notice="Recovery file rejected: "+(e.message||e)+". No records were modified.";}
 finally{v28Busy=false;if(location.hash==="#cloud")cloud();else profile();}
}

function v23ExitOldTestMode(){
 if(!TEST_MODE)return;
 if(!confirm('Exit the old V2.2 local Test Mode? Your sandbox records will stay saved and will not be uploaded.'))return;
 localStorage.removeItem(MODE_KEY);
 location.reload();
}
