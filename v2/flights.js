/* HeliLog V2 flight model — pure module. No browser storage or DOM side effects.
 * Pilot-function category reporting is a prototype convention, not a regulatory credit determination.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV2Flights=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const ROLES=Object.freeze(["PIC","SOLO","SPIC","PICUS","DUAL","CO-PILOT"]);
 const PIC_ROLES=new Set(["PIC","SOLO","SPIC","PICUS"]);
 const SELF_ROLES=new Set(["PIC","SOLO"]);
 const own=Object.prototype.hasOwnProperty;
 const clone=x=>JSON.parse(JSON.stringify(x));
 function need(test,message){if(!test)throw Error(message);}
 function text(value,name,max=140){
  need(typeof value==="string"&&value.trim().length>0&&value.trim().length<=max,name+" is required (up to "+max+" characters)");
  return value.trim();
 }
 function optional(value,max=600){
  const str=String(value??"").trim();need(str.length<=max,"Text must not exceed "+max+" characters");return str;
 }
 function iso(at){need(typeof at==="string"&&!Number.isNaN(Date.parse(at))&&at.includes("T"),"Valid ISO timestamp required");return at;}
 function dateValue(x){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x||""))throw Error("Date must be YYYY-MM-DD");
  const d=new Date(x+"T00:00:00Z");
  need(!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===x,"Date is invalid");
  return x;
 }
 function timeValue(x){
  const s=String(x??"").trim();
  const m=/^([01]\d|2[0-3]):?([0-5]\d)$/.exec(s);
  need(!!m,"Time must use 24-hour HHmm or HH:mm (00:00–23:59)");
  return m[1]+":"+m[2];
 }
 function timeMinutes(x){const [h,m]=timeValue(x).split(":").map(Number);return h*60+m;}
 function elapsed(off,on){const n=(timeMinutes(on)-timeMinutes(off)+1440)%1440;need(n>0,"Departure and arrival times cannot be identical");return n;}
 function minutes(x,name,maximum=1440){
  need(typeof x==="number"&&Number.isSafeInteger(x)&&x>=0&&x<=maximum,name+" must be a non-negative whole number of minutes");
  return x;
 }
 function count(x,name){
  need(typeof x==="number"&&Number.isSafeInteger(x)&&x>=0&&x<=100,name+" must be an integer from 0 to 100");
  return x;
 }
 function updated(state,at){
  need(state&&state.schemaVersion===2&&Array.isArray(state.aircraft)&&Array.isArray(state.flights)&&Array.isArray(state.people),"Valid V2 workspace required");
  const next=clone(state);
  next.meta.revision+=1;next.meta.updatedAt=iso(at);return next;
 }
 function getAircraft(state,id){return state.aircraft.find(a=>a.id===id);}
 function getFlight(state,id){return state.flights.find(f=>f.id===id);}
 function accountHolder(state){return state.people.find(p=>p.isAccountHolder)||null;}
 function setAccountHolder(state,id,at){
  const next=updated(state,at);
  need(next.people.some(p=>p.id===id),"Saved pilot profile not found");
  next.people.forEach(p=>p.isAccountHolder=p.id===id);
  return next;
 }
 function aircraftFields(input){
  need(input&&typeof input==="object","Aircraft required");
  const reg=text(String(input.registration||"").toUpperCase(),"Registration",18);
  const icao=text(String(input.icao||"").toUpperCase(),"ICAO type designator",8);
  need(/^[A-Z0-9-]{2,18}$/.test(reg),"Invalid aircraft registration");
  need(/^[A-Z0-9]{2,8}$/.test(icao),"ICAO designator must have 2–8 letters/digits");
  need(["SE","ME"].includes(input.engine),"Engine type must be SE or ME");
  return {registration:reg,icao,manufacturer:optional(input.manufacturer,100),
   model:optional(input.model,100),variant:optional(input.variant,100),engine:input.engine};
 }
 function addAircraft(state,data,at){
  const next=updated(state,at),id=text(data?.id,"Aircraft ID",90),fields=aircraftFields(data);
  need(!getAircraft(next,id),"Aircraft ID already exists");
  need(!next.aircraft.some(a=>a.registration===fields.registration),"Registration already exists");
  next.aircraft.push({id,...fields,createdAt:iso(at),updatedAt:at});
  return next;
 }
 function editAircraft(state,id,patch,at){
  const next=updated(state,at),a=getAircraft(next,id);
  need(!!a,"Aircraft not found");
  const updatedAircraft=aircraftFields({...a,...patch});
  need(!next.aircraft.some(b=>b.id!==id&&b.registration===updatedAircraft.registration),"Registration already exists");
  Object.assign(a,updatedAircraft,{updatedAt:at});
  return next;
 }
 function deleteAircraft(state,id,at){
  const next=updated(state,at);
  need(getAircraft(next,id),"Aircraft not found");
  need(!next.flights.some(f=>f.aircraftId===id),"Cannot delete aircraft used by flights");
  next.aircraft=next.aircraft.filter(a=>a.id!==id);
  return next;
 }
 function flightFields(state,values,original){
  need(values&&typeof values==="object","Flight details required");
  const date=dateValue(values.date);
  const aircraftId=text(values.aircraftId,"Aircraft",90);
  const aircraft=getAircraft(state,aircraftId);
  need(!!aircraft,"Selected aircraft does not exist");
  const role=text(values.role,"Pilot function",20);
  need(ROLES.includes(role),"Invalid pilot function");
  const owner=accountHolder(state);
  const isSelf=SELF_ROLES.has(role);
  need(!isSelf||!!owner||!!original,"Set an account holder under Pilot Profiles before logging PIC or SOLO");
  const picPersonId=isSelf?(original&&original.role===role?original.picPersonId:owner?.id):text(values.picPersonId,"Commander",90);
  const commander=state.people.find(p=>p.id===picPersonId);
  need(!!commander,"Selected commander does not exist");
  if(!isSelf&&!original)need(!owner||commander.id!==owner.id,"For this pilot function, the commander must be someone other than the account holder");
  const pilotConfig=values.pilotConfig;
  need(pilotConfig==="single"||pilotConfig==="multi","Pilot configuration must be single or multi");
  const off=timeValue(values.off),on=timeValue(values.on),durationMin=elapsed(off,on);
  const dep=text(String(values.dep||"").toUpperCase(),"Departure aerodrome",15);
  const arr=text(String(values.arr||"").toUpperCase(),"Arrival aerodrome",15);
  const ifrMin=minutes(values.ifrMin??0,"IFR time");
  const nightMin=minutes(values.nightMin??0,"Night time");
  const instructorMin=minutes(values.instructorMin??0,"Instructor time");
  for(const [key,value] of Object.entries({ifrMin,nightMin,instructorMin})){
   need(value<=durationMin,key+" cannot exceed flight time");
  }
  const takeoffDay=count(values.takeoffDay??0,"Day take-offs");
  const takeoffNight=count(values.takeoffNight??0,"Night take-offs");
  const landingDay=count(values.landingDay??0,"Day landings");
  const landingNight=count(values.landingNight??0,"Night landings");
  const remarks=optional(values.remarks,2000);
  need(typeof values.crossCountry==="boolean","Cross-country must be true/false");
  return {
   date,aircraftId,aircraftSnapshot:{registration:aircraft.registration,icao:aircraft.icao,engine:aircraft.engine},
   dep,arr,off,on,durationMin,role,picPersonId,picName:commander.name,
   pilotConfig,ifrMin,nightMin,instructorMin,takeoffDay,takeoffNight,landingDay,landingNight,
   crossCountry:values.crossCountry,remarks
  };
 }
 function addFlight(state,data,at){
  const next=updated(state,at),id=text(data?.id,"Flight ID",90);
  need(!getFlight(next,id),"Flight ID already exists");
  const f=flightFields(next,data);
  next.flights.push({id,...f,createdAt:iso(at),updatedAt:at});
  return next;
 }
 function flightIsArchived(state,id){
  return (state.archives?.flights||[]).some(b=>(b.items||[]).some(i=>i.flightId===id));
 }
 function editFlight(state,id,data,at){
  const next=updated(state,at),f=getFlight(next,id);
  need(!!f,"Flight not found");
  need(!flightIsArchived(next,id),"Archived flights require a correction addendum");
  const revised=flightFields(next,{...f,...data},f);
  // Changing an aircraft profile must not rewrite the snapshot of an existing flight.
  if(revised.aircraftId===f.aircraftId)revised.aircraftSnapshot=clone(f.aircraftSnapshot);
  Object.assign(f,revised,{updatedAt:at});return next;
 }
 function deleteFlight(state,id,at){
  const next=updated(state,at);
  need(getFlight(next,id),"Flight not found");
  need(!flightIsArchived(next,id),"Archived flights cannot be deleted");
  next.flights=next.flights.filter(f=>f.id!==id);return next;
 }
 function totals(state,records=state.flights){
  const totals={total:0,pic:0,copilot:0,dual:0,spic:0,picus:0,night:0,ifr:0,instructor:0,
   engineSE:0,engineME:0,single:0,multi:0,crossCountry:0,flightCount:0,
   takeoffDay:0,takeoffNight:0,landingDay:0,landingNight:0};
  for(const f of records){
   const n=f.durationMin;
   totals.total+=n;totals.flightCount++;
   if(PIC_ROLES.has(f.role))totals.pic+=n;
   if(f.role==="CO-PILOT")totals.copilot+=n;
   if(f.role==="DUAL")totals.dual+=n;
   if(f.role==="SPIC")totals.spic+=n;
   if(f.role==="PICUS")totals.picus+=n;
   totals[f.aircraftSnapshot?.engine==="ME"?"engineME":"engineSE"]+=n;
   totals[f.pilotConfig==="multi"?"multi":"single"]+=n;
   if(f.crossCountry)totals.crossCountry+=n;
   for(const [to,from] of Object.entries({night:"nightMin",ifr:"ifrMin",instructor:"instructorMin",
      takeoffDay:"takeoffDay",takeoffNight:"takeoffNight",landingDay:"landingDay",landingNight:"landingNight"}))totals[to]+=Number(f[from]||0);
  }
  return totals;
 }
 function fmtMinutes(n){return Math.floor(n/60)+":"+String(n%60).padStart(2,"0");}
 function validateState(state){
  const errors=[];
  if(!state||!Array.isArray(state.aircraft)||!Array.isArray(state.flights)||!Array.isArray(state.people))
   return ["Invalid V2 flight/aircraft collections"];
  const ids=new Set(),regs=new Set(),fids=new Set();
  const ownerCount=state.people.filter(p=>p.isAccountHolder).length;
  if(ownerCount>1)errors.push("Multiple account-holder profiles");
  for(const a of state.aircraft){
   if(!a||!a.id||ids.has(a.id)){errors.push("Missing/duplicate aircraft ID");continue;}
   ids.add(a.id);
   try{const norm=aircraftFields(a);
    if(regs.has(norm.registration))errors.push("Duplicate aircraft registration "+norm.registration);
    regs.add(norm.registration);
   }catch(e){errors.push("Invalid aircraft "+a.id+": "+e.message);}
  }
  for(const f of state.flights){
   if(!f||!f.id||fids.has(f.id)){errors.push("Missing/duplicate flight ID");continue;}
   fids.add(f.id);
   try{
    const aircraft=getAircraft(state,f.aircraftId);
    need(!!aircraft,"Aircraft missing");
    need(!!f.aircraftSnapshot&&["SE","ME"].includes(f.aircraftSnapshot.engine)&&!!f.aircraftSnapshot.icao,"Aircraft snapshot missing");
    need(f.durationMin===elapsed(f.off,f.on),"Invalid duration");
    const previous=flightFields(state,f,f);
    for(const field of ["date","dep","arr","off","on","role","picPersonId","pilotConfig",
     "ifrMin","nightMin","instructorMin","takeoffDay","takeoffNight","landingDay","landingNight","crossCountry","remarks"]){
       need(f[field]===previous[field],"Invalid "+field);
    }
    // The snapshot must survive later modifications to an aircraft profile.
   }catch(e){errors.push("Invalid flight "+f.id+": "+e.message);}
  }
  return errors;
 }
 return Object.freeze({ROLES,PIC_ROLES,SELF_ROLES,addAircraft,editAircraft,deleteAircraft,getAircraft,
  setAccountHolder,accountHolder,addFlight,editFlight,deleteFlight,getFlight,flightIsArchived,
  totals,fmtMinutes,validateState,timeValue,elapsed,dateValue});
});
