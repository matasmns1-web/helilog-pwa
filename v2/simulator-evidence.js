/* HeliLog V2.41 — read-only matching of explicitly classified FFS sessions.
 * This NEVER grants EASA privileges or awards automatic operator credit.
 * Unclassified/legacy simulator entries remain unmatched until pilot supplies
 * a precise ICAO represented-aircraft type and crew configuration.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HeliLogV241SimulatorEvidence=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const TYPE=/^[A-Z0-9]{2,8}$/;
 function classification(session){
  if(!session||session.entryType!=='simulator'||session.simCategory!=='FFS')return null;
  const type=String(session.simAircraftType||'').trim().toUpperCase();
  const config=String(session.simPilotConfig||'');
  if(!TYPE.test(type)||!['single','multi'].includes(config))return null;
  if(!/^[A-Za-z0-9:_-]{1,128}$/.test(String(session.id||'')))return null;
  const min=Number(session.stdMin);
  if(!Number.isSafeInteger(min)||min<=0)return null;
  const date=String(session.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    !Number.isFinite(Date.parse(date+'T00:00:00Z'))||
    new Date(Date.parse(date+'T00:00:00Z')).toISOString().slice(0,10)!==date)return null;
  return {type,config};
 }
 function matches(session,rule){
  const identified=classification(session);
  return !!(identified&&rule&&rule.aircraftType===identified.type&&
   ['single','multi','all'].includes(rule.configuration)&&
   (rule.configuration==='all'||rule.configuration===identified.config)&&
   Array.isArray(rule.acceptedSources)&&rule.acceptedSources.includes('ffs')&&
   typeof rule.monitor==='string'&&rule.monitor.length>0);
 }
 // Exact snapshot, rather than a non-cryptographic short hash: even one
 // changed qualification/date/device/remark forces another explicit review.
 function proof(session){
  if(!classification(session))return null;
  const snapshot=JSON.stringify([
   String(session.id),session.date,session.simCategory,
   session.simAircraftType,session.simPilotConfig,session.simDevice||'',
   session.simQualification||'',session.stdMin,session.remarks||''
  ]);
  return snapshot.length<=12000?snapshot:null;
 }
 function eligibleRecord(record,session,rule){
  return !!(record&&record.source==='ffs'&&record.status==='reviewed'&&
   record.sessionId===session?.id&&record.sessionProof&&
   proof(session)===record.sessionProof&&matches(session,rule)&&
   record.date===session.date&&
   record.configuration===session.simPilotConfig&&
   record.aircraftType===session.simAircraftType&&
   record.unit===rule.unit);
 }
 function suggestions(session,profiles){
  if(!classification(session)||!Array.isArray(profiles))return [];
  return profiles.flatMap(profile=>(profile?.rules||[]).filter(rule=>matches(session,rule))
   .map(rule=>({profileId:profile.id,operator:profile.operator,ruleId:rule.id,
    title:rule.title,unit:rule.unit})));
 }
 return Object.freeze({version:'2.41',classification,matches,proof,eligibleRecord,suggestions});
});
