/* HeliLog V2.18: offline civil-twilight night calculation.
 * EASA/SERA definition: centre of Sun below -6 degrees is night.
 * Solar position via Jean Meeus approximate equations (SunCalc/Mourner model).
 * Public-domain aerodrome coordinates: OurAirports, checked October 2026.
 * Not an official national AIP twilight table or certified calculation.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogNight=api;
})(typeof window!=="undefined"?window:globalThis,function(){
 "use strict";
 const R=Math.PI/180;
 const T0=Date.UTC(2000,0,1,12);
 const DAY=86400000;
 const HORIZON=-6*R;
 const KNOWN=Object.freeze({
  // OurAirports published WGS84 aerodrome reference points.
  EYVI:[54.634102,25.285801],EYKA:[54.963965,24.085820],
  EYPA:[55.973202,21.093901],EYSA:[55.893902,23.395000],
  EYKL:[55.712021,21.242892],EYMO:[55.112875,25.336484],
  EYKS:[54.879799,23.881500],EYVK:[54.668301,25.515800],
  EVRA:[56.920752,23.970711],EETN:[59.413246,24.832640],
  EPWA:[52.165699,20.967100],
  // Lithuania 2026 VFR AIP: EYPN reference point; others published ATZ centres.
  EYPN:[55.708889,24.345278],EYPR:[54.653611,24.056389],
  EYVP:[54.483056,24.992222],EYRO:[55.611111,24.217500],
  EYRD:[54.495556,24.717500],EYMM:[54.662222,23.452222],
  EYNI:[55.328056,21.048056]
 });
 const AIP_CODES=new Set(['EYPN','EYPR','EYVP','EYRO','EYRD','EYMM','EYNI']);
 function coordinates(input){
  const a=Number(input?.lat),b=Number(input?.lon);
  if(input==null||input.lat==null||input.lon==null||input.lat===""||input.lon===""||!Number.isFinite(a)||!Number.isFinite(b)||
     a<-90||a>90||b<-180||b>180)return null;
  return {lat:a,lon:b};
 }
 function lookup(code){
  const v=KNOWN[String(code||"").trim().toUpperCase()];
  return v?{lat:v[0],lon:v[1],source:AIP_CODES.has(String(code||'').trim().toUpperCase())?
    "Lithuania AIP aerodrome / ATZ centre":"OurAirports"}:null;
 }
 function utcFlight(date,off,on){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||""))return null;
  const base=Date.parse(date+"T00:00:00Z");
  if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,10)!==date)return null;
  function clock(x){if(!/^\d{2}:\d{2}$/.test(x||""))return null;
   const h=Number(x.slice(0,2)),m=Number(x.slice(3,5));
   return h<24&&m<60?h*60+m:null;}
  const a=clock(off),b=clock(on);
  if(a===null||b===null||a===b)return null;
  // Existing HeliLog flight-time rule: arrival <= departure means the next UTC day.
  const n=(b-a+1440)%1440;
  return n?{start:base+a*60000,minutes:n,end:base+a*60000+n*60000}:null;
 }
 function sunAltitude(ms,point){
  const d=(ms-T0)/DAY;
  const M=R*(357.5291+0.98560028*d);
  const C=R*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M));
  const L=M+C+R*102.9372+Math.PI;
  const dec=Math.asin(Math.sin(L)*Math.sin(R*23.4397));
  const ra=Math.atan2(Math.sin(L)*Math.cos(R*23.4397),Math.cos(L));
  // Note: hour angle east-positive geographical longitude.
  const H=R*(280.16+360.9856235*d+point.lon)-ra;
  const lat=point.lat*R;
  return Math.asin(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(H))/R;
 }
 function directLongitude(from,to,t){
  let delta=((to-from+540)%360)-180;
  return ((from+t*delta+540)%360)-180;
 }
 function position(a,b,t){
  return {lat:a.lat+(b.lat-a.lat)*t,lon:directLongitude(a.lon,b.lon,t)};
 }
 function distanceKm(a,b){
  const p1=a.lat*R,p2=b.lat*R;
  const delta=((b.lon-a.lon+540)%360)-180;
  const h=Math.sin((p2-p1)/2)**2+
    Math.cos(p1)*Math.cos(p2)*Math.sin(delta*R/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
 }
 // Sample solar-centre altitude at the midpoint of each UTC loggable minute.
 // Route is interpolated between aerodrome centres; not a recorded GPS track.
 function calculate({date,off,on,dep,arr}={}){
  const a=coordinates(dep),b=coordinates(arr),flight=utcFlight(date,off,on);
  if(!flight)return {ok:false,reason:"Enter a valid flight date and different off/on times in UTC."};
  if(!a||!b)return {ok:false,reason:"Coordinates are missing or invalid. Enter WGS84 latitude and longitude for both sites."};
  let night=0;
  for(let i=0;i<flight.minutes;i++){
   const t=(i+0.5)/flight.minutes;
   if(sunAltitude(flight.start+(i+0.5)*60000,position(a,b,t))<-6)night++;
  }
  const km=distanceKm(a,b);
  return {ok:true,nightMinutes:night,totalMinutes:flight.minutes,distanceKm:Math.round(km),
    method:km<2?"same-site":"straight-line-estimate",civilTwilightAngle:-6,
    departure:a,arrival:b,date,off,on};
 }
 function utcLabel(ms){
  const d=new Date(ms);return d.toISOString().slice(0,16).replace("T"," ")+" UTC";
 }
 // Scan the +/- 24 h surrounding the flight for local morning/evening crossings.
 function twilightAround(ms,point){
  const p=coordinates(point);if(!p||!Number.isFinite(ms))return null;
  const events=[],step=60000,first=ms-24*60*step,last=ms+24*60*step;
  let prev=sunAltitude(first,p)<-6;
  for(let t=first+step;t<=last;t+=step){
   const now=sunAltitude(t,p)<-6;
   if(now!==prev){
    let lo=t-step,hi=t;
    for(let j=0;j<12;j++){
     const mid=(lo+hi)/2;
     if((sunAltitude(mid,p)<-6)===prev)lo=mid;else hi=mid;
    }
    events.push({type:now?"evening":"morning",at:Math.round((lo+hi)/2/60000)*60000});
   }
   prev=now;
  }
  const nearest=(type)=>events.filter(x=>x.type===type)
    .sort((x,y)=>Math.abs(x.at-ms)-Math.abs(y.at-ms))[0]?.at??null;
  return {morningUtc:nearest("morning"),eveningUtc:nearest("evening"),
    polar:events.length===0};
 }
 return Object.freeze({lookup,coordinates,utcFlight,sunAltitude,calculate,twilightAround,utcLabel,distanceKm});
});
