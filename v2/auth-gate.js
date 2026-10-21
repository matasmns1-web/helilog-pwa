/* HeliLog V2.3 private login gate. No automatic import of V2.2 local data. */
const HELILOG_TEST_VERSION='V2.28';
let v23Unlocked=false,v23AuthBusy=false,v23AuthMessage="";
let v23RecoveryStage="signin",v23InviteStage="signin";
function v23Escape(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function v23AccountWorkspace(){return v23Unlocked && !!window.HeliLogV23Sync.status().owner;}
function v23SyncInfo(){
 const st=window.HeliLogV23Sync.status();
 const label=st.state==="synced"?(window.HeliLogV23Sync.extended()?"Cloud synced":"Cloud setup incomplete"):st.state==="syncing"?"Syncing records…":
 st.state==="conflict"?"Conflict: needs attention":st.state==="offline"?"Offline: saved on device":
 st.state==="error"?"Sync error: saved on device":
 st.pending?"Pending upload: "+st.pending+" change(s)":"Checking cloud records…";
 const pending=Math.max(0,Number(st.pending)||0);
 const setupNeeded=!window.HeliLogV23Sync.extended() && st.state==="synced";
 const tone=st.state==="conflict"||st.state==="error"?"problem":
  st.state==="offline"||pending||setupNeeded?"warn":st.state==="synced"?"ok":"busy";
 const shortLabel=st.state==="conflict"?"Conflict":st.state==="error"?"Sync issue":
  st.state==="offline"?"Offline":pending?pending+" pending":
  st.state==="syncing"?"Syncing…":setupNeeded?"Finish setup":st.state==="synced"?"Synced":"Checking…";
 return '<details class="v220-sync-pop" data-tone="'+tone+'">'+
 '<summary class="v220-sync-pill" aria-label="Cloud sync: '+v23Escape(shortLabel)+'. Show details">'+
 '<span class="v220-sync-icon" aria-hidden="true">☁</span>'+
 '<span class="v220-sync-dot" aria-hidden="true"></span>'+
 '<span class="v220-sync-label">'+v23Escape(shortLabel)+'</span>'+
 '<span class="v220-sync-chevron" aria-hidden="true">⌄</span></summary>'+
 '<div class="v220-sync-bubble"><b>'+v23Escape(label)+'</b>'+
 (pending?'<div class="mini">'+pending+' pending change(s)</div>':'')+
 (st.error?'<div class="mini">'+v23Escape(st.error)+'</div>':'')+
 '<div class="mini">'+(window.HeliLogV23Sync.extended()?
  'Aircraft, flights, pilot profiles, qualifications, endorsements, medical records and opening totals are included in cloud sync. Print archive snapshots and signed corrections require separate confirmation.':
  'Aircraft and flights sync only. Finish setup in Cloud account to include pilot profiles, endorsements, qualifications and previous totals.')+'</div>'+
 ((st.state==="conflict"||st.state==="error"||pending||setupNeeded)?
 '<button type="button" class="btn" onclick="go(\'cloud\')">Review on this device</button>':'')+
 '</div></details>';
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
 '<button class="btn primary" type="submit">Sign in</button></form>'+
 '<button class="btn" type="button" style="width:100%;margin-top:10px" onclick="v23ShowPasswordHelp()">Forgot password?</button>')+
 (TEST_MODE?'<div class="note" style="margin-top:15px">The previous local Test Mode is active. To use cloud login, exit the old sandbox first. Its data remains safely stored.</div>'+
 '<button class="btn" type="button" onclick="v23ExitOldTestMode()">Exit old Test Mode</button>':'')+
 '<p class="mini" style="margin-top:20px">Your logbook is private to this account. Aircraft and flights sync across devices signed into the same account; records from other accounts are not imported automatically.</p>'+
 '</div></div>';
}

