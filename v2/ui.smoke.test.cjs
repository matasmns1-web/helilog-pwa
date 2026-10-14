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
 for(const file of ["domain.js","storage.js","print.js","app.js"]){
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
     elements:{namedItem:name=>({value:fields[name]||""})},
     querySelectorAll(){return selected}
   };
   events.submit({target:form,preventDefault(){}});
 };
 const draw=()=>{
   pointer.pointerdown({preventDefault(){},clientX:25,clientY:30,pointerId:1});
   pointer.pointerup();
 };
 return {current,click,navigate,submit,draw,printed,app,records,context};
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
