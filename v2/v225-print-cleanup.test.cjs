/* V2.25 — print/export markup must never include developer comments. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'source/app/04-export-and-print.js'),'utf8');
const aircraft={id:'a1',icao:'G2CA',reg:'TEST-1',engine:'SE'};

function makeFlight(picName){
  return {id:'f1',date:'2026-10-20',aid:'a1',dep:'DEPA',arr:'ARRA',off:'10:00',on:'11:00',
    mins:60,role:'PIC',picName,pilotConfig:'single',takeoffDay:1,landingDay:1,
    nightMin:0,ifrMin:0,remarks:'Completed training'};
}

function renderPrint(flight,additionalOptions={}){
  let documentHTML='';
  const popup={document:{open(){},write(html){documentHTML=html},close(){}},focus(){}};
  const browser={
    TEST_MODE:true,
    S:{pilot:{name:'Test Pilot',licence:'TEST',authority:'TEST'},broughtForward:{}},
    window:{open(){return popup}},
    alert(message){throw new Error(message)},
    isSimulatorSession(){return false},
    flightPilotConfig(f){return f.pilotConfig||'single'},
    engineCode(){return 'SE'},
    ac(){return aircraft},
    displayDate(value){return value},
    fmt(minutes){return `${Math.floor(Number(minutes||0)/60)}:${String(Number(minutes||0)%60).padStart(2,'0')}`},
    flightRemarksForDisplay(f){return f.remarks||''},
    pilotLicenceDisplay(){return 'TEST'}
  };
  vm.createContext(browser);
  vm.runInContext(source,browser,{filename:'04-export-and-print.js'});
  const result=browser.exportPrintableLogbook({flights:[flight],aircraft:[aircraft],
    pilot:{name:'Test Pilot',licence:'TEST',authority:'TEST'},...additionalOptions});
  assert.equal(result,true);
  return documentHTML;
}

test('normal PDF export contains only actual logbook rows, not the leaked PIC developer comment',()=>{
  const flight=makeFlight('SELF');
  const before=JSON.stringify(flight);
  const html=renderPrint(flight);
  assert.doesNotMatch(html,/For historical printed records|retained to keep reprints unchanged|New PIC\/SOLO flights store SELF/i);
  assert.match(html,/<div class="title">PILOT LOG BOOK<\/div>/);
  assert.match(html,/<td class="pic-name">SELF<\/td>/);
  const row=html.match(/<tr class="flight-row">([\s\S]*?)<\/tr>/)?.[1];
  assert.ok(row,'Printed flight row missing');
  assert.equal((row.match(/<td\b/g)||[]).length,27,'27-column paper format must remain unchanged');
  assert.equal(JSON.stringify(flight),before,'Printing must not change saved records');
});

test('archive and legacy print preserve PIC names and layouts without stray text',()=>{
  const flight=makeFlight('Original Commander');
  const before=JSON.stringify(flight);
  for(const paperLayoutVersion of [undefined,1]){
    const html=renderPrint(flight,{archiveBatch:'ARCH-001',firstPage:1,blockUnusedRows:true,
      ...(paperLayoutVersion?{paperLayoutVersion}:{})});
    assert.doesNotMatch(html,/For historical printed records|retained to keep reprints unchanged|New PIC\/SOLO flights store SELF/i);
    assert.match(html,/<td class="pic-name">Original Commander<\/td>/);
    assert.match(html,/Batch ARCH-001/);
    assert.match(html,/— UNUSED —/);
    const row=html.match(/<tr class="flight-row">([\s\S]*?)<\/tr>/)?.[1];
    assert.equal((row.match(/<td\b/g)||[]).length,paperLayoutVersion===1?26:27);
  }
  assert.equal(JSON.stringify(flight),before,'Archive reprinting must not modify stored records');
});
