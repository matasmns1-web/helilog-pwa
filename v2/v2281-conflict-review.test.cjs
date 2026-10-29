"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,p),"utf8");
const gate=read("auth-gate.js"),view=read("cloud-view.js"),worker=read("service-worker.js");
function makeNav(rows,mode="conflict"){
 const start=gate.indexOf("function v2281FocusConflictReview("),end=gate.indexOf("function v23LoginView(){",start);
 assert.ok(start>=0&&end>start);
 const code=gate.slice(start,end);
 let opened=0,focused=0,scrolled=0,compared=[],navigations=0,prevented=0;
 const panel={scrollIntoView:()=>{scrolled++},focus:()=>{focused++}};
 const document={getElementById:id=>id==="v2281ConflictReview"||id==="v2281RecordComparison"?panel:null};
 const location={hash:"#settings"};
 const api=new Function("window","document","location","setTimeout","v23AccountWorkspace","v27RecordBusy","v27ReviewRecordConflict","cloud","go",code+";return {open:v2281OpenConflictReview,focus:v2281FocusConflictReview};")(
   {HeliLogV23Sync:{status:()=>({state:mode}),conflicts:()=>rows}},document,location,fn=>fn(),
   ()=>true,false,(kind,id)=>{compared.push([kind,id]);return Promise.resolve();},
   ()=>{opened++},dest=>{location.hash="#"+dest;navigations++}
 );
 const event={preventDefault(){prevented++},stopPropagation(){prevented++}};
 return {api,event,get report(){return{opened,focused,scrolled,compared,navigations,prevented}}};
}
test("sync bubble opens the unique local conflict comparison, not just Cloud account",()=>{
 const env=makeNav([{kind:"settings",id:"siteLocations",reviewable:true}]);
 env.api.open(env.event);
 assert.equal(env.report.navigations,1);
 assert.deepEqual(env.report.compared,[["settings","siteLocations"]]);
 assert.equal(env.report.prevented,2);
});
test("multiple or protected conflicts focus the visible on-device panel without overwriting",()=>{
 const env=makeNav([{kind:"endorsement",id:"signed",reviewable:false},{kind:"person",id:"pilot",reviewable:true}]);
 env.api.open(env.event);
 assert.deepEqual(env.report.compared,[["person","pilot"]]);
 const many=makeNav([{kind:"person",id:"p1",reviewable:true},{kind:"person",id:"p2",reviewable:true}]);
 many.api.open(many.event);
 assert.equal(many.report.compared.length,0);
 assert.ok(many.report.focused>=1);assert.ok(many.report.scrolled>=1);
 const blocked=makeNav([{kind:"endorsement",id:"signed",reviewable:false}]);
 blocked.api.open(blocked.event);
 assert.equal(blocked.report.compared.length,0);
 assert.ok(blocked.report.focused>=1);
});
test("Cloud page puts a labelled, device-specific issue panel before the ordinary account cards",()=>{
 assert.match(view,/id="v2281ConflictReview"/);
 assert.match(view,/tabindex="-1"/);
 assert.match(view,/These conflicts are stored <b>on this device<\/b>/);
 const first=view.indexOf("(v23AccountWorkspace()?v27ConflictsMarkup()");
 const card=view.indexOf("'<'+'div class"); // fall back to heading text
 assert.ok(first!==-1);
 assert.ok(first<view.indexOf("Connection status"));
 assert.match(view,/No ordinary record in the queue can be compared automatically/);
 assert.match(view,/Do not clear app data or force-upload/);
 assert.match(view,/Compare pilot profile safely/);
});
test("record comparison hides raw saved signature images and never chooses a copy automatically",()=>{
 assert.match(view,/key==='savedSignatureData'\|\|key==='signatureData'/);
 assert.match(view,/id="v2281RecordComparison"/);
 assert.match(view,/Keep current device copy/);
 assert.match(view,/Use earlier unsent copy/);
 assert.match(view,/Use current cloud copy/);
 assert.doesNotMatch(gate,/onclick="go\(\\'cloud\\'\)">Review on this device/);
 assert.match(gate,/v2281OpenConflictReview\(event\)/);
});
test("hotfix updates PWA cache without touching production, print or cloud database schema",()=>{
 assert.match(worker,/helilog-v2-49-cloud-conflict-review-1/);
 assert.match(read("source/index.template.html"),/V2\.49/);
 assert.match(read("auth-gate.js"),/HELILOG_TEST_VERSION='V2\.49'/);
 assert.doesNotMatch(read("print.js"),/v2281OpenConflictReview/);
 assert.doesNotMatch(read("archive-integrity.js"),/v2281OpenConflictReview/);
});
