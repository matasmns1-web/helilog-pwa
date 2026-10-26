/* HeliLog V2.33 TEST — conservative FCL.060 recent-experience evidence.
 * Pure calculation. Never interprets ordinary landings or simulator minutes
 * as verified pilot-flying take-off/approach/landing sequences.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HeliLogV233Recency=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const DATE=/^\d{4}-\d{2}-\d{2}$/;
 function dateUTC(v){
   if(typeof v!=='string'||!DATE.test(v))return null;
   const t=Date.parse(v+'T00:00:00Z');
   return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v?t:null;
 }
 function dateShift(iso,days){
   const t=dateUTC(iso);
   if(t===null)throw Error('Invalid recency reference date.');
   return new Date(t+days*86400000).toISOString().slice(0,10);
 }
 const whole=x=>Number.isSafeInteger(x)&&x>=0;
 function typeCode(f,aircraft){
   const snapshot=String(f?.recency?.icao||'').trim().toUpperCase();
   if(snapshot && /^[A-Z0-9]{2,8}$/.test(snapshot))return snapshot;
   const a=(aircraft||[]).find(x=>x.id===f?.aid);
   return String(a?.icao||'').trim().toUpperCase();
 }
 function config(f){
   return f?.pilotConfig==='multi'||Number(f?.multiPilotMin||0)>0?'multi':'single';
 }
 function verified(f){
   const r=f?.recency;
   return !!(r&&r.pfConfirmed===true&&whole(r.day)&&whole(r.night)&&
     (r.day+r.night)>0 &&
     r.day<=Math.min(Number(f.takeoffDay||0),Number(f.landingDay||0)) &&
     r.night<=Math.min(Number(f.takeoffNight||0),Number(f.landingNight||0)));
 }
 function candidate(f){
   return Math.max(0,Math.min(Number(f.takeoffDay||0),Number(f.landingDay||0)))+
     Math.max(0,Math.min(Number(f.takeoffNight||0),Number(f.landingNight||0)));
 }
 function trailingEvent(events,target){
   let sum=0;
   for(const e of events){
     sum+=e.count;
     if(sum>=target)return e.date;
   }
   return null;
 }
 function assess(flights,aircraft,iso,type,pilotConfig='single'){
   if(dateUTC(iso)===null)throw Error('Reference date must be YYYY-MM-DD.');
   const from=dateShift(iso,-89);
   const filtered=(flights||[]).filter(f=>
     f&&f.entryType!=='simulator'&&dateUTC(f.date)!==null&&
     f.date>=from&&f.date<=iso&&typeCode(f,aircraft)===type&&config(f)===pilotConfig);
   const documented=filtered.filter(verified);
   const events=(kind)=>documented.map(f=>({date:f.date,count:kind==='night'?f.recency.night:f.recency.day+f.recency.night}))
     .filter(x=>x.count>0).sort((a,b)=>b.date.localeCompare(a.date));
   const normal=events('general'),night=events('night');
   const general=normal.reduce((n,x)=>n+x.count,0);
   const nightCount=night.reduce((n,x)=>n+x.count,0);
   const generalBase=trailingEvent(normal,3),nightBase=trailingEvent(night,1);
   const older=filtered.filter(f=>!verified(f)&&candidate(f)>0);
   const unavailable=older.reduce((n,f)=>n+candidate(f),0);
   return Object.freeze({
     type,config:pilotConfig,from,through:iso,general,night:nightCount,
     generalDocumented:general>=3,nightDocumented:nightCount>=1,
     nextGeneralLoss:generalBase?dateShift(generalBase,90):null,
     nextNightLoss:nightBase?dateShift(nightBase,90):null,
     unverifiedFlights:older.length,unverifiedPotential:unavailable,
     confirmedFlights:documented.length
   });
 }
 function groups(flights,aircraft,iso){
   if(dateUTC(iso)===null)throw Error('Reference date must be YYYY-MM-DD.');
   const pairs=new Set();
   (aircraft||[]).forEach(a=>{
     const type=String(a?.icao||'').trim().toUpperCase();
     if(/^[A-Z0-9]{2,8}$/.test(type))pairs.add(type+'|single');
   });
   (flights||[]).filter(f=>f?.entryType!=='simulator').forEach(f=>{
     const type=typeCode(f,aircraft);
     if(/^[A-Z0-9]{2,8}$/.test(type))pairs.add(type+'|'+config(f));
   });
   return [...pairs].map(s=>{
      const [type,cfg]=s.split('|');
      return assess(flights,aircraft,iso,type,cfg);
   }).sort((a,b)=>a.type.localeCompare(b.type)||a.config.localeCompare(b.config));
 }
 return Object.freeze({assess,groups,dateShift,verified,typeCode});
});