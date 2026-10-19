/* node --test v2/full-interface.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const original=fs.readFileSync(path.join(root,"index.html"),"utf8");

function boot(){
 const memory=new Map(),elements=new Map(),alerts=[];
 function node(id){
  if(!elements.has(id))elements.set(id,{innerHTML:"",value:"",checked:false,style:{},dataset:{},
   classList:{add(){},remove(){},toggle(){}},addEventListener(){},
   setAttribute(){},querySelectorAll(){return []},focus(){}});
  return elements.get(id);
 }
 const env={
  console,Date,JSON,Math,Promise,URL,setTimeout(){},setInterval(){},
  location:{hash:"#dashboard",protocol:"https:",hostname:"helilog-v2-test.onrender.com"},
  navigator:{userAgent:"Desktop simulator",platform:"Linux",maxTouchPoints:0},
  confirm(){return true},alert(s){alerts.push(String(s))},
  matchMedia(){return {matches:false}},addEventListener(){},
  localStorage:{getItem:k=>memory.has(k)?memory.get(k):null,
   setItem(k,v){memory.set(k,v)},removeItem(k){memory.delete(k)}},
  document:{documentElement:{classList:{add(){},remove(){},toggle(){}}},
   querySelector:s=>node(s),getElementById:s=>node(s),
   querySelectorAll(){return []},addEventListener(){}}
 };
 env.window=env;
 const cx=vm.createContext(env);
 for(const file of ["domain.js","print.js","endorsement-bridge.js","endorsement-ui.js","cloud-config.js","cloud-foundation.js","cloud-view.js","cloud-sync.js","auth-gate.js"]){
  vm.runInContext(fs.readFileSync(path.join(__dirname,file),"utf8"),cx,{filename:file});
 }
 env.HeliLogCloud={refresh:()=>new Promise(()=>{}),snapshot:()=>({configured:false,status:"signed_out"})};
 const inline=html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"));
 vm.runInContext(inline,cx,{filename:"V2 restored HTML inline script"});
 vm.runInContext("v23Unlocked=true",cx);
 function renderPage(route){
  env.location.hash="#"+route;
  vm.runInContext("render()",cx);
  return node("#app").innerHTML;
 }
 return {cx,alerts,memory,renderPage};
}

test("complete V1 modules and specialised/simulator totals are retained",()=>{
 for(const fn of ["dashboard","logbook","add","aircraft","pilots","endorsements",
  "printarchive","totals","profile","testmode","mobilemore"]){
  assert.ok(original.includes("function "+fn+"("),fn+" missing in V1");
  assert.ok(html.includes("function "+fn+"("),fn+" missing in V2");
 }
 for(const text of ["Simulator / synthetic training device experience",
  "Specialised helicopter operations experience","By ICAO type",
  "Take-offs &amp; landings","Import CSV"]){
  assert.ok(html.includes(text),text);
 }
});
test("V1 storage key isolated and previous V2 alpha retained",()=>{
 assert.match(html,/helilog_v2_complete_test_data/);
 assert.match(html,/helilog_v2_complete_test_sandbox/);
 assert.doesNotMatch(html,/helilog_v111/);
 assert.ok(fs.existsSync(path.join(__dirname,"alpha.html")));
});
test("V2 standalone assets and archive scripts are present",()=>{
 for(const file of ["domain.js","print.js","endorsement-bridge.js",
  "endorsement-ui.js","manifest.webmanifest","service-worker.js",
  "icon-192.png","icon-512.png","apple-touch-icon.png"]){
   assert.ok(fs.existsSync(path.join(__dirname,file)),file);
 }
 assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,"manifest.webmanifest"),"utf8")).short_name,"HeliLog V2");
});
test("all original pages and new endorsement archive render in V2",()=>{
 const ui=boot();
 for(const route of ["dashboard","logbook","add","aircraft","pilots","endorsements",
   "printarchive","endorsementarchive","totals","profile","cloud","testmode","mobilemore"]){
  const page=ui.renderPage(route);
  assert.ok(page.length>400,route+" empty page");
  assert.doesNotMatch(page,/HeliLog could not load this screen/,route);
 }
 assert.equal(ui.alerts.length,0);
});
test("V1 flight form, totals panels, and new endorsement archive link work",()=>{
 const ui=boot();
 const add=ui.renderPage("add");
 assert.match(add,/Pilot function/);
 assert.match(add,/Cross-country/);
 const totals=ui.renderPage("totals");
 for(const heading of ["Aircraft engine experience","Pilot configuration time",
  "Additional breakdown","Simulator / synthetic training device experience",
  "By ICAO type","Specialised helicopter operations experience"]){
  assert.ok(totals.includes(heading),heading);
 }
 const paper=ui.renderPage("printarchive");
 assert.match(paper,/Endorsement print archive — V2/);
 const cloud=ui.renderPage("cloud");
 assert.match(cloud,/Cloud not configured/);
 assert.match(cloud,/No cloud database has been activated/);
});
test("new endorsement print archive opens inside the restored V1 interface",()=>{
 const ui=boot();
 const script=[
  'const p=S.people.find(x=>!x.isAccountHolder);',
  'const e={id:"e-test",date:"2026-10-14",category:"Proficiency check / revalidation",',
  ' title:"Cabri test",text:"Test endorsement",location:"Vilnius",qualificationId:"",',
  ' signatoryPersonId:p.id,signedName:p.name,signedLicence:p.licence||"",',
  ' signedAt:"2026-10-14T10:00:00.000Z",signatureData:"data:image/png;base64,aGVsbG8="};',
  'S.endorsements.push(e);',
  'const preview=v2ArchiveBridge.draft(S,["e-test"],"END-TEST","2026-10-14T11:00:00.000Z");',
  'S.endorsementV2Archive=v2ArchiveBridge.confirm(S,preview,"2026-10-14T12:00:00.000Z");',
  'v2EndorsementArchive();',
  '({archived:S.endorsementV2Archive.batches.length,original:S.endorsements.find(x=>x.id==="e-test").text,',
  ' reprint:app.innerHTML.includes("Reprint exact pages")})'
 ].join("\n");
 const result=vm.runInContext(script,ui.cx);
 assert.equal(result.archived,1);
 assert.equal(result.original,"Test endorsement");
 assert.equal(result.reprint,true);
});
