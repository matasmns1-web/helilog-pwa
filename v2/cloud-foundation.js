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
 function validConfig(c=config()){
  if(c.authEnabled!==true || !c.supabaseUrl || !c.publishableKey)return false;
  if(c.environment!=="test"||c.inviteOnly!==true)throw Error("Only invite-only TEST cloud projects are accepted in V2.2.");
  let url;
  try{url=new URL(c.supabaseUrl);}catch{throw Error("Cloud project URL is invalid.");}
  if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"&&url.pathname!==""||url.search||url.hash)throw Error("Use a secure Supabase project base URL.");
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
    auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false},
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
 return Object.freeze({snapshot,refresh,signIn,initializeProfile,signOut,validConfig,client:verifiedClient,
  libraryUrl:sdkUrl});
});
