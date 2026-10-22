/* V2.19 — safe private-beta production packaging and origin/auth gates. */
"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const script=path.join(__dirname,"build-helilog-production.cjs");
const source=fs.readFileSync(path.join(root,"v2/cloud-foundation.js"),"utf8");
const liveSite="https://helilog-pwa.onrender.com";
const fakeProject="https://zzzzzzzzzzzzzzzzzzzz.supabase.co";
const fakeKey="sb_publishable_PRODUCTION_FAKE_1234567890_abcdef";
function candidate(vars={},options={}){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"helilog-prod-ci-"));
 const output=path.join(tmp,"helilog-prod-build");
 const env={...process.env,HELILOG_RELEASE_GATE:"prepare-only",
  HELILOG_PROD_ORIGIN:liveSite,HELILOG_PROD_SUPABASE_URL:fakeProject,
  HELILOG_PROD_SUPABASE_PUBLISHABLE_KEY:fakeKey,
  HELILOG_OUTPUT_DIR:output,...vars};
 const run=spawnSync(process.execPath,[script],{env,encoding:"utf8"});
 if(options.cleanup!==false)fs.rmSync(tmp,{recursive:true,force:true});
 return {run,output,tmp};
}
function configRoot(config,origin){
 const root={location:{origin,search:"",hash:""},HeliLogCloudConfig:config};
 root.window=root;
 return new Function("window","module",source+";return window.HeliLogCloud;")(root,undefined);
}
test("a release candidate cannot be built without explicit manual release gate",()=>{
 const result=candidate({HELILOG_RELEASE_GATE:""});
 assert.notEqual(result.run.status,0);
 assert.match(result.run.stderr,/Production candidate blocked/);
});
test("the staging database and test website cannot be promoted accidentally",()=>{
 const a=candidate({HELILOG_PROD_SUPABASE_URL:"https://cabfifnsxpaalgsyicbo.supabase.co"});
 assert.notEqual(a.run.status,0);
 assert.match(a.run.stderr,/dedicated non-test/);
 const b=candidate({HELILOG_PROD_ORIGIN:"https://helilog-v2-test.onrender.com"});
 assert.notEqual(b.run.status,0);
 assert.match(b.run.stderr,/test\/staging/);
});
test("secret/service-role credentials and unsafe output directories are rejected",()=>{
 const s=candidate({HELILOG_PROD_SUPABASE_PUBLISHABLE_KEY:"sb_secret_should_never_be_public"});
 assert.notEqual(s.run.status,0);
 assert.match(s.run.stderr,/publishable key/);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"helilog-unsafe-check-"));
 const bad=candidate({HELILOG_OUTPUT_DIR:tmp});
 assert.notEqual(bad.run.status,0);
 assert.match(bad.run.stderr,/build output must be named/);
 fs.rmSync(tmp,{recursive:true,force:true});
});
test("candidate packages all required relative PWA assets with separate backend",()=>{
 const built=candidate({}, {cleanup:false});
 try{
  assert.equal(built.run.status,0,built.run.stderr);
  const names=fs.readdirSync(built.output);
  assert.ok(names.length>=22);
  assert.ok(names.includes('aerodrome-lookup.js'));
  assert.ok(names.includes('night-calculation.js'));
  assert.ok(!names.some(x=>x.endsWith(".cjs")||x.endsWith(".md")||x==="alpha.html"));
  const cfg=fs.readFileSync(path.join(built.output,"cloud-config.js"),"utf8");
  assert.match(cfg,/"environment"\s*:\s*"production"/);
  assert.match(cfg,/sb_publishable_PRODUCTION_FAKE/);
  assert.doesNotMatch(cfg,/cabfifnsxpaalgsyicbo/);
  assert.match(cfg,/helilog-pwa\.onrender\.com/);
  const html=fs.readFileSync(path.join(built.output,"index.html"),"utf8");
  assert.match(html,/V2\.32\.1 · PRIVATE BETA/);
  assert.match(html,/Private Beta Candidate/);
  const manifest=JSON.parse(fs.readFileSync(path.join(built.output,"manifest.webmanifest"),"utf8"));
  assert.match(manifest.description,/not independently certified/);
  assert.equal(manifest.start_url,"./index.html");
  assert.equal(manifest.scope,"./");
  const worker=fs.readFileSync(path.join(built.output,"service-worker.js"),"utf8");
  assert.match(worker,/helilog-v2-32-1-production-candidate-1/);
  assert.ok(names.includes('dark-cockpit.css'));
  assert.ok(names.includes('guide.css'));
  assert.ok(fs.existsSync(path.join(root,"index.html")),"the existing V1 root is untouched");
 }finally{fs.rmSync(built.tmp,{recursive:true,force:true});}
});
test("production auth requires its exact origin and distinct project",()=>{
 const c={supabaseUrl:fakeProject,publishableKey:fakeKey,authEnabled:true,
  environment:"production",inviteOnly:true,productionOrigin:liveSite};
 assert.equal(configRoot(c,liveSite).validConfig(c),true);
 assert.throws(()=>configRoot(c,"https://evil.example").validConfig(c),/Production cloud connection blocked/);
 const testDb={...c,supabaseUrl:"https://cabfifnsxpaalgsyicbo.supabase.co"};
 assert.throws(()=>configRoot(testDb,liveSite).validConfig(testDb),/Production cloud connection blocked/);
 const staging={...c,productionOrigin:"https://helilog-v2-test.onrender.com"};
 assert.throws(()=>configRoot(staging,staging.productionOrigin).validConfig(staging),/Production cloud connection blocked/);
 const ordinaryTest={...c,environment:"test"};
 assert.equal(configRoot(ordinaryTest,"https://helilog-v2-test.onrender.com").validConfig(ordinaryTest),true);
});
