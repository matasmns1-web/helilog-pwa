'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const boot=read('source/app/13-routing-and-boot.js');
const css=read('source/base.css');
const formSource=read('source/app/06-flights-and-night.js');
function fixture(){
 const classes=new Set(),bodyClasses=new Set(),formClasses=new Set(['quick-entry-active']);
 let formBottom=595,navTop=690,headTop=56,keyboard=false,full=false;
 const form={classList:{contains:k=>formClasses.has(k)},
  getBoundingClientRect:()=>({bottom:formBottom})};
 const heading={getBoundingClientRect:()=>({top:headTop})};
 const nav={getBoundingClientRect:()=>({top:navTop})};
 const root={classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},scrollTop:0};
 const body={classList:{contains:k=>bodyClasses.has(k),add:k=>bodyClasses.add(k),remove:k=>bodyClasses.delete(k)}};
 let scrollCalls=[],requestCalls=0;
 const window={innerWidth:390,scrollY:0,
  scrollTo:(x,y)=>{scrollCalls.push([x,y]);window.scrollY=y;},
  getComputedStyle:()=>({display:'grid'}),
  requestAnimationFrame:cb=>{requestCalls++;cb();}};
 const document={documentElement:root,body,
  getElementById:id=>id==='flightForm'?form:null,
  querySelector:sel=>sel==='.mobile'?nav:sel==='#app > .top'?heading:null,
  activeElement:{tagName:'BODY'}};
 const ctx=vm.createContext({window,document,isMobileTypingField:()=>keyboard,
    Number,ResizeObserver:undefined});
 const start=boot.indexOf('let quickViewportObserver=null');
 const end=boot.indexOf('function updateMobileKeyboardUI(){',start);
 assert.ok(start>=0&&end>start,'viewport code present');
 vm.runInContext(boot.slice(start,end),ctx);
 return {window,document,form,classes,bodyClasses,formClasses,scrollCalls,
  setFormBottom:n=>{formBottom=n;},setNavTop:n=>{navTop=n;},
  setHeadTop:n=>{headTop=n;},setKeyboard:v=>{keyboard=v;},
  sync:()=>vm.runInContext('syncQuickFlightScrollLock()',ctx),
  scheduled:()=>vm.runInContext('scheduleQuickFlightScrollLock()',ctx),
  get scrollCallsCount(){return scrollCalls.length;},
  get requestCalls(){return requestCalls;},
 };
}
test('Quick entry fitting on screen locks body and disallows accidental dragging',()=>{
 const h=fixture();h.sync();
 assert.ok(h.classes.has('helilog-quick-scroll-locked'));
 assert.deepEqual(h.scrollCalls,[[0,0]]);
 assert.match(css,/html\.helilog-quick-scroll-locked body\s*\{\s*position:fixed;\s*inset:0;/);
 assert.match(css,/overflow-y:hidden!important/);
});
test('focusing a typing input releases lock immediately and permits normal keyboard scrolling',()=>{
 const h=fixture();h.sync();
 h.setKeyboard(true);h.bodyClasses.add('keyboard-open');h.sync();
 assert.equal(h.classes.has('helilog-quick-scroll-locked'),false);
 assert.equal(h.scrollCallsCount,1,'must not force scrollTo while keyboard is open');
 assert.match(boot,/updateMobileKeyboardUI\(\)\{[\s\S]*syncQuickFlightScrollLock\(\)/);
});
test('after keyboard closes, form returns to top and locks only if it still fits',()=>{
 const h=fixture();h.sync();h.setKeyboard(true);h.bodyClasses.add('keyboard-open');h.sync();
 h.window.scrollY=80;h.setFormBottom(515);
 h.setKeyboard(false);h.bodyClasses.delete('keyboard-open');h.sync();
 assert.equal(h.classes.has('helilog-quick-scroll-locked'),true);
 assert.deepEqual(h.scrollCalls,[[0,0],[0,0]]);
});
test('expanding optional details or showing an error unlocks when form is taller than available area',()=>{
 const h=fixture();h.sync();
 h.setFormBottom(730);h.sync();
 assert.equal(h.classes.has('helilog-quick-scroll-locked'),false);
 h.setFormBottom(610);h.sync();
 assert.equal(h.classes.has('helilog-quick-scroll-locked'),true);
});
test('short screen and hidden mobile dock never trap the form',()=>{
 const h=fixture();h.setNavTop(500);h.sync();
 assert.equal(h.classes.has('helilog-quick-scroll-locked'),false);
 h.setNavTop(690);h.setHeadTop(-30);h.sync();
 assert.equal(h.classes.has('helilog-quick-scroll-locked'),false);
});
test('Full mode and non-Quick screens do not lock',()=>{
 const h=fixture();h.sync();
 h.formClasses.delete('quick-entry-active');h.sync();
 assert.equal(h.classes.has('helilog-quick-scroll-locked'),false);
 h.formClasses.add('quick-entry-active');h.window.innerWidth=1024;h.sync();
 assert.equal(h.classes.has('helilog-quick-scroll-locked'),false);
});
test('form changes and all navigation routes recompute or release the scroll lock',()=>{
 assert.match(formSource,/function setFlightEntryMode\(mode\)[\s\S]*scheduleQuickFlightScrollLock/);
 assert.match(formSource,/function toggleQuickEntryExtras\(\)[\s\S]*scheduleQuickFlightScrollLock/);
 assert.match(formSource,/function updateQuickNightNotice\(outcome\)[\s\S]*scheduleQuickFlightScrollLock/);
 assert.match(boot,/function render\(\)\{\s*document\.documentElement\.classList\.remove\('helilog-quick-scroll-locked'\);/);
 assert.match(boot,/scheduleQuickFlightScrollLock\(\);\s*\}catch\(e\)/);
 assert.match(boot,/window\.visualViewport\.addEventListener\('resize',updateMobileKeyboardUI\)/);
});
test('locked mode has no data writes and keeps existing flight-save validation',()=>{
 const lock=boot.slice(boot.indexOf('let quickViewportObserver=null'),boot.indexOf('function updateMobileKeyboardUI(){'));
 assert.doesNotMatch(lock,/localStorage|sessionStorage|save\(|insert\(|update\(|fetch\(/);
 for(const part of ['function saveFlight()','function setFlightEntryMode(mode)','function v218UpdateNight()'])
  assert.ok(formSource.includes(part));
 assert.match(read('service-worker.js'),/helilog-v2-49-cloud-conflict-review-1/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.49'/);
});