/* V2.19: recovery is an independent locked screen. Never open a workspace from an email link. */
function v23RecoveryView(stage=v23RecoveryStage){
 v23Unlocked=false;
 document.documentElement.classList.add("helilog-locked");
 document.documentElement.classList.remove("helilog-cloud-workspace");
 const invalid=stage==="invalid",ready=stage==="reset",sent=stage==="sent";
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card" contenteditable="false">'+
 '<div style="font-size:29px;font-weight:800">🚁 HeliLog</div>'+
 '<div class="muted">'+HELILOG_TEST_VERSION+' · Private pilot logbook test</div>'+
 '<h1 style="font-size:23px;margin-top:25px">'+(ready?'Set a new password':'Reset your password')+'</h1>'+
 '<p class="muted">'+(ready?'Choose a new password for your HeliLog account.':
 'Enter your account email and we will send recovery instructions if the address is registered.')+'</p>'+
 (v23AuthMessage?'<div class="note" role="status">'+v23Escape(v23AuthMessage)+'</div>':'')+
 (ready?
 '<form class="form" onsubmit="v23SaveRecoveredPassword(event)">'+
 '<div class="field"><label for="v23NewPassword">New password</label>'+
 '<input id="v23NewPassword" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></div>'+
 '<div class="field"><label for="v23ConfirmPassword">Confirm new password</label>'+
 '<input id="v23ConfirmPassword" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></div>'+
 '<p class="mini">Use at least 6 characters. A longer, unique password is safer.</p>'+
 '<button class="btn primary" type="submit">Update password</button></form>':
 (sent?'<p class="mini">Check your inbox and spam folder. The link can only be used for a limited time.</p>':
 '<form class="form" onsubmit="v23RequestPasswordReset(event)">'+
 '<div class="field"><label for="v23ResetEmail">Email</label>'+
 '<input id="v23ResetEmail" type="email" autocomplete="email" required></div>'+
 '<button class="btn primary" type="submit">Send recovery email</button></form>'))+
 '<button class="btn" style="width:100%;margin-top:12px" type="button" onclick="v23ReturnFromRecovery()">Back to sign in</button>'+
 (invalid?'<p class="mini">Expired links do not change your flight records or cloud data.</p>':'')+
 '</div></div>';
}
function v23ShowPasswordHelp(){
 v23RecoveryStage="request";v23AuthMessage="";
 v23RecoveryView();
}
async function v23ReturnFromRecovery(){
 if(v23AuthBusy)return;
 if(window.location?.search?.includes("helilog_recovery=")){
  v23AuthBusy=true;
  try{
   await window.HeliLogCloud.cancelPasswordRecovery();
  }catch(e){
   v23RecoveryStage="invalid";
   v23AuthMessage=String(e.message||e);
   v23RecoveryView();
   return;
  }finally{v23AuthBusy=false;}
 }
 v23RecoveryStage="signin";v23AuthMessage="";
 v23LoginView();
}
async function v23RequestPasswordReset(event){
 event.preventDefault();if(v23AuthBusy)return;
 const email=document.getElementById("v23ResetEmail")?.value||"";
 v23AuthBusy=true;v23AuthMessage="";
 try{
  await window.HeliLogCloud.sendPasswordReset(email);
  v23RecoveryStage="sent";
  v23AuthMessage="If this email address has a HeliLog account, recovery instructions will arrive shortly.";
 }catch(e){v23RecoveryStage="request";v23AuthMessage=String(e.message||e);}
 finally{v23AuthBusy=false;v23RecoveryView();}
}
async function v23SaveRecoveredPassword(event){
 event.preventDefault();if(v23AuthBusy||v23RecoveryStage!=="reset")return;
 const a=document.getElementById("v23NewPassword"),b=document.getElementById("v23ConfirmPassword");
 const password=a?.value||"",confirmation=b?.value||"";
 if(a)a.value="";if(b)b.value="";
 if(password!==confirmation||password.length<6||password.length>128){
  v23AuthMessage="Passwords must match and contain 6–128 characters.";
  v23RecoveryView();return;
 }
 v23AuthBusy=true;v23AuthMessage="";
 try{
  await window.HeliLogCloud.completePasswordRecovery(password);
  v23RecoveryStage="signin";
  v23AuthMessage="Password updated. Sign in with your new password.";
  v23LoginView();
 }catch(e){v23AuthMessage=String(e.message||e);v23RecoveryView();}
 finally{v23AuthBusy=false;}
}

/* Invitation acceptance is a separate locked Auth flow: never expose the logbook
 * while Supabase's temporary invitation session is present. */
