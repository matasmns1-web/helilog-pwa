/* Run: node --test v2/app-web-archive.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const PNG="data:image/png;base64,aGVsbG8=";

function boot(installed=false){
 const store=new Map(),elements=new Map(),alerts=[];
 let opens=0,failSave=false;
 const canvas={
  width:900,height:230,toDataURL:()=>PNG,
  getContext:()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}}),
  addEventListener(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:900,height:230}}
 };
 function element(id){
  if(id==="signatureCanvas")return canvas;
  if(!elements.has(id))elements.set(id,{
   innerHTML:"",value:"",checked:false,style:{},dataset:{},
   classList:{add(){},remove(){},toggle(){}},addEventListener(){},
   setAttribute(){},querySelectorAll(){return []},focus(){}
  });
  return elements.get(id);
 }
 const env={
  console,Date,JSON,Math,Promise,URL,setTimeout(){},setInterval(){},clearTimeout(){},
  location:{hash:"#dashboard",protocol:"https:",hostname:"helilog-v2-test.onrender.com"},
  navigator:{userAgent:"Mozilla/5.0 (iPad)",platform:"MacIntel",maxTouchPoints:5,standalone:installed},
  matchMedia(){return {matches:env.navigator.standalone}},addEventListener(){},
  confirm(){return true},alert(s){alerts.push(String(s))},
  open(){opens++;return {document:{open(){},write(){},close(){}},focus(){}}},
  localStorage:{
   getItem:key=>store.has(key)?store.get(key):null,
   setItem(key,value){if(failSave)throw Error("Out of space");store.set(key,value)},
   removeItem:key=>store.delete(key)
  },
  document:{
   documentElement:{classList:{add(){},remove(){},toggle(){}}},
   querySelector:q=>element(q),getElementById:q=>element(q),
   querySelectorAll(){return []},addEventListener(){}
  }
 };
 env.window=env;
 const context=vm.createContext(env);
 for(const file of ["domain.js","print.js","endorsement-bridge.js","endorsement-ui.js","cloud-config.js","cloud-foundation.js","cloud-view.js","cloud-sync.js","auth-gate.js"]){
  vm.runInContext(fs.readFileSync(path.join(__dirname,file),"utf8"),context,{filename:file});
 }
 env.HeliLogCloud={refresh:()=>new Promise(()=>{}),snapshot:()=>({configured:false,status:"signed_out"})};
 const inline=html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"));
 vm.runInContext(inline,context,{filename:"v2/index.html inline JS"});
 vm.runInContext("v23Unlocked=true",context);
 const evaluate=script=>vm.runInContext(script,context);
 return {evaluate,env,alerts,store,app:()=>element("#app").innerHTML,
  get opens(){return opens},failSaves:()=>{failSave=true}};
}
function seedEndorsement(b){
 b.evaluate([
  'const person=S.people.find(p=>!p.isAccountHolder);',
  'S.endorsements.push({id:"v21-demo",date:"2026-10-14",category:"Skill test",',
  ' title:"Fictional Cabri endorsement",text:"Fictional signed test wording",',
  ' location:"Vilnius",qualificationId:"",signatoryPersonId:person.id,',
  ' signatureData:"",signedAt:"",signedName:"",signedLicence:""});'
 ].join("\n"));
}
test("V2.8.1 is the current interface version label",()=>{
 assert.match(html,/<title>HeliLog V2\.8\.1/);
 assert.match(html,/V2\.8\.1 · TEST/);
 assert.doesNotMatch(html,/<title>HeliLog V2\.0 Alpha/);
});
test("installed app can sign and save but shows pending status without archive controls",()=>{
 const b=boot(true);
 seedEndorsement(b);
 b.evaluate('endorsementSignatureDirty=true; applyEndorsementSignature("v21-demo")');
 assert.equal(b.evaluate('S.endorsements.find(e=>e.id==="v21-demo").signatureData'),PNG);
 const stored=JSON.parse(b.store.get("helilog_v2_complete_test_data"));
 assert.equal(stored.endorsements.find(e=>e.id==="v21-demo").signatureData,PNG);
 assert.match(b.app(),/Signed · Awaiting web archive/);
 assert.match(b.app(),/With extended cloud sync enabled/);
 assert.doesNotMatch(b.app(),/Print \/ Archive<\/button>/);
 b.evaluate('mobilemore()');
 assert.doesNotMatch(b.app(),/<b>Endorsement archive<\/b>/);
});
test("installed mode blocks archive route, print, confirmation and correction actions",()=>{
 const b=boot(true);
 seedEndorsement(b);
 b.evaluate('location.hash="#endorsementarchive";render()');
 assert.equal(b.env.location.hash,"#endorsements");
 assert.match(b.app(),/Pilot Memoranda \/ Endorsements/);
 assert.equal(b.evaluate('v2PrintEndorsementHTML("<h1>Blocked</h1>")'),false);
 b.evaluate('v2StartEndorsementCorrection("v21-demo")');
 b.evaluate('v2ConfirmEndorsementBatch()');
 assert.equal(b.opens,0);
 assert.match(b.alerts.join(" "),/web browser/);
});
test("web shows print action and archived page with correction access",()=>{
 const b=boot(false);
 seedEndorsement(b);
 b.evaluate('endorsementSignatureDirty=true; applyEndorsementSignature("v21-demo")');
 assert.match(b.app(),/Print \/ Archive/);
 assert.match(b.app(),/Signed · Awaiting web archive/);
 b.evaluate([
  'const preview=v2ArchiveBridge.draft(S,["v21-demo"],"END-TEST","2026-10-14T10:00:00.000Z");',
  'S.endorsementV2Archive=v2ArchiveBridge.confirm(S,preview,"2026-10-14T11:00:00.000Z");',
  'endorsements();'
 ].join("\n"));
 assert.match(b.app(),/Archived · Page 1/);
 assert.match(b.app(),/View archive \/ Corrections/);
 b.evaluate('v2EndorsementArchive()');
 assert.match(b.app(),/Reprint exact pages/);
});
test("failed local save does not show success or leave an unsaved signature marked signed",()=>{
 const b=boot(true);
 seedEndorsement(b);
 b.failSaves();
 b.evaluate('endorsementSignatureDirty=true; applyEndorsementSignature("v21-demo")');
 assert.equal(b.evaluate('S.endorsements.find(e=>e.id==="v21-demo").signatureData'),"");
 assert.doesNotMatch(b.app(),/Endorsement signed and saved/);
});
test("standalone mode hides desktop archive nav and new service worker caches UI",()=>{
 assert.match(html,/html\.helilog-installed-app nav button\[data-v="printarchive"\]/);
 const sw=fs.readFileSync(path.join(__dirname,"service-worker.js"),"utf8");
 assert.match(sw,/helilog-v2-8-1-archive-readiness-1/);
 assert.match(sw,/\.\/endorsement-ui\.js/);
});
