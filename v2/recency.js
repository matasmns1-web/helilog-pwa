/* HeliLog V2.33.1 TEST — automatic FCL.060 movement estimates.
 * For single-pilot PIC/SOLO, paired take-offs and landings provide estimated
 * PF take-off/approach/landing sequences. An approach is not separately logged:
 * NEVER describe this inference as independently confirmed legal currency.
 * Other crew roles/configurations require explicit PF evidence.
 * No write, backfill or alteration of signed records.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HeliLogV233Recency=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const DATE=/^\d{4}-\d{2}-\d{2}$/;
 const whole=x=>Number.isSafeInteger(x)&&x>=0;
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
 function typeCode(f,aircraft){
   const snapshot=String(f?.recency?.icao||'').trim().toUpperCase();
   if(snapshot&&/^[A-Z0-9]{2,8}$/.test(snapshot))return snapshot;
   const a=(aircraft||[]).find(x=>x.id===f?.aid);
   return String(a?.icao||'').trim().toUpperCase();
 }
 function config(f){
   if(f?.pilotConfig==='multi'||f?.pilotConfig==='single')return f.pilotConfig;
   return Number(f?.multiPilotMin||0)>0?'multi':'single';
 }
 function pairs(f,kind){
   const to=Number(f?.[kind==='night'?'takeoffNight':'takeoffDay']);
   const ld=Number(f?.[kind==='night'?'landingNight':'landingDay']);
   return whole(to)&&whole(ld)?Math.min(to,ld):0;
 }
 function verified(f){
   const r=f?.recency;
   return !!(r?.pfConfirmed===true&&whole(r.day)&&whole(r.night)&&
     r.day+r.night>0&&r.day<=pairs(f,'day')&&r.night<=pairs(f,'night'));
 }
 function autoEligible(f){
   // For PIC/SOLO in a single-pilot helicopter, the account holder normally PF.
   // DUAL/SPIC/PICUS/co-pilot and all multi-pilot flights need an explicit PF record.
   return !!(f&&f.entryType!=='simulator'&&config(f)==='single'&&
     ['PIC','SOLO'].includes(f.role)&&f.recency?.excludeAuto!==true);
 }
 function evidence(f){
   if(f?.entryType==='simulator')return {day:0,night:0,source:'unverified'};
   if(f?.recency?.excludeAuto===true)return {day:0,night:0,source:'excluded'};
   if(verified(f))return {day:f.recency.day,night:f.recency.night,source:'confirmed'};
   if(autoEligible(f)){
     const day=pairs(f,'day'),night=pairs(f,'night');
     if(day+night)return {day,night,source:'estimated'};
   }
   return {day:0,night:0,source:'unverified'};
 }
 function candidate(f){return pairs(f,'day')+pairs(f,'night');}
 function trailingEvent(events,target){
   let sum=0;
   for(const e of events){
     sum+=e.count;
     if(sum>=target)return e.date;
   }
   return null;
 }
 function nightHistory(flights,aircraft,iso,type,pilotConfig){
   return (flights||[]).some(f=>f&&f.entryType!=='simulator'&&
     dateUTC(f.date)!==null&&f.date<=iso&&typeCode(f,aircraft)===type&&
     config(f)===pilotConfig&&
     (Number(f.takeoffNight||0)>0||Number(f.landingNight||0)>0||
      Number(f.nightMin||0)>0||Number(f.recency?.night||0)>0));
 }
 function assess(flights,aircraft,iso,type,pilotConfig='single'){
   if(dateUTC(iso)===null)throw Error('Reference date must be YYYY-MM-DD.');
   const from=dateShift(iso,-89);
   const filtered=(flights||[]).filter(f=>
     f&&f.entryType!=='simulator'&&dateUTC(f.date)!==null&&
     f.date>=from&&f.date<=iso&&typeCode(f,aircraft)===type&&config(f)===pilotConfig);
   const credited=filtered.map(f=>({f,credit:evidence(f)}));
   const events=(kind)=>credited.map(({f,credit})=>({
     date:f.date,count:kind==='night'?credit.night:credit.day+credit.night}))
     .filter(x=>x.count>0).sort((a,b)=>b.date.localeCompare(a.date));
   const normal=events('general'),night=events('night');
   const general=normal.reduce((n,x)=>n+x.count,0);
   const nightCount=night.reduce((n,x)=>n+x.count,0);
   const manual=credited.filter(x=>x.credit.source==='confirmed');
   const manualGeneral=manual.reduce((n,x)=>n+x.credit.day+x.credit.night,0);
   const manualNight=manual.reduce((n,x)=>n+x.credit.night,0);
   const generalBase=trailingEvent(normal,3),nightBase=trailingEvent(night,1);
   const unverified=credited.filter(x=>x.credit.source==='unverified'&&candidate(x.f)>0);
   const unavailable=unverified.reduce((n,x)=>n+candidate(x.f),0);
   return Object.freeze({
     type,config:pilotConfig,from,through:iso,general,night:nightCount,
     generalDocumented:manualGeneral>=3,nightDocumented:manualNight>=1,
     generalEstimated:general>=3,nightEstimated:nightCount>=1,
     estimatedFlights:credited.filter(x=>x.credit.source==='estimated').length,
     confirmedFlights:manual.length,
     nightApplicable:nightHistory(flights,aircraft,iso,type,pilotConfig),
     nextGeneralLoss:generalBase?dateShift(generalBase,90):null,
     nextNightLoss:nightBase?dateShift(nightBase,90):null,
     unverifiedFlights:unverified.length,unverifiedPotential:unavailable
   });
 }
 function groups(flights,aircraft,iso){
   if(dateUTC(iso)===null)throw Error('Reference date must be YYYY-MM-DD.');
   const pairsSet=new Set();
   (flights||[]).filter(f=>f&&f.entryType!=='simulator'&&
     dateUTC(f.date)!==null&&f.date<=iso).forEach(f=>{
     const type=typeCode(f,aircraft);
     if(/^[A-Z0-9]{2,8}$/.test(type))pairsSet.add(type+'|'+config(f));
   });
   return [...pairsSet].map(s=>{
     const [type,cfg]=s.split('|');
     return assess(flights,aircraft,iso,type,cfg);
   }).sort((a,b)=>a.type.localeCompare(b.type)||a.config.localeCompare(b.config));
 }
 return Object.freeze({assess,groups,dateShift,verified,typeCode,evidence,autoEligible});
});