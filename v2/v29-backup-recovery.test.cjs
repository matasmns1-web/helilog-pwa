/* HeliLog V2.9 TEST — cloud snapshots and browser encryption regression. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {webcrypto}=require("node:crypto");
const source=fs.readFileSync(path.join(__dirname,"cloud-backups.js"),"utf8");
const schema=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","20261016030000_v29_cloud_backups.sql"),"utf8");
const guard=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","20261016040000_v29_restore_guard.sql"),"utf8");
const OWNER="11111111-1111-4111-a111-111111111111";
const ID="22222222-2222-4222-a222-222222222222";
const HASH="a".repeat(64);
const snapshot={owner:OWNER,backupId:ID,createdAt:"2026-10-16T09:30:00.000Z",serverHash:HASH,
 content:{schema:1,records:[{kind:"flight",record_id:"f-1",payload:{mins:45}}],
 archives:[{id:"3"}],frozen:[],addenda:[],account:{display_name:"Test Pilot"}}};
function fixture(){
 let owner=OWNER,online=true,calls=[],fail=false;
 const db={
  from(name){
   assert.equal(name,"helilog_backup_snapshots");
   let fields="",selectFilters={},method="";
   const query={
    select(x){fields=x;return this},
    eq(k,x){selectFilters[k]=x;return this},
    order(){return this},
    limit(){return this},
    async maybeSingle(){
     assert.equal(selectFilters.owner_id,OWNER);
     assert.equal(selectFilters.id,ID);
     if(fail)return {data:null,error:{message:"Forbidden"}};
     return {data:{id:ID,created_at:snapshot.createdAt,sha256:HASH,
       content:snapshot.content},error:null};
    },
    then(resolve,reject){return Promise.resolve({data:[{id:ID,
      created_at:snapshot.createdAt,source:"daily",sha256:HASH}],error:null}).then(resolve,reject)}
   };return query;
  },
  async rpc(name,params){
   calls.push([name,params]);
   if(fail)return {data:null,error:{message:"Test error"}};
   if(name==="helilog_create_backup_now")return {data:ID,error:null};
   if(name==="helilog_restore_preview")return {data:{
    id:ID,createdAt:snapshot.createdAt,currentHash:HASH,snapshotHash:HASH,
    restorable:true,missingUnsigned:2,differentExisting:0,protectedMismatch:0
   },error:null};
   if(name==="helilog_restore_missing_records")return {data:{
    restored:2,backupBeforeRestore:ID
   },error:null};
   throw Error("Unexpected RPC "+name);
  }
 };
 const root={crypto:webcrypto,isSecureContext:true,
  get navigator(){return {onLine:online}},
  HeliLogCloud:{snapshot:()=>({userId:owner})},
  btoa:x=>Buffer.from(x,"binary").toString("base64"),
  atob:x=>Buffer.from(x,"base64").toString("binary")};
 root.window=root;
 const api=new Function("window","module",source+";return window.HeliLogV29Backup")(root,undefined);
 return {api,db,calls,setOwner(x){owner=x},goOffline(){online=false},setFail(){fail=true}};
}
test("backup list and manually created snapshots are account-scoped",async()=>{
 const f=fixture();
 const list=await f.api.list(f.db,OWNER);
 assert.equal(list.length,1);
 assert.equal(list[0].id,ID);
 assert.equal(await f.api.create(f.db,OWNER),ID);
 assert.equal(f.calls[0][0],"helilog_create_backup_now");
 f.setOwner("33333333-3333-4333-a333-333333333333");
 await assert.rejects(()=>f.api.create(f.db,OWNER),/correct cloud account/);
});
test("restore requires a fresh preview, explicit phrase, and consistent cloud fingerprint",async()=>{
 const f=fixture(),plan=await f.api.preview(f.db,OWNER,ID);
 assert.equal(plan.missingUnsigned,2);
 await assert.rejects(()=>f.api.restore(f.db,OWNER,plan,"YES"),/Type RESTORE/);
 const result=await f.api.restore(f.db,OWNER,plan,"RESTORE MISSING RECORDS");
 assert.equal(result.restored,2);
 assert.equal(f.calls.at(-1)[1].p_expected_current_hash,HASH);
 assert.equal(f.calls.at(-1)[1].p_snapshot,ID);
});
test("offline and cloud errors fail closed",async()=>{
 const f=fixture();f.goOffline();
 await assert.rejects(()=>f.api.create(f.db,OWNER),/network connection/);
 const fail=fixture();fail.setFail();
 await assert.rejects(()=>fail.api.create(fail.db,OWNER),/Test error/);
});
test("encrypt and decrypt complete cloud snapshot with real AES-256-GCM and PBKDF2",async()=>{
 const f=fixture();
 const password="correct horse secure test passphrase";
 const sealed=await f.api.encryptSnapshot(snapshot,password);
 assert.equal(sealed.format,"encrypted-cloud-snapshot");
 assert.equal(sealed.cipher,"AES-256-GCM");
 assert.equal(sealed.iterations,310000);
 assert.ok(!JSON.stringify(sealed).includes("Test Pilot"));
 assert.ok(!JSON.stringify(sealed).includes("mins"));
 const plain=await f.api.decryptSnapshot(sealed,password,OWNER);
 assert.deepEqual(plain.data,snapshot);
 assert.equal(plain.records,1);
 assert.equal(plain.archives,1);
});
test("wrong passphrase, tampered ciphertext and wrong account are rejected",async()=>{
 const f=fixture(),sealed=await f.api.encryptSnapshot(snapshot,"very strong backup passphrase");
 await assert.rejects(()=>f.api.decryptSnapshot(sealed,"another wrong passphrase",OWNER),/Wrong passphrase/);
 const tampered={...sealed,ciphertext:sealed.ciphertext.slice(0,-10)+"AAAAAAAAAA"};
 await assert.rejects(()=>f.api.decryptSnapshot(tampered,"very strong backup passphrase",OWNER),/Wrong passphrase|Invalid/);
 await assert.rejects(()=>f.api.decryptSnapshot(sealed,"very strong backup passphrase",
  "33333333-3333-4333-a333-333333333333"),/another account/);
});
test("no weak passphrases or malformed encrypted envelopes",async()=>{
 const f=fixture();
 await assert.rejects(()=>f.api.encryptSnapshot(snapshot,"1234567"),/at least 12/);
 await assert.rejects(()=>f.api.decryptSnapshot({app:"HeliLog",format:"backup"},"a".repeat(20),OWNER),/Not a supported/);
});
test("database snapshots remain private and scheduled, while restore excludes signed and proposed corrections",()=>{
 assert.match(schema,/create policy "Pilot reads own backup snapshots"/);
 assert.match(schema,/grant select on table public\.helilog_backup_snapshots to authenticated/);
 assert.match(schema,/revoke all on table public\.helilog_backup_snapshots from anon,authenticated/);
 assert.match(schema,/cron\.schedule\('helilog-v29-daily-test-snapshots','0 3 \* \* \*'/);
 assert.match(schema,/v_undo=public\.helilog_capture_backup\(v_owner,'pre_restore'\)/);
 assert.match(schema,/p_expected_current_hash/);
 assert.match(schema,/p_confirmation<>'RESTORE MISSING RECORDS'/);
 assert.match(guard,/if v_kind='correction_proposal' then continue/);
 assert.match(guard,/if v_item->>'kind'='correction_proposal' then continue/);
 assert.match(guard,/v_item->>'sealed_at'/);
 assert.match(guard,/helilog_archive_entries/);
});
