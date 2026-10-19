/* Node regression: node --test v2/ui.smoke.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");

function boot(){
 const records=new Map(),events={},pointer={},printed=[];
 const drawingContext={beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){},clearRect(){}};
 const canvas={
   width:900,height:230,
   addEventListener(event,fn){pointer[event]=fn},
   getContext(){return drawingContext},
   getBoundingClientRect(){return {left:0,top:0,width:900,height:230}},
   setPointerCapture(){},
   toDataURL(){return "data:image/png;base64,aGVsbG8="}
 };
 const app={innerHTML:""};
 const browser={
   console,
   localStorage:{
     getItem:key=>records.has(key)?records.get(key):null,
     setItem:(key,value)=>records.set(key,value),
     removeItem:key=>records.delete(key)
   },
   document:{
     getElementById(id){
       if(id==="app")return app;
       if(id==="sign-canvas")return canvas;
       if(id==="batch-checked"||id==="amend-checked")return {checked:true};
       return null;
     },
     querySelectorAll(){return []},
     addEventListener:(event,fn)=>events[event]=fn
   },
   open(){return {document:{open(){},write(content){printed.push(content)},close(){}},focus(){}}},
   confirm(){return true},
   prompt(){return "RESET_V2_SANDBOX"}
 };
 browser.window=browser;
 const context=vm.createContext(browser);
 for(const file of ["domain.js","storage.js","print.js","flights.js","app.js"]){
   vm.runInContext(fs.readFileSync(path.join(__dirname,file),"utf8"),context,{filename:file});
 }
 const current=()=>JSON.parse(records.get("helilog_v2_dev_workspace"));
 const click=(action,id)=>{
   const target={dataset:{action,id},closest(selector){return selector==="[data-action]"?this:null}};
   events.click({target});
 };
 const navigate=page=>{
   const target={dataset:{nav:page},closest(selector){return selector==="[data-nav]"?this:null}};
   events.click({target});
 };
 const submit=(id,fields,selected=[])=>{
   const form={
     id,matches(){return true},
     elements:{namedItem:name=>({value:fields[name]??"",checked:fields[name]===true})},
     querySelectorAll(){return selected}
   };
   events.submit({target:form,preventDefault(){}});
 };
 const draw=()=>{
   pointer.pointerdown({preventDefault(){},clientX:25,clientY:30,pointerId:1});
   pointer.pointerup();
 };
 const filter=(name,value)=>{
   const target={dataset:{flightFilter:name},value,name:"filter-"+name};
   events[name==="search"?"input":"change"]({target});
 };
 return {current,click,navigate,submit,draw,filter,printed,app,records,context};
}

test("UI: creates, signs, previews and archives an endorsement, then signs a correction",()=>{
 const ui=boot();
 assert.match(ui.app.innerHTML,/V2 development workspace/);
 ui.navigate("people");
 ui.submit("person-form",{name:"Fake Instructor",licence:"TEST-123"});
 const personId=ui.current().people[0].id;
 ui.navigate("endorsements");
 ui.click("create-endorsement");
 ui.submit("endorsement-form",{
   date:"14-10-2026",category:"Skill test",title:"Original title",text:"Original text",
   signatoryPersonId:personId
 });
 const endorsementId=ui.current().endorsements[0].id;
 ui.click("sign-endorsement",endorsementId);
 ui.draw();ui.click("apply-signature");
 assert.ok(ui.current().endorsements[0].signature);

 ui.navigate("archive");
 ui.submit("archive-select-form",{},[{value:endorsementId}]);
 assert.equal(ui.current().archives.endorsements.length,0);
 assert.match(ui.printed[0],/PILOT MEMORANDA \/ ENDORSEMENTS/);
 ui.click("confirm-batch");
 assert.equal(ui.current().archives.endorsements.length,1);

 ui.navigate("endorsements");
 ui.click("amend-endorsement",endorsementId);
 ui.submit("amend-form",{
   date:"14-10-2026",category:"Skill test",title:"Corrected title",text:"Corrected text",
   signatoryPersonId:personId,reason:"Test correction"
 });
 ui.draw();ui.click("apply-signature");
 ui.click("preview-amendment");
 assert.match(ui.printed[1],/ENDORSEMENT CORRECTION ADDENDUM/);
 ui.click("confirm-amendment");
 const state=ui.current();
 assert.equal(state.endorsements[0].title,"Original title");
 assert.equal(state.amendments.endorsements.length,1);
 assert.equal(state.amendments.endorsements[0].after.title,"Corrected title");
 assert.equal(ui.context.HeliLogV2Domain.validateState(state).length,0);
});
test("UI: reset isolates V2 and never removes existing V1 storage",()=>{
 const ui=boot();
 ui.records.set("helilog_v111","v1-test-placeholder");
 ui.navigate("settings");
 ui.click("reset-workspace");
 assert.equal(ui.records.get("helilog_v111"),"v1-test-placeholder");
 assert.equal(ui.current().endorsements.length,0);
 assert.match(ui.app.innerHTML,/reset/);
});


test("UI: aircraft, account holder, 24-hour flight, aircraft snapshot and totals",()=>{
 const ui=boot();
 ui.navigate("people");
 ui.submit("person-form",{name:"Test Pilot",licence:"CPL(H)"});
 const pilotId=ui.current().people[0].id;
 ui.click("set-owner",pilotId);
 ui.submit("person-form",{name:"Test Examiner",licence:"FI(H)"});
 ui.navigate("aircraft");
 ui.click("new-aircraft");
 ui.submit("aircraft-form",{
  registration:"LY-CAB",icao:"G2CA",manufacturer:"Guimbal",model:"Cabri G2",variant:"",engine:"SE"
 });
 assert.equal(ui.current().aircraft.length,1);
 const aircraftId=ui.current().aircraft[0].id;
 ui.navigate("flights");
 ui.click("new-flight");
 assert.match(ui.app.innerHTML,/data-time-picker="off"/);
 const flight={
  date:"14-10-2026",aircraftId,dep:"EYVI",arr:"EYKA",off:"0935",on:"10:45",
  role:"PIC",picPersonId:"",pilotConfig:"single",ifrMin:"25",nightMin:"0",
  instructorMin:"0",takeoffDay:"1",landingDay:"1",takeoffNight:"0",landingNight:"0",
  crossCountry:true,remarks:"Fictional flight"
 };
 ui.submit("flight-form",flight);
 let state=ui.current();
 assert.equal(state.flights.length,1);
 assert.equal(state.flights[0].durationMin,70);
 assert.equal(state.flights[0].picPersonId,pilotId);
 assert.equal(state.flights[0].off,"09:35");
 assert.equal(state.flights[0].aircraftSnapshot.icao,"G2CA");
 assert.equal(ui.context.HeliLogV2Flights.validateState(state).length,0);
 const flightId=state.flights[0].id;
 ui.navigate("aircraft");
 ui.click("edit-aircraft",aircraftId);
 ui.submit("aircraft-form",{
  registration:"LY-CAB",icao:"A139",manufacturer:"Test",model:"Modified",variant:"",engine:"ME"
 });
 ui.navigate("flights");
 ui.click("edit-flight",flightId);
 ui.submit("flight-form",{...flight,remarks:"Updated fictional flight"});
 state=ui.current();
 assert.equal(state.flights[0].aircraftSnapshot.engine,"SE");
 ui.navigate("flight-totals");
 assert.match(ui.app.innerHTML,/1:10/);
 assert.equal(ui.context.HeliLogV2Flights.totals(state).engineSE,70);
 assert.equal(ui.context.HeliLogV2Flights.validateState(state).length,0);
});
test("UI: an invalid time does not create a flight",()=>{
 const ui=boot();
 ui.navigate("people");
 ui.submit("person-form",{name:"Pilot"});
 ui.click("set-owner",ui.current().people[0].id);
 ui.navigate("aircraft");ui.click("new-aircraft");
 ui.submit("aircraft-form",{registration:"LY-TEST",icao:"G2CA",engine:"SE"});
 ui.navigate("flights");ui.click("new-flight");
 ui.submit("flight-form",{
  date:"14-10-2026",aircraftId:ui.current().aircraft[0].id,
  dep:"EYVI",arr:"EYVI",off:"25:60",on:"10:45",role:"PIC",
  pilotConfig:"single",ifrMin:"0",nightMin:"0",instructorMin:"0",
  takeoffDay:"0",landingDay:"0",takeoffNight:"0",landingNight:"0"
 });
 assert.equal(ui.current().flights.length,0);
 assert.match(ui.app.innerHTML,/Add Flight/);
});


test("UI: V1-style dashboard, totals sections and Logbook filters remain functional",()=>{
 const ui=boot();
 assert.match(ui.app.innerHTML,/Flight-time overview/);
 assert.match(ui.app.innerHTML,/Recent flights/);
 assert.match(ui.app.innerHTML,/Upcoming dates/);
 assert.match(ui.app.innerHTML,/Aircraft time/);
 assert.match(ui.app.innerHTML,/30 days/);
 ui.click("dashboard-range","30");
 assert.match(ui.app.innerHTML,/dashboard-range/);

 ui.navigate("people");
 ui.submit("person-form",{name:"Example Pilot"});
 ui.click("set-owner",ui.current().people[0].id);
 ui.navigate("aircraft");ui.click("new-aircraft");
 ui.submit("aircraft-form",{registration:"LY-TEST",icao:"G2CA",engine:"SE"});
 const aid=ui.current().aircraft[0].id;
 ui.navigate("flights");ui.click("new-flight");
 ui.submit("flight-form",{
  date:"14-10-2026",aircraftId:aid,dep:"EYVI",arr:"EYKA",off:"0935",on:"10:45",
  role:"PIC",pilotConfig:"single",ifrMin:"20",nightMin:"0",instructorMin:"0",
  takeoffDay:"1",landingDay:"1",takeoffNight:"0",landingNight:"0",crossCountry:true
 });
 ui.navigate("flights");
 assert.match(ui.app.innerHTML,/filter-search/);
 assert.match(ui.app.innerHTML,/EYVI/);
 ui.filter("xc","false");
 ui.navigate("flights");
 assert.doesNotMatch(ui.app.innerHTML,/<td>EYVI<\/td>/);
 assert.match(ui.app.innerHTML,/0 of 1 flights/);
 ui.click("reset-flight-filters");
 assert.match(ui.app.innerHTML,/1 of 1 flights/);
 ui.navigate("flight-totals");
 for(const section of [
  "Aircraft engine experience","Pilot configuration time","Additional breakdown",
  "Simulator / synthetic training device experience","Take-offs &amp; landings",
  "By ICAO type","Specialised helicopter operations experience"
 ])assert.ok(ui.app.innerHTML.includes(section),section);
 for(const label of ["Total","PIC","Co-pilot","Dual"]){
  assert.match(ui.app.innerHTML,new RegExp('class="label">'+label+'</div>'));
 }
});
