/* HeliLog V2.8 TEST — externally saved, checksum-verified account recovery packages.
 * This module NEVER writes cloud records or restores a cloud account.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV28Recovery=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 const clone=x=>JSON.parse(JSON.stringify(x));
 const digest=async data=>{
  if(!root.crypto?.subtle)throw Error("Secure HTTPS with Web Crypto is required for SHA-256.");
  const bytes=new TextEncoder().encode(data);
  const hashed=await root.crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hashed)].map(b=>b.toString(16).padStart(2,"0")).join("");
 };
 function count(data){
  return {flights:data.flights.length,aircraft:data.aircraft.length,
   endorsements:data.endorsements.length,
   flightArchives:data.printArchive?.batches?.length||0,
   endorsementArchives:data.endorsementV2Archive?.batches?.length||0};
 }
 function validWorkspace(data){
  return data&&typeof data==="object"&&!Array.isArray(data)&&
   data.pilot&&typeof data.pilot==="object"&&
   ["flights","aircraft","people","endorsements","qualifications"].every(k=>Array.isArray(data[k]))&&
   (!data.printArchive||Array.isArray(data.printArchive.batches))&&
   (!data.endorsementV2Archive||Array.isArray(data.endorsementV2Archive.batches));
 }
 async function create({data,owner,archiveReport}){
  if(!/^[0-9a-f-]{36}$/i.test(String(owner)))throw Error("An authenticated account is required.");
  if(!validWorkspace(data))throw Error("The local account workspace is incomplete; no backup was prepared.");
  if(!archiveReport?.ok||!/^[0-9a-f]{64}$/i.test(archiveReport.fingerprint||""))
   throw Error("Verify cloud archive integrity before preparing a recovery package.");
  const local=clone(data);
  const hash=await digest(JSON.stringify(local));
  return {app:"HeliLog",format:"helilog-cloud-recovery",backupSchema:3,
   appVersion:"2.12",environment:"cloud-test",accountId:owner,
   exportedAt:new Date().toISOString(),
   integrity:{algorithm:"SHA-256",sha256:hash},
   archiveEvidence:{fingerprint:archiveReport.fingerprint,
    counts:clone(archiveReport.counts),
    assessedAt:new Date().toISOString()},
   data:local};
 }
 async function verify(parsed,owner){
  if(!parsed||parsed.app!=="HeliLog"||parsed.format!=="helilog-cloud-recovery"||
     parsed.backupSchema!==3||parsed.environment!=="cloud-test")
   throw Error("Select a V2.8 HeliLog cloud recovery package. Older files use the separate backup checker.");
  if(parsed.accountId!==owner)
   throw Error("This backup belongs to another account. No records were changed.");
  if(!validWorkspace(parsed.data))throw Error("Backup workspace is structurally incomplete.");
  if(parsed.integrity?.algorithm!=="SHA-256"||
     !/^[0-9a-f]{64}$/i.test(parsed.integrity.sha256||""))
   throw Error("Recovery package checksum metadata is missing or invalid.");
  if(!/^[0-9a-f]{64}$/i.test(parsed.archiveEvidence?.fingerprint||""))
   throw Error("The recovery package has no valid archive audit fingerprint.");
  const actual=await digest(JSON.stringify(parsed.data));
  if(actual.toLowerCase()!==parsed.integrity.sha256.toLowerCase())
   throw Error("Recovery package checksum FAILED. This file was altered or damaged.");
  return {verified:true,accountId:owner,exportedAt:parsed.exportedAt,
   counts:count(parsed.data),archiveFingerprint:parsed.archiveEvidence.fingerprint,
   warning:"This verifies file integrity, not the truth of flight entries or the current cloud state. No restore was performed."};
 }
 return Object.freeze({create,verify,validWorkspace,count});
});
