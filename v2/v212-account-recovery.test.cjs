/* V2.19 security + password recovery: no emails are sent in these tests. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const cloud=fs.readFileSync(path.join(__dirname,"cloud-foundation.js"),"utf8");
const gate=fs.readFileSync(path.join(__dirname,"auth-gate.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const sql=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","20261019090000_v212_trigger_execution_hardening.sql"),"utf8");
const base=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","20261014000000_helilog_v22_foundation.sql"),"utf8");
function fixture({callback="",sessionToken="",identity="pilot1",sessionUser="pilot1",updateError=null,requestError=null}={}){
 const calls=[],state={sessionToken,identity,sessionUser};
 const auth={
  getSession:async()=>{calls.push("session");return {data:{session:state.sessionToken?{access_token:state.sessionToken,user:{id:state.sessionUser}}:null},error:null};},
  getUser:async()=>{calls.push("user");return {data:{user:state.identity?{id:state.identity}:null},error:null};},
  resetPasswordForEmail:async(email,options)=>{calls.push({type:"request",email,options});return {error:requestError};},
  updateUser:async(params)=>{calls.push({type:"update",params});return {error:updateError};},
  signOut:async(options)=>{calls.push({type:"signout",options});state.sessionToken="";return {error:null};}
 };
 const db={auth,from(){throw Error("Recovery must never read or write pilot tables.")}};
 const loc=new URL("https://helilog-v2-test.onrender.com/"+callback);
 const root={URL,URLSearchParams,Promise,console,
  location:{href:loc.href,origin:loc.origin,protocol:loc.protocol,pathname:loc.pathname,search:loc.search,hash:loc.hash},
  history:{replaceState(_state,_title,url){calls.push({type:"replaceUrl",url})}},
  supabase:{createClient(_url,_key,config){calls.push({type:"client",config});return db}},
  HeliLogCloudConfig:{authEnabled:true,environment:"test",inviteOnly:true,
   supabaseUrl:"https://test-project.supabase.co",publishableKey:"sb_publishable_0123456789abcdefghijkl"}
 };
 root.window=root;
 const api=new Function("window","module",cloud+";return window.HeliLogCloud;")(root,undefined);
 return {api,calls,state,root};
}
test("forgot-password email has a fixed same-origin reset destination and generic result",async()=>{
 const f=fixture();
 assert.equal((await f.api.beginPasswordRecovery()).state,"none");
 await f.api.sendPasswordReset("pilot@example.test");
 const call=f.calls.find(x=>x.type==="request");
 assert.equal(call.email,"pilot@example.test");
 assert.equal(call.options.redirectTo,"https://helilog-v2-test.onrender.com/?helilog_recovery=1");
 assert.equal(f.calls.find(x=>x.type==="client").config.auth.detectSessionInUrl,false);
 assert.ok(!f.calls.some(x=>x.type==="update"));
});
test("a fabricated recovery marker alone cannot authorize a password change",async()=>{
 const f=fixture({callback:"?helilog_recovery=1"});
 assert.equal((await f.api.beginPasswordRecovery()).state,"invalid");
 await assert.rejects(f.api.completePasswordRecovery("a sufficiently long password"),/valid recovery email link/);
 assert.ok(!f.calls.some(x=>x.type==="update"));
});
test("recovery tokens must match the Supabase session AND a verified user",async()=>{
 const f=fixture({callback:"?helilog_recovery=1#access_token=stolen&refresh_token=refresh&type=recovery",sessionToken:"current"});
 assert.equal((await f.api.beginPasswordRecovery()).state,"invalid");
 assert.equal(f.calls.find(x=>x.type==="client").config.auth.detectSessionInUrl,true);
 await assert.rejects(f.api.completePasswordRecovery("a sufficiently long password"));
 const g=fixture({callback:"?helilog_recovery=1#access_token=link&refresh_token=r&type=recovery",sessionToken:"link",identity:"first",sessionUser:"second"});
 assert.equal((await g.api.beginPasswordRecovery()).state,"invalid");
 assert.ok(!g.calls.some(x=>x.type==="update"));
});
test("expired recovery callbacks remain locked and never open the logbook",async()=>{
 const f=fixture({callback:"?helilog_recovery=1#error=access_denied&error_description=OTP%20expired",sessionToken:"older"});
 assert.equal((await f.api.beginPasswordRecovery()).state,"invalid");
 assert.ok(!f.calls.some(x=>x.type==="update"));
 assert.match(gate,/if\(recovery.state!=="none"\)/);
 assert.match(gate,/v23RecoveryView\(\);\s*return;/);
 assert.match(gate,/document.documentElement.classList.add\("helilog-locked"\)/);
});
test("a verified reset updates ONLY the credential, revokes sessions and clears the URL",async()=>{
 const f=fixture({callback:"?helilog_recovery=1#access_token=link&refresh_token=refresh&type=recovery",sessionToken:"link"});
 assert.equal((await f.api.beginPasswordRecovery()).state,"ready");
 await assert.rejects(f.api.completePasswordRecovery("abcde"),/6 and 128/);
 await assert.rejects(f.api.completePasswordRecovery("x".repeat(129)),/6 and 128/);
 assert.equal(await f.api.completePasswordRecovery("abcdef"),true);
 assert.equal(f.calls.filter(x=>x.type==="update").length,1);
 assert.equal(f.calls.find(x=>x.type==="signout").options.scope,"global");
 assert.equal(f.calls.find(x=>x.type==="replaceUrl").url,"/");
 await assert.rejects(f.api.completePasswordRecovery("twelve letters + something"),/valid recovery email link/);
});
test("canceling a recovery link signs out its temporary session before returning to login",async()=>{
 const f=fixture({callback:"?helilog_recovery=1#access_token=link&refresh_token=r&type=recovery",sessionToken:"link"});
 assert.equal((await f.api.beginPasswordRecovery()).state,"ready");
 assert.equal(await f.api.cancelPasswordRecovery(),true);
 assert.equal(f.calls.find(x=>x.type==="signout").options.scope,"local");
 assert.equal(f.calls.find(x=>x.type==="replaceUrl").url,"/");
 await assert.rejects(f.api.completePasswordRecovery("a sufficient password"),/valid recovery email link/);
 assert.ok(!f.calls.some(x=>x.type==="update"));
 assert.match(gate,/await window\.HeliLogCloud\.cancelPasswordRecovery\(\)/);
});
test("an unsuccessful password update does not announce success or sign out",async()=>{
 const f=fixture({callback:"?helilog_recovery=1#access_token=link&refresh_token=r&type=recovery",
  sessionToken:"link",updateError:{message:"bad password"}});
 assert.equal((await f.api.beginPasswordRecovery()).state,"ready");
 await assert.rejects(f.api.completePasswordRecovery("twelve letters + something"),/could not be updated/);
 assert.ok(!f.calls.some(x=>x.type==="signout"));
});
test("sign in provides an accessible recovery request and matching-password form",()=>{
 assert.match(gate,/Forgot password\?/);
 assert.match(gate,/v23ShowPasswordHelp/);
 assert.match(gate,/v23RequestPasswordReset/);
 assert.match(gate,/v23SaveRecoveredPassword/);
 assert.match(gate,/id="v23NewPassword" type="password" minlength="6"/);
 assert.match(gate,/id="v23ConfirmPassword" type="password" minlength="6"/);
 assert.match(gate,/if\(password!==confirmation\|\|password.length<6/);
 assert.match(html,/HeliLog V2\.19/);
 assert.match(cloud,/password\.length<6\|\|password\.length>128/);
 assert.match(gate,/Use at least 6 characters/);
});
test("six account tables use owner RLS and trigger-only SECURITY DEFINER grants are restricted",()=>{
 for(const name of ["helilog_accounts","helilog_records","helilog_print_archives","helilog_archive_entries","helilog_archive_addenda"])
  assert.ok(base.includes("alter table public."+name+" enable row level security;"),name);
 assert.match(base,/auth\.uid\(\)/);
 assert.match(sql,/revoke execute on function public\.helilog_validate_correction_proposal\(\)\s+from public, anon, authenticated;/i);
 assert.match(sql,/revoke execute on function public\.helilog_retire_confirmed_correction\(\)\s+from public, anon, authenticated;/i);
 assert.doesNotMatch(sql,/drop\s+table|truncate|delete\s+from/i);
});
