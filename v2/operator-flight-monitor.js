/* HeliLog v2.38 TEST — read-only, explicit flight-field operator activity monitor.
 * No flight, cloud, EASA calculation or signed archive mutations.
 * User-selected flight fields are self-recorded evidence, not validated operator currency.
 */
(function(root,factory){const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HeliLogV2362OperatorMonitor=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const OPTIONS=Object.freeze([
  {id:'special:HESLO1',label:'Flight entry → HESLO 1 cycles',unit:'cycles'},
  {id:'special:HESLO2',label:'Flight entry → HESLO 2 cycles',unit:'cycles'},
  {id:'special:HESLO3',label:'Flight entry → HESLO 3 cycles',unit:'cycles'},
  {id:'special:HESLO4',label:'Flight entry → HESLO 4 cycles',unit:'cycles'},
  {id:'special:VRLL',label:'Flight entry → Vertical-reference long-line cycles',unit:'cycles'},
  {id:'special:HEC',label:'Flight entry → Human external cargo cycles',unit:'cycles'},
  {id:'special:HHO',label:'Flight entry → Hoist (HHO) cycles',unit:'cycles'},
  {id:'special:FIRE',label:'Flight entry → Firefighting cycles',unit:'cycles'},
  {id:'special:MOUNTAIN',label:'Flight entry → Mountain operations cycles',unit:'cycles'},
  {id:'special:SURVEY',label:'Flight entry → Aerial survey cycles',unit:'cycles'},
  {id:'special:OFFSHORE',label:'Flight entry → Offshore platform landings',unit:'landings'},
  {id:'special:NVIS',label:'Flight entry → NVIS flights',unit:'flights'},
  {id:'flights:all',label:'Flight logbook → Recorded flights (all operations)',unit:'flights'},
  {id:'flights:night',label:'Flight logbook → Night flights (recorded night time)',unit:'flights'},
  {id:'flights:night-vfr',label:'Flight logbook → Night VFR flights (explicit VFR + night time)',unit:'flights'}
 ]);
 const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
   Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(Date.parse(s+'T00:00:00Z')).toISOString().slice(0,10)===s;
 const shift=(d,days)=>new Date(Date.parse(d+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
 const positive=x=>Number.isSafeInteger(x)&&x>=0&&x<=9999;
 function optionFor(monitor){return OPTIONS.find(x=>x.id===monitor)||null;}
 function validate(rule){
  if(!rule||typeof rule!=='object')throw Error('Invalid operator rule.');
  const option=optionFor(rule.monitor);
  if(!option)throw Error('Choose a monitored activity from recorded flight fields.');
  if(rule.unit!==option.unit)throw Error('The monitoring activity must use '+option.unit+'.');
  return option;
 }
 function assess(rule,flights,aircraft,asOf){
  const option=validate(rule);
  if(!validDate(asOf))throw Error('Invalid assessment date.');
  if(!/^[A-Z0-9]{2,8}$/.test(rule.aircraftType||'')||
     !['single','multi','all'].includes(rule.configuration)||
     !Number.isSafeInteger(rule.minimum)||rule.minimum<1||
     !Number.isSafeInteger(rule.periodDays)||rule.periodDays<1||rule.periodDays>1095)
    throw Error('Invalid operator rule threshold.');
  const from=shift(asOf,1-rule.periodDays);
  const airById=new Map((Array.isArray(aircraft)?aircraft:[]).map(a=>[a.id,String(a.icao||'').trim().toUpperCase()]));
  const used=new Set(),evidence=[];let unrecorded=0;
  for(const f of Array.isArray(flights)?flights:[]){
   if(!f||f.entryType==='simulator'||!validDate(f.date)||f.date<from||f.date>asOf||
      airById.get(f.aid)!==rule.aircraftType||
      (rule.configuration!=='all'&&(f.pilotConfig==='multi'?'multi':'single')!==rule.configuration))continue;
   // Distinct real flight entries only; repeated IDs cannot multiply evidence.
   const id=String(f.id||'');
   if(!id||used.has(id))continue;
   used.add(id);
   let n=0;
   if(option.id==='flights:all')n=1;
   else if(option.id==='flights:night'||option.id==='flights:night-vfr'){
    // Night is recorded duration, not IFR time or number of night movements.
    // Night VFR MUST have a positively recorded VFR classification. Legacy and
    // unspecified flights are deliberately excluded; never infer from IFR minutes.
    const night=f.nightMin,total=f.mins;
    const validNight=positive(night)&&night>0&&positive(total)&&night<=total;
    n=validNight&&(option.id!=='flights:night-vfr'||f.flightRules==='VFR')?1:0;
   }
   else{
    const code=option.id.slice(8);
    if(!Object.prototype.hasOwnProperty.call(f.specialOps||{},code))continue;
    if(option.id==='special:NVIS')n=1;
    else{
     const d=f.specialOpsCycles?.[code];
     if(!d||!positive(d.day)||!positive(d.night)){unrecorded++;continue;}
     n=d.day+d.night;
    }
   }
   if(n>0)evidence.push({date:f.date,id,count:n});
  }
  const count=evidence.reduce((n,e)=>n+e.count,0);
  const thresholdMet=count>=rule.minimum;
  let thresholdUntil=null;
  if(thresholdMet){
   let tally=0;
   for(const e of [...evidence].sort((a,b)=>b.date.localeCompare(a.date))){
    tally+=e.count;
    if(tally>=rule.minimum){thresholdUntil=shift(e.date,rule.periodDays);break;}
   }
  }
  return Object.freeze({kind:'operator-recorded-activity',monitor:option.id,unit:option.unit,
    title:rule.title,type:rule.aircraftType,configuration:rule.configuration,
    from,through:asOf,count,minimum:rule.minimum,thresholdMet,thresholdUntil,
    evidenceFlights:evidence.length,missingCycleCounts:unrecorded,
    certified:false,source:'flight',disclaimer:'Recorded flight activity only; does not confirm operator approval, crew qualifications, or EASA privileges.'});
 }
 return Object.freeze({version:'2.38',OPTIONS,optionFor,validate,assess});
});