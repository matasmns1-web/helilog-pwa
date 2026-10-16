/* Run: node --test v2/v26-login-ui.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const folder=__dirname;
const html=fs.readFileSync(path.join(folder,"index.html"),"utf8");
const auth=fs.readFileSync(path.join(folder,"auth-gate.js"),"utf8");
const worker=fs.readFileSync(path.join(folder,"service-worker.js"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.webmanifest"),"utf8"));

function loginMarkup(snapshot){
 const begin=auth.indexOf("function v23LoginView(){");
 const end=auth.indexOf("async function v23Boot(){");
 assert.ok(begin!==-1&&end>begin);
 const body=auth.slice(begin,end);
 const app={innerHTML:""};
 const document={documentElement:{classList:{add(){}}}};
 const window={HeliLogCloud:{snapshot:()=>snapshot}};
 const renderer=new Function("window","document","app","TEST_MODE","v23AuthMessage",
  "v23Escape","HELILOG_TEST_VERSION","v23Unlocked",body+";return v23LoginView;");
 renderer(window,document,app,false,"",x=>String(x),"V2.11",false)();
 return app.innerHTML;
}

test("login displays current version, and only form fields accept text",()=>{
 const markup=loginMarkup({status:"signed_out",error:""});
 assert.match(markup,/V2\.11 · Private pilot logbook test/);
 assert.match(markup,/contenteditable="false"/);
 assert.match(markup,/<h1[^>]*>Sign in<\/h1>/);
 assert.match(markup,/id="v23Email" type="email"/);
 assert.match(markup,/id="v23Password" type="password"/);
 assert.doesNotMatch(markup,/contenteditable="true"/);
 assert.match(html,/\.v23-auth-card\{user-select:none;/);
 assert.match(html,/\.v23-auth-card input,\.v23-auth-card textarea\{user-select:text;/);
 assert.match(html,/caret-color:auto/);
 assert.doesNotMatch(markup,/Log out/);
});

test("account setup retains a way to switch accounts without a global logout",()=>{
 const markup=loginMarkup({status:"signed_in",hasProfile:false,error:""});
 assert.match(markup,/Create your pilot profile/);
 assert.match(markup,/Switch account/);
});

test("Log out lives in Profile only; it is not in the common header or mobile More",()=>{
 const head=html.slice(html.indexOf("function header("),html.indexOf("function dashboard("));
 const moreStart=html.indexOf("function mobilemore(){");
 const more=html.slice(moreStart,html.indexOf("function ",moreStart+1));
 const profileStart=html.indexOf("function profile(){");
 const profile=html.slice(profileStart,html.indexOf("function settings(){",profileStart));
 assert.doesNotMatch(head,/v23SignOut/);
 assert.doesNotMatch(more,/v23SignOut/);
 assert.match(profile,/v23AccountWorkspace\(\).*v23SignOut\(\).*Log out/);
 assert.equal((html.match(/Log out<\/button>/g)||[]).length,1);
 assert.match(auth,/confirmLeaveFlightForm\(\)/);
 assert.match(auth,/unsynchronized change\(s\) remain saved/);
});

test("PWA version and references are consistent for the V2.11 update",()=>{
 assert.match(html,/<title>HeliLog V2\.11/);
 assert.match(html,/V2\.11 · TEST/);
 assert.equal(manifest.name,"HeliLog V2.11 — Test");
 assert.match(auth,/HELILOG_TEST_VERSION='V2\.11'/);
 assert.match(auth,/<h2>🚁 HeliLog '\+HELILOG_TEST_VERSION/);
 assert.match(worker,/helilog-v2-11-interface-1/);
 for(const file of ["cloud-config","cloud-foundation","cloud-view","cloud-sync","auth-gate","cloud-archives"]){
  const ref=file+".js?v=2.11-interface-1";
  assert.ok(html.includes(ref),"Missing version in HTML: "+ref);
  assert.ok(worker.includes(ref),"Missing version in PWA shell: "+ref);
 }
 assert.doesNotMatch(html,/v=2\.5-profile-self-1/);
 assert.doesNotMatch(worker,/v=2\.5-profile-self-1/);
});
