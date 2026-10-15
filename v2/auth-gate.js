/* HeliLog V2.3 private login gate. No automatic import of V2.2 local data. */
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
 '<div class="mini">V2.3 synchronizes aircraft and flights ONLY. Endorsements, signatures, print archives, corrections, profile details and previous totals are still device-local.</div></div>';
}
function v23LoginView(){
 v23Unlocked=false;
 document.documentElement.classList.add("helilog-locked");
 const st=window.HeliLogCloud.snapshot(),profile=st.status==="signed_in"&&!st.hasProfile;
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card">'+
 '<div style="font-size:29px;font-weight:800">🚁 HeliLog</div>'+
 '<div class="muted">V2.3 · Private pilot logbook test</div>'+
 '<h1 style="font-size:23px;margin-top:25px">'+(profile?'Create your pilot profile':'Sign in')+'</h1>'+
 '<p class="muted">'+(profile?'Complete your account before opening your logbook.':
 'Sign in to open your private cloud logbook. Registration is invitation-only.')+'</p>'+
 (v23AuthMessage?'<div class="note" role="alert">'+v23Escape(v23AuthMessage)+'</div>':'')+
 (st.error?'<div class="mini">'+v23Escape(st.error)+'</div>':'')+
 (profile?
 '<form class="form" onsubmit="v23CreateProfile(event)"><div class="field"><label for="v23PilotName">Your name</label>'+
 '<input id="v23PilotName" type="text" maxlength="120" required autocomplete="name"></div>'+
 '<button class="btn primary" type="submit">Create private profile</button></form>'+
 '<button class="btn" type="button" style="margin-top:15px" onclick="v23SignOut()">Sign out</button>':
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
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card"><h2>🚁 HeliLog V2.3</h2><p>Checking your account…</p></div></div>';
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
 const client=await window.HeliLogCloud.client();
 window.HeliLogV23Sync.start({
  userId:id,client,getData:()=>S,
  replaceData:next=>{
   if(typeof hasUnsavedFlightChanges==='function'&&hasUnsavedFlightChanges())
    throw Error("A flight form has unsaved changes. Finish or cancel the edit before refreshing cloud records.");
   const updated={...S,aircraft:next.aircraft,flights:next.flights};
   // Persist the complete merged cache before replacing the visible model.
   localStorage.setItem(KEY,JSON.stringify(updated));
   S=updated;
  },
  onStatus:()=>v23UpdateSyncChip()
 });
 await window.HeliLogV23Sync.refresh();
 v23Unlocked=true;
 document.documentElement.classList.remove("helilog-locked");
 document.documentElement.classList.add("helilog-cloud-workspace");
 if(location.hash==="#login"||!location.hash)location.hash="#dashboard";
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
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card">Signing in…</div></div>';
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
 const pending=window.HeliLogV23Sync.status().pending;
 if(pending&&!confirm(pending+" unsynchronized change(s) remain saved on this device. Sign out anyway?"))return;
 v23AuthBusy=true;v23Unlocked=false;
 document.documentElement.classList.add("helilog-locked");
 document.documentElement.classList.remove("helilog-cloud-workspace");
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card">Signing out…</div></div>';
 window.HeliLogV23Sync.stop();
 try{await window.HeliLogCloud.signOut();v23AuthMessage="Signed out. Your account-specific cached records are preserved on this device.";}
 catch(e){v23AuthMessage=e.message||String(e);}
 finally{
  KEY=LIVE_KEY;S={pilot:{name:""},aircraft:[],flights:[],people:[],endorsements:[],qualifications:[]};
  v23AuthBusy=false;v23LoginView();
 }
}
async function v23RefreshSync(){
 if(!v23AccountWorkspace())return;
 await window.HeliLogV23Sync.refresh();
 v23UpdateSyncChip();
 if(location.hash==="#cloud")cloud();
}
function v23PreventUnsupportedArchive(){
 if(!v23AccountWorkspace())return false;
 alert("V2.3 cloud workspaces sync aircraft and flights only. Paper archive creation and corrections are unavailable here until immutable cloud archiving is implemented. Your old local V2.2 archives remain untouched.");
 return true;
}

function v23ExitOldTestMode(){
 if(!TEST_MODE)return;
 if(!confirm('Exit the old V2.2 local Test Mode? Your sandbox records will stay saved and will not be uploaded.'))return;
 localStorage.removeItem(MODE_KEY);
 location.reload();
}
