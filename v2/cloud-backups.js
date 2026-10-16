/* HeliLog V2.9 TEST: private SQL snapshots and client-only AES-GCM downloads.
 * No password or plaintext is uploaded to a new external service.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.HeliLogV29Backup=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
 "use strict";
 const uuid=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
 const activeOwner=owner=>{
  if(!uuid(owner)||root.HeliLogCloud?.snapshot?.().userId!==owner)
   throw Error("Sign in to the correct cloud account first.");
  if(root.navigator?.onLine===false)throw Error("This operation requires a network connection.");
 };
 const checked=(response,name)=>{
  if(response?.error)throw Error(name+": "+response.error.message);
  if(response?.data===undefined||response?.data===null)throw Error(name+": empty cloud response.");
  return response.data;
 };
 async function list(client,owner){
  activeOwner(owner);
  const result=await client.from("helilog_backup_snapshots")
    .select("id,created_at,source,sha256").eq("owner_id",owner)
    .order("created_at",{ascending:false}).limit(50);
  activeOwner(owner);
  return checked(result,"Loading backup history");
 }
 async function create(client,owner){
  activeOwner(owner);
  const id=checked(await client.rpc("helilog_create_backup_now"),"Creating server backup");
  activeOwner(owner);
  if(!uuid(id))throw Error("Invalid server snapshot identifier.");
  return id;
 }
 async function preview(client,owner,id){
  activeOwner(owner);
  if(!uuid(id))throw Error("Select a valid backup snapshot.");
  const data=checked(await client.rpc("helilog_restore_preview",{p_snapshot:id}),"Verifying recovery plan");
  activeOwner(owner);
  if(data.id!==id || !/^[a-f0-9]{64}$/i.test(data.snapshotHash||"")||
    !/^[a-f0-9]{64}$/i.test(data.currentHash||""))
   throw Error("Invalid recovery plan response.");
  return data;
 }
 async function restore(client,owner,plan,confirmation){
  activeOwner(owner);
  if(!plan||plan.restorable!==true||!uuid(plan.id))
   throw Error("Recovery preview is invalid or unsafe. Preview again.");
  if(confirmation!=="RESTORE MISSING RECORDS")
   throw Error("Type RESTORE MISSING RECORDS exactly.");
  const result=checked(await client.rpc("helilog_restore_missing_records",{
   p_snapshot:plan.id,p_expected_current_hash:plan.currentHash,
   p_confirmation:confirmation
  }),"Restoring missing cloud records");
  activeOwner(owner);
  if(!Number.isInteger(result.restored)||result.restored<0)
   throw Error("Cloud restoration response could not be verified.");
  return result;
 }
 const bytesToBase64=bytes=>{
  let s="";for(let i=0;i<bytes.length;i+=32768)
   s+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return root.btoa(s);
 };
 const base64ToBytes=text=>{
  if(typeof text!=="string"||text.length>140000000||
     !/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw Error("Invalid encrypted file encoding.");
  return Uint8Array.from(root.atob(text),c=>c.charCodeAt(0));
 };
 const cryptoAPI=()=>{
  if(!root.crypto?.subtle||!root.crypto.getRandomValues||!root.isSecureContext)
   throw Error("A secure HTTPS browser supporting Web Crypto is required.");
  return root.crypto;
 };
 async function keyFromPassword(password,salt){
  if(typeof password!=="string"||password.length<12)
   throw Error("Use an encryption passphrase of at least 12 characters.");
  const c=cryptoAPI(),encoder=new TextEncoder();
  const base=await c.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveKey"]);
  return c.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},
   base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 }
 async function encryptSnapshot(payload,password){
  if(!uuid(payload?.owner)||!uuid(payload?.backupId)||
     !payload.content||!uuid(payload.content.account?.user_id||payload.owner)||
     !/^[a-f0-9]{64}$/i.test(payload?.serverHash||""))
   throw Error("Backup contents or server integrity metadata are invalid.");
  const c=cryptoAPI(),salt=c.getRandomValues(new Uint8Array(16)),
   iv=c.getRandomValues(new Uint8Array(12)),enc=new TextEncoder();
  const key=await keyFromPassword(password,salt);
  const sealed=new Uint8Array(await c.subtle.encrypt({
   name:"AES-GCM",iv,additionalData:enc.encode("HeliLog-V2.9-test")
  },key,enc.encode(JSON.stringify(payload))));
  return {app:"HeliLog",format:"encrypted-cloud-snapshot",version:1,
   cipher:"AES-256-GCM",kdf:"PBKDF2-SHA256",iterations:310000,
   salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(sealed)};
 }
 async function decryptSnapshot(locked,password,owner){
  if(!locked||locked.app!=="HeliLog"||locked.format!=="encrypted-cloud-snapshot"||
    locked.version!==1||locked.cipher!=="AES-256-GCM"||
    locked.kdf!=="PBKDF2-SHA256"||locked.iterations!==310000)
   throw Error("Not a supported V2.9 encrypted HeliLog backup.");
  const salt=base64ToBytes(locked.salt),iv=base64ToBytes(locked.iv);
  if(salt.length!==16||iv.length!==12)throw Error("Invalid encryption salt or nonce.");
  const c=cryptoAPI(),enc=new TextEncoder(),key=await keyFromPassword(password,salt);
  let unpacked;
  try{unpacked=await c.subtle.decrypt({
   name:"AES-GCM",iv,additionalData:enc.encode("HeliLog-V2.9-test")
  },key,base64ToBytes(locked.ciphertext));}
  catch{throw Error("Wrong passphrase or damaged encrypted backup. No data was changed.");}
  let plain;
  try{plain=JSON.parse(new TextDecoder().decode(unpacked));}
  catch{throw Error("The decrypted backup is not valid JSON.");}
  if(plain.owner!==owner || !uuid(plain.backupId)||
   !plain.content || !/^[a-f0-9]{64}$/i.test(plain.serverHash||""))
   throw Error("This encrypted backup belongs to another account or contains invalid data.");
  return {backupId:plain.backupId,createdAt:plain.createdAt,
   records:plain.content.records?.length||0,archives:plain.content.archives?.length||0,
   frozen:plain.content.frozen?.length||0,addenda:plain.content.addenda?.length||0,
   data:plain};
 }
 async function downloadPayload(client,owner,id){
  activeOwner(owner);
  const plan=await preview(client,owner,id);
  const response=await client.from("helilog_backup_snapshots")
    .select("id,created_at,sha256,content").eq("owner_id",owner).eq("id",id).maybeSingle();
  activeOwner(owner);
  const row=checked(response,"Reading encrypted export source");
  if(row.id!==id||row.sha256!==plan.snapshotHash)
   throw Error("Backup changed since it was verified. No file created.");
  return {owner,backupId:id,createdAt:row.created_at,serverHash:row.sha256,content:row.content};
 }
 return Object.freeze({list,create,preview,restore,encryptSnapshot,decryptSnapshot,
   downloadPayload,keyFromPassword});
});
