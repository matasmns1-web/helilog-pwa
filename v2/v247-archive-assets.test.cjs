'use strict';
/* V2.47: archived aircraft/pilots are reversible visibility metadata, not deleted logbook records. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const assets=read('source/app/07-aircraft-and-people.js');
const flights=read('source/app/06-flights-and-night.js');
const endorsements=read('source/app/08-endorsements.js');
const totals=read('source/app/09-totals.js');
const cloud=read('cloud-sync.js');
function fixture(){
 const S={
  aircraft:[{id:'old',icao:'G2CA',reg:'OLD-001',engine:'Single engine',manufacturer:'Guimbal',model:'Cabri G2',inactive:true},
    {id:'new',icao:'R44',reg:'NEW-001',engine:'Single engine',manufacturer:'Robinson',model:'R44'}],
  people:[{id:'me',name:'Account Holder',isAccountHolder:true},
   {id:'teacher',name:'Old Instructor',role:'Instructor',inactive:true,savedSignatureData:'data:image/png;base64,YWJj'},
   {id:'active',name:'Current Instructor',role:'Instructor'}],
  flights:[{id:'historical',aid:'old',picPersonId:'teacher',picName:'Old Instructor',mins:90}],
  endorsements:[{id:'end1',signatoryPersonId:'teacher',title:'Historic endorsement',signatureData:'saved'}],
  printArchive:{batches:[{id:'signed',flightIds:['historical']}]}
 };
 let saves=0,allowSave=true,confirms=0,where='';
 const ctx={
  S,app:{innerHTML:''},effectiveFlights:()=>S.flights,
  engineCode:()=> 'SE',fmt:n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0'),
  isSimulatorSession:()=>false,htmlEscape:x=>String(x??''),
  header:(title,subtitle,actions)=>'<header>'+title+' '+subtitle+' '+actions+'</header>',
  v227IsPNG:x=>typeof x==='string'&&x.startsWith('data:image/png;base64,'),
  save:()=>{saves++;return allowSave;},
  confirm:()=>{confirms++;return true;},
  personById:id=>S.people.find(p=>p.id===id),
  go:page=>{where=page;if(page==='aircraft')ctx.aircraft();if(page==='pilots')ctx.pilots();}
 };
 vm.createContext(ctx);
 vm.runInContext(assets,ctx);
 return {ctx,S,get saves(){return saves},get confirms(){return confirms},setCanSave:yes=>{allowSave=yes}};
}
test('inactive helicopter does not appear among active cards but stays accessible under Archived',()=>{
 const s=fixture();s.ctx.aircraft();
 assert.match(s.ctx.app.innerHTML,/NEW-001/);
 assert.doesNotMatch(s.ctx.app.innerHTML,/OLD-001/);
 assert.match(s.ctx.app.innerHTML,/Archived aircraft \(1\)/);
 vm.runInContext('showArchivedAircraft=true',s.ctx);s.ctx.aircraft();
 assert.match(s.ctx.app.innerHTML,/OLD-001/);
 assert.doesNotMatch(s.ctx.app.innerHTML,/NEW-001/);
 assert.match(s.ctx.app.innerHTML,/1:30/);
 s.ctx.toggleAircraftInactive('old');
 assert.equal(s.S.aircraft[0].inactive,false);
 assert.equal(s.S.flights[0].aid,'old');
 assert.equal(s.S.flights[0].mins,90);
 assert.equal(s.S.printArchive.batches[0].flightIds[0],'historical');
 assert.equal(s.saves,1);
});
test('archiving a currently active aircraft is reversible and does not touch same-type totals',()=>{
 const s=fixture();const snapshot=JSON.stringify({flights:s.S.flights,archive:s.S.printArchive,endorsements:s.S.endorsements});
 s.ctx.toggleAircraftInactive('new');
 assert.equal(s.S.aircraft[1].inactive,true);assert.equal(s.confirms,1);
 s.ctx.toggleAircraftInactive('new');
 assert.equal(s.S.aircraft[1].inactive,false);
 assert.equal(JSON.stringify({flights:s.S.flights,archive:s.S.printArchive,endorsements:s.S.endorsements}),snapshot);
 assert.match(totals,/combinedTotalsByType\(\)/);
 assert.doesNotMatch(totals,/inactive===true|inactive!==true/);
});
test('archived pilot is excluded from active list, and account holder cannot be archived',()=>{
 const s=fixture();s.ctx.pilots();
 assert.match(s.ctx.app.innerHTML,/Account Holder/);
 assert.match(s.ctx.app.innerHTML,/Current Instructor/);
 assert.doesNotMatch(s.ctx.app.innerHTML,/Old Instructor/);
 vm.runInContext('showArchivedPilots=true',s.ctx);s.ctx.pilots();
 assert.match(s.ctx.app.innerHTML,/Old Instructor/);
 assert.match(s.ctx.app.innerHTML,/Signature/);
 s.ctx.togglePersonInactive('me');
 assert.equal(s.S.people[0].inactive,undefined);
 s.ctx.togglePersonInactive('teacher');
 assert.equal(s.S.people[1].inactive,false);
 assert.ok(s.S.people[1].savedSignatureData);
 assert.equal(s.S.flights[0].picPersonId,'teacher');
 assert.equal(s.S.endorsements[0].signatoryPersonId,'teacher');
});
test('failed local save restores inactive state for both aircraft and people',()=>{
 const s=fixture();s.setCanSave(false);
 s.ctx.toggleAircraftInactive('new');s.ctx.togglePersonInactive('active');
 assert.equal(s.S.aircraft[1].inactive,undefined);
 assert.equal(s.S.people[2].inactive,undefined);
 assert.equal(s.saves,2);
});
test('new flight and endorsement selections omit inactive assets; edits preserve their original selection',()=>{
 assert.match(flights,/S\.aircraft\.filter\(a=>a\.inactive!==true \|\| \(editing && existing\.aid===a\.id\)\)/);
 assert.match(flights,/S\.people\.filter\(p=>!p\.isAccountHolder&&p\.inactive!==true\)/);
 assert.match(flights,/lastFlight\.aid && a\.inactive!==true/);
 assert.match(flights,/!editingFlightId && ac\(\$\('#aid'\)\.value\)\?\.inactive===true/);
 assert.match(endorsements,/p\.inactive!==true \|\| \(editId && e\.signatoryPersonId===p\.id\)/);
 assert.match(cloud,/payload:clone\(entry\)/);
});
