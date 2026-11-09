'use strict';
/* V2.55: Render a page-specific owner's signature and attestation INSIDE the
 * pilot signature cell, while retaining exact historic archive print formats.
 */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const src=read('source/app/04-export-and-print.js');
const start=src.indexOf('function v255AccountSignatureData(){');
const end=src.indexOf('\nlet pendingArchivePreview=null;',start);
assert.ok(start>=0 && end>start,'Page signature renderer found');
const renderer=src.slice(start,end);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAElFTkSuQmCC';
const emptyTotals={spSE:0,spME:0,multi:0,single:0,total:0,pic:0,copilot:0,dual:0,
 toDay:0,toNight:0,ldgDay:0,ldgNight:0,night:0,ifr:0,instructor:0,std:0};
const flight={id:'F1',date:'2026-11-05',dep:'EYVI',arr:'EYVI',off:'09:00',on:'10:00',
 mins:60,role:'PIC',picName:'SELF',aid:'a1',remarks:'Air work'};
function fixture(overrides={}){
 let html='',opened=0;
 const S={pilot:{name:'Account Holder',authority:'CAA'},people:[
  {id:'owner',name:'Account Holder',isAccountHolder:true,savedSignatureData:png},
  {id:'another',name:'Other Pilot',savedSignatureData:'data:image/png;base64,YWJjZA=='}]};
 if(overrides.owner!==undefined)S.people[0]={...S.people[0],...overrides.owner};
 if(overrides.pilotName)S.pilot.name=overrides.pilotName;
 const win={open(){
  opened++;
  return {document:{open(){},write(s){html=s},close(){}},focus(){}};
 }};
 const ctx={S,window:win,TEST_MODE:!!overrides.testMode,LOGBOOK_ROWS_PER_PAGE:3,
  v227IsPNG:s=>typeof s==='string'&&s.length<=250000&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s),
  fmt:n=>'0:'+String(Number(n||0)%60).padStart(2,'0'),
  htmlEscape:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  ac:()=>({icao:'G2CA',reg:'LY-ABC'}),flightPilotConfig:()=> 'single',engineCode:()=> 'SE',
  isSimulatorSession:()=>false,functionTime:()=>0,displayDate:x=>x,
  sumLogbookFields:()=>emptyTotals,addExportTotals:()=>emptyTotals,
  broughtForwardExportTotals:()=>emptyTotals,flightRemarksForDisplay:f=>f.remarks,
  pilotLicenceDisplay:()=> 'CPL(H)',alert:()=>{throw Error('Alert was not expected')},
  exportFlightsForScope:()=>[flight],signedHours:()=> '0:00'};
 vm.createContext(ctx);
 vm.runInContext(renderer,ctx);
 const options={flights:[flight],...(overrides.options||{})};
 assert.equal(ctx.exportPrintableLogbook(options),true);
 assert.equal(opened,1);
 return {html,ctx};
}
test('new pages put attestation and saved owner PNG INSIDE the signature table cell',()=>{
 const {html}=fixture();
 const cell=html.slice(html.indexOf('<td class="totals-signature-cell"'),html.indexOf('</td>',html.indexOf('<td class="totals-signature-cell"')));
 assert.match(cell,/PILOT SIGNATURE/);
 assert.match(cell,/pilot-page-cert-statement/);
 assert.match(cell,/I certify that the entries on this page are a true record of the flights shown above\./);
 assert.match(cell,/class="pilot-page-autosign"/);
 assert.ok(cell.includes('src="'+png+'"'));
 assert.doesNotMatch(html,/<div class="certification">/);
 assert.equal((html.match(/I certify that the entries on this page are a true record/g)||[]).length,1);
 assert.match(html,/\.totals-row td\{height:6\.6mm/);
 assert.match(html,/height:15\.8mm/);
});
test('no stored, incorrect-owner or mismatched profile signature leaves a handwriting space',()=>{
 for(const config of [
  {owner:{savedSignatureData:''}},{owner:{savedSignatureData:'javascript:alert(1)'}},
  {owner:{isAccountHolder:false}},{pilotName:'Different Person'}
 ]){
  const {html}=fixture(config);
  assert.match(html,/pilot-page-cert-statement/);
  assert.match(html,/pilot-page-hand-sign/);
  assert.doesNotMatch(html,/<img class="pilot-page-autosign"/);
 }
});
test('a new archive reprint uses the frozen PNG snapshot even if the profile changes',()=>{
 const {html}=fixture({owner:{savedSignatureData:'data:image/png;base64,YWJjZA=='},
  options:{archiveBatch:'HL-010',signatureLayoutVersion:1,pilotSignatureData:png,firstPage:10}});
 assert.match(html,/class="pilot-page-autosign"/);
 assert.ok(html.includes('src="'+png+'"'));
 assert.doesNotMatch(html,/src="data:image\/png;base64,YWJjZA=="/);
});
test('an earlier archived batch retains its exact old signature cell and separate footer',()=>{
 const {html}=fixture({options:{archiveBatch:'HL-001',paperLayoutVersion:1,pilotSignatureData:png,firstPage:1}});
 const cell=html.slice(html.indexOf('<td class="totals-signature-cell"'),html.indexOf('</td>',html.indexOf('<td class="totals-signature-cell"')));
 assert.match(cell,/PILOT SIGNATURE/);
 assert.doesNotMatch(cell,/pilot-page-cert-statement|pilot-page-autosign/);
 assert.match(html,/<div class="certification">/);
 assert.match(html,/\.totals-row td\{height:5\.3mm/);
});
test('archive preview freezes and passes same signature snapshot through confirmation and reprint',()=>{
 const archive=read('source/app/05-archive-and-corrections.js');
 assert.match(archive,/signatureLayoutVersion:1,/);
 assert.match(archive,/pilotSignatureData:v255AccountSignatureData\(\)/);
 assert.match(archive,/signatureLayoutVersion:draft\.signatureLayoutVersion,pilotSignatureData:draft\.pilotSignatureData/);
 assert.match(archive,/signatureLayoutVersion:b\.signatureLayoutVersion,pilotSignatureData:b\.pilotSignatureData/);
 assert.match(archive,/JSON\.stringify\(draft\)!==pendingArchivePreview/);
 assert.match(archive,/const finalBatch=JSON\.parse\(JSON\.stringify\(draft\)\)/);
 assert.doesNotMatch(archive,/b\.pilotSignatureData\s*=\s*v255AccountSignatureData\(\)/);
});
test('obsolete V1 prototype deletion text is removed without losing archive/signed-flight guards',()=>{
 const flights=read('source/app/06-flights-and-night.js');
 assert.doesNotMatch(flights,/This removes the flight from the V1 prototype/);
 assert.match(flights,/This will delete the unarchived flight from your logbook/);
 assert.match(flights,/If cloud sync is enabled, the deletion will sync to your other devices/);
 assert.match(flights,/A countersigned flight is protected/);
 assert.match(flights,/This flight is part of a confirmed print archive and cannot be deleted/);
});
test('all app assets and release notes are versioned for TEST only',()=>{
 const template=read('source/index.template.html'),app=read('index.html'),
  guide=read('source/app/13-help-guide.js'),worker=read('service-worker.js'),
  manifest=read('manifest.webmanifest'),gate=read('auth-gate.js');
 assert.match(template,/V2\.56\.2 · TEST ENVIRONMENT/);
 assert.match(app,/V2\.56\.2 · TEST ENVIRONMENT/);
 assert.match(app,/function v255AccountSignatureData\(\)/);
 assert.match(app,/pilot-page-autosign/);
 assert.match(guide,/v:"V2\.55",name:"Pilot signature inside the printed page box"/);
 assert.match(worker,/helilog-v2-56-2-compact-signatures-1/);
 assert.match(manifest,/HeliLog V2\.56\.2 — Compact Signature Totals Test/);
 assert.match(gate,/HELILOG_TEST_VERSION='V2\.56\.2'/);
});
