/* Run: node --test v2/v25-profile-pic.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const dir=__dirname;
const html=fs.readFileSync(path.join(dir,"index.html"),"utf8");
const auth=fs.readFileSync(path.join(dir,"auth-gate.js"),"utf8");
const worker=fs.readFileSync(path.join(dir,"service-worker.js"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest.webmanifest"),"utf8"));
function section(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,"Could not extract "+start);
 return html.slice(a,b);
}
const helpers=section("function pilotNameParts(","function ownerPerson(){");
test("existing full-name accounts split for display without rewriting old data",()=>{
 let original={name:"Matas Simonis",licenceType:"CPL(H)"};
 const api=new Function("S","isSimulatorSession","isArchivedFlight",helpers+";return {pilotNameParts,displayPICName} ")(
  {pilot:original},()=>false,()=>false);
 assert.deepEqual(api.pilotNameParts(),{firstName:"Matas",lastName:"Simonis"});
 assert.equal(original.firstName,undefined);
 assert.deepEqual(api.pilotNameParts({name:"Matas"}),{firstName:"Matas",lastName:""});
 assert.deepEqual(api.pilotNameParts({name:"Matas Simonis",firstName:"Matas",lastName:"Simonis"}),{firstName:"Matas",lastName:"Simonis"});
});
test("PIC and SOLO display SELF, while other commanders and frozen pages retain original names",()=>{
 const api=new Function("S","isSimulatorSession","isArchivedFlight",helpers+";return displayPICName")(
  {pilot:{name:"Test Pilot"}},()=>false,id=>id==="f-archived");
 assert.equal(api({id:"f-pic",role:"PIC",picName:"Test Pilot"}),"SELF");
 assert.equal(api({id:"f-solo",role:"SOLO",picName:"Test Pilot"}),"SELF");
 assert.equal(api({id:"f-dual",role:"DUAL",picName:"Instructor Example"}),"Instructor Example");
 assert.equal(api({id:"f-archived",role:"PIC",picName:"Original Pilot"}),"Original Pilot");
 assert.match(html,/if\(\['PIC','SOLO'\]\.includes\(role\)\)picName='SELF'/);
 assert.match(html,/if\(picPerson && !\['PIC','SOLO'\]\.includes\(role\)\) picName=picPerson\.name/);
 assert.match(html,/<td class="pic-name">\$\{htmlEscape\(f\.picName\|\|''\)\}<\/td>/);
});
test("PIC and SOLO input is locked to SELF; switching to DUAL asks for a commander",()=>{
 const pic={value:"",dataset:{},style:{},readOnly:false};
 const role={value:"PIC"};
 const S={pilot:{name:"Demo Pilot"}};
 const code=section("function roleChanged(){","function showFormError(");
 const f=new Function("S","$","ownerPerson",code+";return roleChanged")(S,id=>id==="#role"?role:pic,()=>({id:"p_owner",name:"Demo Pilot"}));
 f();
 assert.equal(pic.value,"SELF");assert.equal(pic.readOnly,true);assert.equal(pic.dataset.personId,"p_owner");
 role.value="SOLO";f();assert.equal(pic.value,"SELF");
 role.value="DUAL";f();assert.equal(pic.value,"");assert.equal(pic.readOnly,false);
});
test("saving profile retains full name for exported logbook and stores separate given/family names",()=>{
 const fields={"#ownFirstName":{value:"Test"},"#ownLastName":{value:"Pilot"},
 "#ownLicenceType":{value:"CPL(H)"},"#ownLicenceNumber":{value:"LT-001"},"#ownAuthority":{value:"TKA"}};
 const S={pilot:{name:"Old Pilot",licenceType:""},people:[{id:"p_owner",name:"Old Pilot",isAccountHolder:true}],
  flights:[{id:"self",role:"PIC",picName:"Old Pilot",picPersonId:"p_owner"},
   {id:"dual",role:"DUAL",picName:"Instructor",picPersonId:"p_instructor"},
   {id:"arch",role:"SOLO",picName:"Old Pilot",picPersonId:"p_owner"}],
  qualifications:[]};
 let saves=0,opened=false;
 const f=new Function("S","$","ownerPerson","pilotLicenceDisplay","isArchivedFlight","save","profile","alert",
  section("function saveOwnProfile(e){","function editMedical(")+";return saveOwnProfile")(
  S,key=>fields[key],()=>S.people[0],()=>S.pilot.licenceType+" · "+S.pilot.licenceNumber,
  id=>id==="arch",()=>{saves++;return true},()=>{opened=true},msg=>{throw Error(msg)});
 f({preventDefault(){}});
 assert.equal(S.pilot.firstName,"Test");
 assert.equal(S.pilot.lastName,"Pilot");
 assert.equal(S.pilot.name,"Test Pilot");
 assert.equal(S.people[0].name,"Test Pilot");
 assert.equal(S.flights[0].picName,"SELF");
 assert.equal(S.flights[1].picName,"Instructor");
 assert.equal(S.flights[2].picName,"Old Pilot");
 assert.equal(saves,1);assert.equal(opened,true);
});
test("saved instructor and commander profiles have separate names but retain full PIC name",()=>{
 const S={people:[{id:"existing",name:"Old Instructor",role:"Instructor"}],
  flights:[{id:"dual",role:"DUAL",picName:"Old Instructor",picPersonId:"existing"}]};
 const first={value:"Test"},surname={value:"Examiner"},role={value:"Examiner"},
  licence={value:"FI(H)"},notes={value:"Fictional"};
 const fields={"#personFirstName":first,"#personLastName":surname,
 "#personRole":role,"#personLicence":licence,"#personNotes":notes};
 let editId="existing",saved=false;
 const code=section("function savePerson(e){","function endorsementById(");
 const fn=new Function("S","$","personById","editingPersonId","isArchivedFlight","save","go","alert",code+";return savePerson");
 const save=fn(S,k=>fields[k],id=>S.people.find(p=>p.id===id),editId,()=>false,
 ()=>{saved=true},()=>{},msg=>{throw Error(msg)});
 save({preventDefault(){}});
 assert.equal(S.people[0].firstName,"Test");
 assert.equal(S.people[0].lastName,"Examiner");
 assert.equal(S.people[0].name,"Test Examiner");
 assert.equal(S.flights[0].picName,"Test Examiner");
 assert.equal(saved,true);
 assert.match(html,/id="personFirstName"/);
 assert.match(html,/id="personLastName"/);
 assert.doesNotMatch(html,/id="personName"/);
});
test("logout is visible only in Profile and checks unsaved edits",()=>{
 assert.match(html,/function header\(title,sub,action=''\)/);
 const header=html.slice(html.indexOf("function header("),html.indexOf("function dashboard("));
 const more=html.slice(html.indexOf("function mobilemore("),html.indexOf("function ",html.indexOf("function mobilemore(")+1));
 const profile=html.slice(html.indexOf("function profile(){"),html.indexOf("function settings(){"));
 assert.doesNotMatch(header,/v23SignOut/);
 assert.doesNotMatch(more,/v23SignOut/);
 assert.match(profile,/Log out<\/button>/);
 assert.match(auth,/Switch account/);
 assert.match(auth,/if\(typeof confirmLeaveFlightForm==="function"&&!confirmLeaveFlightForm\(\)\)return;/);
});
test("V2.19 installs new assets together while keeping older profile migration explicit",()=>{
 assert.match(html,/<title>HeliLog V2\.36\.2/);
 assert.match(html,/V2\.36\.2 · TEST ENVIRONMENT/);
 assert.equal(manifest.name,"HeliLog V2.36.2 — Linked Operator Recency Test");
 assert.match(worker,/helilog-v2-36-2-linked-operator-recency-1/);
 assert.match(worker,/cloud-sync\.js\?v=2\.19-locations-1/);
 assert.match(html,/cloud-sync\.js\?v=2\.19-locations-1/);
 assert.match(html,/id="ownFirstName"/);
 assert.match(html,/id="ownLastName"/);
 assert.doesNotMatch(html,/id="ownName"/);
});
