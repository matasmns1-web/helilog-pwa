/* HeliLog V2.32 — provider-independent, read-only encrypted backup check.
 * This module does not require a Supabase connection or signed-in pilot.
 * Nothing is restored, uploaded, cached or written to localStorage.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV232OfflineCheck=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 const sha256=async text=>{
  if(!root.crypto?.subtle||!root.isSecureContext)
   throw Error("Secure HTTPS and Web Crypto are required for offline verification.");
  const hash=await root.crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
 };
 async function verifyText(fileText,passphrase){
  if(typeof fileText!=="string"||!fileText||fileText.length>100*1024*1024)
   throw Error("Select an encrypted HeliLog JSON file smaller than 100 MB.");
  if(typeof passphrase!=="string"||passphrase.length<12)
   throw Error("Enter the original encryption passphrase (at least 12 characters).");
  const backup=root.HeliLogV29Backup,drill=root.HeliLogV210Drill;
  if(!backup?.decryptSnapshotOffline||!drill?.drill)
   throw Error("Offline recovery verification modules are unavailable. Do not reset the app.");
  let envelope;
  try{envelope=JSON.parse(fileText);}
  catch{throw Error("The selected file is not valid encrypted-backup JSON.");}
  const decrypted=await backup.decryptSnapshotOffline(envelope,passphrase);
  const source=decrypted.data;
  const result=await drill.drill(source,source.owner);
  if(!result.ok||!result.restored||!result.isolated||
     result.sourceFingerprint!==result.recoveryFingerprint)
   throw Error("Backup reconstruction/integrity check failed: "+
    (result.problems||[]).slice(0,2).join(" | ")+". No account data was changed.");
  const created=Date.parse(source.createdAt||"");
  if(!Number.isFinite(created)||created<Date.UTC(2020,0,1))
   throw Error("Backup timestamp is missing or invalid. Do not rely on this file.");
  const ahead=created-Date.now();
  if(ahead>24*60*60*1000)
   throw Error("Backup date is in the future; verify the source and device clock.");
  const older=Date.now()-created;
  const ageDays=Math.max(0,Math.floor(older/(24*60*60*1000)));
  const ageWarning=ageDays>7;
  return Object.freeze({
   verified:true,isolated:true,restoredToAccount:false,requiresCloud:false,
   backupId:source.backupId,
   createdAt:new Date(created).toISOString(),ageDays,ageWarning,
   records:result.counts.records,archives:result.counts.archives,
   frozen:result.counts.frozen,addenda:result.counts.addenda,
   encryptedFileSha256:await sha256(fileText),
   recoveredSha256:result.recoveryFingerprint,
   // The encrypted file is independent ONLY if the pilot actually saves it
   // in separately managed storage. A browser download is not proof of that.
   caveat:"File decrypted and reconstructed in temporary browser memory. No Supabase contact or account restore. Save a copy outside the Supabase provider/device; this check does not establish offsite storage or regulatory acceptance."
  });
 }
 return Object.freeze({verifyText});
});