function v23InvitationView(stage=v23InviteStage){
 v23Unlocked=false;
 document.documentElement.classList.add("helilog-locked");
 document.documentElement.classList.remove("helilog-cloud-workspace");
 const ready=stage==="setup";
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card" contenteditable="false">'+
 '<div style="font-size:29px;font-weight:800">🚁 HeliLog</div>'+
 '<div class="muted">'+HELILOG_TEST_VERSION+' · Private pilot logbook test</div>'+
 '<h1 style="font-size:23px;margin-top:25px">'+(ready?'Welcome to HeliLog':'Invitation link unavailable')+'</h1>'+
 '<p class="muted">'+(ready?'Your invitation has been verified. Choose a password to activate your private account.':
 'This invitation is invalid or expired. Ask the HeliLog administrator for a fresh invitation.')+'</p>'+
 (v23AuthMessage?'<div class="note" role="status">'+v23Escape(v23AuthMessage)+'</div>':'')+
 (ready?'<form class="form" onsubmit="v23CompleteInvitation(event)">'+
 '<div class="field"><label for="v23InvitePassword">Create password</label>'+
 '<input id="v23InvitePassword" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></div>'+
 '<div class="field"><label for="v23InvitePasswordConfirm">Confirm password</label>'+
 '<input id="v23InvitePasswordConfirm" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></div>'+
 '<p class="mini">Minimum 6 characters. A longer unique password is safer.</p>'+
 '<button class="btn primary" type="submit">Create account password</button></form>':'')+
 '<button class="btn" style="width:100%;margin-top:12px" type="button" onclick="v23CancelInvitation()">Back to sign in</button>'+
 '</div></div>';
}
async function v23CancelInvitation(){
 if(v23AuthBusy)return;
 v23AuthBusy=true;
 try{
  await window.HeliLogCloud.cancelInvitation();
  v23InviteStage="signin";v23AuthMessage="";
  v23LoginView();
 }catch(e){
  v23InviteStage="invalid";v23AuthMessage=String(e.message||e);
  v23InvitationView();
 }finally{v23AuthBusy=false;}
}
async function v23CompleteInvitation(event){
 event.preventDefault();if(v23AuthBusy||v23InviteStage!=="setup")return;
 const a=document.getElementById("v23InvitePassword"),b=document.getElementById("v23InvitePasswordConfirm");
 const password=a?.value||"",confirmPassword=b?.value||"";
 if(a)a.value="";if(b)b.value="";
 if(password!==confirmPassword||password.length<6||password.length>128){
  v23AuthMessage="Passwords must match and contain 6–128 characters.";
  v23InvitationView();return;
 }
 v23AuthBusy=true;v23AuthMessage="";
 try{
  await window.HeliLogCloud.completeInvitation(password);
  v23InviteStage="signin";
  v23AuthMessage="Your account password is ready. Sign in to finish your pilot profile.";
  v23LoginView();
 }catch(e){
  v23AuthMessage=String(e.message||e);
  v23InvitationView();
 }finally{v23AuthBusy=false;}
}

