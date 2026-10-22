/* V2.23 — Quick Entry uses the normal flight form, validation and save flow. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const source=fs.readFileSync(path.join(root,'source/app/06-flights-and-night.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'index.html'),'utf8');

function formHarness(existing=null){
  let markup='';
  const fields=new Map();
  const classes=new Set();
  const buttons=['quick','full'].map(entryMode=>({
    dataset:{entryMode},attrs:{},classes:new Set(),
    classList:{toggle(name,on){if(on)this.owner.classes.add(name);else this.owner.classes.delete(name);}},
    setAttribute(name,value){this.attrs[name]=value}
  }));
  for(const button of buttons)button.classList.owner=button;
  const form={
    classList:{toggle(name,on){const next=typeof on==='boolean'?on:!classes.has(name);if(next)classes.add(name);else classes.delete(name);return next;}},
    querySelectorAll(sel){return sel==='[data-entry-mode]'?buttons:[]},
    addEventListener(){}
  };
  const app={};
  Object.defineProperty(app,'innerHTML',{get(){return markup},set(value){
    markup=value;
    for(const match of markup.matchAll(/\bid="([a-zA-Z][a-zA-Z0-9_]*)"/g)){
      if(!fields.has(match[1]))fields.set(match[1],{
        value:'',dataset:{},style:{},checked:false,hidden:false,attrs:{},
        addEventListener(){},classList:{remove(){},add(){}},setAttribute(name,value){this.attrs[name]=value;}
      });
    }
  }});
  const doc={
    getElementById(id){return id==='flightForm'?form:fields.get(id)||null},
    querySelector(){return {checked:true}},
    querySelectorAll(){return []}
  };
  const record=existing?{id:'f1',date:'2026-10-20',aid:'g2',role:'PIC',dep:'EYVI',arr:'EYVI',off:'10:00',on:'11:00',mins:60,
    takeoffDay:1,landingDay:1,nightMin:0,ifrMin:0,pilotConfig:'single'}:null;
  const browser={
    console,document:doc,app,editingFlightId:null,correctingArchivedId:null,
    S:{aircraft:[{id:'g2',icao:'G2CA',reg:'LY-CAB'}],flights:record?[record]:[],people:[],pilot:{name:'Test Pilot'}},
    SPECIAL_OPS:[],
    $:selector=>fields.get(selector.slice(1)),
    header:()=>'',htmlEscape:value=>String(value),
    europeanDateField:()=>'<input id="date">',formatDate:value=>value,
    isArchivedFlight:()=>false,effectiveFlight:f=>f,effectiveFlights:()=>[],
    compareFlightsNewest:()=>0,displayPICName:()=> 'SELF',flightPilotConfig:()=> 'single',fmt:()=> '0:00',
    populateTimePicker:()=>{},markFlightFormDirty:()=>{},v218InitNight:()=>{},updateSpecialOpsPreview:()=>{},
    toggleInstructorTime:()=>{},updateAircraftEngineInfo:()=>{},roleChanged:()=>{}
  };
  browser.window=browser;
  vm.createContext(browser);
  vm.runInContext(source,browser,{filename:'06-flights-and-night.js'});
  // Keep the form rendering and mode implementation real. The complex calculations
  // are already covered by their own regression tests and should not run in this DOM stub.
  vm.runInContext('v218InitNight=()=>{};updateSpecialOpsPreview=()=>{};updateAircraftEngineInfo=()=>{};roleChanged=()=>{};',browser);
  if(existing)browser.add('f1',true);else browser.quickAdd();
  if(!existing){fields.get('role').value='PIC';browser.updateQuickPICVisibility();}
  return {browser,fields,form,classes,buttons,get markup(){return markup}};
}

test('mobile navigation and dashboard open Quick Entry while full entry remains available',()=>{
  assert.match(html,/<button data-v="quickadd"><span class="navicon">＋<\/span><span>Flight<\/span><\/button>/);
  assert.match(html,/quickadd:quickAdd/);
  assert.match(html,/go\('quickadd'\)/);
  assert.match(html,/go\('add'\)/);
  assert.match(html,/v!=='add'&&v!=='quickadd'/);
});

test('Quick Entry shows core fields but retains advanced fields in the same DOM',()=>{
  const ui=formHarness();
  assert.ok(ui.classes.has('quick-entry-active'));
  assert.match(ui.markup,/id="date"/);
  for(const id of ['aid','dep','off','arr','on','mins','role','picName','toDay','toNight',
    'nightAuto','nightMin','ifrMin','crossCountry','remarks','ldgDay','ldgNight','instrMin']){
    assert.ok(ui.fields.has(id),'Missing flight field: '+id);
  }
  assert.match(ui.markup,/id="saveFlightBtn"[^>]+onclick="saveFlight\(\)"/);
  assert.match(css,/#flightForm\.quick-entry-active \.quick-entry-advanced\s*\{display:none!important\}/);
  assert.match(ui.markup,/class="formgrid quick-entry-advanced"/);
  assert.match(ui.markup,/id="moreDetails" class="quick-entry-advanced"/);
  assert.equal(ui.buttons[0].attrs['aria-pressed'],'true');
  assert.equal(ui.buttons[1].attrs['aria-pressed'],'false');
  assert.equal(ui.fields.get('quickEntryHint').hidden,false);
});

test('switching Quick/Full preserves unsaved inputs and never recreates the form',()=>{
  const ui=formHarness();
  ui.fields.get('off').value='09:15';
  ui.fields.get('arr').value='EYKA';
  ui.fields.get('ifrMin').value='25';
  ui.fields.get('ldgDay').value='2';
  const original=ui.form;
  const markup=ui.markup;
  ui.browser.setFlightEntryMode('full');
  assert.ok(!ui.classes.has('quick-entry-active'));
  assert.equal(ui.fields.get('quickEntryHint').hidden,true);
  assert.equal(ui.buttons[1].attrs['aria-pressed'],'true');
  ui.browser.setFlightEntryMode('quick');
  assert.ok(ui.classes.has('quick-entry-active'));
  assert.equal(ui.form,original);
  assert.equal(ui.markup,markup);
  assert.equal(ui.fields.get('off').value,'09:15');
  assert.equal(ui.fields.get('arr').value,'EYKA');
  assert.equal(ui.fields.get('ifrMin').value,'25');
  assert.equal(ui.fields.get('ldgDay').value,'2');
});

test('editing even when quick mode requested displays full original flight fields',()=>{
  const ui=formHarness(true);
  assert.ok(!ui.classes.has('quick-entry-active'));
  assert.doesNotMatch(ui.markup,/data-entry-mode="quick"/);
  assert.equal(ui.fields.get('dep').value,'EYVI');
  assert.equal(ui.fields.get('off').value,'10:00');
  assert.equal(ui.fields.get('ldgDay').value,1);
  assert.match(ui.markup,/onclick="saveFlight\(\)"/);
});

test('Quick Entry keeps operational safety and printing in the original code path',()=>{
  assert.match(source,/const nightAuto=\$\('#nightAuto'\)\.checked/);
  assert.match(source,/if\(!nightPreview\.ok\) return showFormError/);
  assert.match(source,/const specialOps=collectSpecialOps\(m\)/);
  assert.match(source,/const instructorTime=collectInstructorTime\(m\)/);
  assert.match(source,/const signature=flightFingerprintForRecord\(f\)/);
  assert.match(source,/if\(!save\(\)\)return/);
  assert.match(source,/let pilotConfig=document\.querySelector\('input\[name="pilotConfig"\]:checked'\)/);
  assert.match(source,/landing counts follow take-offs/i);
});

test('V2.32 Quick view collapses optional fields, without discarding them when switched',()=>{
  const ui=formHarness();
  assert.ok(ui.classes.has('quick-pic-self'),'PIC/SOLO must hide the automatic SELF field');
  assert.match(ui.markup,/id="quickExtraToggle"[^>]*aria-expanded="false"/);
  assert.match(ui.markup,/id="quickRemarks" class="field quick-entry-optional"/);
  assert.match(ui.markup,/id="crossCountry"/);
  ui.fields.get('remarks').value='Airfield training';
  ui.fields.get('crossCountry').checked=true;
  ui.browser.toggleQuickEntryExtras();
  assert.ok(ui.classes.has('quick-entry-extra-open'));
  assert.equal(ui.fields.get('quickExtraToggle').attrs['aria-expanded'],'true');
  ui.browser.setFlightEntryMode('full');
  ui.browser.setFlightEntryMode('quick');
  assert.equal(ui.fields.get('remarks').value,'Airfield training');
  assert.equal(ui.fields.get('crossCountry').checked,true);
  ui.browser.toggleQuickEntryExtras();
  assert.ok(!ui.classes.has('quick-entry-extra-open'));
  assert.equal(ui.fields.get('quickExtraToggle').attrs['aria-expanded'],'false');
});
test('V2.32 Quick PIC field responds to pilot function without changing stored name',()=>{
  const ui=formHarness();
  ui.fields.get('picName').value='SELF';
  assert.ok(ui.classes.has('quick-pic-self'));
  ui.fields.get('role').value='DUAL';
  ui.browser.updateQuickPICVisibility();
  assert.ok(!ui.classes.has('quick-pic-self'));
  assert.equal(ui.fields.get('picName').value,'SELF',
    'Compact view helper must never modify PIC data, original roleChanged() retains validation');
  ui.fields.get('role').value='SOLO';
  ui.browser.updateQuickPICVisibility();
  assert.ok(ui.classes.has('quick-pic-self'));
});
test('V2.32 invalid automatic night is surfaced in compact view when all flight details are entered',()=>{
  const ui=formHarness();
  for(const [id,value] of Object.entries({
    date:'22-10-2026',dep:'EYVI',off:'12:00',arr:'EYVI',on:'12:45'
  }))ui.fields.get(id).value=value;
  ui.fields.get('nightAuto').checked=true;
  ui.browser.updateQuickNightNotice({ok:false,reason:'Site coordinates unavailable'});
  assert.equal(ui.fields.get('quickNightNotice').hidden,false);
  assert.match(ui.fields.get('quickNightNotice').textContent,/coordinates unavailable/i);
  ui.fields.get('nightAuto').checked=false;
  ui.browser.updateQuickNightNotice({ok:true});
  assert.equal(ui.fields.get('quickNightNotice').hidden,true);
});
