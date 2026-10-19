/* Run: node --test v2/flights.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const F=require("./flights.js");
const D=require("./domain.js");
const S=require("./storage.js");
const AT="2026-10-14T09:30:00.000Z",NEXT="2026-10-14T10:00:00.000Z";
function setup(){
 let state=D.newState("v2-test",AT);
 state=D.addPerson(state,{id:"me",name:"Test Account Holder",licence:"CPL(H)"},AT);
 state=D.addPerson(state,{id:"fi",name:"Test Instructor",licence:"FI(H)"},AT);
 state=F.setAccountHolder(state,"me",AT);
 state=F.addAircraft(state,{id:"c2",registration:"LY-G2CA",icao:"G2CA",
  manufacturer:"Guimbal",model:"Cabri G2",variant:"",engine:"SE"},AT);
 state=F.addAircraft(state,{id:"a139",registration:"LY-ME1",icao:"A139",
  manufacturer:"Leonardo",model:"AW139",variant:"",engine:"ME"},AT);
 return state;
}
const flight={id:"f1",date:"2026-10-14",aircraftId:"c2",dep:"EYVI",arr:"EYVI",
 off:"0930",on:"10:40",role:"PIC",picPersonId:"fi",pilotConfig:"single",
 ifrMin:20,nightMin:0,instructorMin:0,takeoffDay:2,takeoffNight:0,
 landingDay:2,landingNight:0,crossCountry:true,remarks:"Fictional practice"};
test("24-hour input accepts HHmm/HH:mm and overnight duration",()=>{
 assert.equal(F.timeValue("0935"),"09:35");
 assert.equal(F.timeValue("23:59"),"23:59");
 assert.equal(F.elapsed("23:45","00:30"),45);
 assert.equal(F.elapsed("09:30","10:40"),70);
 for(const invalid of ["25:10","9:30","2360","12:7","abc",""]){
  assert.throws(()=>F.timeValue(invalid),/Time must use 24-hour/);
 }
 assert.throws(()=>F.elapsed("0900","09:00"),/cannot be identical/);
});
test("create aircraft and enforce unique registrations and a valid ICAO designator",()=>{
 const s=setup();
 assert.equal(F.getAircraft(s,"c2").icao,"G2CA");
 assert.equal(F.getAircraft(s,"a139").engine,"ME");
 assert.throws(()=>F.addAircraft(s,{id:"duplicate",registration:"LY-G2CA",icao:"G2CA",engine:"SE"},NEXT),/Registration already exists/);
 assert.throws(()=>F.addAircraft(s,{id:"wrong",registration:"LY-XX",icao:"?",engine:"SE"},NEXT),/ICAO designator/);
 assert.deepEqual(F.validateState(s),[]);
});
test("PIC/SOLO always attach account-holder commander; DUAL/SPIC require different saved commander",()=>{
 const s=setup();
 const pic=F.addFlight(s,flight,NEXT);
 assert.equal(F.getFlight(pic,"f1").picPersonId,"me");
 assert.equal(F.getFlight(pic,"f1").picName,"Test Account Holder");
 const solo=F.addFlight(s,{...flight,id:"solo",role:"SOLO"},NEXT);
 assert.equal(F.getFlight(solo,"solo").picPersonId,"me");
 assert.throws(()=>F.addFlight(s,{...flight,role:"DUAL",picPersonId:"me"},NEXT),/other than the account holder/);
 assert.throws(()=>F.addFlight(s,{...flight,role:"SPIC",picPersonId:""},NEXT),/Commander/);
 const dual=F.addFlight(s,{...flight,role:"DUAL",picPersonId:"fi"},NEXT);
 assert.equal(dual.flights[0].picPersonId,"fi");
});
test("SE/ME and pilot configuration are independent, totals account for PICUS/SPIC",()=>{
 let s=setup();
 s=F.addFlight(s,flight,AT);
 s=F.addFlight(s,{...flight,id:"f2",aircraftId:"a139",role:"PICUS",picPersonId:"fi",
  pilotConfig:"single",ifrMin:0,crossCountry:false},NEXT);
 s=F.addFlight(s,{...flight,id:"f3",aircraftId:"c2",role:"DUAL",picPersonId:"fi",
  pilotConfig:"multi",nightMin:30,ifrMin:30},NEXT);
 const t=F.totals(s);
 assert.equal(t.total,210);
 assert.equal(t.pic,140);
 assert.equal(t.dual,70);
 assert.equal(t.picus,70);
 assert.equal(t.engineSE,140);
 assert.equal(t.engineME,70);
 assert.equal(t.single,140);
 assert.equal(t.multi,70);
 assert.equal(t.crossCountry,140);
 assert.equal(t.ifr,50);
 assert.equal(t.night,30);
});
test("aircraft edits cannot retroactively change existing flight snapshots or time totals",()=>{
 let s=F.addFlight(setup(),flight,NEXT);
 const original=F.getFlight(s,"f1").aircraftSnapshot;
 s=F.editAircraft(s,"c2",{registration:"LY-NEW",icao:"A139",engine:"ME"},NEXT);
 assert.deepEqual(F.getFlight(s,"f1").aircraftSnapshot,original);
 s=F.editFlight(s,"f1",{remarks:"Corrected test remarks"},NEXT);
 assert.deepEqual(F.getFlight(s,"f1").aircraftSnapshot,original);
 assert.equal(F.totals(s).engineSE,70);
 assert.deepEqual(F.validateState(s),[]);
});
test("edit and remove an unarchived flight; reject deleting aircraft currently in use",()=>{
 let s=F.addFlight(setup(),flight,NEXT);
 assert.throws(()=>F.deleteAircraft(s,"c2",NEXT),/used by flights/);
 s=F.editFlight(s,"f1",{takeoffDay:3,landingDay:1,remarks:"Manual landing override"},NEXT);
 assert.equal(F.getFlight(s,"f1").landingDay,1);
 assert.equal(F.getFlight(s,"f1").takeoffDay,3);
 s=F.deleteFlight(s,"f1",NEXT);
 assert.equal(s.flights.length,0);
 s=F.deleteAircraft(s,"c2",NEXT);
 assert.equal(s.aircraft.length,1);
});
test("reject IFR/Night exceeding flight time, invalid counts and invalid dates",()=>{
 const s=setup();
 assert.throws(()=>F.addFlight(s,{...flight,ifrMin:71},NEXT),/cannot exceed flight time/);
 assert.throws(()=>F.addFlight(s,{...flight,takeoffNight:-1},NEXT),/integer/);
 assert.throws(()=>F.addFlight(s,{...flight,date:"2026-02-30"},NEXT),/invalid/);
 assert.throws(()=>F.addFlight(s,{...flight,off:"10:40",on:"10:40"},NEXT),/identical/);
});
test("historical commander and aircraft snapshots survive later account-holder changes",()=>{
 let s=F.addFlight(setup(),flight,NEXT);
 s=F.setAccountHolder(s,"fi",NEXT);
 assert.equal(F.getFlight(s,"f1").picPersonId,"me");
 assert.deepEqual(F.validateState(s),[]);
});
test("storage adapter validates both domain and flight records and preserves V1 keys",()=>{
 const map=new Map([["helilog_v111","V1 data"]]);
 const store={getItem:key=>map.has(key)?map.get(key):null,
 setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
 const repo=S.createRepository(store,D,F.validateState);
 let s=setup();
 repo.save(s,null);
 const invalid=JSON.parse(JSON.stringify(s));
 invalid.flights.push({id:"bad",date:"2026-10-14"});
 assert.throws(()=>repo.save(invalid,s.meta.revision),/invalid V2 state/i);
 s=F.addFlight(s,flight,NEXT);
 repo.save(s,repo.load().meta.revision);
 assert.equal(repo.load().flights.length,1);
 assert.equal(map.get("helilog_v111"),"V1 data");
});
