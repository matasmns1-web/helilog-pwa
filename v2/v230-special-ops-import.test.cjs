'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const source=read('source/app/09-totals.js');
const domain=read('source/app/01-domain-and-navigation.js');
const OPS=['VRLL','HESLO1','HESLO2','HESLO3','HESLO4','HEC','NVIS','HHO','OFFSHORE','FIRE','MOUNTAIN','SURVEY']
 .map(code=>({code,label:code}));
function oneFunction(code,name){
 const start=code.indexOf('function '+name+'(');
 if(start<0)throw Error('Missing '+name);
 const first=code.indexOf('{',start);
 let depth=0,end=-1;
 for(let i=first;i<code.length;i++){
  if(code[i]==='{')depth++;
  if(code[i]==='}'&&!--depth){end=i+1;break;}
 }
 if(end<0)throw Error('Unclosed '+name);
 return code.slice(start,end);
}
function input(value=''){
 return {value,focus(){},scrollIntoView(){},classList:{add(){},remove(){}}};
}
function fixture(){
 const elements=new Map();
 const classes=new Set();
 elements.set('bfSpecialOpsModal',{
  classList:{add:s=>classes.add(s),remove:s=>classes.delete(s),contains:s=>classes.has(s)}});
 elements.set('bfSpecialOpsError',input());
 elements.set('bfSpecialOpsSummary',input());
 elements.set('bfError',input());
 const keys={bfTotal:'10:00',bfEngineSE:'10:00',bfEngineME:'',bfSingle:'10:00',
  bfMulti:'',bfPIC:'10:00',bfCopilot:'',bfDual:'',bfInstructor:'',bfSPIC:'',
  bfPICUS:'',bfNight:'',bfIFR:'',bfToDay:'',bfToNight:'',bfLdgDay:'',bfLdgNight:''};
 for(const [k,v] of Object.entries(keys))elements.set(k,input(v));
 for(const op of OPS)elements.set('bfSpecialOp_'+op.code,input());
 let writes=0;
 const S={broughtForward:{total:600,specialOps:{HESLO2:120}},broughtForwardByType:[],
  broughtForwardImported:true,broughtForwardImportedAt:'2026-10-21T10:00:00.000Z',
  printArchive:{batches:[]},flights:[]};
 const context=vm.createContext({
  S,SPECIAL_OPS:OPS,
  document:{getElementById:id=>elements.get(id),querySelectorAll:()=>[],
    querySelector:()=>({focus(){}})},
  fmt:n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0'),
  broughtForwardInputMinutes:v=>v?Math.floor(v/60)+':'+String(v%60).padStart(2,'0'):'',
  parseBroughtForwardMinutes:v=>{
   const str=String(v||'').trim();
   if(!str)return 0;
   if(/^\d+:[0-5]\d$/.test(str)){let [h,m]=str.split(':').map(Number);return h*60+m;}
   if(/^\d+(?:\.\d+)?$/.test(str))return Math.round(Number(str)*60);
   return null;
  },
  confirm:()=>true,
  save:()=>{writes++;return true;},
  settings:()=>{},
  alert:()=>{},
  Object,Number,String
 });
 for(const name of ['validPreviousSpecialOps','updateBroughtForwardSpecialOpsSummary',
  'openBroughtForwardSpecialOps','closeBroughtForwardSpecialOps','applyBroughtForwardSpecialOps',
  'saveBroughtForwardTotals']){
  const fn=oneFunction(source,name);
  vm.runInContext(fn,context);
 }
 vm.runInContext('let bfSpecialOpsDraft={...validPreviousSpecialOps(S.broughtForward.specialOps)};',context);
 return {ctx:context,S,elements,classes,get writes(){return writes;}};
}
test('all twelve existing specialised operation categories are available for historic import',()=>{
 for(const op of OPS)assert.ok(domain.includes("code:'"+op.code+"'"),op.code);
 assert.match(source,/SPECIAL_OPS\.map\(op=>.*bfSpecialOp_/s);
 assert.match(source,/role="dialog" aria-modal="true" aria-labelledby="bfSpecialOpsTitle"/);
 assert.match(read('source/app/13-routing-and-boot.js'),/closeBroughtForwardSpecialOps\(\)/);
});
test('existing imported HESLO2 time appears when opening popup and Cancel cannot alter persisted records',()=>{
 const f=fixture();
 vm.runInContext('openBroughtForwardSpecialOps()',f.ctx);
 assert.ok(f.classes.has('open'));
 assert.equal(f.elements.get('bfSpecialOp_HESLO2').value,'2:00');
 f.elements.get('bfSpecialOp_HESLO2').value='3:30';
 vm.runInContext('closeBroughtForwardSpecialOps()',f.ctx);
 assert.equal(f.S.broughtForward.specialOps.HESLO2,120);
 assert.equal(f.writes,0);
 vm.runInContext('openBroughtForwardSpecialOps()',f.ctx);
 assert.equal(f.elements.get('bfSpecialOp_HESLO2').value,'2:00');
});
test('Apply stages operations without a cloud or logbook write, and main Save commits nested settings atomically',()=>{
 const f=fixture();
 vm.runInContext('openBroughtForwardSpecialOps()',f.ctx);
 f.elements.get('bfSpecialOp_HESLO2').value='3:00';
 f.elements.get('bfSpecialOp_VRLL').value='1:30';
 vm.runInContext('applyBroughtForwardSpecialOps()',f.ctx);
 assert.equal(f.writes,0);
 assert.equal(f.S.broughtForward.specialOps.HESLO2,120);
 assert.equal(f.elements.get('bfSpecialOpsSummary').textContent,'2 operation categories entered');
 vm.runInContext('saveBroughtForwardTotals({preventDefault(){}})',f.ctx);
 assert.equal(f.writes,1);
 assert.equal(f.S.broughtForward.specialOps.HESLO2,180);
 assert.equal(f.S.broughtForward.specialOps.VRLL,90);
 assert.equal(f.S.broughtForward.total,600);
 assert.equal(f.S.flights.length,0,'No fictional flights must be generated');
});
test('operation categories may overlap and their sum may exceed total without being added to actual flight time',()=>{
 const f=fixture();
 vm.runInContext('openBroughtForwardSpecialOps()',f.ctx);
 f.elements.get('bfSpecialOp_HESLO2').value='9:00';
 f.elements.get('bfSpecialOp_VRLL').value='8:00';
 vm.runInContext('applyBroughtForwardSpecialOps()',f.ctx);
 vm.runInContext('saveBroughtForwardTotals({preventDefault(){}})',f.ctx);
 assert.equal(f.S.broughtForward.total,600);
 assert.equal(f.S.broughtForward.specialOps.HESLO2,540);
 assert.equal(f.S.broughtForward.specialOps.VRLL,480);
});
test('negative, invalid and longer-than-total operation times are refused before main form save',()=>{
 for(const value of ['11:00','oops','-1:00']){
  const f=fixture();
  vm.runInContext('openBroughtForwardSpecialOps()',f.ctx);
  f.elements.get('bfSpecialOp_VRLL').value=value;
  vm.runInContext('applyBroughtForwardSpecialOps()',f.ctx);
  assert.ok(f.classes.has('open'));
  assert.match(f.elements.get('bfSpecialOpsError').textContent,/VRLL must be/);
  assert.equal(f.S.broughtForward.specialOps.HESLO2,120);
  assert.equal(f.writes,0);
 }
});
test('main form total reduction cannot leave imported operations above actual historical flying time',()=>{
 const f=fixture();
 f.elements.get('bfTotal').value='1:00';
 f.elements.get('bfEngineSE').value='1:00';
 f.elements.get('bfSingle').value='1:00';
 f.elements.get('bfPIC').value='1:00';
 vm.runInContext('saveBroughtForwardTotals({preventDefault(){}})',f.ctx);
 assert.match(f.elements.get('bfError').textContent,/HESLO2 time exceeds/);
 assert.equal(f.writes,0);
 assert.equal(f.S.broughtForward.total,600);
});
test('signed archive locks imported specialised-operation correction along with existing previous totals',()=>{
 const f=fixture();
 f.S.printArchive.batches.push({id:'HL-001'});
 vm.runInContext('saveBroughtForwardTotals({preventDefault(){}})',f.ctx);
 assert.equal(f.writes,0);
 assert.equal(f.S.broughtForward.specialOps.HESLO2,120);
});
test('previous and newly logged specialised operation time remains separately attributable',()=>{
 const S={broughtForward:{specialOps:{VRLL:80,HESLO2:120}},flights:[]};
 const flights=[{id:'f1',specialOps:{VRLL:30,HESLO2:20}},{id:'f2',specialOps:{VRLL:10}}];
 const ctx=vm.createContext({S,SPECIAL_OPS:OPS,effectiveFlights:()=>flights,Number,Object});
 vm.runInContext(oneFunction(domain,'specialisedTotals'),ctx);
 const totals=vm.runInContext('specialisedTotals()',ctx);
 const vrll=totals.find(x=>x.code==='VRLL'),heslo=totals.find(x=>x.code==='HESLO2');
 assert.equal(vrll.flights,2);assert.equal(vrll.previousMinutes,80);
 assert.equal(vrll.recordedMinutes,40);assert.equal(vrll.minutes,120);
 assert.equal(heslo.flights,1);assert.equal(heslo.previousMinutes,120);
 assert.equal(heslo.recordedMinutes,20);assert.equal(heslo.minutes,140);
 assert.equal(totals.length,2);
});
test('legacy accounts without historical specialised operations remain unchanged',()=>{
 const S={broughtForward:{total:500},flights:[]};
 const ctx=vm.createContext({S,SPECIAL_OPS:OPS,effectiveFlights:()=>[],Number,Object});
 vm.runInContext(oneFunction(domain,'specialisedTotals'),ctx);
 assert.deepEqual(Array.from(vm.runInContext('specialisedTotals()',ctx)),[]);
});
test('historical category data uses existing revision-checked broughtForward cloud settings record',()=>{
 const sync=read('cloud-sync.js');
 assert.match(sync,/const settingNames=\[[^\]]*"broughtForward"/);
 assert.match(sync,/data\?\.\[name\]/);
 assert.match(sync,/data\[item\.id\]=clone\(item\.data\)/);
 assert.match(source,/next\.specialOps=previousOps/);
 assert.match(source,/if\(!save\(\)\)\{/);
 assert.match(read('source/app/03-import-and-integrity.js'),/Previous specialised-operation totals are malformed/);
 assert.match(source,/Previous<\/th><th>Recorded here<\/th><th>Combined/);
});
