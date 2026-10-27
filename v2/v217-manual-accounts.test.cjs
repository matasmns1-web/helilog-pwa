/* V2.19 — friends-only manual account beta, no Google OAuth. */
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const dir=__dirname;
const cloud=fs.readFileSync(path.join(dir,"cloud-foundation.js"),"utf8");
const gate=fs.readFileSync(path.join(dir,"auth-gate.js"),"utf8");
const cfg=fs.readFileSync(path.join(dir,"cloud-config.js"),"utf8");
const page=fs.readFileSync(path.join(dir,"index.html"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest.webmanifest"),"utf8"));
const worker=fs.readFileSync(path.join(dir,"service-worker.js"),"utf8");
const production=fs.readFileSync(path.join(dir,"..","scripts","build-helilog-production.cjs"),"utf8");
test("Google OAuth routes, initiation, and callback are not shipped",()=>{
 for(const [name,source] of [["cloud",cloud],["login",gate],["config",cfg],["production",production]]){
  assert.doesNotMatch(source,/googleEnabled|finishGoogleRedirect|signInWithGoogle|googleRequested|v23GoogleSignIn/i,name);
 }
 assert.doesNotMatch(page,/Continue with Google|helilog_oauth=google/);
});
test("manual accounts retain password login, invitation and recovery",()=>{
 for(const word of ["signIn(email,password)","initializeProfile(displayName)","sendPasswordReset(email)",
   "beginInvitation()","completeInvitation(password)","beginPasswordRecovery()","completePasswordRecovery(password)"]){
   assert.ok(cloud.includes(word),"Missing manual Auth flow "+word);
 }
 assert.match(gate,/v23SignIn\(event\)/);
 assert.match(gate,/Registration is invitation-only/);
 assert.match(gate,/v23ShowPasswordHelp\(\)/);
 assert.doesNotMatch(gate,/>Create account<\/button>/);
 assert.match(gate,/Switch account/);
});
test("staging stays connected only to existing test backend and private login",()=>{
 assert.match(cfg,/cabfifnsxpaalgsyicbo\.supabase\.co/);
 assert.match(cfg,/environment:\s*"test"/);
 assert.match(cfg,/inviteOnly:\s*true/);
 assert.doesNotMatch(cfg,/xvmzvoldlajvnfxonrvn/);
 assert.match(cloud,/owner|auth\.uid|verifiedClient/i);
});
test("version and offline PWA references are coherent",()=>{
 assert.match(page,/<title>HeliLog V2\.39\.1 — Cloud Sync Recovery · Test<\/title>/);
 assert.equal(manifest.name,"HeliLog V2.39.1 — Operator Recency Cloud Sync Test");
 assert.match(worker,/helilog-v2-39-1-operator-cloud-1/);
 assert.match(gate,/HELILOG_TEST_VERSION='V2\.39\.1'/);
 for(const asset of ["cloud-config","cloud-foundation","auth-gate","cloud-view","cloud-sync","recovery"]){
   const ref=asset+".js?v="+(['cloud-sync','auth-gate'].includes(asset)?'2.39.1-operator-sync-1':'2.19-locations-1');
   assert.ok(page.includes(ref),"HTML missing "+ref);
   assert.ok(worker.includes(ref),"service worker missing "+ref);
 }
 assert.match(production,/productionCache='helilog-'/);
 assert.doesNotMatch(production,/helilog-v2-(15|16)-production-candidate/);
});
