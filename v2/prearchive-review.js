/* V2.29 — independent, READ-ONLY pre-archive flight review.
 * Pure evaluator shared by the browser and Node regression tests.
 * Does not write, normalize, repair, sign, upload or archive any records.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV29Review=api;
})(typeof window!=="undefined"?window:globalThis,function(){
 "use strict";
 const roles=new Set(["PIC","SOLO","SPIC","PICUS","DUAL","CO-PILOT"]);
 const ownerRoles=new Set(["PIC","SOLO"]);
 const safeString=x=>String(x??"").trim();
 const numbers=(v)=>Number(v);
 const minutes=(v)=>Number.isSafeInteger(v)&&v>=0;
 const clock=v=>{
  const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(safeString(v));
  return m?Number(m[1])*60+Number(m[2]):null;
 };
 // Compare UTC intervals, not rounded/logged flight minutes. A flight with
 // on < off continues into the next UTC date; touching endpoints do not overlap.
 // Invalid dates, missing times, simulator sessions and ambiguous equal clocks
 // are handled by other checks and are not treated as reliable intervals here.
 const flightInterval=f=>{
  if(!f||f.entryType==="simulator")return null;
  const date=safeString(f.date);
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const base=Date.UTC(year,month-1,day);
  const parsed=new Date(base);
  if(!Number.isFinite(base)||parsed.getUTCFullYear()!==year||
     parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)return null;
  const off=clock(f.off),on=clock(f.on);
  if(off===null||on===null||off===on)return null;
  const start=base/60000+off,end=base/60000+on+(on<off?1440:0);
  return {start,end};
 };
 const flightTimeLabel=f=>safeString(f.date)+" "+
   safeString(f.off)+"–"+safeString(f.on)+(clock(f.on)<clock(f.off)?" (next UTC day)":"")+" UTC";
 const findOverlaps=(selected,allFlights)=>{
  // Use one copy per stable record ID, favouring the exact draft being printed.
  // That also prevents a selected record from matching itself in allFlights.
  const originals=new Map();
  for(const f of allFlights){
   if(f&&typeof f.id==="string"&&f.id&&!originals.has(f.id))
    originals.set(f.id,f);
  }
  const ids=new Set();
  for(const f of selected){
   if(f&&typeof f.id==="string"&&f.id){ids.add(f.id);originals.set(f.id,f);}
  }
  const ordered=[...originals.values()].map(f=>({flight:f,time:flightInterval(f)}))
   .filter(x=>x.time).sort((a,b)=>a.time.start-b.time.start);
  const overlaps=[];
  for(let i=0;i<ordered.length;i++){
   const a=ordered[i];
   for(let j=i+1;j<ordered.length&&ordered[j].time.start<a.time.end;j++){
    const b=ordered[j];
    if(!ids.has(a.flight.id)&&!ids.has(b.flight.id))continue;
    const shared=Math.min(a.time.end,b.time.end)-Math.max(a.time.start,b.time.start);
    if(shared<=0)continue;
    const current=ids.has(a.flight.id)?a.flight:b.flight;
    const other=current===a.flight?b.flight:a.flight;
    overlaps.push({current,other,shared});
   }
  }
  return overlaps;
 };
 const key=(f,aircraft)=>{
  if(f.entryType==="simulator"){
   const parts=["SIM",f.date,f.simCategory,f.simDevice,f.simQualification,f.stdMin,f.remarks];
   return f.date&&(f.simCategory||f.simDevice)&&Number(f.stdMin)>0?
    parts.map(x=>safeString(x).toUpperCase()).join("|"):null;
  }
  const reg=aircraft.find(a=>a.id===f.aid)?.reg;
  const parts=[f.date,reg,f.dep,f.off,f.arr,f.on].map(x=>safeString(x).toUpperCase().replace(/\s+/g,""));
  return parts.every(Boolean)?parts.join("|"):null;
 };
 function evaluate({draft,allFlights=[],people=[]}={}){
  if(!draft||!Array.isArray(draft.flights)||!Array.isArray(allFlights)||
     !Array.isArray(draft.aircraft)||!Array.isArray(people))
   throw Error("Cannot review a malformed print batch. The original logbook remains unchanged.");
  const issues=[],chosen=new Set(draft.flights.map(f=>f.id));
  const add=(severity,code,message,flight,other)=>{
   issues.push({severity,code,message,flightId:flight?.id||null,
    otherFlightId:other?.id||null,date:flight?.date||null});
  };
  const aircraft=draft.aircraft;
  const seen=new Map();
  for(const f of allFlights){
   const fingerprint=key(f,aircraft);
   if(fingerprint){
    const a=seen.get(fingerprint)||[];
    a.push(f);seen.set(fingerprint,a);
   }
  }
  // Same-account helicopter flights cannot occupy overlapping UTC clock
  // intervals. Include cross-midnight overlaps and prior confirmed batches
  // present in allFlights. Report each pair exactly once.
  for(const {current,other,shared} of findOverlaps(draft.flights,allFlights)){
   const fmt=m=>Math.floor(m/60)+":"+String(m%60).padStart(2,"0");
   add("critical","overlapping-flight",
    "Flight time overlaps another logbook entry by "+fmt(shared)+" (HH:mm). "+
    flightTimeLabel(current)+" conflicts with "+flightTimeLabel(other)+
    ". Review both entries; nothing was changed.",current,other);
  }
  const members=new Map(people.filter(p=>p&&p.id).map(p=>[p.id,p]));
  const account=safeString(draft.pilot?.name).toLowerCase();
  let independent={total:0,pic:0,copilot:0,dual:0,night:0,ifr:0,
   instructor:0,single:0,multi:0,engineSE:0,engineME:0,std:0};
  for(const f of draft.flights){
   if(!f||!f.id){add("critical","missing-id","An entry is missing its unique identifier.",f);continue;}
   const a=aircraft.find(x=>x.id===f.aid);
   const sim=f.entryType==="simulator";
   const duration=Number(f.mins),std=Number(f.stdMin||0);
   if(!sim){
    if(!a)add("critical","aircraft","The selected aircraft is missing from the aircraft list.",f);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(safeString(f.date))||
       Number.isNaN(new Date(f.date+"T00:00:00Z").getTime()))
     add("critical","date","Flight date is missing or invalid.",f);
    const k=key(f,aircraft);
    const duplicates=k?(seen.get(k)||[]).filter(x=>x.id!==f.id):[];
    if(duplicates.length){
     const other=duplicates[0];
     add("critical","duplicate","Possible duplicate: identical date, registration, route and UTC times"+
      (duplicates.length>1?" ("+duplicates.length+" other entries).":"."),f,other);
    }
    if(!safeString(f.dep)||!safeString(f.arr))
     add("critical","route","Departure or arrival location is missing.",f);
    if(!minutes(duration)||duration===0)
     add("critical","flight-time","Actual flight time is missing, negative or not a whole number of minutes.",f);
    else{
     if(duration<=5)add("advisory","short-flight","Recorded helicopter flight time is five minutes or less. Verify it is intentional.",f);
     if(duration>240)add("advisory","long-flight","Recorded helicopter flight time exceeds four hours. Verify against source records.",f);
    }
    const start=clock(f.off),end=clock(f.on);
    if(start===null||end===null)
     add("critical","utc-time","Departure/arrival UTC time is missing or not in 24-hour HH:mm format.",f);
    else{
     const elapsed=(end-start+1440)%1440; // midnight rollover is ordinary, not an error.
     if(elapsed===0)add("advisory","same-time","Departure and arrival UTC times are identical; check the flight or day rollover.",f);
     else if(minutes(duration)&&Math.abs(duration-elapsed)>10)
      add("advisory","elapsed","Entered flight time differs from the UTC off/on interval by more than 10 minutes ("+
        duration+" vs "+elapsed+" minutes). Verify the recorded time basis.",f);
    }
    if(!roles.has(f.role))add("critical","pilot-function","Pilot function is missing or not recognized.",f);
    const personName=safeString(f.picName),normalized=personName.toLowerCase();
    if(ownerRoles.has(f.role)){
     if(!personName)add("critical","pic","PIC name is missing. For PIC/SOLO use SELF.",f);
     else if(normalized!=="self"&&normalized!==account)
      add("advisory","pic-self","PIC/SOLO entry names another pilot rather than SELF. Check a legacy record.",f);
    }else{
     if(!personName||normalized==="self")
      add("critical","pic","Pilot function "+safeString(f.role)+" needs the actual commander's name, not SELF.",f);
     else if(account&&normalized===account)
      add("critical","pic-account","For "+safeString(f.role)+", PIC must identify the commander, not the account holder.",f);
     if(f.picPersonId&&!members.has(f.picPersonId))
      add("advisory","pic-link","The referenced commander profile is no longer saved.",f);
     else if(!f.picPersonId&&personName&&normalized!=="self")
      add("advisory","pic-link","This legacy PIC name is not linked to a saved pilot profile.",f);
    }
    for(const [field,label] of [["nightMin","Night"],["ifrMin","IFR"],["instrMin","Instructor"]]){
     const t=Number(f[field]||0);
     if(!minutes(t)||(minutes(duration)&&t>duration))
      add("critical","subtime-"+field,label+" time is negative, invalid or exceeds total flight time.",f);
    }
    for(const [field,label] of [["takeoffDay","Day take-offs"],["takeoffNight","Night take-offs"],
      ["landingDay","Day landings"],["landingNight","Night landings"]]){
     if(!minutes(Number(f[field]||0)))
      add("critical","count-"+field,label+" count is negative or not a whole number.",f);
    }
    const takeoffs=Number(f.takeoffDay||0)+Number(f.takeoffNight||0);
    const landings=Number(f.landingDay||0)+Number(f.landingNight||0);
    if(minutes(takeoffs)&&minutes(landings)&&takeoffs!==landings)
     add("advisory","movements","Take-off and landing counts differ. Check whether this is intentional.",f);
    if(f.pilotConfig&&f.pilotConfig!=="single"&&f.pilotConfig!=="multi")
     add("advisory","pilot-config","Pilot configuration is not recognized; review Single-/Multi-pilot time.",f);
    if(minutes(duration)){
     independent.total+=duration;
     if(ownerRoles.has(f.role)||f.role==="SPIC"||f.role==="PICUS")independent.pic+=duration;
     if(f.role==="CO-PILOT")independent.copilot+=duration;
     if(f.role==="DUAL")independent.dual+=duration;
     const multi=f.pilotConfig==="multi"||(!f.pilotConfig&&Number(f.multiPilotMin||0)>0);
     if(multi)independent.multi+=duration;
     else independent.single+=duration;
     const engine=safeString(a?.engine).toLowerCase();
     if(engine==="me"||engine.includes("multi"))independent.engineME+=duration;
     else independent.engineSE+=duration;
    }
    independent.night+=Number(f.nightMin||0);
    independent.ifr+=Number(f.ifrMin||0);
    independent.instructor+=Number(f.instrMin||0);
   }else{
    const duplicates=(seen.get(key(f,aircraft))||[]).filter(x=>x.id!==f.id);
    if(duplicates.length)add("critical","duplicate-simulator",
      "Possible duplicate simulator session with the same device, category, duration and remarks.",f,duplicates[0]);
    if(!minutes(std)||std===0)add("critical","sim-time","Simulator time must be positive whole minutes.",f);
    if(duration!==0)add("critical","sim-flight-time","Simulator entry contains actual flight minutes.",f);
    if(!safeString(f.simDevice)&&!safeString(f.simCategory).startsWith("FNPT"))
     add("advisory","sim-device","Simulator device/type is missing.",f);
    if(minutes(std))independent.std+=std;
   }
  }
  if(independent.pic+independent.copilot+independent.dual!==independent.total)
   add("critical","role-total","Sum of PIC, co-pilot and dual time differs from batch flight time.");
  if(independent.single+independent.multi!==independent.total)
   add("critical","pilot-total","Single- and multi-pilot time does not match actual flight time.");
  if(independent.engineSE+independent.engineME!==independent.total)
   add("critical","engine-total","Single- and multi-engine time does not match actual flight time.");
  const fields=Object.keys(independent);
  for(const field of fields){
   if(Number(draft.flightTotals?.[field]||0)!==independent[field])
    add("critical","batch-"+field,"Printed batch "+field+" total differs from independently recalculated flight entries.");
   const opening=Number(draft.openingTotals?.[field]||0),
    batch=Number(draft.flightTotals?.[field]||0),
    closing=Number(draft.closingTotals?.[field]||0);
   if(!Number.isFinite(opening)||!Number.isFinite(batch)||!Number.isFinite(closing)||
      opening+batch!==closing)
    add("critical","running-"+field,"Carried-forward "+field+" plus batch time does not equal closing "+field+" total.");
  }
  const critical=issues.filter(x=>x.severity==="critical").length;
  const advisory=issues.length-critical;
  return {issues,critical,advisory,entries:draft.flights.length,
   batchId:safeString(draft.id),firstPage:draft.firstPage,pageCount:draft.pageCount,
   flightMinutes:independent.total,simulatorMinutes:independent.std,
   reviewedIds:[...chosen]};
 }
 return Object.freeze({evaluate});
});
