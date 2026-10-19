#!/usr/bin/env node
/* HeliLog private-beta candidate packager. NEVER an automatic deploy.
 * Only Supabase publishable keys may appear in static browser JS.
 */
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {URL}=require("node:url");
const root=path.resolve(__dirname,"..");
const source=path.join(root,"v2");
const target=path.resolve(process.env.HELILOG_OUTPUT_DIR||path.join(root,"dist-prod"));
const testRef="cabfifnsxpaalgsyicbo";
function must(condition,message){if(!condition)throw Error("Production candidate blocked: "+message);}
function origin(raw,label){
 let url;
 try{url=new URL(raw)}catch{throw Error("Invalid "+label+" URL")}
 must(url.protocol==="https:","HTTPS required for "+label);
 must(!url.username&&!url.password&&!url.search&&!url.hash
  &&(url.pathname==="/"||url.pathname===""),"clean "+label+" origin required");
 return url.origin;
}
function prepare(){
 must(process.env.HELILOG_RELEASE_GATE==="prepare-only",
  "set HELILOG_RELEASE_GATE=prepare-only only after reviewing the release checklist");
 const webOrigin=origin(process.env.HELILOG_PROD_ORIGIN||"","website");
 const apiOrigin=origin(process.env.HELILOG_PROD_SUPABASE_URL||"","Supabase");
 const project=new URL(apiOrigin).hostname.match(/^([a-z0-9]{16,})\.supabase\.co$/);
 must(project&&project[1]!==testRef,"a dedicated non-test Supabase project is required");
 must(!/(?:^|[.-])(test|staging|preview|dev)(?:[.-]|$)/i.test(new URL(webOrigin).hostname),
  "website hostname must not be a test/staging host");
 must(webOrigin!==apiOrigin,"website and Supabase origins must differ");
 const key=process.env.HELILOG_PROD_SUPABASE_PUBLISHABLE_KEY||"";
 must(/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(key),
  "only a publishable key is permitted, never a secret or service_role key");
 must(!target.startsWith(source+path.sep)&&target!==source,
  "candidate output cannot overwrite V2 source");
 must(["dist-prod"].includes(path.basename(target))||
      path.basename(target).startsWith("helilog-prod-"),
  "build output must be named dist-prod or helilog-prod-* to prevent unsafe cleanup");
 must(target!==root&&target!==path.parse(target).root,
  "build output cannot be the repository root or filesystem root");
 const files=[
  "index.html","manifest.webmanifest","service-worker.js",
  "apple-touch-icon.png","icon-192.png","icon-512.png",
  "domain.js","night-calculation.js","print.js","endorsement-bridge.js","endorsement-ui.js",
  "cloud-config.js","cloud-foundation.js","cloud-view.js","cloud-sync.js",
  "auth-gate.js","cloud-archives.js","archive-integrity.js",
  "recovery.js","cloud-backups.js","disaster-recovery.js"
 ];
 for(const file of files)must(fs.statSync(path.join(source,file)).isFile(),"missing asset "+file);
 let index=fs.readFileSync(path.join(source,"index.html"),"utf8");
 let gate=fs.readFileSync(path.join(source,"auth-gate.js"),"utf8");
 let manifest=JSON.parse(fs.readFileSync(path.join(source,"manifest.webmanifest"),"utf8"));
 let worker=fs.readFileSync(path.join(source,"service-worker.js"),"utf8");
 must(index.includes("HeliLog V2.18"),"HTML must be V2.18");
 must(manifest.name.includes("V2.18"),"manifest release version mismatch");
 must(worker.includes("helilog-v2-17"),"offline cache release version mismatch");
 const cfg="/* Generated production candidate public configuration; no secret keys. */\n"+
 "window.HeliLogCloudConfig = Object.freeze("+JSON.stringify({
  supabaseUrl:apiOrigin,publishableKey:key,authEnabled:true,environment:"production",
  inviteOnly:true,productionOrigin:webOrigin
 },null,2)+");\n";
 // The genuine local Test Mode warning remains untouched; this is not regulatory approval.
 index=index.replace("HeliLog V2.18 — Automatic Night Time","HeliLog V2.18 — Private Beta Candidate")
   .replace("V2.18 · TEST","V2.18 · PRIVATE BETA");
 gate=gate.replaceAll(" · Private pilot logbook test"," · Private beta logbook")
  .replaceAll("TEST Supabase database","private Supabase database")
  .replaceAll("TEST snapshot","private snapshot");
 manifest.name="HeliLog V2.18 — Private Beta";
 manifest.short_name="HeliLog";
 manifest.description="Private beta helicopter pilot logbook; not independently certified for regulatory recordkeeping.";
 worker=worker.replace("const CACHE='helilog-v2-18-night-1';",
                        "const CACHE='helilog-v2-18-production-candidate-1';");
 must(worker.includes("helilog-v2-18-production-candidate-1"),"distinct production PWA cache missing");
 // Clean fixed build directory. Never overwrite the V2 source or V1 root.
 if(fs.existsSync(target))fs.rmSync(target,{recursive:true,force:true});
 fs.mkdirSync(target,{recursive:true});
 for(const file of files){
  const destination=path.join(target,file);
  if(file==="cloud-config.js")fs.writeFileSync(destination,cfg);
  else if(file==="index.html")fs.writeFileSync(destination,index);
  else if(file==="auth-gate.js")fs.writeFileSync(destination,gate);
  else if(file==="service-worker.js")fs.writeFileSync(destination,worker);
  else if(file==="manifest.webmanifest")fs.writeFileSync(destination,JSON.stringify(manifest,null,2)+"\n");
  else fs.copyFileSync(path.join(source,file),destination);
 }
 const links=[...index.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^"]*)?"/g)].map(x=>x[1]);
 for(const f of links)must(fs.existsSync(path.join(target,f)),"missing linked script "+f);
 for(const f of ["index.html","manifest.webmanifest","service-worker.js","cloud-foundation.js"])
  must(fs.statSync(path.join(target,f)).size>50,"empty release asset "+f);
 console.log("HeliLog V2.18 release candidate verified: "+files.length+" static assets");
 console.log("Production origin: "+webOrigin+" | distinct Supabase project: "+project[1]);
 console.log("Build output: "+target+" (NOT DEPLOYED)");
}
try{prepare()}catch(e){console.error(e.message);process.exitCode=1}
