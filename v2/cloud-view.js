/* HeliLog V2.2 — Cloud Account screen.
 * Access from the existing interface. No flights or local records are
 * read/written to the cloud. Signup is disabled: invite-only accounts.
 */
let v22CloudNotice="",v22CloudBusy=false;
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
   '<button class="btn" type="button" onclick="v23SignOut()">Sign out of cloud</button></div>';
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
 app.innerHTML=header('Cloud account','HeliLog V2.4 · Private account and synchronization',
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
  '<p class="mini">Conflicting revisions remain pending for manual resolution, not overwritten.</p></div>'+
  '<div class="card" style="margin-top:16px"><div class="head"><h2>Local logbook protection</h2></div>'+
  '<p><b>V2.4 synchronizes aircraft and flights; other data syncs after your one-time account setup.</b> Your existing V2.2 test data is preserved separately and never automatically uploaded.</p>'+
  '<p class="muted">Endorsements, instructor profiles, qualifications, signature images, brought-forward totals and all print archive/correction history are NOT backed up to the cloud yet. Offline sign-in and automatic conflict resolution are planned later.</p>'+
  '<p class="mini">Other pilots will have separate private accounts when invitations become available. A saved instructor/examiner in your logbook does not automatically become an account user.</p>'+
  '</div>';
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
