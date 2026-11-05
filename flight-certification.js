/* HeliLog V2.54 — PICUS / SPIC commander countersignature evidence.
 * Records an explicit signer's PNG and a snapshot of the precise signed flight.
 * No automatic signature, no independent identity verification, no qualified
 * electronic signature and no change to the pilot's recorded flight time.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV254Certification=api;
})(typeof window!=="undefined"?window:globalThis,function(){
 "use strict";
 const FIELDS=["id","entryType","date","aid","dep","off","arr","on","mins","role",
  "picName","picPersonId","pilotConfig","nightMin","nightCalculation","ifrMin",
  "takeoffDay","takeoffNight","landingDay","landingNight","instrMin","instructorSelected",
  "stdType","stdMin","crossCountry","specialOps","specialOpsCycles","recency","remarks"];
 const VALID_PNG=/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
 function escapeHTML(value){
  return String(value??"").replace(/[&<>"']/g,ch=>({
   "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));
 }
 function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object"){
   const o={};for(const k of Object.keys(value).sort())o[k]=canonical(value[k]);return o;
  }
  return value;
 }
 function subject(f){
  if(!f||typeof f!=="object")return "";
  const snapshot={};
  for(const key of FIELDS)if(Object.prototype.hasOwnProperty.call(f,key))
    snapshot[key]=canonical(f[key]);
  return JSON.stringify(snapshot);
 }
 function required(f){return !!f&&f.entryType!=="simulator"&&(f.role==="PICUS"||f.role==="SPIC");}
 function png(src){return typeof src==="string"&&src.length<=250000&&VALID_PNG.test(src);}
 function status(f){
  if(!required(f))return "not-required";
  const c=f.commanderCertification;
  if(!c)return "pending";
  if(!c||c.version!==1||!png(c.signatureData)||!c.signedAt||
     !/^\d{4}-\d{2}-\d{2}T/.test(c.signedAt)||
     !c.signerId||c.signerId!==f.picPersonId||
     !c.signedName||c.signedName!==f.picName||
     !["drawn","saved-profile"].includes(c.source)||
     typeof c.signedRecord!=="string"||c.signedRecord!==subject(f))
   return "invalid";
  return "certified";
 }
 function create(f,person,signatureData,source,at){
  if(!required(f)||f.commanderCertification||!person||
     person.isAccountHolder||person.id!==f.picPersonId||
     person.name!==f.picName||!png(signatureData)||
     !["drawn","saved-profile"].includes(source))throw Error("Only the recorded commander/FI may countersign this flight.");
  const signedAt=at||new Date().toISOString();
  if(!Number.isFinite(Date.parse(signedAt)))throw Error("Invalid certification date.");
  return {version:1,signerId:person.id,signedName:person.name,
   signedLicence:person.licence||"",signedLicenceNumber:person.licenceNumber||"",
   signedFiFeNumber:person.fiFeNumber||"",signatureData,source,
   signedAt,approvedAt:signedAt,signedRecord:subject(f)};
 }
 function countersignatureText(f){
  if(!required(f))return "";
  const s=status(f);
  return f.role+" — "+(f.picName?"PIC/FI: "+f.picName+"; ":"")+
   (s==="certified"?"countersigned "+f.commanderCertification.signedAt.slice(0,10):
    s==="invalid"?"signature needs re-verification":"signature not recorded electronically");
 }
 // This is used only by the PDF/printed flight row. Any stored PNG must match
 // both a strict data: URL allowlist and the unchanged, signed flight snapshot.
 function printRemarks(f,remarks){
  let html=escapeHTML(remarks||"");
  if(!required(f))return html;
  const c=f.commanderCertification,valid=status(f)==="certified";
  const label=escapeHTML(f.role+" — "+(f.picName||"PIC/FI"));
  if(html)html+="<div style=\"margin-top:2px\"></div>";
  html+='<div class="flight-commander-cert"><b>'+label+"</b>";
  if(valid){
   html+='<img class="flight-commander-sig" src="'+c.signatureData+
    '" alt="PIC or instructor countersignature" />';
   html+='<span class="flight-commander-date">Countersigned '+escapeHTML(c.signedAt.slice(0,10))+"</span>";
  }else if(status(f)==="invalid"){
   html+='<span class="flight-commander-pending">Signature verification needed — no valid electronic certification</span>';
  }else{
   html+='<span class="flight-commander-pending">PIC/FI signature: __________________</span>';
  }
  return html+"</div>";
 }
 function sums(flights){
  const out={signedSpic:0,signedPicus:0,pendingSpic:0,pendingPicus:0,invalid:0};
  for(const f of flights||[]){
   if(!required(f))continue;
   const minutes=Number(f.mins||0);
   if(!Number.isSafeInteger(minutes)||minutes<0)continue;
   const s=status(f);
   if(s==="invalid")out.invalid++;
   const key=(s==="certified"?"signed":"pending")+(f.role==="SPIC"?"Spic":"Picus");
   out[key]+=minutes;
  }
  return out;
 }
 return Object.freeze({required,png,subject,status,create,printRemarks,countersignatureText,sums});
});