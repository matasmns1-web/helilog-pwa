'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const owner='11111111-1111-4111-a111-111111111111',backupId='22222222-2222-4222-a222-222222222222';
const flight={id:'flt-1',date:'2026-10-22',mins:45,role:'PIC'};
function payload(ageDays=0){
 return {owner,backupId,serverHash:'b'.repeat(64),
 createdAt:new Date(Date.now()-ageDays*86400000).toISOString(),
 content:{schema:1,account:{display_name:'Private Fictional Name',licence:'Fictional'},
 records:[{kind:'flight',record_id:'flt-1',payload:flight}],
 archives:[{id:'archive-1',kind:'flight',payload:{flightIds:['flt-1']}}],
 frozen:[{archive_id:'archive-1',record_kind:'flight',record_id:'flt-1',snapshot:flight}],
 addenda:[]}};
}
function fixture(){
 let net=0;
 const root={crypto:webcrypto,isSecureContext:true,navigator:{onLine:false},
  btoa:s=>Buffer.from(s,'binary').toString('base64'),
  atob:s=>Buffer.from(s,'base64').toString('binary'),
  HeliLogCloud:{snapshot:()=>{net++;throw Error('Cloud MUST NOT be accessed when offline');}}};
 root.window=root;
 const backup=new Function('window','module',read('cloud-backups.js')+
  ';return window.HeliLogV29Backup')(root,undefined);
 const drill=new Function('window','module',read('disaster-recovery.js')+
  ';return window.HeliLogV210Drill')(root,undefined);
 root.HeliLogV29Backup=backup;root.HeliLogV210Drill=drill;
 const offline=new Function('window','module',read('offline-backup-check.js')+
  ';return window.HeliLogV232OfflineCheck')(root,undefined);
 return {backup,drill,offline,root,get networkCalls(){return net}};
}
test('signed-out and disconnected pilot verifies encrypted snapshot in memory without any Supabase calls',async()=>{
 const f=fixture(),pass='offline independent fictional passphrase';
 const enc=await f.backup.encryptSnapshot(payload(),pass),text=JSON.stringify(enc);
 assert.doesNotMatch(text,/Private Fictional Name|licence|flt-1/);
 const result=await f.offline.verifyText(text,pass);
 assert.equal(result.verified,true);assert.equal(result.restoredToAccount,false);
 assert.equal(result.requiresCloud,false);assert.equal(result.isolated,true);
 assert.deepEqual({records:result.records,archives:result.archives,frozen:result.frozen,addenda:result.addenda},
  {records:1,archives:1,frozen:1,addenda:0});
 assert.match(result.encryptedFileSha256,/^[a-f0-9]{64}$/);
 assert.equal(result.recoveredSha256.length,64);
 assert.equal(f.networkCalls,0);
 assert.doesNotMatch(JSON.stringify(result),/Private Fictional Name|licence|flt-1|passphrase:"offline/);
});
test('signed-in decryption still enforces explicit owner while offline decryption never reads auth state',async()=>{
 const f=fixture(),pass='independent backup passphrase',enc=await f.backup.encryptSnapshot(payload(),pass);
 await assert.rejects(()=>f.backup.decryptSnapshot(enc,pass,'33333333-3333-4333-a333-333333333333'),/another account/);
 const plain=await f.backup.decryptSnapshotOffline(enc,pass);
 assert.equal(plain.data.owner,owner);assert.equal(f.networkCalls,0);
});
test('wrong passphrase and changed encrypted ciphertext fail closed',async()=>{
 const f=fixture(),pass='correct independent offline password';
 const enc=await f.backup.encryptSnapshot(payload(),pass);
 await assert.rejects(()=>f.offline.verifyText(JSON.stringify(enc),'incorrect and long password'),/Wrong passphrase|damaged/);
 const damaged={...enc,ciphertext:enc.ciphertext.slice(0,-8)+'AAAAAAAA'};
 await assert.rejects(()=>f.offline.verifyText(JSON.stringify(damaged),pass),/Wrong passphrase|damaged/);
 assert.equal(f.networkCalls,0);
});
test('structurally inconsistent printed/signed archive is rejected after decryption',async()=>{
 const f=fixture(),data=payload(),pass='verified full backup passphrase';
 data.content.records[0].payload={...data.content.records[0].payload,mins:999};
 const enc=await f.backup.encryptSnapshot(data,pass);
 await assert.rejects(()=>f.offline.verifyText(JSON.stringify(enc),pass),/Archived original differs/);
 assert.equal(f.networkCalls,0);
});
test('missing file, non encrypted JSON and oversized file rejected before storing or restoring',async()=>{
 const f=fixture(),pass='independent strong file passphrase';
 await assert.rejects(()=>f.offline.verifyText('',pass),/smaller than 100 MB/);
 await assert.rejects(()=>f.offline.verifyText('{}',pass),/supported V2.9 encrypted/);
 await assert.rejects(()=>f.offline.verifyText('{invalid',pass),/not valid encrypted-backup JSON/);
 await assert.rejects(()=>f.offline.verifyText('{}','tiny'),/at least 12/);
 assert.equal(f.networkCalls,0);
});
test('backup age indicates old independent copy and not offsite success',async()=>{
 const f=fixture(),pass='independent strong file passphrase';
 const enc=await f.backup.encryptSnapshot(payload(12),pass);
 const result=await f.offline.verifyText(JSON.stringify(enc),pass);
 assert.equal(result.ageWarning,true);assert.ok(result.ageDays>=11);
 assert.match(result.caveat,/Save a copy outside/);
 assert.doesNotMatch(result.caveat,/automatically uploaded/i);
});
test('login screen can verify without signed-in workspace; password cleared and file not uploaded',()=>{
 const gate=read('auth-gate.js'),html=read('source/index.template.html'),sw=read('service-worker.js');
 assert.match(gate,/Verify an encrypted backup without signing in/);
 assert.match(gate,/onsubmit="v232VerifyOfflineFile\(event\)"/);
 assert.match(gate,/if\(passInput\)passInput\.value="";/);
 assert.match(gate,/if\(fileInput\)fileInput\.value="";/);
 const code=gate.slice(gate.indexOf('async function v232VerifyOfflineFile'),gate.indexOf('/* V2.19: recovery'));
 assert.doesNotMatch(code,/HeliLogCloud|localStorage|fetch\(|\.rpc\(|\.from\(|save\(|replaceData/);
 assert.match(code,/window\.HeliLogV232OfflineCheck\.verifyText/);
 assert.match(html,/offline-backup-check\.js\?v=2\.32/);
 assert.match(sw,/offline-backup-check\.js\?v=2\.32/);
 assert.match(read('service-worker.js'),/helilog-v2-41-2-sim-details-1/);
 assert.match(gate,/HELILOG_TEST_VERSION='V2\.41\.2'/);
});
