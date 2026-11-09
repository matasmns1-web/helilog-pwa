'use strict';
/* V2.56.3: Totals shows SPIC/PICUS hours without any digital-signature status.
 * Flight-specific commander/FI signatures, signing requirements and print
 * archive validation remain part of the existing separate modules. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const totals=read('source/app/09-totals.js');
const a=totals.indexOf('function totals(){'),b=totals.indexOf('\nfunction editBroughtForwardTotals()',a);
assert.ok(a>=0&&b>a);
const source=totals.slice(a,b);
const fmt=n=>Math.floor(Number(n||0)/60)+':'+String(Number(n||0)%60).padStart(2,'0');
function render(sums){
  const app={innerHTML:''},flights=[{id:'f1',role:'SPIC',mins:210},{id:'f2',role:'PICUS',mins:665}];
  const context={app,window:{HeliLogV254Certification:{sums(){throw Error('Totals must not invoke digital signature statuses')}}},
    header:()=>'',confirmedCorrections:()=>[],calcTotals:()=>({
      total:875,pic:875,copilot:0,dual:0,spic:210,picus:665,night:72,ifr:27,
      engineSE:875,engineME:0,single:875,multi:0,
      toDay:2,toNight:0,ldgDay:2,ldgNight:0,
    }),combinedTotalsByType:()=>[],specialisedTotals:()=>[],
    effectiveFlights:()=>flights,isSimulatorSession:()=>false,
    previousEngineUnallocated:()=>0,previousPilotUnallocated:()=>0,
    fmt,htmlEscape:v=>String(v),Number,Object,Map,Math
  };
  vm.createContext(context);vm.runInContext(source,context);vm.runInContext('totals()',context);
  return app.innerHTML;
}
test('Totals shows the normal SPIC/PICUS/Night/IFR rows with no signing status',()=>{
  const html=render();
  assert.match(html,/Additional breakdown/);
  assert.match(html,/<p>SPIC <span style="float:right">3:30<\/span><\/p>/);
  assert.match(html,/<p>PICUS <span style="float:right">11:05<\/span><\/p>/);
  assert.match(html,/<p>Night <span style="float:right">1:12<\/span><\/p>/);
  assert.match(html,/<p>IFR <span style="float:right">0:27<\/span><\/p>/);
  assert.doesNotMatch(html,/v2562-signature-details|PICUS\/SPIC signatures|digitally signed|Digitally countersigned flight time|not electronically certified|without digital certification|signature needs re-verification/);
  assert.doesNotMatch(source,/HeliLogV254Certification|showSignatureSummary|signedSpic|pendingPicus/);
});
test('flight certification and archive protections remain in their own modules',()=>{
  const certification=read('flight-certification.js');
  const ui=read('source/app/08-flight-certification.js');
  const archive=read('source/app/05-archive-and-corrections.js');
  assert.match(certification,/function status\(f\)/);
  assert.match(certification,/function sums\(flights\)/);
  assert.match(ui,/v254ApproveCertification/);
  assert.match(archive,/commander-certification/);
  assert.match(read('source/app/04-export-and-print.js'),/HeliLogV254Certification\?\.printRemarks/);
});
test('release metadata and help note describe TEST-only presentation change',()=>{
  assert.match(read('source/index.template.html'),/HeliLog V2\.56\.3 — Clean Totals · Test/);
  assert.match(read('index.html'),/V2\.56\.3 · TEST ENVIRONMENT/);
  assert.match(read('manifest.webmanifest'),/HeliLog V2\.56\.3 — Clean Totals Test/);
  assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.56\.3'/);
  assert.match(read('service-worker.js'),/helilog-v2-56-3-clean-totals-1/);
  assert.match(read('source/app/13-help-guide.js'),/v:"V2\.56\.3",name:"Simpler Totals without signature-status indicators"/);
});
