'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const cert=require('./flight-certification.js');
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const person={id:'pPIC',name:'Capt. Test',licence:'ATPL(H)',licenceNumber:'1234',role:'PIC',savedSignatureData:PNG};
function flight(role='PICUS'){return{
 id:'f-test',entryType:'flight',date:'2026-11-04',aid:'helicopter1',
 dep:'EYVI',off:'10:00',arr:'EYKA',on:'11:30',mins:90,
 role,picName:person.name,picPersonId:person.id,pilotConfig:'multi',
 nightMin:0,ifrMin:0,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,
 remarks:'Training & practise',specialOps:{},recency:{},
 createdAt:'2026-11-04T11:30:00Z',updatedAt:'2026-11-04T11:31:00Z'};}
test('AMC1 FCL.050 PICUS and SPIC only need explicit PIC/FI countersignatures',()=>{
 assert.equal(cert.required(flight('PICUS')),true);
 assert.equal(cert.required(flight('SPIC')),true);
 for(const r of ['PIC','SOLO','DUAL','CO-PILOT'])assert.equal(cert.required(flight(r)),false);
 assert.equal(cert.required({...flight('PICUS'),entryType:'simulator'}),false);
 assert.equal(cert.status(flight('PICUS')),'pending');
 assert.equal(cert.status(flight('PIC')),'not-required');
});
test('saved-signature or drawn countersignature is flight-specific and survives profile changes',()=>{
 const f=flight();f.commanderCertification=cert.create(f,person,PNG,'saved-profile','2026-11-04T12:00:00.000Z');
 assert.equal(cert.status(f),'certified');
 assert.equal(f.commanderCertification.signedLicenceNumber,'1234');
 const rendered=cert.printRemarks(f,'Night & "IFR"');
 assert.match(rendered,/PICUS — Capt\. Test/);
 assert.match(rendered,/flight-commander-sig/);
 assert.match(rendered,/data:image\/png;base64,/);
 assert.match(rendered,/Night &amp; &quot;IFR&quot;/);
 person.savedSignatureData='';
 assert.equal(cert.status(f),'certified');
 f.updatedAt='2026-11-05T14:00:00Z';
 assert.equal(cert.status(f),'certified','modification timestamps are not certified facts');
});
test('changes to signed flight time, PIC identity or remarks invalidate certification and hide PNG',()=>{
 const base=flight();base.commanderCertification=cert.create(base,person,PNG,'drawn');
 for(const [key,value] of [['mins',91],['role','SPIC'],['picName','Another PIC'],['remarks','Changed'],['ifrMin',15],['date','2026-11-05'],['aid','new helicopter']]){
  const f={...base,[key]:value};
  assert.equal(cert.status(f),'invalid','changed field: '+key);
  const html=cert.printRemarks(f,'Changed');
  assert.doesNotMatch(html,/data:image\/png/);
  assert.match(html,/Signature verification needed/);
 }
});
test('reject any attempt to sign as logbook owner, wrong pilot, wrong role or arbitrary URL',()=>{
 const f=flight(),owner={...person,isAccountHolder:true};
 assert.throws(()=>cert.create(f,owner,PNG,'drawn'),/Only the recorded/);
 assert.throws(()=>cert.create(f,{...person,id:'another'},PNG,'drawn'),/Only the recorded/);
 assert.throws(()=>cert.create(f,{...person,name:'different'},PNG,'drawn'),/Only the recorded/);
 assert.throws(()=>cert.create(f,person,'javascript:alert(1)','drawn'),/Only the recorded/);
 assert.throws(()=>cert.create(f,person,PNG,'automatic'),/Only the recorded/);
 assert.throws(()=>cert.create(flight('DUAL'),person,PNG,'drawn'),/Only the recorded/);
 const signed=flight();signed.commanderCertification=cert.create(signed,person,PNG,'drawn');
 assert.throws(()=>cert.create(signed,person,PNG,'drawn'),/Only the recorded/);
});
test('unsigned legacy flights stay recorded but are not shown as digitally certified',()=>{
 const a=flight('PICUS'),b=flight('SPIC');
 b.commanderCertification=cert.create(b,person,PNG,'drawn');
 const result=cert.sums([a,b,flight('PIC'),{...a,role:'PICUS',mins:0}]);
 assert.equal(result.pendingPicus,90);
 assert.equal(result.signedSpic,90);
 assert.equal(result.signedPicus,0);
 assert.match(cert.printRemarks(a,'Original remarks'),/PIC\/FI signature: __________________/);
 assert.doesNotMatch(cert.printRemarks(a,'Original remarks'),/<img/);
 assert.match(cert.printRemarks(a,'Original remarks'),/Original remarks/);
});
test('malformed stored PNG, schema, signer or altered subject are never treated as countersigned',()=>{
 const signed=flight();signed.commanderCertification=cert.create(signed,person,PNG,'drawn');
 for(const changed of [
  {signatureData:'data:image/svg+xml;base64,AAAA'},
  {signedRecord:'not the flight'},
  {signerId:'somebody else'},
  {signedName:'another pilot'},
  {source:'automatic'},
  {version:2}]){
  const f={...signed,commanderCertification:{...signed.commanderCertification,...changed}};
  assert.equal(cert.status(f),'invalid');
  assert.doesNotMatch(cert.printRemarks(f,'test'),/<img/);
 }
});
test('UI requires explicit signing consent, protects signed flights and preserves archive workflow',()=>{
 const ui=read('source/app/08-flight-certification.js'),flights=read('source/app/06-flights-and-night.js'),
 archives=read('source/app/05-archive-and-corrections.js'),people=read('source/app/07-aircraft-and-people.js'),
 print=read('source/app/04-export-and-print.js'),total=read('source/app/09-totals.js');
 assert.match(ui,/v254ApproveCertification/);
 assert.match(ui,/setupEndorsementSignaturePad/);
 assert.match(ui,/v254ApplySavedCertification/);
 assert.match(ui,/v254ApplyDrawnCertification/);
 assert.match(ui,/v254WithdrawCertification/);
 assert.match(ui,/certificationHistory/);
 assert.match(ui,/isArchivedFlight\(id\)/);
 assert.match(flights,/v254CertificationMarkup\(f\)/);
 assert.match(flights,/Withdraw certification/);
 assert.match(flights,/\.commanderCertification/);
 assert.match(people,/f\.commanderCertification/);
 assert.match(archives,/code:"commander-certification"/);
 assert.match(print,/HeliLogV254Certification\?\.printRemarks/);
 assert.match(print,/\.flight-commander-sig/);
 assert.match(total,/signedPicus/);
 assert.match(total,/pendingPicus/);
});
test('assets, help, staging version and build script are wired for TEST only',()=>{
 const template=read('source/index.template.html'),worker=read('service-worker.js'),
 index=read('index.html'),guide=read('source/app/13-help-guide.js'),gate=read('auth-gate.js'),
 manifest=read('manifest.webmanifest'),build=read('../scripts/build-helilog-v2.cjs');
 assert.match(template,/src="\.\/flight-certification\.js\?v=2\.54"/);
 assert.match(worker,/flight-certification\.js\?v=2\.54/);
 assert.match(index,/V2\.55 · TEST ENVIRONMENT/);
 assert.match(index,/v254CertificationMarkup/);
 assert.match(guide,/V2\.54/);
 assert.match(gate,/HELILOG_TEST_VERSION='V2\.55'/);
 assert.match(manifest,/V2\.55 — Page Pilot Signature Test/);
 assert.match(build,/08-flight-certification\.js/);
});
