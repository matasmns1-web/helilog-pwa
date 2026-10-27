'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const archive=read('source/app/05-archive-and-corrections.js');
const detail=read('source/app/06-flights-and-night.js');
function harness(){
 const start=archive.indexOf('let v229ReviewReturn=null;');
 const end=archive.indexOf('function v229PreArchiveReview(){',start);
 assert.ok(start>=0&&end>start,'review return helpers exist');
 const model={pageCount:1,flights:[{id:'flight-a'},{id:'flight-b'}],total:120};
 const checkbox={checked:true};
 const visits=[],navigations=[],scrolled=[];
 let visible=true;
 const ctx=vm.createContext({
  S:{flights:model.flights},location:{hash:'#archivereview'},Number,JSON,
  nextArchiveDraft:()=>model,flight:id=>{visits.push(id);visible=false;},
  go:page=>{navigations.push(page);visible=true;checkbox.checked=false;},
  document:{getElementById:id=>{
   if(!visible)return null;
   if(id==='v229Acknowledge')return checkbox;
   if(id==='v229-review-issue-2')return {scrollIntoView:opts=>scrolled.push(opts)};
   return null;
  }}
 });
 vm.runInContext(archive.slice(start,end),ctx);
 return {ctx,model,checkbox,visits,navigations,scrolled};
}
test('opening either entry stores review position without changing the draft or archive',()=>{
 const h=harness(),before=JSON.stringify(h.model);
 vm.runInContext("v229OpenReviewFlight('flight-b',2)",h.ctx);
 assert.deepEqual(h.visits,['flight-b']);
 assert.equal(JSON.stringify(h.model),before);
 assert.equal(vm.runInContext("v229CanReturnToReview('flight-b')",h.ctx),true);
 assert.equal(vm.runInContext("v229CanReturnToReview('flight-a')",h.ctx),false);
 assert.equal(vm.runInContext("v229CanReturnToReview('not-found')",h.ctx),false);
 vm.runInContext('v229ReturnToReview()',h.ctx);
 assert.deepEqual(h.navigations,['archivereview']);
 assert.equal(h.checkbox.checked,true,'unchanged review should keep checked acknowledgement');
 assert.equal(h.scrolled.length,1,'return scrolls back to same finding');
 assert.equal(h.scrolled[0].block,'start');
 assert.equal(vm.runInContext("v229CanReturnToReview('flight-b')",h.ctx),false);
});
test('changes to selected page count invalidate the previous checkbox upon return',()=>{
 const h=harness();
 vm.runInContext("v229OpenReviewFlight('flight-a',2)",h.ctx);
 h.model.pageCount=2;
 vm.runInContext('v229ReturnToReview()',h.ctx);
 assert.equal(h.checkbox.checked,false);
 assert.equal(h.scrolled.length,0,'do not resume an obsolete finding');
});
test('an unacknowledged review stays unchecked when returning',()=>{
 const h=harness();
 h.checkbox.checked=false;
 vm.runInContext("v229OpenReviewFlight('flight-a',2)",h.ctx);
 vm.runInContext('v229ReturnToReview()',h.ctx);
 assert.equal(h.checkbox.checked,false);
});
test('Back to review only appears for flight opened from review, not normal logbook',()=>{
 assert.match(detail,/v229CanReturnToReview\(id\)\?'<button class="btn" onclick="v229ReturnToReview\(\)">← Back to review<\/button>'/);
 assert.match(detail,/v229CanReturnToReview\(id\)\?\s*'<button class="btn" onclick="v229ReturnToReview\(\)">← Back to review<\/button>'/);
 assert.match(detail,/go\(\\'logbook\\'\)/);
 assert.match(archive,/id="v229-review-issue-'\+issueIndex/);
 assert.match(archive,/v229OpenReviewFlight\('\+\s*htmlEscape\(JSON\.stringify\(issue\.otherFlightId\)\)\+','\+issueIndex/);
});
test('review and print confirmation still require exact batch fingerprint',()=>{
 assert.match(archive,/pendingArchiveReview===JSON\.stringify\(draft\)/);
 assert.match(archive,/pendingArchivePreview===JSON\.stringify\(draft\)/);
 assert.match(archive,/if\(!v229ArchiveReviewed\(draft\)\)/);
 assert.doesNotMatch(archive.slice(archive.indexOf('let v229ReviewReturn=null;'),archive.indexOf('function v229PreArchiveReview(){')),/localStorage|save\(|setItem\(|archiveBatch/);
 assert.match(read('service-worker.js'),/helilog-v2-37-operator-night-recency-1/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.37'/);
});
