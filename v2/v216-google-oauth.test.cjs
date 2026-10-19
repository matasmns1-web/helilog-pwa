/* HeliLog V2.16 Google OAuth sign-in regression tests.
 * Synthetic tokens and users only; never exchanges Google secrets or calls Google.
 */
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const cloud=fs.readFileSync(path.join(__dirname,"cloud-foundation.js"),"utf8");
const gate=fs.readFileSync(path.join(__dirname,"auth-gate.js"),"utf8");
function fixture({query="",fragment="",token="",sessionUser="pilot-a",verifiedUser="pilot-a",oauthError=null,configGoogle=true}={}){
 const calls=[],state={token,sessionUser,verifiedUser};
 const loc=new URL("https://helilog-v2-test.onrender.com/"+query+fragment);
 const auth={
  signInWithOAuth:async input=>{calls.push({type:"oauth",input});return {data:{url:"https://accounts.google.com/"},error:oauthError};},
  getSession:async()=>{calls.push("getSession");return {data:{session:state.token?{access_token:state.token,user:{id:state.sessionUser}}:null},error:null};},
  getUser:async()=>{calls.push("getUser");return {data:{user:state.verifiedUser?{id:state.verifiedUser,email:"pilot@example.test"}:null},error:null};}
 };
 const appConfig={authEnabled:true,environment:"test",inviteOnly:true,googleEnabled:configGoogle,
  supabaseUrl:"https://sample.supabase.co",publishableKey:"sb_publishable_public_test_0123456789"};
 const root={URL,URLSearchParams,Promise,console,
  location:{origin:loc.origin,protocol:loc.protocol,pathname:loc.pathname,search:loc.search,hash:loc.hash},
  history:{replaceState(_state,_title,url){calls.push({type:"clearUrl",url});}},
  HeliLogCloudConfig:appConfig,
  supabase:{createClient(_url,_key,options){
   calls.push({type:"client",options});
   return {auth,from(){throw Error("OAuth must not query logbook records before verified sign-in.");}};
  }}};
 root.window=root;
 const api=new Function("window","module",cloud+";return window.HeliLogCloud;")(root,undefined);
 return {api,calls,root};
}
test("Google login starts an implicit Supabase OAuth flow on the current HTTPS origin",async()=>{
 const f=fixture();
 const x=await f.api.signInWithGoogle();
 assert.equal(x.url,"https://accounts.google.com/");
 const request=f.calls.find(x=>x.type==="oauth").input;
 assert.equal(request.provider,"google");
 assert.deepEqual(request.options,{redirectTo:"https://helilog-v2-test.onrender.com/?helilog_oauth=google"});
 assert.equal(f.calls.find(x=>x.type==="client").options.auth.flowType,"implicit");
 assert.equal(f.calls.find(x=>x.type==="client").options.auth.detectSessionInUrl,false);
 assert.ok(!f.calls.includes("getUser"));
});
test("Google login is disabled when environment flag is not configured",async()=>{
 const f=fixture({configGoogle:false});
 assert.equal(f.api.googleEnabled(),false);
 await assert.rejects(f.api.signInWithGoogle(),/not enabled/);
 assert.equal(f.calls.length,0);
});
test("valid OAuth return requires matching session access token and verified owner",async()=>{
 const f=fixture({query:"?helilog_oauth=google",fragment:"#access_token=token&refresh_token=refresh&type=bearer",token:"token"});
 assert.equal((await f.api.finishGoogleRedirect()).state,"ready");
 assert.equal(f.calls.find(x=>x.type==="client").options.auth.detectSessionInUrl,true);
 assert.equal(f.calls.find(x=>x.type==="clearUrl").url,"/");
 const a=fixture({query:"?helilog_oauth=google",fragment:"#access_token=stolen&refresh_token=refresh",token:"old-session"});
 assert.equal((await a.api.finishGoogleRedirect()).state,"invalid");
 const b=fixture({query:"?helilog_oauth=google",fragment:"#access_token=token&refresh_token=refresh",token:"token",sessionUser:"other"});
 assert.equal((await b.api.finishGoogleRedirect()).state,"invalid");
 assert.equal(b.calls.find(x=>x.type==="clearUrl").url,"/");
});
test("cancelled Google sign-in and URL marker without token stay locked",async()=>{
 const f=fixture({query:"?helilog_oauth=google",fragment:"#error=access_denied&error_description=user%20cancelled"});
 assert.equal((await f.api.finishGoogleRedirect()).state,"invalid");
 const empty=fixture({query:"?helilog_oauth=google",token:"stale-session"});
 assert.equal((await empty.api.finishGoogleRedirect()).state,"invalid");
 assert.ok(!empty.calls.includes("getUser"));
 assert.equal((await fixture().api.finishGoogleRedirect()).state,"none");
});
test("Google callback does not intercept password recovery or invite callbacks",async()=>{
 const a=fixture({query:"?helilog_oauth=google&helilog_recovery=1",fragment:"#access_token=token&refresh_token=refresh&type=recovery",token:"token"});
 assert.equal((await a.api.finishGoogleRedirect()).state,"none");
 const b=fixture({query:"?helilog_oauth=google",fragment:"#access_token=token&refresh_token=refresh&type=invite",token:"token"});
 assert.equal((await b.api.finishGoogleRedirect()).state,"none");
 assert.equal((await b.api.beginInvitation()).state,"ready");
});
test("login presents Google only when enabled, preserves email/password, and handles callback first",()=>{
 const beginning=gate.indexOf("function v23LoginView(){"),end=gate.indexOf("async function v23Boot(){");
 assert.ok(beginning>=0&&end>beginning);
 const app={innerHTML:""},document={documentElement:{classList:{add(){}}}};
 function html(enabled){
  const window={HeliLogCloud:{snapshot:()=>({status:"signed_out",error:""})},
    HeliLogCloudConfig:{googleEnabled:enabled}};
  const render=new Function("window","document","app","TEST_MODE","v23AuthMessage","v23Escape","HELILOG_TEST_VERSION","v23Unlocked",
    gate.slice(beginning,end)+";return v23LoginView;");
  render(window,document,app,false,"",x=>String(x),"V2.16",false)();
  return app.innerHTML;
 }
 const on=html(true),off=html(false);
 assert.match(on,/Continue with Google/);
 assert.match(on,/v23GoogleSignIn/);
 assert.match(on,/id="v23Email" type="email"/);
 assert.match(on,/id="v23Password" type="password"/);
 assert.match(off,/Registration is invitation-only/);
 assert.doesNotMatch(off,/Continue with Google/);
 assert.match(gate,/const google=await window\.HeliLogCloud\.finishGoogleRedirect\(\)/);
 assert.match(gate,/if\(google.state==="invalid"\)[\s\S]*?v23LoginView\(\);\s*return;/);
});
