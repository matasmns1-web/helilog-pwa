/* V2.15 — safe invitation-first account creation, no emails or real users. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const cloud=fs.readFileSync(path.join(__dirname,"cloud-foundation.js"),"utf8");
const gate=fs.readFileSync(path.join(__dirname,"auth-gate.js"),"utf8");
function fixture({fragment="",token="",identity="pilot1",sessionIdentity="pilot1",failUpdate=false,failSignOut=false}={}){
 const calls=[],state={token,identity,sessionIdentity};
 const auth={
  getSession:async()=>{calls.push("getSession");return {data:{session:state.token?{access_token:state.token,user:{id:state.sessionIdentity}}:null},error:null};},
  getUser:async()=>{calls.push("getUser");return {data:{user:state.identity?{id:state.identity}:null},error:null};},
  updateUser:async(params)=>{calls.push({type:"update",params});return {error:failUpdate?{message:"Update denied"}:null};},
  signOut:async(options)=>{calls.push({type:"signout",options});if(!failSignOut)state.token="";return {error:failSignOut?{message:"Sign out denied"}:null};}
 };
 const config={authEnabled:true,environment:"test",inviteOnly:true,
  supabaseUrl:"https://sample.supabase.co",publishableKey:"sb_publishable_public_test_0123456789"};
 const root={URL,URLSearchParams,Promise,console,
  location:{origin:"https://helilog-v2-test.onrender.com",protocol:"https:",pathname:"/",search:"",hash:fragment},
  history:{replaceState(_state,_title,url){calls.push({type:"clearUrl",url})}},
  HeliLogCloudConfig:config,
  supabase:{createClient(_u,_k,options){
   calls.push({type:"createClient",options});
   return {auth,from(){throw Error("Invitation flow must not access logbook data.")}};
  }}};
 root.window=root;
 const api=new Function("window","module",cloud+";return window.HeliLogCloud;")(root,undefined);
 return {api,calls,state,root};
}
test("ordinary login does not process invitation tokens or invoke link callbacks",async()=>{
 const a=fixture({fragment:"#profile"});
 assert.equal((await a.api.beginInvitation()).state,"none");
 await assert.rejects(a.api.completeInvitation("123456"),/valid|verify/i);
 assert.equal(a.calls.length,0);
});
test("a dashboard invitation requires both tokens and verified Supabase identity",async()=>{
 const a=fixture({fragment:"#access_token=token&refresh_token=refresh&type=invite",token:"token"});
 assert.equal((await a.api.beginInvitation()).state,"ready");
 assert.equal(a.calls.find(x=>x.type==="createClient").options.auth.detectSessionInUrl,true);
 const invalid=fixture({fragment:"#access_token=stolen&refresh_token=refresh&type=invite",token:"other"});
 assert.equal((await invalid.api.beginInvitation()).state,"invalid");
 await assert.rejects(invalid.api.completeInvitation("123456"),/verify/);
 const mismatch=fixture({fragment:"#access_token=token&refresh_token=refresh&type=invite",token:"token",sessionIdentity:"other"});
 assert.equal((await mismatch.api.beginInvitation()).state,"invalid");
 assert.ok(!mismatch.calls.some(x=>x.type==="update"));
});
test("expired and malformed invitation links fail closed",async()=>{
 const expired=fixture({fragment:"#error=access_denied&error_description=OTP%20expired"});
 assert.equal((await expired.api.beginInvitation()).state,"invalid");
 const incomplete=fixture({fragment:"#access_token=token&type=invite",token:"token"});
 assert.equal((await incomplete.api.beginInvitation()).state,"invalid");
 assert.ok(!incomplete.calls.some(x=>x.type==="update"));
 assert.match(gate,/if\(invitation.state!=="none"\)/);
 assert.match(gate,/v23InvitationView\(\);\s*return;/);
 assert.match(gate,/document.documentElement.classList.add\("helilog-locked"\)/);
});
test("invited user sets password and must sign in again; no records touched",async()=>{
 const a=fixture({fragment:"#access_token=token&refresh_token=refresh&type=invite",token:"token"});
 assert.equal((await a.api.beginInvitation()).state,"ready");
 await assert.rejects(a.api.completeInvitation("12345"),/between 6 and 128/);
 await assert.rejects(a.api.completeInvitation("x".repeat(129)),/between 6 and 128/);
 assert.equal(await a.api.completeInvitation("abcdef"),true);
 assert.equal(a.calls.filter(x=>x.type==="update").length,1);
 assert.equal(a.calls.find(x=>x.type==="update").params.password,"abcdef");
 assert.equal(a.calls.find(x=>x.type==="signout").options.scope,"global");
 assert.equal(a.calls.find(x=>x.type==="clearUrl").url,"/");
 await assert.rejects(a.api.completeInvitation("abcdef"),/verify/);
});
test("cancelling invitation explicitly closes temporary session and removes tokens",async()=>{
 const a=fixture({fragment:"#access_token=token&refresh_token=refresh&type=invite",token:"token"});
 assert.equal((await a.api.beginInvitation()).state,"ready");
 assert.equal(await a.api.cancelInvitation(),true);
 assert.equal(a.calls.find(x=>x.type==="signout").options.scope,"local");
 assert.equal(a.calls.find(x=>x.type==="clearUrl").url,"/");
 await assert.rejects(a.api.completeInvitation("abcdef"),/verify/);
 assert.match(gate,/await window\.HeliLogCloud\.cancelInvitation\(\)/);
});
test("unsuccessful password update does not claim invitation was accepted",async()=>{
 const a=fixture({fragment:"#access_token=token&refresh_token=refresh&type=invite",token:"token",failUpdate:true});
 assert.equal((await a.api.beginInvitation()).state,"ready");
 await assert.rejects(a.api.completeInvitation("abcdef"),/Could not set/);
 assert.ok(!a.calls.some(x=>x.type==="signout"));
});
test("the new invitation screen remains locked and checks both password entries",()=>{
 assert.match(gate,/function v23InvitationView\(/);
 assert.match(gate,/v23CompleteInvitation\(event\)/);
 assert.match(gate,/v23CancelInvitation\(\)/);
 assert.match(gate,/id="v23InvitePassword" type="password" minlength="6"/);
 assert.match(gate,/id="v23InvitePasswordConfirm" type="password" minlength="6"/);
 assert.match(gate,/password!==confirmPassword\|\|password.length<6/);
 assert.match(gate,/Sign in to finish your pilot profile/);
});
