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
   '<button class="btn" type="button" onclick="v22CloudSignOut()">Sign out of cloud</button></div>';
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
 app.innerHTML=header('Cloud account','HeliLog V2.2 · Private account foundation',
  '<button class="btn" onclick="go(\\'profile\\')">← Profile</button>')+
  '<div class="card" style="margin-bottom:16px"><div class="head"><h2>Connection status</h2></div>'+
  '<div class="pwa-state"><b>'+v22CloudEscape(stateText)+'</b></div>'+
  (st.configured?'<div class="mini">Test environment · Invitation-only accounts</div>':'<div class="mini">Test project is not configured yet.</div>')+
  (st.error?'<div class="note" role="alert">'+v22CloudEscape(st.error)+'</div>':'')+
  (v22CloudNotice?'<div class="note" role="status">'+v22CloudEscape(v22CloudNotice)+'</div>':'')+
  (st.configured?'<button class="btn" type="button" onclick="v22CloudRefresh()"'+(v22CloudBusy?' disabled':'')+'>Check cloud connection</button>':'')+
  '</div>'+
  action+
  '<div class="card" style="margin-top:16px"><div class="head"><h2>Local logbook protection</h2></div>'+
  '<p><b>No automatic upload or synchronization is enabled in V2.2.</b> Your existing flights, signed endorsements and print archives remain in this browser or installed app.</p>'+
  '<p class="muted">Logging into an account does not migrate or copy test data. We will add an explicit reviewed import and record-by-record synchronization process in a later version.</p>'+
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
