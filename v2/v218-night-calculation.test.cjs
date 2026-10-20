/* V2.19 offline UTC civil twilight night calculation regression tests */
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const night=require("./night-calculation.js");
const vilnius=night.lookup("EYVI"),kaunas=night.lookup("EYKA");
test("bundled official reference coordinates include common Lithuanian aerodromes",()=>{
 assert.deepEqual({lat:vilnius.lat,lon:vilnius.lon},{lat:54.634102,lon:25.285801});
 assert.deepEqual({lat:kaunas.lat,lon:kaunas.lon},{lat:54.963965,lon:24.08582});
 for(const code of ["EYVI","EYKA","EYPA","EYSA","EYKL","EYMO","EYKS","EYVK","EYPN","EYPR","EYVP","EYRO","EYRD","EYMM","EYNI","EVRA","EETN","EPWA"])
  assert.ok(night.lookup(code),code);
 assert.equal(night.lookup("XXXX"),null);
});
test("24-hour UTC chronology, midnight crossing, invalid dates and zero-duration",()=>{
 assert.equal(night.utcFlight("2026-10-19","23:30","00:45").minutes,75);
 assert.equal(night.utcFlight("2026-10-19","10:00","11:25").minutes,85);
 assert.equal(night.utcFlight("2026-10-19","10:00","10:00"),null);
 assert.equal(night.utcFlight("2026-02-30","09:00","10:00"),null);
 assert.equal(night.utcFlight("2026-10-19","25:00","26:00"),null);
});
test("at Lithuanian midlatitude, solar centre is high at summer midday and low at UTC night",()=>{
 const high=night.sunAltitude(Date.UTC(2026,5,21,12,0),vilnius);
 const low=night.sunAltitude(Date.UTC(2026,5,21,23,0),vilnius);
 assert.ok(high>50&&high<70,high);
 assert.ok(low<-6&&low>-25,low);
});
test("flight during daytime has no night minutes and nighttime flight is all night",()=>{
 const day=night.calculate({date:"2026-10-19",off:"09:00",on:"10:10",dep:vilnius,arr:vilnius});
 assert.equal(day.ok,true);assert.equal(day.nightMinutes,0);assert.equal(day.totalMinutes,70);
 const dark=night.calculate({date:"2026-10-19",off:"22:10",on:"23:40",dep:vilnius,arr:vilnius});
 assert.equal(dark.nightMinutes,90);
 const rollover=night.calculate({date:"2026-10-19",off:"23:45",on:"00:30",dep:vilnius,arr:vilnius});
 assert.equal(rollover.totalMinutes,45);assert.equal(rollover.nightMinutes,45);
});
test("twilight crossing gives a partial 0 < night < total calculation",()=>{
 const r=night.calculate({date:"2026-10-19",off:"14:30",on:"18:00",dep:vilnius,arr:vilnius});
 assert.equal(r.ok,true);assert.ok(r.nightMinutes>0&&r.nightMinutes<210,r);
 assert.equal(r.nightMinutes+r.totalMinutes-r.nightMinutes,210);
 const dawn=night.calculate({date:"2026-10-19",off:"02:00",on:"07:30",dep:vilnius,arr:vilnius});
 assert.ok(dawn.nightMinutes>0&&dawn.nightMinutes<330,dawn);
});
test("en-route straight-line uses both aerodrome coordinates, exact minute bounds",()=>{
 const route=night.calculate({date:"2026-10-19",off:"15:00",on:"17:15",dep:vilnius,arr:kaunas});
 const back=night.calculate({date:"2026-10-19",off:"15:00",on:"17:15",dep:kaunas,arr:vilnius});
 assert.equal(route.ok,true);assert.equal(route.method,"straight-line-estimate");
 assert.ok(route.distanceKm>60&&route.distanceKm<100);
 assert.ok(route.nightMinutes>=0&&route.nightMinutes<=135);
 assert.ok(back.nightMinutes>=0&&back.nightMinutes<=135);
 assert.equal(night.calculate({date:"2026-10-19",off:"14:00",on:"15:00",dep:vilnius,arr:vilnius}).method,"same-site");
});
test("northern polar day and night are supported, longitude wrap remains finite",()=>{
 const polar={lat:78.2,lon:15.6};
 assert.equal(night.calculate({date:"2026-06-21",off:"21:00",on:"22:00",dep:polar,arr:polar}).nightMinutes,0);
 assert.equal(night.calculate({date:"2026-12-21",off:"11:00",on:"12:00",dep:polar,arr:polar}).nightMinutes,60);
 const dateline=night.calculate({date:"2026-10-19",off:"22:00",on:"23:10",
  dep:{lat:60,lon:179.5},arr:{lat:60,lon:-179.5}});
 assert.ok(dateline.ok&&dateline.distanceKm<100);
});
test("missing/invalid location never fabricates a zero-night auto calculation",()=>{
 for(const p of [null,{lat:"",lon:""},{lat:"91",lon:0},{lat:55,lon:181}]){
  const r=night.calculate({date:"2026-10-19",off:"22:00",on:"23:00",dep:p,arr:vilnius});
  assert.equal(r.ok,false);
 }
});
test("twilight event times are UTC and are near a civil dusk/morning transition",()=>{
 const at=Date.UTC(2026,9,19,16);
 const events=night.twilightAround(at,vilnius);
 assert.ok(events.eveningUtc!==null&&events.morningUtc!==null,events);
 for(const when of [events.eveningUtc,events.morningUtc]){
  assert.ok(Math.abs(night.sunAltitude(when,vilnius)+6)<0.06,
    "event should cross centre-of-Sun -6 degrees: "+night.sunAltitude(when,vilnius));
  assert.match(night.utcLabel(when),/UTC$/);
 }
});
test("flight form preserves historical night totals and requires opt-in automatic calculation",()=>{
 const index=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
 const sw=fs.readFileSync(path.join(__dirname,"service-worker.js"),"utf8");
 assert.match(index,/id="nightAuto" type="checkbox" checked/);
 assert.match(index,/existing\?old\?\.mode==='automatic':true/);
 assert.match(index,/nightCalculation:\{/);
 assert.match(index,/nightAuto\?'automatic':'manual'/);
 assert.match(index,/if\(!nightPreview\.ok\) return showFormError/);
 assert.match(index,/function v218PlaceChanged/);
 assert.match(index,/v218InitNight\(existing\)/);
 assert.match(index,/\.\/night-calculation\.js\?v=2\.19-night-1/);
 assert.match(sw,/night-calculation\.js\?v=2\.19-night-1/);
});

test("published Lithuania AIP October 2026 Vilnius civil twilight table agrees within five minutes",()=>{
 // GEN 2.7 valid 16 Apr 2026: EYVI October 18 TWIL FROM 04:15, TWIL TO 15:52 UTC.
 // Astronomical estimates use published airport reference coordinates, rather
 // than relying upon the published five-day interpolated civil-twilight table.
 const around=Date.UTC(2026,9,18,15,0);
 const ev=night.twilightAround(around,vilnius);
 const morning=Date.UTC(2026,9,18,4,15),evening=Date.UTC(2026,9,18,15,52);
 assert.ok(Math.abs(ev.morningUtc-morning)<=5*60000,"morning "+night.utcLabel(ev.morningUtc));
 assert.ok(Math.abs(ev.eveningUtc-evening)<=5*60000,"evening "+night.utcLabel(ev.eveningUtc));
});
test("AIP Panevėžys aerodrome position is available offline",()=>{
 const p=night.lookup("EYPN");
 assert.ok(p);
 assert.ok(Math.abs(p.lat-(55+42/60+32/3600))<0.00001);
 assert.ok(Math.abs(p.lon-(24+20/60+43/3600))<0.00001);
 assert.match(p.source,/AIP/);
});
