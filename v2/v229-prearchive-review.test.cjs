'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const review=require('./prearchive-review.js');
const flight=(extras={})=>({
 id:'f1',date:'2026-10-21',aid:'a1',dep:'EYVI',arr:'EYVI',
 off:'12:00',on:'13:00',mins:60,role:'PIC',picName:'SELF',picPersonId:'owner',
 pilotConfig:'single',nightMin:0,ifrMin:0,instrMin:0,
 takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,...extras
});
const aircraft=[{id:'a1',reg:'LY-ABC',engine:'Single engine'}];
const people=[{id:'owner',name:'Owner',isAccountHolder:true},{id:'instructor',name:'Instructor'}];
function draft(flights=[flight()],extra={}){
 const total=flights.reduce((n,f)=>n+(f.mins||0),0);
 const std=flights.reduce((n,f)=>n+(f.stdMin||0),0);
 const pic=flights.reduce((n,f)=>n+(['PIC','SOLO','SPIC','PICUS'].includes(f.role)?f.mins||0:0),0);
 const dual=flights.reduce((n,f)=>n+(f.role==='DUAL'?f.mins||0:0),0);
 const copilot=flights.reduce((n,f)=>n+(f.role==='CO-PILOT'?f.mins||0:0),0);
 const multi=flights.reduce((n,f)=>n+(f.pilotConfig==='multi'?f.mins||0:0),0);
 const night=flights.reduce((n,f)=>n+(f.nightMin||0),0);
 const ifr=flights.reduce((n,f)=>n+(f.ifrMin||0),0);
 const instructor=flights.reduce((n,f)=>n+(f.instrMin||0),0);
 const t={total,std,pic,dual,copilot,multi,single:total-multi,
  engineSE:total,engineME:0,night,ifr,instructor};
 return {id:'HL-001',firstPage:1,pageCount:1,flights,aircraft,pilot:{name:'Owner'},
  flightTotals:{...t},openingTotals:Object.fromEntries(Object.keys(t).map(k=>[k,0])),
  closingTotals:{...t},...extra};
}
function analyze(d,all=d.flights){return review.evaluate({draft:d,allFlights:all,people});}
test('clean single-PIC flight passes pre-archive review and evaluator never mutates anything',()=>{
 const d=draft(),all=JSON.parse(JSON.stringify(d.flights)),snapshot=JSON.stringify({d,all,people});
 const result=analyze(d,all);
 assert.equal(result.critical,0);assert.equal(result.advisory,0);
 assert.deepEqual(result.issues,[]);
 assert.equal(JSON.stringify({d,all,people}),snapshot);
});
test('duplicate candidate matched against an earlier archived flight is reported and links both entries',()=>{
 const upcoming=flight({id:'future'});
 const archived=flight({id:'archived-old'});
 const found=analyze(draft([upcoming]),[archived,upcoming]);
 const duplicate=found.issues.find(i=>i.code==='duplicate');
 assert.equal(duplicate.flightId,'future');assert.equal(duplicate.otherFlightId,'archived-old');
 assert.equal(duplicate.severity,'critical');
});
test('a different time or date is not treated as an identical flight',()=>{
 const newest=flight({id:'newest',on:'13:05',mins:65});
 const old=flight({id:'old'});
 assert.ok(!analyze(draft([newest]),[newest,old]).issues.some(i=>i.code==='duplicate'));
});
test('missing PIC identity, incorrect SELF and broken commander profile generate findings',()=>{
 let f=flight({role:'DUAL',picName:'SELF',picPersonId:'missing'});
 const issues=analyze(draft([f])).issues;
 assert.ok(issues.some(i=>i.code==='pic'&&i.severity==='critical'));
 assert.ok(issues.some(i=>i.code==='pic-link'));
 const invalid=analyze(draft([flight({role:'SPIC',picName:'Owner',picPersonId:'owner'})]));
 assert.ok(invalid.issues.some(i=>i.code==='pic-account'));
});
test('UTC midnight rollover is valid and does not generate a fabricated 23-hour discrepancy',()=>{
 const f=flight({off:'23:40',on:'00:35',mins:55});
 const res=analyze(draft([f]));
 assert.ok(!res.issues.some(i=>['elapsed','utc-time','same-time'].includes(i.code)));
});
test('unusual duration, different off/on duration, negative or excessive sub-times are highlighted',()=>{
 const f=flight({off:'07:00',on:'12:00',mins:250,nightMin:300,takeoffDay:2,landingDay:1});
 const res=analyze(draft([f]));
 for(const code of ['long-flight','elapsed','subtime-nightMin','movements'])
  assert.ok(res.issues.some(i=>i.code===code),code);
});
test('an individual short, otherwise correct flight creates an advisory, not an automatic change',()=>{
 const f=flight({mins:4,on:'12:04'});
 const result=analyze(draft([f]));
 assert.ok(result.issues.some(i=>i.code==='short-flight'&&i.severity==='advisory'));
});
test('independently recalculated flight totals detect misprinted minutes and carried totals',()=>{
 const d=draft();
 d.flightTotals.total=999;d.closingTotals.total=2000;
 const issues=analyze(d).issues;
 assert.ok(issues.some(i=>i.code==='batch-total'));
 assert.ok(issues.some(i=>i.code==='running-total'));
});
test('invalid flight role is exposed through PIC/Dual/Co-pilot grand total mismatch',()=>{
 const d=draft([flight({role:'UNKNOWN'})]);
 const issues=analyze(d).issues;
 assert.ok(issues.some(i=>i.code==='pilot-function'));
 assert.ok(issues.some(i=>i.code==='role-total'));
});
test('simulator time remains independent of actual flight hours and prevents duplicate simulator sessions',()=>{
 const sim={id:'s1',entryType:'simulator',date:'2026-10-21',simCategory:'FNPT II',
   simDevice:'',simQualification:'G2',stdMin:70,mins:0,remarks:'Practice'};
 const old={...sim,id:'s-older'};
 const d=draft([sim]);
 const report=analyze(d,[sim,old]);
 assert.equal(report.flightMinutes,0);assert.equal(report.simulatorMinutes,70);
 assert.ok(report.issues.some(i=>i.code==='duplicate-simulator'));
 assert.ok(!report.issues.some(i=>i.code==='batch-total'));
});
test('same-day overlapping flights from screenshot produce three critical pairs with both record links',()=>{
 const a=flight({id:'a',date:'2026-10-20',off:'14:30',on:'18:00',mins:210});
 const b=flight({id:'b',date:'2026-10-20',off:'15:00',on:'18:00',mins:180});
 const c=flight({id:'c',date:'2026-10-20',off:'16:00',on:'17:30',mins:90});
 const prev=flight({id:'prev',date:'2026-10-19',off:'10:00',on:'12:00',mins:120});
 const report=analyze(draft([prev,a,b,c]),[prev,a,b,c]);
 const overlaps=report.issues.filter(i=>i.code==='overlapping-flight');
 assert.equal(overlaps.length,3);
 assert.ok(overlaps.every(i=>i.severity==='critical'&&i.flightId&&i.otherFlightId));
 assert.deepEqual(overlaps.map(i=>[i.flightId,i.otherFlightId].sort().join('-')).sort(),['a-b','a-c','b-c']);
 assert.ok(overlaps.some(i=>i.message.includes('14:30–18:00')&&i.message.includes('15:00–18:00')));
 assert.ok(!overlaps.some(i=>i.flightId==='prev'||i.otherFlightId==='prev'));
});
test('adjacent flights sharing an endpoint are not reported as overlapping',()=>{
 const a=flight({id:'a',off:'10:00',on:'11:00'});
 const b=flight({id:'b',off:'11:00',on:'12:00'});
 const report=analyze(draft([a,b]),[a,b]);
 assert.ok(!report.issues.some(i=>i.code==='overlapping-flight'));
});
test('UTC midnight rollover catches overlap with a flight logged on the following date',()=>{
 const night=flight({id:'night',date:'2026-10-20',off:'23:30',on:'00:35',mins:65});
 const morning=flight({id:'morning',date:'2026-10-21',off:'00:20',on:'01:00',mins:40});
 const report=analyze(draft([night,morning]),[night,morning]);
 const overlaps=report.issues.filter(i=>i.code==='overlapping-flight');
 assert.equal(overlaps.length,1);
 assert.match(overlaps[0].message,/0:15.*next UTC day/);
});
test('a new flight overlapping an already archived record outside the selected batch is flagged',()=>{
 const past=flight({id:'archived',date:'2026-10-20',off:'10:00',on:'11:00'});
 const upcoming=flight({id:'new',date:'2026-10-20',off:'10:50',on:'11:20',mins:30});
 const report=analyze(draft([upcoming]),[past,upcoming]);
 const overlapping=report.issues.filter(i=>i.code==='overlapping-flight');
 assert.equal(overlapping.length,1);
 assert.deepEqual([overlapping[0].flightId,overlapping[0].otherFlightId],['new','archived']);
});
test('overlapping entries on different aircraft are also flagged in one pilot logbook',()=>{
 const a=flight({id:'a',off:'10:00',on:'11:00'});
 const b=flight({id:'b',aid:'a2',off:'10:15',on:'10:45',mins:30});
 const d=draft([a,b],{aircraft:[...aircraft,{id:'a2',reg:'LY-XYZ',engine:'Single engine'}]});
 const report=analyze(d,[a,b]);
 assert.equal(report.issues.filter(i=>i.code==='overlapping-flight').length,1);
});
test('simulator or invalid/equal UTC intervals do not produce fabricated overlap',()=>{
 const a=flight({id:'a',off:'10:00',on:'11:00'});
 const untimed=flight({id:'untimed',off:'',on:'11:00'});
 const equal=flight({id:'equal',off:'10:20',on:'10:20',mins:0});
 const sim={id:'sim',entryType:'simulator',date:'2026-10-21',simCategory:'FNPT II',
    simDevice:'',simQualification:'G2',stdMin:60,mins:0,off:'10:05',on:'10:55'};
 const report=analyze(draft([a,untimed,equal,sim]),[a,untimed,equal,sim]);
 assert.ok(!report.issues.some(i=>i.code==='overlapping-flight'));
 assert.ok(report.issues.some(i=>i.code==='utc-time'));
 assert.ok(report.issues.some(i=>i.code==='same-time'));
});
test('non-selected overlaps are not incorrectly included in a selected page review',()=>{
 const a=flight({id:'older1',off:'14:30',on:'18:00',mins:210});
 const b=flight({id:'older2',off:'15:00',on:'18:00',mins:180});
 const selected=flight({id:'selected',off:'06:00',on:'07:00'});
 const report=analyze(draft([selected]),[a,b,selected]);
 assert.ok(!report.issues.some(i=>i.code==='overlapping-flight'));
});
test('cross-flight overlap review stays purely read-only and never changes the input records',()=>{
 const a=flight({id:'a',off:'14:30',on:'18:00',mins:210});
 const b=flight({id:'b',off:'15:00',on:'18:00',mins:180});
 const d=draft([a,b]),all=[a,b],before=JSON.stringify({d,all,people});
 const report=analyze(d,all);
 assert.ok(report.critical>=1);
 assert.equal(JSON.stringify({d,all,people}),before);
});
test('selected exact draft must be reviewed, changed page count invalidates review, and print and archive both gate',()=>{
 const s=read('source/app/05-archive-and-corrections.js');
 const lines=s.slice(s.indexOf('function v229ArchiveReviewed('),s.indexOf('function v229OpenReviewFlight('));
 assert.match(lines,/pendingArchiveReview===JSON\.stringify\(draft\)/);
 assert.match(s,/pendingArchivePreview=null;pendingArchiveReview=null; \/\/ Review and preview must match/);
 assert.match(s,/if\(!v229ArchiveReviewed\(draft\)\)\{go\("archivereview"\);return;\}/);
 assert.match(s,/if\(!v229ArchiveReviewed\(draft\)\)\{\s*alert\("The reviewed flight batch changed/);
 assert.match(s,/id="v229Acknowledge"/);
 assert.match(s,/Continue to print archive/);
 assert.match(s,/Step 1 — Pre-archive flight review/);
 assert.match(s,/Preview \/ Print pages/);
 assert.match(s,/Confirm printed & signed/);
 assert.match(s,/if\(!confirm\(/);
 assert.doesNotMatch(read('prearchive-review.js'),/localStorage|\.update\(|\.insert\(|\.delete\(|\.setItem\(/);
});
test('Help guide teaches onboarding, cloud sync, recovery, and new pre-archive review',()=>{
 const guide=read('source/app/13-help-guide.js');
 for(const term of ['Pre-archive flight review','Review flights before printing',
  'Check sign-in connection','one shared cloud logbook','Restore these missing records','V2.33.5',
  'repeat the review','brand-new device'])assert.ok(guide.toLowerCase().includes(term.toLowerCase()),term);
 assert.match(guide,/htmlEscape\(step\)/);
});
test('V2.33.5 external checker is versioned, cached offline and restricted to the test release',()=>{
 const html=read('source/index.template.html');
 const sw=read('service-worker.js');
 assert.match(html,/prearchive-review\.js\?v=2\.29/);
 assert.match(sw,/prearchive-review\.js\?v=2\.29/);
 assert.match(sw,/helilog-v2-33-5-bold-recency-1/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.33\.5'/);
 const route=read('source/app/13-routing-and-boot.js');
 assert.match(route,/archivereview:v229PreArchiveReview/);
 assert.match(route,/v==='archivereview'/);
 assert.doesNotMatch(read('print.js'),/v229PreArchiveReview/);
 assert.doesNotMatch(read('archive-integrity.js'),/v229PreArchiveReview/);
});
