/* HeliLog V2.35 TEST — Phase 3A custom operator rule and credit model.
 * Separate, in-memory pilot-reviewed evidence tracking. Does not modify
 * EASA FCL.060/SPA recency, flight records, cloud data or signed archives.
 * Pilot review is NOT operator approval, certification or an e-signature.
 */
(function(root,factory){const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HeliLogV235AdvancedRecency=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const SOURCES=Object.freeze(['flight','ffs','check','training']);
 const UNITS=Object.freeze(['sequences','flights','cycles','landings','sessions']);
 const CONFIGS=Object.freeze(['single','multi','all']);
 const ID=/^[A-Za-z0-9:_-]{1,128}$/,TYPE=/^[A-Z0-9]{2,8}$/;
 const isId=x=>typeof x==='string'&&ID.test(x);
 const isType=x=>typeof x==='string'&&TYPE.test(x);
 const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
 const words=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=max;
 function validDate(s){
   if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
   const t=Date.parse(s+'T00:00:00Z');
   return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s;
 }
 function shift(s,days){
   if(!validDate(s))throw Error('Invalid date');
   return new Date(Date.parse(s+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
 }
 function ruleSet(input){
   if(!input||!isId(input.id)||!isId(input.ownerId)||!words(input.operator,120)||
     !Array.isArray(input.rules)||!input.rules.length||input.rules.length>50)
     throw Error('Invalid operator rule set');
   const seen=new Set();
   const rules=input.rules.map(r=>{
     if(!r||!isId(r.id)||seen.has(r.id)||!words(r.title,120)||
       !isType(r.aircraftType)||!CONFIGS.includes(r.configuration)||
       !UNITS.includes(r.unit)||!integer(r.periodDays,1,1095)||
       !integer(r.minimum,1,9999)||!Array.isArray(r.acceptedSources)||
       !r.acceptedSources.length||!r.acceptedSources.every(x=>SOURCES.includes(x))||
       new Set(r.acceptedSources).size!==r.acceptedSources.length)
       throw Error('Invalid operator rule');
     seen.add(r.id);
     return Object.freeze({id:r.id,title:r.title.trim(),aircraftType:r.aircraftType,
       configuration:r.configuration,unit:r.unit,periodDays:r.periodDays,
       minimum:r.minimum,acceptedSources:Object.freeze([...r.acceptedSources])});
   });
   return Object.freeze({schema:1,id:input.id,ownerId:input.ownerId,
     operator:input.operator.trim(),rules:Object.freeze(rules)});
 }
 function creditEvent(e){
   if(!e||!isId(e.id)||!isId(e.ownerId)||!isId(e.ruleId)||
     !validDate(e.date)||!isType(e.aircraftType)||!CONFIGS.includes(e.configuration)||
     !SOURCES.includes(e.source)||!UNITS.includes(e.unit)||
     !integer(e.amount,1,9999)||!['draft','reviewed'].includes(e.status))
     throw Error('Invalid credit event');
   if(e.status==='reviewed'&&!words(e.evidenceRef,240))
     throw Error('Reviewed credit requires evidence reference');
   if(e.evidenceRef!=null&&e.evidenceRef!==''&&!words(e.evidenceRef,240))
     throw Error('Invalid evidence reference');
   return Object.freeze({schema:1,id:e.id,ownerId:e.ownerId,ruleId:e.ruleId,
     date:e.date,aircraftType:e.aircraftType,configuration:e.configuration,
     source:e.source,unit:e.unit,amount:e.amount,status:e.status,
     evidenceRef:e.evidenceRef?e.evidenceRef.trim():''});
 }
 function assess(set,events,asOf,ruleId){
   const validated=ruleSet(set);
   if(!validDate(asOf))throw Error('Invalid assessment date');
   const rule=validated.rules.find(r=>r.id===ruleId);
   if(!rule)throw Error('Unknown operator rule');
   const from=shift(asOf,1-rule.periodDays);
   const seen=new Set(),accepted=[];
   for(const raw of Array.isArray(events)?events:[]){
     let e;try{e=creditEvent(raw);}catch{continue;}
     if(seen.has(e.id))continue;
     seen.add(e.id);
     if(e.ownerId!==validated.ownerId||e.ruleId!==rule.id||
       e.aircraftType!==rule.aircraftType||e.unit!==rule.unit||
       (rule.configuration!=='all'&&e.configuration!==rule.configuration)||
       !rule.acceptedSources.includes(e.source)||e.status!=='reviewed'||
       !e.evidenceRef||e.date<from||e.date>asOf)continue;
     accepted.push(e);
   }
   const count=accepted.reduce((n,e)=>n+e.amount,0),met=count>=rule.minimum;
   let nextThresholdLoss=null;
   if(met){
     const newest=[...accepted].sort((a,b)=>b.date.localeCompare(a.date));
     let sum=0;
     for(const e of newest){
       sum+=e.amount;
       if(sum>=rule.minimum){nextThresholdLoss=shift(e.date,rule.periodDays);break;}
     }
   }
   return Object.freeze({kind:'custom-operator-only',ruleId:rule.id,
     operator:validated.operator,unit:rule.unit,from,through:asOf,
     minimum:rule.minimum,count,thresholdMet:met,nextThresholdLoss,
     evidenceIds:Object.freeze(accepted.map(e=>e.id)),certification:false,
     disclaimer:'Pilot-reviewed custom operator tracking only. Confirm approval, checks, training and legal privileges separately.'});
 }
 return Object.freeze({version:'2.35',SOURCES,UNITS,CONFIGS,validDate,shift,ruleSet,creditEvent,assess});
});