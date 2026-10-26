/* HeliLog V2.34 TEST — specialised operations recent-experience counters.
 * Read-only calculator over documented flights. No automatic certification:
 * training, hover transitions, operational approval, personnel roles,
 * aircraft/FFS credits, and offshore full sequences require independent checks.
 */
(function(root,factory){const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HeliLogV234SpecialRecency=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const kinds=Object.freeze([
  {id:'NVIS',code:'NVIS',title:'NVIS',source:'flights',dayTarget:3,rule:'SPA.NVIS.130(d)'},
  {id:'HHO',code:'HHO',title:'Hoist (HHO)',source:'cycles',dayTarget:3,nightTarget:3,rule:'SPA.HHO.130(d)'},
  {id:'OFFSHORE',code:'OFFSHORE',title:'Offshore',source:'sequences',dayTarget:3,nightTarget:3,rule:'SPA.HOFO.170(b)'}
 ]);
 const whole=x=>Number.isSafeInteger(x)&&x>=0&&x<=9999;
 const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  !Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(Date.parse(v+'T00:00:00Z')).toISOString().slice(0,10)===v;
 function shift(date,days){
  if(!validDate(date))throw Error('Invalid ISO date');
  return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
 }
 function isRealFlight(f){return f&&f.entryType!=='simulator'&&validDate(f.date);}
 function typeCode(f,aircraft){
  const a=(aircraft||[]).find(a=>a.id===f?.aid);
  return String(a?.icao||'').trim().toUpperCase();
 }
 function config(f){return f?.pilotConfig==='multi'?'multi':'single';}
 function cycles(f,code){
  const rec=f?.specialOpsCycles?.[code];
  if(!rec||!whole(rec.day)||!whole(rec.night))return {day:0,night:0};
  // Cycle data without an operation marker must never be credited.
  if(!Object.prototype.hasOwnProperty.call(f.specialOps||{},code))return {day:0,night:0};
  return {day:rec.day,night:rec.night};
 }
 function lastThreshold(events,target){
  let total=0;
  for(const e of [...events].sort((a,b)=>b.date.localeCompare(a.date))){
   total+=e.count;
   if(total>=target)return shift(e.date,90);
  }
  return null;
 }
 function assess(flights,aircraft,asOf,type,kindId,configuration='single'){
  if(!validDate(asOf))throw Error('Invalid reference date');
  const kind=kinds.find(k=>k.id===kindId);
  if(!kind)throw Error('Unknown specialised recency');
  const start=shift(asOf,-89);
  const matching=(flights||[]).filter(f=>isRealFlight(f)&&f.date<=asOf&&
    typeCode(f,aircraft)===type&&config(f)===configuration&&
    Object.prototype.hasOwnProperty.call(f.specialOps||{},kind.code));
  const history=matching.length>0;
  const within=matching.filter(f=>f.date>=start);
  const entries=within.map(f=>{
   if(kind.source==='flights')return {date:f.date,day:1,night:0};
   const c=cycles(f,kind.code);
   return {date:f.date,day:c.day,night:c.night};
  });
  const day=entries.reduce((n,e)=>n+e.day+e.night,0);
  const night=entries.reduce((n,e)=>n+e.night,0);
  // Night panel appears only after explicitly recorded night cycles.
  const nightHistory=kind.nightTarget?matching.some(f=>cycles(f,kind.code).night>0):false;
  const full=entries.map(e=>({date:e.date,count:e.day+e.night}));
  const dark=entries.map(e=>({date:e.date,count:e.night}));
  return Object.freeze({type,config:configuration,id:kind.id,title:kind.title,
    rule:kind.rule,source:kind.source,start,asOf,history,
    day,night,nightHistory,dayTarget:kind.dayTarget,nightTarget:kind.nightTarget||0,
    dayMet:day>=kind.dayTarget,nightMet:!!kind.nightTarget&&night>=kind.nightTarget,
    dayLapse:day>=kind.dayTarget?lastThreshold(full,kind.dayTarget):null,
    nightLapse:kind.nightTarget&&night>=kind.nightTarget?lastThreshold(dark,kind.nightTarget):null,
    evidenceFlights:within.length,
    missingCounts:kind.source==='flights'?0:within.filter(f=>!f.specialOpsCycles?.[kind.code]).length
  });
 }
 function groups(flights,aircraft,asOf){
  if(!validDate(asOf))throw Error('Invalid reference date');
  const by=new Set();
  (flights||[]).filter(f=>isRealFlight(f)&&f.date<=asOf).forEach(f=>{
   const type=typeCode(f,aircraft);
   if(!/^[A-Z0-9]{2,8}$/.test(type))return;
   for(const kind of kinds)if(Object.prototype.hasOwnProperty.call(f.specialOps||{},kind.code))
     by.add(type+'|'+config(f)+'|'+kind.id);
  });
  return [...by].map(s=>{
   const [type,cfg,id]=s.split('|');
   return assess(flights,aircraft,asOf,type,id,cfg);
  }).sort((a,b)=>a.type.localeCompare(b.type)||a.title.localeCompare(b.title)||a.config.localeCompare(b.config));
 }
 return Object.freeze({kinds,groups,assess,cycles,shift});
});