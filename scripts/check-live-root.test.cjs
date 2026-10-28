/* Production cutover gate for root-served HeliLog V2.
 * No external access, user credentials or database writes.
 */
"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("root runs V2.42 private beta, not the V1 landing page",()=>{
 const index=read("index.html");
 assert.match(index,/<title>HeliLog V2\.42 — Private Beta Candidate<\/title>/);
 assert.match(index,/V2\.42 · PRIVATE BETA/);
 assert.match(index,/dark-cockpit\.css\?v=2\.20-cockpit-3/);
 assert.match(index,/guide\.css\?v=2\.29/);
 assert.match(index,/Help &amp; Guide/);
 assert.match(index,/src="\.\/prearchive-review\.js\?v=2\.29\.1"/);
 assert.match(index,/src="\.\/simulator-evidence\.js\?v=2\.41\.2"/);
 assert.match(index,/function v242ArchiveCheck\(\)/);
 assert.match(index,/Older updates/);
 assert.match(index,/function syncQuickFlightScrollLock\(\)/);
 assert.match(index,/src="\.\/cloud-foundation\.js\?v=2\.19-locations-1"/);
 assert.match(index,/src="\.\/auth-gate\.js\?v=2\.39\.1-operator-sync-1"/);
 assert.match(index,/src="\.\/night-calculation\.js\?v=2\.19-locations-1"/);
 assert.match(index,/src="\.\/aerodrome-lookup\.js\?v=2\.19-locations-1"/);
 assert.doesNotMatch(index,/Continue with Google/);
 assert.match(index,/not proof that a printer completed|not yet presented as a qualified/i);
});
test("root config exclusively targets pinned production Supabase",()=>{
 const config=read("cloud-config.js");
 assert.match(config,/"environment":\s*"production"/);
 assert.match(config,/"productionOrigin":\s*"https:\/\/helilog-pwa\.onrender\.com"/);
 assert.match(config,/"supabaseUrl":\s*"https:\/\/xvmzvoldlajvnfxonrvn\.supabase\.co"/);
 assert.match(config,/sb_publishable_[A-Za-z0-9_-]{12,}/);
 assert.match(config,/"inviteOnly":\s*true/);
 assert.doesNotMatch(config,/cabfifnsxpaalgsyicbo|sb_secret_|service_role|googleEnabled/);
 assert.match(read("cloud-foundation.js"),/productionOrigin/);
});
test("all root app scripts exist and static assets match source",()=>{
 const html=read("index.html");
 const scripts=[...html.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^"]*)?"/g)].map(x=>x[1]);
 assert.ok(scripts.length>=12,"complete app scripts required");
 for(const f of scripts)assert.ok(fs.existsSync(path.join(root,f)),f);
 const same=["domain.js","print.js","prearchive-review.js","endorsement-bridge.js","endorsement-ui.js",
   "cloud-foundation.js","cloud-view.js","cloud-sync.js","cloud-archives.js",
   "recency.js","special-recency.js","advanced-recency.js",
   "operator-flight-monitor.js","simulator-evidence.js","operator-rules-ui.js","offline-backup-check.js",
   "night-calculation.js","aerodrome-lookup.js","archive-integrity.js",
   "recovery.js","cloud-backups.js","disaster-recovery.js"];
 for(const f of same)assert.equal(read(f),read("v2/"+f),"root asset diverged: "+f);
});
test("production offline cache and manifest are isolated from TEST and V1",()=>{
 const sw=read("service-worker.js");
 assert.match(sw,/const CACHE='helilog-v2-42-production-candidate-1'/);
 assert.match(sw,/dark-cockpit\.css\?v=2\.20-cockpit-3/);
 assert.match(sw,/guide\.css\?v=2\.29/);
 assert.match(sw,/cloud-config\.js\?v=2\.19-locations-1/);
 assert.match(sw,/prearchive-review\.js\?v=2\.29\.1/);
 assert.match(sw,/aerodrome-lookup\.js\?v=2\.19-locations-1/);
 assert.doesNotMatch(sw,/const CACHE='helilog-v2-19-locations-1'/);
 const manifest=JSON.parse(read("manifest.webmanifest"));
 assert.match(manifest.name,/V2\.42 — Private Beta/);
 assert.equal(manifest.scope,"./");
 assert.equal(manifest.start_url,"./index.html");
});
test("production cloud status is compact and expandable, with unchanged print logic",()=>{
 const html=read("index.html"),auth=read("auth-gate.js"),css=read("dark-cockpit.css");
 assert.match(html,/v220-page-heading/);
 assert.match(auth,/details class="v220-sync-pop"/);
 assert.match(auth,/v220-sync-bubble/);
 assert.match(css,/details\.v220-sync-pop/);
 assert.equal(read("print.js"),read("v2/print.js"));
 assert.equal(read("guide.css"),read("v2/guide.css"));
});
test("old same-origin V1 is available for access/export, not migrated automatically",()=>{
 assert.ok(fs.existsSync(path.join(root,"legacy/v1.43.2/index.html")));
 assert.ok(fs.existsSync(path.join(root,"legacy/v1.43.2/service-worker.js")));
 const old=read("legacy/v1.43.2/index.html");
 assert.doesNotMatch(old,/V2\.19 — Private Beta Candidate/);
 assert.match(old,/HeliLog/);
});
