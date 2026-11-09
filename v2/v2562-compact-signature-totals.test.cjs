'use strict';
/* V2.56.2: signature information is disclosed on demand in the Totals card,
 * with no change to signer eligibility, countersignature evidence or time. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const source=read('source/app/09-totals.js');
const begin=source.indexOf('function totals(){');
const end=source.indexOf('\nfunction editBroughtForwardTotals()',begin);
assert.ok(begin===0&&end>begin,'Isolated Totals renderer');
const render=source.slice(begin,end);
const fmt=n=>{
 const mins=Number(n||0);
 return Math.floor(mins/60)+':'+String(mins%60).padStart(2,'0');
};
function page(sums,roleTotals={}){
 const orig=JSON.stringify(sums),flights=[{role:'SPIC',mins:210},{role:'PICUS',mins:665}];
 const app={innerHTML:''};
 const ctx={app,window:{HeliLogV254Certification:{sums:()=>sums}},
   confirmedCorrections:()=>[],header:()=>'',calcTotals:()=>({
     total:875,pic:875,copilot:0,dual:0,spic:210,picus:665,night:60,ifr:0,
     ...roleTotals
   }),combinedTotalsByType:()=>[],specialisedTotals:()=>[],
   effectiveFlights:()=>flights,isSimulatorSession:()=>false,
   previousEngineUnallocated:()=>0,previousPilotUnallocated:()=>0,
   fmt,htmlEscape:v=>String(v),Number,Math,Map,Object};
 vm.createContext(ctx);vm.runInContext(render,ctx);vm.runInContext('totals()',ctx);
 assert.equal(JSON.stringify(sums),orig,'Countersignature totals are not mutated');
 return app.innerHTML;
}
test('both roles fully digitally signed: one compact closed summary instead of four visible paragraphs',()=>{
 const html=page({signedSpic:210,signedPicus:665,pendingSpic:0,pendingPicus:0,invalid:0});
 const summary=html.match(/<details class="v2562-signature-details"[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>/);
 assert.ok(summary);
 assert.match(summary[1],/PICUS\/SPIC signatures/);
 assert.match(summary[1],/14:35 digitally signed/);
 assert.doesNotMatch(summary[1],/without digital certification|need review/);
 assert.doesNotMatch(html,/<details class="v2562-signature-details"[^>]*\sopen(?:\s|>)/);
 assert.match(html,/<div>SPIC: 3:30 signed · 0:00 not electronically certified<\/div>/);
 assert.match(html,/<div>PICUS: 11:05 signed · 0:00 not electronically certified<\/div>/);
 assert.match(html,/<p>Night [\s\S]*?<\/p>\s*<p>IFR/);
});
test('uncertified time and invalid evidence remain noticeable in collapsed summary',()=>{
 const html=page({signedSpic:60,signedPicus:40,pendingSpic:90,pendingPicus:20,invalid:2});
 const summary=html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1];
 assert.match(summary,/1:40 digitally signed/);
 assert.match(summary,/1:50 without digital certification/);
 assert.match(summary,/2 need review/);
 assert.match(html,/SPIC: 1:00 signed · 1:30 not electronically certified/);
 assert.match(html,/PICUS: 0:40 signed · 0:20 not electronically certified/);
 assert.match(html,/2 record\(s\) have mismatched digital evidence/);
 assert.match(html,/Earlier paper signatures are not automatically recognised/);
 assert.match(html,/qualifying PIC\/FI certification for licensing use/);
});
test('paper-only SPIC/PICUS totals without any digital evidence do not create an empty widget',()=>{
 const html=page({signedSpic:0,signedPicus:0,pendingSpic:0,pendingPicus:0,invalid:0},
  {spic:210,picus:665});
 assert.doesNotMatch(html,/v2562-signature-details|PICUS\/SPIC signatures/);
 assert.match(html,/SPIC <span style="float:right">3:30<\/span>/);
 assert.match(html,/PICUS <span style="float:right">11:05<\/span>/);
 assert.match(html,/<p>Night/);
});
test('test-only version, PWA cache and help note match the new compact presentation',()=>{
 assert.match(read('source/index.template.html'),/HeliLog V2\.56\.2 — Compact Signature Totals · Test/);
 assert.match(read('index.html'),/V2\.56\.2 · TEST ENVIRONMENT/);
 assert.match(read('manifest.webmanifest'),/HeliLog V2\.56\.2 — Compact Signature Totals Test/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.56\.2'/);
 assert.match(read('service-worker.js'),/helilog-v2-56-2-compact-signatures-1/);
 assert.match(read('source/app/13-help-guide.js'),/v:"V2\.56\.2",name:"Compact PICUS\/SPIC certification summary"/);
});
