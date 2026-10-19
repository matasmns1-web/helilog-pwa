/* Run: node --test v2/auth-sync.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const syncSource=fs.readFileSync(path.join(__dirname,"cloud-sync.js"),"utf8");
const authSource=fs.readFileSync(path.join(__dirname,"auth-gate.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const user1="11111111-1111-4111-a111-111111111111";
const user2="22222222-2222-4222-b222-222222222222";
const tick=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};

function backend(){
 const rows=[];
 let lostAck=false;
 class Query{
  constructor(table){assert.equal(table,"helilog_records");this.op="read";this.conditions={}}
  select(){return this}eq(k,v){this.conditions[k]=v;return this}
  in(k,values){this.inFilter={key:k,values};return this}
  order(){return this}range(){return this}
  insert(body){this.op="insert";this.body=body;return this}
  update(body){this.op="update";this.body=body;return this}
  delete(){this.op="delete";return this}
  then(resolve,reject){
   const eligible=r=>Object.entries(this.conditions).every(([k,v])=>r[k]===v)
    &&(!this.inFilter||this.inFilter.values.includes(r[this.inFilter.key]));
   let data=[],error=null;
   if(this.op==="read")data=rows.filter(eligible).map(r=>({...r}));
   else if(this.op==="insert"){
    if(rows.some(r=>r.owner_id===this.body.owner_id&&r.kind===this.body.kind&&r.record_id===this.body.record_id))
     error={code:"23505",message:"duplicate"};
    else{
     const row={...this.body,revision:1};rows.push(row);data=[{revision:1}];
     if(lostAck){lostAck=false;error={message:"Simulated lost server acknowledgement"};data=null;}
    }
   }else{
    const index=rows.findIndex(eligible);
    if(index>=0){
     const row=rows[index];
     if(this.op==="update")Object.assign(row,this.body);
     else rows.splice(index,1);
     data=[{revision:row.revision}];
    }
   }
   return Promise.resolve({data,error}).then(resolve,reject);
  }
 }
 return {rows,client:{from:name=>new Query(name)},loseNextAcknowledgement(){lostAck=true}};
}
function device(server,userId=user1){
 const store=new Map(),root={navigator:{onLine:true},console,
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)},
  HeliLogCloud:{snapshot(){return {userId}}}
 };
 root.window=root;
 const api=new Function("window","module",syncSource+";return window.HeliLogV23Sync;")(root,undefined);
 let data={aircraft:[],flights:[]};
 api.start({userId,client:server.client,getData:()=>data,replaceData:next=>{data=next}});
 return {api,root,store,get data(){return data}};
}
test("only authenticated accounts can access own cloud rows",async()=>{
 const server=backend(),a=device(server,user1),b=device(server,user2);
 await a.api.refresh();await b.api.refresh();
 a.data.aircraft.push({id:"a1",reg:"LY-TEST",icao:"G2CA"});a.api.track(a.data);
 await tick();
 assert.equal(server.rows.length,1);
 await b.api.refresh();
 assert.equal(b.data.aircraft.length,0,"second pilot must not see first pilot's aircraft");
 assert.match([...a.store.keys()].join(" "),/11111111-1111/);
 assert.doesNotMatch([...b.store.keys()].join(" "),/11111111-1111/);
});
test("new aircraft and flight upload and appear on a second device",async()=>{
 const server=backend(),a=device(server),b=device(server);
 await a.api.refresh();await b.api.refresh();
 a.data.aircraft.push({id:"a1",icao:"G2CA",reg:"LY-TEST"});
 a.api.track(a.data);await tick();
 a.data.flights.push({id:"f1",aid:"a1",date:"2026-10-15",mins:45});
 a.api.track(a.data);await tick();
 assert.equal(server.rows.length,2);
 assert.equal(a.api.status().pending,0);
 await b.api.refresh();
 assert.equal(b.data.flights[0].id,"f1");
 assert.equal(b.data.aircraft[0].id,"a1");
});
test("offline edits stay queued; conflicting revisions cannot overwrite server",async()=>{
 const server=backend(),a=device(server),b=device(server);
 await a.api.refresh();
 a.data.aircraft.push({id:"a1",reg:"LY-TEST"});a.api.track(a.data);await tick();
 await b.api.refresh();
 b.root.navigator.onLine=false;
 b.data.aircraft[0].reg="LY-OFF";b.api.track(b.data);await tick();
 assert.equal(b.api.status().pending,1);
 a.data.aircraft[0].reg="LY-ONLINE";a.api.track(a.data);await tick();
 assert.equal(server.rows[0].revision,2);
 b.root.navigator.onLine=true;await b.api.refresh();await tick();
 assert.equal(b.api.status().state,"conflict");
 assert.equal(b.data.aircraft[0].reg,"LY-OFF");
 assert.equal(server.rows[0].payload.reg,"LY-ONLINE");
});
test("reconnect recognizes writes completed despite lost server acknowledgement",async()=>{
 const server=backend(),a=device(server);
 await a.api.refresh();
 server.loseNextAcknowledgement();
 a.data.aircraft.push({id:"a1",reg:"LY-TEST",nested:{z:1,a:2}});
 a.api.track(a.data);await tick();
 assert.equal(a.api.status().pending,1);
 assert.equal(server.rows.length,1);
 // Supabase JSONB can change key order; this must not create false conflicts.
 server.rows[0].payload={nested:{a:2,z:1},reg:"LY-TEST",id:"a1"};
 await a.api.refresh();await tick();
 assert.equal(a.api.status().pending,0);
 assert.equal(a.api.status().state,"synced");
 assert.equal(server.rows.length,1);
});
test("local changes skipped by queue are protected from incoming overwrite",async()=>{
 const server=backend(),a=device(server);
 await a.api.refresh();
 a.data.aircraft.push({id:"a1",reg:"LY-TEST"});a.api.track(a.data);await tick();
 // Direct local mutation emulates an interrupted write before track().
 a.data.aircraft[0].reg="LY-UNSENT";
 await a.api.pull();
 assert.equal(a.api.status().state,"conflict");
 assert.equal(a.data.aircraft[0].reg,"LY-UNSENT");
});
test("login gate, offline shell and version labels exist without implicit legacy import",()=>{
 assert.match(html,/<html lang="en" class="helilog-locked">/);
 assert.match(html,/V2\.12 · TEST/);
 assert.match(html,/cloud-sync\.js/);
 assert.match(html,/auth-gate\.js/);
 assert.match(html,/let KEY=TEST_MODE/);
 assert.match(html,/v23Boot\(\)/);
 assert.match(html,/v23AccountWorkspace\(\)/);
 assert.match(authSource,/recordKey\(id\)/);
 assert.match(authSource,/freshLogbookData/);
 assert.doesNotMatch(authSource,/setItem\(LIVE_KEY/);
 const sw=fs.readFileSync(path.join(__dirname,"service-worker.js"),"utf8");
 assert.match(sw,/helilog-v2-12-accounts-1/);
 assert.match(sw,/\.\/auth-gate\.js/);
 assert.match(sw,/\.\/cloud-sync\.js/);
});