async function v23Boot(){
 if(v23AuthBusy)return;
 v23AuthBusy=true;v23AuthMessage="";
 document.documentElement.classList.add("helilog-locked");
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card" contenteditable="false"><h2>🚁 HeliLog '+HELILOG_TEST_VERSION+'</h2><p>Checking your account…</p></div></div>';
 try{
  const invitation=await window.HeliLogCloud.beginInvitation();
  if(invitation.state!=="none"){
   v23InviteStage=invitation.state==="ready"?"setup":"invalid";
   v23AuthMessage=invitation.message||"";
   v23InvitationView();
   return;
  }
  const recovery=await window.HeliLogCloud.beginPasswordRecovery();
  if(recovery.state!=="none"){
   v23RecoveryStage=recovery.state==="ready"?"reset":"invalid";
   v23AuthMessage=recovery.message||"";
   v23RecoveryView();
   return;
  }
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
 v213ResetPrivateViews(id);
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
     // Only correction proposals are synced as ordinary records. Signed
     // archive batches and confirmed addenda stay in the protected archive pull.
     printArchive:{...S.printArchive,corrections:next.printArchive?.corrections||S.printArchive?.corrections},
     pilot:next.pilot||S.pilot,
     broughtForward:next.broughtForward??S.broughtForward,
     broughtForwardByType:next.broughtForwardByType??S.broughtForwardByType,
     broughtForwardImported:next.broughtForwardImported??S.broughtForwardImported,
     broughtForwardImportedAt:next.broughtForwardImportedAt??S.broughtForwardImportedAt,
     // These settings are synced as a record and must be applied too.
     siteLocations:next.siteLocations??S.siteLocations};
   // Commit one complete account state, or keep the old one on failure.
   localStorage.setItem(KEY,JSON.stringify(updated));
   S=updated;
  },
  onStatus:()=>v23UpdateSyncChip()
 });
 await window.HeliLogV23Sync.refresh();
 // A genuinely fresh account cache can safely inherit the existing cloud
 // source. Do not auto-adopt on a previously used device, which may hold
 // unsynchronized endorsements or pilot details.
 if(stored===null && !window.HeliLogV23Sync.extended()){
  try{
   const setup=await window.HeliLogV23Sync.accountSetup();
   if(setup.hasCloud)await window.HeliLogV23Sync.activateExtension("cloud");
  }catch(error){
   v22CloudNotice="Automatic account setup needs review. Local data was retained: "+(error.message||error);
  }
 }
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
 if(el){
  const wasOpen=!!el.querySelector('details[open]');
  el.innerHTML=v23SyncInfo();
  if(wasOpen)el.querySelector('details')?.setAttribute('open','');
 }
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
 v213ResetPrivateViews();
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
  (window.HeliLogV24Archive?.blockReason?.()||"Check the cloud archive connection in this web browser. Other devices can synchronize later."));
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
  await v23RefreshSync();
  if(window.HeliLogV23Sync.status().state!=="synced"||
     window.HeliLogV24Archive?.error?.())
   throw Error("Archive or record synchronization is not healthy. Resolve that issue before exporting a verified package.");
  const owner=window.HeliLogCloud.snapshot().userId;
  const initial=JSON.stringify(S);
  const report=await v28ReadAudit(true);
  const localBatchCount=(S.printArchive?.batches?.length||0)+(S.endorsementV2Archive?.batches?.length||0);
  const localCorrectionCount=(S.printArchive?.corrections||[]).filter(x=>x.confirmedAt).length+
    (S.endorsementV2Archive?.amendments||[]).length;
  if(localBatchCount!==report.counts.batches || localCorrectionCount!==report.counts.addenda)
   throw Error("The device and cloud archive counts differ. Wait for archive refresh, then retry.");
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
 finally{v28Busy=false;if(location.hash==="#cloud")cloud();else if(location.hash==="#backups")backups();}
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
 finally{v28Busy=false;if(location.hash==="#cloud")cloud();else if(location.hash==="#backups")backups();}
}


/* V2.9 private snapshots, encrypted external exports and missing-only restore. */
let v29Snapshots=[],v29SelectedId="",v29BackupBusy=false,v29BackupMessage="",v29RestorePlan=null;
/* V2.19: private UI state must never follow the user into a different account.
 * In-flight callbacks are checked against a generation token before they can
 * update backup history, download files, or open recovery prompts.
 */
let v213PrivateViewEpoch=0,v213PrivateViewOwner="";
function v213ResetPrivateViews(owner=""){
 v213PrivateViewEpoch++;
 v213PrivateViewOwner=owner;
 v28LastAudit=null;v28Busy=false;v28Notice="";
 v29Snapshots=[];v29SelectedId="";v29BackupBusy=false;
 v29BackupMessage="";v29RestorePlan=null;
 v210Health=null;v210Retention=null;v210DrillMessage="";
 if(typeof v213ResetCloudViewState==="function")v213ResetCloudViewState();
}
function v213AssertPrivateView(owner,epoch){
 if(v213PrivateViewOwner!==owner||v213PrivateViewEpoch!==epoch||
    !v23AccountWorkspace()||window.HeliLogCloud.snapshot().userId!==owner)
  throw Error("Cloud account changed. This operation is cancelled without exposing another account's information.");
}

