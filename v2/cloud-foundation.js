/* HeliLog V2.2 account foundation.
 * No flight, endorsement or archive data is uploaded by this module.
 * Only a verified Supabase Auth session and its OWN helilog_accounts row
 * can be read or explicitly initialized. Auth is invitation-only in V2.2.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogCloud=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 const config=()=>root.HeliLogCloudConfig||{};
 const sdkUrl="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
 let client=null,loading=null,status="unconfigured",lastError="",user=null,account=null;
 // Capture the recovery token before Supabase consumes and removes the URL fragment.
 // A query marker alone never gives permission to reset a password.
 const recoveryQuery=new URLSearchParams(root.location?.search||"");
 const recoveryFragment=new URLSearchParams((root.location?.hash||"").replace(/^#/,""));
 const recoveryRequested=recoveryQuery.get("helilog_recovery")==="1";
 const recoveryAccessToken=recoveryRequested&&recoveryFragment.get("type")==="recovery"
  &&recoveryFragment.get("refresh_token")?recoveryFragment.get("access_token"):"";
 const recoveryLinkError=recoveryQuery.get("error_description")||recoveryFragment.get("error_description")||"";
 // Dashboard invite links arrive at Site URL with type=invite, access_token and refresh_token.
 // An error fragment is also handled as a locked invite screen, never as an account login.
 const inviteAttempted=!recoveryRequested&&(
  recoveryFragment.get("type")==="invite"||
  (recoveryQuery.get("helilog_oauth")!=="google"&&!!recoveryFragment.get("error")));
 const inviteAccessToken=inviteAttempted&&recoveryFragment.get("type")==="invite"
  &&recoveryFragment.get("refresh_token")?recoveryFragment.get("access_token"):"";
 const inviteLinkError=recoveryFragment.get("error_description")||"";
 // Google OAuth uses the implicit token callback only on a fixed same-origin URL.
 // A marker alone is never sufficient proof of a new, verified session.
 const googleRequested=!recoveryRequested&&!inviteAttempted&&recoveryQuery.get("helilog_oauth")==="google";
 const googleAccessToken=googleRequested&&recoveryFragment.get("refresh_token")?
  recoveryFragment.get("access_token"):"";
 const googleLinkError=googleRequested?(recoveryFragment.get("error_description")||
  recoveryQuery.get("error_description")||""):"";
 let recoveryVerified=false,inviteVerified=false;
 function clearRecoveryUrl(){
  const here=root.location;
  if(!here||!root.history?.replaceState)return;
  // Never retain recovery tokens or callback markers in browser history.
  root.history.replaceState(null,"",here.pathname||"/");
 }
 function recoveryRedirectUrl(){
  if(!root.location||root.location.protocol!=="https:"||
    !root.location.origin||!root.location.pathname)
   throw Error("Password recovery requires the secure HeliLog website.");
  return root.location.origin+root.location.pathname+"?helilog_recovery=1";
 }
 function validConfig(c=config()){
  if(c.authEnabled!==true || !c.supabaseUrl || !c.publishableKey)return false;
  if(c.inviteOnly!==true||!["test","production"].includes(c.environment))
   throw Error("Only invite-only test or verified production cloud projects are allowed.");
  let url;
  try{url=new URL(c.supabaseUrl);}catch{throw Error("Cloud project URL is invalid.");}
  if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"&&url.pathname!==""||url.search||url.hash)throw Error("Use a secure Supabase project base URL.");
  if(c.environment==="production"){
   const origin=root.location?.origin||"";
   if(!origin||!c.productionOrigin||origin!==c.productionOrigin||
      !/^https:\/\//.test(origin)||
      /(?:^|[.-])(test|staging|preview|dev)(?:[.-]|$)/i.test(new URL(origin).hostname)||
      url.hostname==="cabfifnsxpaalgsyicbo.supabase.co"||
      !/^[a-z0-9]{16,}\.supabase\.co$/.test(url.hostname))
    throw Error("Production cloud connection blocked: use a verified production website and a separate production Supabase project.");
  }
  const key=String(c.publishableKey);
  // Require modern publishable keys. A legacy JWT-shaped service_role key
  // can otherwise be misclassified as anon and accidentally exposed.
  if(!/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(key))
   throw Error("Only a Supabase sb_publishable_ key is allowed; never use a secret, legacy JWT or service_role key in the public site.");
  return true;
 }
 function snapshot(){
  return Object.freeze({configured:!!(config().authEnabled&&config().supabaseUrl&&config().publishableKey),
    status,error:lastError,email:user?.email||"",userId:user?.id||"",
    hasProfile:!!account,displayName:account?.display_name||"",
    synced:false,localDataUploaded:false,inviteOnly:true});
 }
 function loadLibrary(){
  if(root.supabase?.createClient)return Promise.resolve(root.supabase);
  return new Promise((resolve,reject)=>{
   if(!root.document||!root.document.createElement){reject(Error("Browser unavailable"));return;}
   const node=root.document.createElement("script");
   node.src=sdkUrl;node.async=true;
   node.onload=()=>root.supabase?.createClient?resolve(root.supabase):reject(Error("Supabase SDK did not initialize."));
   node.onerror=()=>reject(Error("Unable to load cloud sign-in library. Check your internet connection."));
   root.document.head.appendChild(node);
  });
 }
 async function connect(){
  if(client)return client;
  if(loading)return loading;
  if(!validConfig()){status="unconfigured";throw Error("Cloud account setup is not configured yet.");}
  status="connecting";lastError="";
  loading=(async()=>{
   const lib=await loadLibrary();
   client=lib.createClient(config().supabaseUrl,config().publishableKey,{
    auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:recoveryRequested||inviteAttempted||googleRequested,flowType:"implicit"},
    db:{schema:"public"}
   });
   return client;
  })();
  try{return await loading;}
  catch(e){status="error";lastError=e.message;throw e;}
  finally{loading=null;}
 }
 async function refresh(){
  if(!validConfig()){status="unconfigured";lastError="";user=null;account=null;return snapshot();}
  try{
   const db=await connect();
   const {data:identity,error:authErr}=await db.auth.getUser();
   // Supabase reports a missing session on first visit; that is signed OUT,
   // not a broken database connection.
   if(authErr && identity?.user)throw authErr;
   if(!identity?.user){
    if(authErr && authErr.name!=="AuthSessionMissingError"&&!/Auth session missing/i.test(authErr.message||""))throw authErr;
    status="signed_out";user=null;account=null;lastError="";return snapshot();
   }
   user={id:identity.user.id,email:identity.user.email};
   const {data:profile,error:profileErr}=await db.from("helilog_accounts")
    .select("user_id,display_name").eq("user_id",user.id).maybeSingle();
   if(profileErr)throw Error("Cloud profile unavailable. Verify that the V2.2 migration and RLS policies were applied. "+profileErr.message);
   account=profile||null;
   status="signed_in";lastError="";
   return snapshot();
  }catch(e){
   status="error";lastError=String(e.message||e);
   // On error do not falsely present a verified account as connected.
   user=null;account=null;return snapshot();
  }
 }
 function googleEnabled(){return config().googleEnabled===true;}
 function googleRedirectUrl(){
  if(!root.location||root.location.protocol!=="https:"||
    !root.location.origin||!root.location.pathname)
   throw Error("Google sign-in requires the secure HeliLog website.");
  return root.location.origin+root.location.pathname+"?helilog_oauth=google";
 }
 async function signInWithGoogle(){
  if(!googleEnabled())throw Error("Google sign-in is not enabled for this HeliLog environment.");
  const db=await connect();
  const {data,error}=await db.auth.signInWithOAuth({
   provider:"google",options:{redirectTo:googleRedirectUrl()}
  });
  if(error)throw Error("Google sign-in could not begin. Verify that the Google provider is configured in Supabase.");
  return data;
 }
 async function finishGoogleRedirect(){
  if(!googleRequested)return {state:"none"};
  if(googleLinkError||!googleAccessToken){
   clearRecoveryUrl();
   return {state:"invalid",message:"Google sign-in was cancelled, rejected or expired. Please try again."};
  }
  try{
   const db=await connect();
   const {data:sessionData,error:sessionError}=await db.auth.getSession();
   if(sessionError||!sessionData?.session||sessionData.session.access_token!==googleAccessToken)
    throw Error("OAuth callback did not match the session");
   const {data:identity,error:identityError}=await db.auth.getUser();
   if(identityError||!identity?.user||identity.user.id!==sessionData.session.user?.id)
    throw Error("Unverified Google account");
   clearRecoveryUrl();
   return {state:"ready"};
  }catch{
   clearRecoveryUrl();
   return {state:"invalid",message:"Google sign-in could not be verified. Please try again."};
  }
 }
 async function signIn(email,password){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||"").trim()))throw Error("Enter a valid email address.");
  if(!password)throw Error("Enter your password.");
  const db=await connect();
  const {error}=await db.auth.signInWithPassword({email:String(email).trim(),password});
  if(error)throw Error(error.message||"Login failed.");
  return refresh();
 }
 async function initializeProfile(displayName){
  const db=await connect();
  const {data:identity,error:authErr}=await db.auth.getUser();
  if(authErr||!identity?.user)throw Error("Sign in before creating your cloud profile.");
  const name=String(displayName||"").trim();
  if(name.length<2||name.length>120)throw Error("Enter your full name (2–120 characters).");
  const {error}=await db.from("helilog_accounts").insert({
   user_id:identity.user.id,display_name:name
  });
  if(error)throw Error(error.message||"Could not create cloud profile.");
  return refresh();
 }
 async function sendPasswordReset(email){
  const address=String(email||"").trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error("Enter a valid email address.");
  const db=await connect();
  const {error}=await db.auth.resetPasswordForEmail(address,{redirectTo:recoveryRedirectUrl()});
  if(error)throw Error("Recovery email could not be sent. Please wait and try again.");
  // Keep the response independent of whether an email belongs to an account.
  return true;
 }
 async function beginPasswordRecovery(){
  if(!recoveryRequested)return {state:"none"};
  recoveryVerified=false;
  if(recoveryLinkError||!recoveryAccessToken)
   return {state:"invalid",message:"This recovery link is invalid or expired. Request a new one."};
  try{
   const db=await connect();
   const {data:sessionData,error:sessionError}=await db.auth.getSession();
   if(sessionError||!sessionData?.session||sessionData.session.access_token!==recoveryAccessToken)
    throw Error("Invalid recovery session");
   const {data:identity,error:identityError}=await db.auth.getUser();
   if(identityError||!identity?.user||identity.user.id!==sessionData.session.user?.id)
    throw Error("Unverified recovery account");
   recoveryVerified=true;
   return {state:"ready"};
  }catch{
   return {state:"invalid",message:"This recovery link could not be verified. It may have expired or already been used. Request a new one."};
  }
 }
 async function cancelPasswordRecovery(){
  if(!recoveryRequested)return true;
  recoveryVerified=false;
  const db=await connect();
  const {error}=await db.auth.signOut({scope:"local"});
  if(error)throw Error("Could not close the password recovery session. Please retry before signing in.");
  user=null;account=null;status="signed_out";lastError="";
  clearRecoveryUrl();
  return true;
 }
 async function completePasswordRecovery(password){
  if(!recoveryVerified||!recoveryRequested)throw Error("Open a valid recovery email link first.");
  if(typeof password!=="string"||password.length<6||password.length>128)
   throw Error("Use a password between 6 and 128 characters.");
  const db=await connect();
  const {data:identity,error:identityError}=await db.auth.getUser();
  if(identityError||!identity?.user)throw Error("Recovery session expired. Request another link.");
  const {error}=await db.auth.updateUser({password});
  if(error)throw Error("Password could not be updated. Request another link or retry.");
  recoveryVerified=false;
  const {error:signOutError}=await db.auth.signOut({scope:"global"});
  clearRecoveryUrl();
  user=null;account=null;status="signed_out";lastError="";
  if(signOutError)throw Error("Password changed, but sign-out could not finish. Close HeliLog and sign in with your new password.");
  return true;
 }
 async function beginInvitation(){
  if(!inviteAttempted)return {state:"none"};
  inviteVerified=false;
  if(inviteLinkError||!inviteAccessToken)
   return {state:"invalid",message:"This invitation link is invalid or expired. Ask the HeliLog administrator to send a new invitation."};
  try{
   const db=await connect();
   const {data:sessionData,error:sessionError}=await db.auth.getSession();
   if(sessionError||!sessionData?.session||
      sessionData.session.access_token!==inviteAccessToken)
    throw Error("Invitation session does not match the email token");
   const {data:identity,error:identityError}=await db.auth.getUser();
   if(identityError||!identity?.user||identity.user.id!==sessionData.session.user?.id)
    throw Error("Unverified invited account");
   inviteVerified=true;
   return {state:"ready"};
  }catch{
   return {state:"invalid",message:"This invitation could not be verified. Request a fresh invitation."};
  }
 }
 async function cancelInvitation(){
  if(!inviteAttempted)return true;
  inviteVerified=false;
  const db=await connect();
  const {error}=await db.auth.signOut({scope:"local"});
  if(error)throw Error("Could not close the invitation session. Retry before signing in.");
  user=null;account=null;status="signed_out";lastError="";
  clearRecoveryUrl();
  return true;
 }
 async function completeInvitation(password){
  if(!inviteAttempted||!inviteVerified)throw Error("Open and verify an invitation email link first.");
  if(typeof password!=="string"||password.length<6||password.length>128)
   throw Error("Use a password between 6 and 128 characters.");
  const db=await connect();
  const {data:identity,error:identityError}=await db.auth.getUser();
  if(identityError||!identity?.user)throw Error("Invitation session expired. Ask for a new link.");
  const {error}=await db.auth.updateUser({password});
  if(error)throw Error("Could not set the account password. Please retry or request a new invitation.");
  inviteVerified=false;
  const {error:signOutError}=await db.auth.signOut({scope:"global"});
  clearRecoveryUrl();
  user=null;account=null;status="signed_out";lastError="";
  if(signOutError)throw Error("Password saved, but sign-out failed. Close HeliLog and sign in with your new password.");
  return true;
 }
 async function signOut(){
  const db=await connect();
  const {error}=await db.auth.signOut();
  if(error)throw Error(error.message||"Sign out failed.");
  status="signed_out";lastError="";user=null;account=null;return snapshot();
 }
 // Only return the browser SDK to an account whose identity has just been
 // verified by Supabase. Row Level Security remains the real data boundary.
 async function verifiedClient(){
  const result=await refresh();
  if(result.status!=="signed_in"||!result.userId||!result.hasProfile)
   throw Error("Sign in and complete your private profile before accessing cloud records.");
  return connect();
 }
 return Object.freeze({snapshot,refresh,signIn,googleEnabled,signInWithGoogle,finishGoogleRedirect,
  initializeProfile,signOut,sendPasswordReset,
  beginPasswordRecovery,completePasswordRecovery,cancelPasswordRecovery,
  beginInvitation,cancelInvitation,completeInvitation,validConfig,client:verifiedClient,
  libraryUrl:sdkUrl});
});
