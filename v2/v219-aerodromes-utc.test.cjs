/* V2.19 — worldwide ICAO lookup and user-managed helipad directory checks. */
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const root=__dirname;
const airports=require("./aerodrome-lookup.js");
const night=require("./night-calculation.js");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const cloud=fs.readFileSync(path.join(root,"cloud-sync.js"),"utf8");
const sw=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const source=fs.readFileSync(path.join(root,"aerodrome-lookup.js"),"utf8");
function mock(sourceCsv,fail=false){
 let n=0;
 const context={HeliLogNight:night,fetch:async()=>{n++;if(fail)throw Error("No internet");
 return {ok:true,text:async()=>sourceCsv}}};
 const api=new Function("window","module",source+";return window.HeliLogAerodromes;")(context,undefined);
 return {api,calls:()=>n};
}
test("global airport CSV parsing recognizes ICAO, including comma-containing names",()=>{
 const csv='1,"Test, Airport","City","Country","TST","EDDF",50.033,8.570,500\n'+
 '2,"Another Airfield","Vilnius","Lithuania","\\\\N","EYVI",54.6341,25.2858,650\n'+
 '3,"Bad","Bad","Bad","BAD","ABCD",999,999,0\n';
 const a=airports.parse(csv);
 assert.equal(a.EDDF.lat,50.033);
 assert.equal(a.EDDF.name,"Test, Airport");
 assert.equal(a.EYVI.lon,25.2858);
 assert.equal(a.ABCD,undefined);
});
test("bundled ICAO coordinates are available without an online request",async()=>{
 const f=mock("",true);
 const p=await f.api.lookup("eyvi");
 assert.equal(p.lat,54.634102);assert.equal(f.calls(),0);
});
test("unknown ICAO lookup downloads worldwide index once and reuses it",async()=>{
 const csv='1,"Frankfurt","Frankfurt","Germany","FRA","EDDF",50.033333,8.570556,500\n'+
 '2,"Munich","Munich","Germany","MUC","EDDM",48.353802,11.786086,1487\n';
 const f=mock(csv);
 const [a,b]=await Promise.all([f.api.lookup("EDDF"),f.api.lookup("EDDM")]);
 assert.equal(f.calls(),1);
 assert.equal(a.lat,50.033333);assert.equal(b.lon,11.786086);
 assert.equal((await f.api.lookup("EDDF")).source,"OpenFlights global airport database");
 assert.equal(f.calls(),1);
 assert.equal(await f.api.lookup("BASE-1"),null);
 assert.equal(f.calls(),1);
});
test("offline unknown ICAO falls back gracefully; no fabricated coordinates",async()=>{
 const f=mock("",true);
 assert.equal(await f.api.lookup("EDDF"),null);
 assert.equal(f.calls(),1);
 assert.equal(await f.api.lookup("EDDF"),null);
 assert.equal(f.calls(),1);
});
test("Add Flight has UTC labels, not lat/lon fields",()=>{
 assert.match(html,/Departure time \(UTC, 24h\)/);
 assert.match(html,/Arrival time \(UTC, 24h\)/);
 assert.match(html,/id="off" type="text"/);assert.match(html,/id="on" type="text"/);
 assert.doesNotMatch(html,/id="nightCoordinateDetails"/);
 assert.doesNotMatch(html,/id="depLat"|id="depLon"|id="arrLat"|id="arrLon"/);
 assert.match(html,/Night time \(minutes\)/);
 assert.match(html,/id="nightAuto" type="checkbox"/);
 assert.match(html,/function v218Point\(/);
 assert.match(html,/window\.HeliLogAerodromes\.cached\(code\)/);
 assert.match(html,/v219RequestICAO\(code\)/);
});
test("custom helipad management belongs to Settings and is synced privately",()=>{
 assert.match(html,/function v219LocationsPage\(/);
 assert.match(html,/function v219SaveSite\(/);
 assert.match(html,/function v219DeleteSite\(/);
 assert.match(html,/go\('locations'\)/);
 assert.match(html,/Settings → Aerodromes & Helipads/);
 assert.match(html,/v219Sites\(\)/);
 assert.match(html,/siteLocations:\[\]/);
 assert.match(cloud,/const settingNames=\[[^\]]*"siteLocations"/);
 assert.match(cloud,/name==="siteLocations"\?\[\]/);
 assert.match(html,/location[s]?:v219LocationsPage/);
});
test("previously recorded night coordinates and archived records are left unchanged",()=>{
 assert.match(html,/const earlier=current\?\.\[which\]===code/);
 assert.match(html,/Previously saved flight/);
 assert.match(html,/existing\?old\?\.mode==='automatic':true/);
 assert.match(html,/nightCalculation:\{/);
 assert.match(html,/if\(isArchivedFlight\(id\)\)return startArchivedCorrection/);
});
test("offline PWA precaches the lookup helper for all devices",()=>{
 assert.match(sw,/\.\/aerodrome-lookup\.js\?v=2\.19-locations-1/);
 assert.match(html,/\.\/aerodrome-lookup\.js\?v=2\.19-locations-1/);
 assert.match(sw,/helilog-v2-33-2-recency-choices-1/);
});