function v29RequireOwner(){
 if(!v23AccountWorkspace())throw Error("Sign in to your private cloud workspace.");
 const owner=window.HeliLogCloud.snapshot().userId;
 if(!owner)throw Error("Verified cloud account unavailable.");
 return owner;
}
async function v29Run(label,action){
 if(v29BackupBusy)return;
 const epoch=v213PrivateViewEpoch,owner=v213PrivateViewOwner;
 v29BackupBusy=true;v29BackupMessage="";v29RestorePlan=null;
 try{await action();}catch(e){
  if(v213PrivateViewEpoch===epoch&&v213PrivateViewOwner===owner)
   v29BackupMessage=label+": "+String(e.message||e);
 }finally{
  if(v213PrivateViewEpoch===epoch&&v213PrivateViewOwner===owner){
   v29BackupBusy=false;
   if(location.hash==="#backups"&&v23AccountWorkspace())backups();
  }
 }
}
async function v29LoadCloudSnapshots(){
 await v29Run("Backup history",async()=>{
  const owner=v29RequireOwner(),db=await window.HeliLogCloud.client();
  const epoch=v213PrivateViewEpoch;
  const snapshots=await window.HeliLogV29Backup.list(db,owner);
  v213AssertPrivateView(owner,epoch);
  v29Snapshots=snapshots;
  if(!v29Snapshots.some(x=>x.id===v29SelectedId))v29SelectedId=v29Snapshots[0]?.id||"";
  v29BackupMessage=v29Snapshots.length?
   "Loaded "+v29Snapshots.length+" most recent cloud snapshots. Daily backups run at 03:00 UTC.":
   "No server snapshots yet. Create one now while connected.";
 });
}
function v29ChooseSnapshot(id){v29SelectedId=String(id||"");v29RestorePlan=null;}
async function v29CreateCloudSnapshot(){
 await v29Run("Backup now",async()=>{
  const owner=v29RequireOwner(),epoch=v213PrivateViewEpoch;
  await v23RefreshSync();
  v213AssertPrivateView(owner,epoch);
  if(window.HeliLogV23Sync.status().state!=="synced"||
    window.HeliLogV24Archive.error())
   throw Error("Resolve this browser's pending cloud edits or archive discrepancy first.");
  const db=await window.HeliLogCloud.client();
  v213AssertPrivateView(owner,epoch);
  const id=await window.HeliLogV29Backup.create(db,owner);
  v213AssertPrivateView(owner,epoch);
  const snapshots=await window.HeliLogV29Backup.list(db,owner);
  v213AssertPrivateView(owner,epoch);
  v29Snapshots=snapshots;
  v29SelectedId=id;
  const [health,retention]=await Promise.all([
   window.HeliLogV29Backup.health(db,owner),
   window.HeliLogV29Backup.retention(db,owner)
  ]);
  v213AssertPrivateView(owner,epoch);
  v210Health=health;v210Retention=retention;
  v29BackupMessage="Created a private, checksum-protected snapshot in the TEST Supabase database. For independent disaster protection, also download an encrypted copy.";
 });
}
async function v29DownloadEncryptedSnapshot(){
 if(v29BackupBusy)return;
 const passwordInput=document.getElementById("v29ExportPass");
 const confirmInput=document.getElementById("v29ExportPassConfirm");
 const password=passwordInput?.value||"", repeated=confirmInput?.value||"";
 if(passwordInput)passwordInput.value="";
 if(confirmInput)confirmInput.value="";
 await v29Run("Encrypted export",async()=>{
  if(password.length<12)throw Error("Enter a passphrase of at least 12 characters.");
  if(password!==repeated)throw Error("Passphrase confirmation does not match.");
  const owner=v29RequireOwner(),epoch=v213PrivateViewEpoch,db=await window.HeliLogCloud.client();
  v213AssertPrivateView(owner,epoch);
  if(!v29SelectedId)throw Error("Select a cloud snapshot first.");
  const source=await window.HeliLogV29Backup.downloadPayload(db,owner,v29SelectedId);
  v213AssertPrivateView(owner,epoch);
  const encrypted=await window.HeliLogV29Backup.encryptSnapshot(source,password);
  v213AssertPrivateView(owner,epoch);
  // Do not put the account holder's name, email or account ID in the filename.
  const blob=new Blob([JSON.stringify(encrypted)],{type:"application/json"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download="HeliLog_V29_Encrypted_Cloud_Snapshot.json";
  document.body.appendChild(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  v29BackupMessage="Encrypted file download requested. Keep it off-device, and store your passphrase separately. HeliLog cannot recover a forgotten passphrase.";
 });
}
async function v29InspectEncryptedSnapshot(ev){
 if(v29BackupBusy)return;
 const file=ev?.target?.files?.[0];
 if(ev?.target)ev.target.value="";
 if(!file)return;
 const passwordInput=document.getElementById("v29InspectPass");
 const password=passwordInput?.value||"";
 if(passwordInput)passwordInput.value="";
 await v29Run("Inspect encrypted backup",async()=>{
  if(file.size>100*1024*1024)throw Error("File exceeds the 100 MB verification limit.");
  const owner=v29RequireOwner(),epoch=v213PrivateViewEpoch;
  const unlocked=await window.HeliLogV29Backup.decryptSnapshot(JSON.parse(await file.text()),password,owner);
  v213AssertPrivateView(owner,epoch);
  v29BackupMessage="Encrypted backup decrypted and authenticated: "+unlocked.records+" cloud records, "+
   unlocked.archives+" print batches, "+unlocked.frozen+" frozen originals and "+
   unlocked.addenda+" signed addenda. Inspection is read-only; no records were restored.";
 });
}
async function v29PreviewCloudRestore(){
 await v29Run("Recovery preview",async()=>{
  const owner=v29RequireOwner(),epoch=v213PrivateViewEpoch;
  if(!v29SelectedId)throw Error("Select a backup snapshot.");
  await v23RefreshSync();
  v213AssertPrivateView(owner,epoch);
  if(window.HeliLogV23Sync.status().state!=="synced"||window.HeliLogV24Archive.error())
   throw Error("Resolve local pending/conflicted sync and archived-record discrepancies first.");
  const db=await window.HeliLogCloud.client();
  const plan=await window.HeliLogV29Backup.preview(db,owner,v29SelectedId);
  v213AssertPrivateView(owner,epoch);
  v29RestorePlan=plan;
  v29BackupMessage=plan.restorable?
   "Verified snapshot: "+plan.missingUnsigned+" missing unsigned records can be restored. "+
   plan.differentExisting+" different existing records; "+plan.protectedMismatch+
   " protected mismatches. No existing cloud records or signed archives will be changed.":
   "RECOVERY BLOCKED: "+plan.differentExisting+" existing records differ and "+
   plan.protectedMismatch+" archived/signed records fail provenance checks. No changes made.";
 });
}
async function v29RestoreMissingCloudRecords(){
 if(!v29RestorePlan||v29RestorePlan.id!==v29SelectedId){
  v29BackupMessage="Preview the selected snapshot again before restoring.";backups();return;
 }
 const input=document.getElementById("v29RestorePhrase");
 const phrase=input?.value||"";
 if(input)input.value="";
 if(phrase!=="RESTORE MISSING RECORDS"){
  v29BackupMessage="Type RESTORE MISSING RECORDS to confirm.";backups();return;
 }
 if(!confirm("Restore ONLY missing unsigned records from the selected TEST snapshot? "+
    "No existing cloud records, signatures or print archives will be overwritten. "+
    "A server-side pre-restore snapshot will be captured in the same transaction."))return;
 const plan=v29RestorePlan;
 await v29Run("Restore missing records",async()=>{
  const owner=v29RequireOwner(),epoch=v213PrivateViewEpoch;
  if(window.HeliLogV23Sync.status().state!=="synced")
   throw Error("This browser is not fully synchronized.");
  const db=await window.HeliLogCloud.client();
  v213AssertPrivateView(owner,epoch);
  const result=await window.HeliLogV29Backup.restore(db,owner,plan,phrase);
  v213AssertPrivateView(owner,epoch);
  await v23RefreshSync();
  v213AssertPrivateView(owner,epoch);
  const snapshots=await window.HeliLogV29Backup.list(db,owner);
  v213AssertPrivateView(owner,epoch);
  v29Snapshots=snapshots;
  v29BackupMessage="Restored "+result.restored+" missing unsigned cloud record(s). "+
   "An independent pre-restore SERVER snapshot was saved in this database. "+
   "Other devices should reconnect and sync before new changes.";
 });
}


/* V2.10 — authenticated monitoring and isolated recovery verification.
 * No live records are written by these functions.
 */
let v210Health=null,v210Retention=null,v210DrillMessage="";
async function v210CheckBackupHealth(){
 await v29Run("Backup monitoring",async()=>{
  const owner=v29RequireOwner(),epoch=v213PrivateViewEpoch,db=await window.HeliLogCloud.client();
  const [status,policy]=await Promise.all([
   window.HeliLogV29Backup.health(db,owner),
   window.HeliLogV29Backup.retention(db,owner)
  ]);
  v213AssertPrivateView(owner,epoch);
  v210Health=status;v210Retention=policy;
  v29BackupMessage=status.status==="healthy"?
   "Latest cloud snapshot checksum verified; scheduled-job monitoring shows no current backup warning.":
   "ATTENTION: backup status is "+status.status.replaceAll("_"," ")+
    ". Keep an independent encrypted copy and investigate before depending on cloud recovery.";
 });
}
async function v210TestEncryptedRecovery(ev){
 if(v29BackupBusy)return;
 const file=ev?.target?.files?.[0];
 if(ev?.target)ev.target.value="";
 if(!file)return;
 const input=document.getElementById("v210DrillPass");
 const pass=input?.value||"";
 if(input)input.value="";
 await v29Run("Isolated recovery drill",async()=>{
  if(file.size>100*1024*1024)
   throw Error("Encrypted file is larger than the 100 MB recovery-drill limit.");
  const owner=v29RequireOwner(),epoch=v213PrivateViewEpoch;
  const locked=JSON.parse(await file.text());
  const verified=await window.HeliLogV29Backup.decryptSnapshot(locked,pass,owner);
  v213AssertPrivateView(owner,epoch);
  const report=await window.HeliLogV210Drill.drill(verified.data,owner);
  v213AssertPrivateView(owner,epoch);
  if(!report.ok)throw Error("The encrypted snapshot failed the sandbox drill: "+
   report.problems.slice(0,3).join(" | ")+". No data was modified.");
  v210DrillMessage="SUCCESS: Isolated recovery reconstructed "+report.counts.records+
   " cloud records, "+report.counts.archives+" print batches, "+
   report.counts.frozen+" frozen originals and "+report.counts.addenda+
   " signed addenda, with matching SHA-256 fingerprints. "+
   "NO existing account was restored or modified. Full provider recovery still requires supervised tooling.";
  v29BackupMessage=v210DrillMessage;
 });
}

function v29BackupPanel(){
 if(!v23AccountWorkspace())return "";
 return `<div class="card" style="margin-top:16px">
  <div class="head"><div><h2>Backup reliability &amp; recovery</h2>
   <div class="muted">Private daily server snapshots and passphrase-protected off-device downloads.</div></div></div>
  <p class="mini">Daily snapshots run at 03:00 UTC. They are in the same TEST Supabase database, not independent disaster recovery. Save an encrypted download elsewhere.</p>
  <div class="actions" style="margin-top:10px">
   <button class="btn" type="button" onclick="v210CheckBackupHealth()" ${v29BackupBusy?'disabled':''}>Check backup health &amp; retention</button>
  </div>
  ${v210Health?`<div class="note" role="status" style="margin-top:10px">
    <b>Backup health:</b> ${htmlEscape(v210Health.status.replaceAll('_',' '))}
    · Scheduler: ${v210Health.scheduleActive?'enabled':'DISABLED'}
    · ${v210Health.snapshotCount} server snapshot(s).
    ${v210Health.lastBackupAt?'Last snapshot: '+htmlEscape(new Date(v210Health.lastBackupAt).toLocaleString())+' ('+htmlEscape(String(v210Health.ageHours))+' h ago).':''}
    · SHA-256: ${v210Health.checksumVerified?'verified':'NOT VERIFIED'}
    · Failed scheduled runs (7 days): ${v210Health.failedJobRuns7d}.
    ${v210Health.lastJobStatus?'· Most recent scheduled job: '+htmlEscape(v210Health.lastJobStatus):''}
  </div>`:''}
  ${v210Retention?`<div class="mini" style="margin-top:8px">
    <b>Retention preview (no deletion):</b> ${v210Retention.daily} daily, 
    ${v210Retention.manual} manual, ${v210Retention.preRestore} pre-restore backups;
    ${v210Retention.eligibleForFuturePruning} would qualify under a future 90-daily/12-month-anchor policy.
    Existing backup snapshots are preserved; retention is preview-only.
  </div>`:''}
  <div class="actions"><button class="btn" onclick="v29LoadCloudSnapshots()" ${v29BackupBusy?'disabled':''}>Refresh backup history</button>
   <button class="btn primary" onclick="v29CreateCloudSnapshot()" ${v29BackupBusy?'disabled':''}>Backup now</button></div>
  <div class="field" style="margin-top:12px"><label for="v29SnapshotSelect">Cloud snapshot</label>
   <select id="v29SnapshotSelect" style="width:100%" onchange="v29ChooseSnapshot(this.value)">
   ${v29Snapshots.length?v29Snapshots.map(b=>`<option value="${htmlEscape(b.id)}" ${b.id===v29SelectedId?'selected':''}>${htmlEscape(new Date(b.created_at).toLocaleString())} · ${htmlEscape(b.source)} · ${htmlEscape(b.id.slice(0,8))}</option>`).join(""):'<option value="">Load history first</option>'}
   </select></div>
  <p><b>Encrypted off-device copy</b></p>
  <p class="mini">AES-256-GCM encryption is performed in this browser. Use a strong passphrase (12+ characters); HeliLog cannot recover it.</p>
  <div class="formgrid">
    <div class="field"><label for="v29ExportPass">Encryption passphrase</label><input id="v29ExportPass" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="v29ExportPassConfirm">Confirm passphrase</label><input id="v29ExportPassConfirm" type="password" autocomplete="new-password"></div>
  </div>
  <button class="btn primary" type="button" onclick="v29DownloadEncryptedSnapshot()" ${v29BackupBusy?'disabled':''}>Download encrypted backup</button>
  <div class="actions" style="margin-top:12px;flex-wrap:wrap">
    <div class="field"><label for="v29InspectPass">Passphrase to inspect a saved file</label><input id="v29InspectPass" type="password" autocomplete="off"></div>
    <input id="v29InspectFile" type="file" accept=".json,application/json" style="display:none" onchange="v29InspectEncryptedSnapshot(event)">
    <button class="btn" type="button" onclick="document.getElementById('v29InspectFile').click()" ${v29BackupBusy?'disabled':''}>Inspect encrypted backup</button>
  </div>
  <div class="note" style="margin-top:14px"><b>Isolated encrypted recovery drill</b>
   <p>Decrypt a saved snapshot and reconstruct its original records and signed history in temporary browser memory only. No records are uploaded, deleted or changed. This tests backup consistency, NOT full cloud-provider restoration.</p></div>
  <div class="actions" style="flex-wrap:wrap">
   <div class="field"><label for="v210DrillPass">Backup passphrase</label>
     <input id="v210DrillPass" type="password" autocomplete="off"></div>
   <input id="v210DrillFile" type="file" accept=".json,application/json" style="display:none" onchange="v210TestEncryptedRecovery(event)">
   <button class="btn" type="button" onclick="document.getElementById('v210DrillFile').click()" ${v29BackupBusy?'disabled':''}>Run isolated recovery drill</button>
  </div>
  <div style="margin:16px 0;border-top:1px solid var(--line)"></div>
  <p><b>Guarded cloud restore</b></p>
  <p class="muted">Only missing unsigned cloud records may be recovered. Existing records, sealed endorsements and printed archives are never overwritten.</p>
  <button class="btn" type="button" onclick="v29PreviewCloudRestore()" ${v29BackupBusy?'disabled':''}>Preview safe restore</button>
  ${v29RestorePlan?.restorable&&v29RestorePlan.id===v29SelectedId&&v29RestorePlan.missingUnsigned>0?`
    <div class="note" style="margin-top:12px">Verified: ${v29RestorePlan.missingUnsigned} missing unsigned records. A pre-restore server snapshot will be kept.</div>
    <div class="field"><label for="v29RestorePhrase">Type RESTORE MISSING RECORDS</label><input id="v29RestorePhrase" autocomplete="off"></div>
    <button class="btn" type="button" onclick="v29RestoreMissingCloudRecords()" ${v29BackupBusy?'disabled':''}>Restore missing records</button>`:''}
  ${v29BackupMessage?`<div role="status" class="note" style="margin-top:12px">${htmlEscape(v29BackupMessage)}</div>`:''}
 </div>`;
}

function v23ExitOldTestMode(){
 if(!TEST_MODE)return;
 if(!confirm('Exit the previous local Test Mode? Your sandbox records will stay saved and will not be uploaded.'))return;
 localStorage.removeItem(MODE_KEY);
 location.reload();
}
