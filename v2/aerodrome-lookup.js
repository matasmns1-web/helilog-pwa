/* HeliLog V2.19 — optional online lookup of ICAO airport reference coordinates.
 * Source: OpenFlights airport data (ODbL), public non-operational reference.
 * Bundle V2.18's local airport coordinates for guaranteed offline lookup.
 * The ~1 MB worldwide list is fetched once per session when an unknown ICAO
 * code is entered. It is never a certified AIP or navigational database.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogAerodromes=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 const URL="https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat";
 let table=null,request=null,unavailable=false;
 function code(value){return String(value||"").trim().toUpperCase();}
 function csvFields(line){
  const out=[];let field="",quoted=false;
  for(let i=0;i<line.length;i++){
   const c=line[i];
   if(c==='"'){
    if(quoted&&line[i+1]==='"'){field+='"';i++}
    else quoted=!quoted;
   }else if(c===","&&!quoted){out.push(field);field=""}
   else field+=c;
  }
  out.push(field);return out;
 }
 function parse(text){
  if(typeof text!=="string"||text.length>12000000)throw Error("Invalid airport data");
  const result=Object.create(null);
  for(const line of text.split(/\r?\n/)){
   const fields=csvFields(line);
   if(fields.length<8)continue;
   const id=code(fields[5]);
   if(!/^[A-Z]{4}$/.test(id)||result[id])continue;
   const lat=Number(fields[6]),lon=Number(fields[7]);
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180)continue;
   result[id]={lat,lon,source:"OpenFlights global airport database",name:fields[1]||id};
  }
  return result;
 }
 function cached(id){
  const key=code(id);
  return root.HeliLogNight?.lookup?.(key)||table?.[key]||null;
 }
 async function lookup(id){
  const key=code(id),local=cached(key);
  if(local)return local;
  // No remote query for private helipad codes, unstructured place names, or
  // anything except a strict four-letter ICAO candidate.
  if(!/^[A-Z]{4}$/.test(key)||unavailable)return null;
  if(!table){
   if(!request){
    request=(async()=>{
     if(typeof root.fetch!=="function")throw Error("Offline airport lookup");
     const controller=typeof AbortController!=="undefined"?new AbortController():null;
     const timeout=controller&&typeof setTimeout==="function"?
      setTimeout(()=>controller.abort(),12000):null;
     try{
      const res=await root.fetch(URL,{signal:controller?.signal,cache:"force-cache"});
      if(!res.ok)throw Error("Aerodrome index unavailable");
      const text=await res.text();
      table=parse(text);
     }finally{if(timeout!==null)clearTimeout(timeout)}
    })().catch(()=>{
     unavailable=true;
     return null;
    }).finally(()=>{request=null});
   }
   await request;
  }
  return table?.[key]||null;
 }
 return Object.freeze({lookup,cached,parse,csvFields,code,sourceUrl:URL});
});
