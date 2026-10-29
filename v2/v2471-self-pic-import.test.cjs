'use strict';
/* v2.47.1 — SELF belongs to the account holder; signed history is immutable. */
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const importer=read('source/app/03-import-and-integrity.js');
const assets=read('source/app/07-aircraft-and-people.js');
const flightSource=read('source/app/06-flights-and-night.js');

function importFixture(){
 const S={
  pilot:{name:'Owner Pilot'},
  people:[{id:'owner',name:'Owner Pilot',isAccountHolder:true}],
  aircraft:[{id:'ac1',icao:'G2CA',reg:'TEST-A',manufacturer:'Guimbal',model:'Cabri G2',engine:'Single engine'}],
  flights:[]
 };
 const controls={importModal:{classList:{remove(){}},},
  importStatus:{innerHTML:''},importPreview:{innerHTML:''},
  confirmImportBtn:{disabled:false}};
 let saves=0;
 const ctx=vm.createContext({
  S,document:{getElementById:id=>controls[id]??null},
  effectiveFlights:()=>S.flights,isSimulatorSession:f=>f.entryType==='simulator',
  ownerPerson:()=>S.people[0],
  ensurePersonForName:name=>{
   let p=S.people.find(p=>p.name.toLowerCase()===name.toLowerCase());
   if(!p){p={id:'new-'+name,name};S.people.push(p);}
   return p;
  },
  parseExternalDate:()=> '2026-10-01',
  displayDate:x=>x,
  validSpecialOps:()=>({valid:true,ops:{}}),
  normalizeEngineConfig:v=>v,
  engineCode:()=> 'SE',htmlEscape:x=>String(x),
  fmt:n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0'),
  save:()=>{saves++;return true;},
  logbook:()=>{},setTimeout:cb=>cb(),alert:()=>{}
 });
 vm.runInContext('let pendingImport=null;',ctx);
 vm.runInContext(importer,ctx);
 return {ctx,S,controls,get saves(){return saves}};
}
function importedRow(role,picName,off){
 return {date:'2026-10-01',aircraft:{icao:'G2CA',reg:'TEST-A',manufacturer:'Guimbal',model:'Cabri G2',
  variant:'',engine:'Single engine'},dep:'EYVI',off,arr:'EYPA',on:'11:00',
  mins:60,role,picName,pilotConfig:'single',nightMin:0,ifrMin:0,
  takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,
  crossCountry:false,specialOps:{},remarks:''};
}
test('CSV PIC and SOLO SELF use the account holder, do not create a SELF profile',()=>{
 const f=importFixture();
 const items=[importedRow('PIC','SELF','08:00'),importedRow('SOLO',' self ','09:00'),
  importedRow('DUAL','Instructor Example','10:00')];
 f.ctx.pendingImport=items; // The test VM uses the same lexical pendingImport as HeliLog.
 vm.runInContext('pendingImport=globalThis.pendingImport',f.ctx);
 vm.runInContext('confirmCSVImport()',f.ctx);
 assert.equal(f.S.flights.length,3);
 for(const row of f.S.flights.slice(0,2)){
  assert.equal(row.picPersonId,'owner');assert.equal(row.picName,'SELF');
 }
 assert.equal(f.S.flights[2].picName,'Instructor Example');
 assert.equal(f.S.people.some(p=>p.name.toUpperCase()==='SELF'),false);
 assert.equal(f.saves,1);
});
test('PIC role always binds to account even when csv has account name instead of SELF',()=>{
 const f=importFixture();
 f.ctx.pendingImport=[importedRow('PIC','Owner Pilot','08:00')];
 vm.runInContext('pendingImport=globalThis.pendingImport;confirmCSVImport()',f.ctx);
 assert.equal(f.S.flights[0].picPersonId,'owner');
 assert.equal(f.S.flights[0].picName,'SELF');
 assert.equal(f.S.people.length,1);
});
test('CSV validation prevents SELF from being used as another function commander',async()=>{
 const f=importFixture();
 const headers=vm.runInContext('IMPORT_HEADERS',f.ctx);
 const data={date:'01-10-2026',icao_type:'G2CA',registration:'TEST-A',manufacturer:'Guimbal',
  model:'Cabri G2',departure:'EYVI',departure_time:'0800',arrival:'EYPA',arrival_time:'0900',
  total_time:'60',pilot_function:'DUAL',pic_name:'SELF',cross_country:'no'};
 const csv=[headers.join(','),headers.map(h=>data[h]??'').join(',')].join('\n');
 const file={text:async()=>csv};
 await vm.runInContext('handleCSVFile',f.ctx)({target:{files:[file]}});
 assert.match(f.controls.importStatus.innerHTML,/commander, not SELF/);
 assert.equal(f.controls.confirmImportBtn.disabled,true);
 assert.equal(f.S.people.length,1);
});
function repairFixture(opts={}){
 const owner={id:'owner',name:'Owner Pilot',isAccountHolder:true};
 const placeholder={id:'self',name:' SELF ',role:'Pilot',licence:'',notes:''};
 if(opts.signature)placeholder.savedSignatureData='data:image/png;base64,YWJj';
 const S={pilot:{name:'Owner Pilot'},people:[owner,placeholder],
  flights:[
   {id:'f1',role:'PIC',picName:'SELF',picPersonId:'self',mins:70},
   {id:'f2',role:'SOLO',picName:'SELF',picPersonId:'self',mins:50},
   {id:'f3',role:'PIC',picName:' SELF ',picPersonId:'',mins:40},
   ...(opts.archived?[{id:'signed',role:'PIC',picName:'SELF',picPersonId:'self',mins:60}]:[]),
   ...(opts.ambiguous?[{id:'dual',role:'DUAL',picName:'SELF',picPersonId:'self',mins:90}]:[])
  ],
  endorsements:opts.endorsement?[{id:'signedEnd',signatoryPersonId:'self',signatureData:'png'}]:[],
  printArchive:{batches:[{id:'historic',flightIds:['signed']}]}
 };
 let saveSuccess=true,saveCount=0,confirmCount=0;
 const ctx=vm.createContext({
  S,app:{innerHTML:''},document:{},
  personById:id=>S.people.find(p=>p.id===id),
  ownerPerson:()=>owner,
  isArchivedFlight:id=>id==='signed',
  isSimulatorSession:()=>false,
  save:()=>{saveCount++;return saveSuccess},
  alert:()=>{},
  confirm:()=>{confirmCount++;return true},
  pilots:()=>{},go:()=>{}
 });
 vm.runInContext(assets,ctx);
 return {S,ctx,owner,placeholder,setSave:v=>saveSuccess=v,get saveCount(){return saveCount},get confirms(){return confirmCount}};
}
test('manual repair relinks only unarchived owner PIC/SOLO and removes unused fake profile',()=>{
 const f=repairFixture();
 vm.runInContext("repairImportedSelfProfile('self')",f.ctx);
 assert.equal(f.saveCount,1);assert.equal(f.confirms,1);
 assert.deepEqual(f.S.flights.map(x=>x.picPersonId),['owner','owner','owner']);
 assert.deepEqual(f.S.flights.map(x=>x.picName),['SELF','SELF','SELF']);
 assert.equal(f.S.people.length,1);
 assert.equal(f.S.people[0].id,'owner');
});
test('archived flights, other pilot functions and signed endorsements are unchanged; SELF stays hidden if referenced',()=>{
 const f=repairFixture({archived:true,ambiguous:true,endorsement:true,signature:true});
 const frozen=JSON.stringify(f.S.flights.find(x=>x.id==='signed'));
 const dual=JSON.stringify(f.S.flights.find(x=>x.id==='dual'));
 const endorsement=JSON.stringify(f.S.endorsements);
 const signature=f.placeholder.savedSignatureData;
 vm.runInContext("repairImportedSelfProfile('self')",f.ctx);
 assert.equal(JSON.stringify(f.S.flights.find(x=>x.id==='signed')),frozen);
 assert.equal(JSON.stringify(f.S.flights.find(x=>x.id==='dual')),dual);
 assert.equal(JSON.stringify(f.S.endorsements),endorsement);
 assert.equal(f.placeholder.savedSignatureData,signature);
 assert.equal(f.placeholder.inactive,true);
 assert.equal(f.S.people.length,2);
 assert.equal(f.S.flights[0].picPersonId,'owner');
 assert.equal(f.S.printArchive.batches[0].flightIds[0],'signed');
});
test('failed storage save restores all person and flight links',()=>{
 const f=repairFixture();const snapshot=JSON.stringify(f.S);
 f.setSave(false);
 vm.runInContext("repairImportedSelfProfile('self')",f.ctx);
 assert.equal(JSON.stringify(f.S),snapshot);
 assert.equal(f.saveCount,1);
});
test('SELF repair button appears only for non-owner legacy pseudo-profile',()=>{
 assert.match(assets,/isLegacySelfPilotProfile\(p\)\?/);
 assert.match(assets,/Repair SELF imports/);
 assert.match(assets,/!isArchivedFlight\(f.id\)/);
 assert.match(flightSource,/picName\.toUpperCase\(\)==='SELF'/);
 assert.match(read('cloud-sync.js'),/payload:clone\(entry\)/);
});
