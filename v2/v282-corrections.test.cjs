/* HeliLog V2.8.2 - cross-device correction draft cloud synchronization
 * Run: node --test v2/v282-corrections.test.cjs
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"cloud-sync.js"),"utf8");
const USER="11111111-1111-4111-a111-111111111111";
const copy=x=>JSON.parse(JSON.stringify(x));
const tick=async()=>{for(let i=0;i<120;i++)await Promise.resolve()};
function server(){
 const rows=[];
 let writes=0;
 class Query{
  constructor(){this.op="read";this.filters={}}
  select(){return this}
  eq(k,v){this.filters[k]=v;return this}
  in(k,values){this.inFilter=[k,values];return this}
  range(){return this}
  order(){return this}
  insert(x){this.op="insert";this.val=x;return this}
  update(x){this.op="update";this.val=x;return this}
  delete(){this.op="delete";return this}
  async maybeSingle(){
   const matched=rows.filter(row=>this.match(row));
   return {data:matched[0]?copy(matched[0]):null,error:null};
  }
  match(row){return Object.entries(this.filters).every(([k,v])=>row[k]===v)&&
   (!this.inFilter||this.inFilter[1].includes(row[this.inFilter[0]]));}
  then(ok,bad){
   let data=[],error=null;
   if(this.op==="read")data=rows.filter(row=>this.match(row)).map(copy);
   else if(this.op==="insert"){
    if(rows.some(r=>r.owner_id===this.val.owner_id&&r.kind===this.val.kind&&(r.record_id===this.val.record_id||(r.kind==='correction_proposal'&&r.payload.flightId===this.val.payload.flightId))))
     error={code:"23505",message:"Duplicate"};
    else{rows.push({...copy(this.val),revision:1});writes++;data=[{revision:1}];}
   }else{
    const pos=rows.findIndex(r=>this.match(r));
    if(pos>=0){
     const row=rows[pos];
     if(this.op==="update")Object.assign(row,copy(this.val));
     else rows.splice(pos,1);
     writes++;data=[{revision:row.revision}];
    }
   }
   return Promise.resolve({data,error}).then(ok,bad);
  }
 }
 return {rows,get writes(){return writes},client:{from:()=>new Query()}};
}
function device(s,keep){
 const store=keep?.store||new Map();
 let data=keep?.data||{aircraft:[],flights:[],printArchive:{firstPage:1,batches:[],corrections:[]},
  pilot:{},broughtForward:{},broughtForwardByType:[],broughtForwardImported:false,broughtForwardImportedAt:"",siteLocations:[]};
 store.set("helilog_v24_ext_"+USER,"true");
 const settings=[["pilot",{}],["broughtForward",{}],["broughtForwardByType",[]],
  ["broughtForwardImported",false],["broughtForwardImportedAt",""],["siteLocations",[]]];
 const versions=store.has("helilog_v23_versions_"+USER)?
  JSON.parse(store.get("helilog_v23_versions_"+USER)):{};
 const mirrors=store.has("helilog_v23_mirror_"+USER)?
  JSON.parse(store.get("helilog_v23_mirror_"+USER)):{};
 for(const [id,value] of settings){
  const key="settings:"+id,payload={id,data:value};
  if(!s.rows.some(row=>row.kind==="settings"&&row.record_id===id))
   s.rows.push({owner_id:USER,kind:"settings",record_id:id,payload,revision:1});
  if(!Object.hasOwn(versions,key)){versions[key]=1;mirrors[key]=JSON.stringify({data:value,id});}
 }
 store.set("helilog_v23_versions_"+USER,JSON.stringify(versions));
 store.set("helilog_v23_mirror_"+USER,JSON.stringify(mirrors));
 let failBackup=false,archive=false;
 const root={navigator:{onLine:true},console:{warn(){},error(){}},
  localStorage:{
   getItem:k=>store.has(k)?store.get(k):null,
   setItem:(k,v)=>{if(failBackup&&k.startsWith("helilog_v27_conflict_backup_"))throw Error("No space for backup");store.set(k,String(v));}
  },
  HeliLogCloud:{snapshot:()=>({userId:USER})},
  isArchivedFlight:()=>archive,
  archivedFlightIdsForAircraft:()=>archive
 };
 root.window=root;
 const api=new Function("window","module",source+";return window.HeliLogV23Sync;")(root,undefined);
 api.start({userId:USER,client:s.client,getData:()=>data,replaceData:next=>{
  data=next;store.set("workspace",JSON.stringify(data));
 }});
 return {api,root,store,get data(){return data},
  failBackup(){failBackup=true},protected(){archive=true},
  restart(){api.stop();return device(s,{store,data});}};
}

const proposal=(id,reason="Correct flight time")=>({
 id,flightId:"f1",sourceBatch:"HL-001",sourcePage:1,sourceRow:1,
 before:{id:"f1",mins:40,role:"PIC"},after:{id:"f1",mins:45,role:"PIC"},
 reason,createdAt:"2026-10-15T14:00:00.000Z",confirmedAt:""
});
test("offline mobile proposal persists and becomes pending on web after reconnect",async()=>{
 const s=server(),app=device(s),web=device(s);
 await app.api.refresh();await web.api.refresh();
 app.root.navigator.onLine=false;
 const draft=proposal("COR-1");
 app.data.printArchive.corrections.push(draft);
 app.api.track(app.data);await tick();
 assert.equal(app.api.status().pending,1);
 assert.equal(s.rows.filter(r=>r.kind==='correction_proposal').length,0);
 const restored=app.restart();
 assert.equal(restored.api.status().pending,1);
 restored.root.navigator.onLine=true;
 await restored.api.refresh();await tick();
 const record=s.rows.find(x=>x.kind==="correction_proposal");
 assert.equal(record.payload.id,"COR-1");
 assert.equal(record.payload.after.mins,45);
 await web.api.refresh();
 assert.equal(web.data.printArchive.corrections.length,1);
 assert.equal(web.data.printArchive.corrections[0].reason,"Correct flight time");
 assert.equal(web.api.status().state,"synced");
});
test("confirmed web addendum retires draft and the mobile keeps the immutable original",async()=>{
 const s=server(),app=device(s),web=device(s);
 await app.api.refresh();await web.api.refresh();
 app.data.flights.push({id:"f1",date:"2026-10-15",mins:40,role:"PIC"});
 app.api.track(app.data);await tick();
 await web.api.refresh();
 const draft=proposal("COR-1");
 app.data.printArchive.corrections.push(draft);app.api.track(app.data);await tick();
 await web.api.refresh();
 assert.equal(web.data.printArchive.corrections[0].confirmedAt,"");
 // The real database trigger retires the proposal atomically when an
 // immutable signed addendum is inserted by the archive RPC.
 const pos=s.rows.findIndex(x=>x.kind==="correction_proposal");
 s.rows.splice(pos,1);
 await app.api.refresh();
 assert.equal(app.data.printArchive.corrections.length,0);
 assert.equal(app.data.flights[0].mins,40);
 // A protected archive refresh then supplies the signed addendum.
 app.data.printArchive.corrections=[{...draft,confirmedAt:"2026-10-15T15:00:00Z"}];
 await app.api.refresh();
 assert.equal(app.data.printArchive.corrections.length,1);
 assert.ok(app.data.printArchive.corrections[0].confirmedAt);
 assert.equal(app.data.flights[0].mins,40);
});
test("different offline corrections to same flight cause a protected conflict",async()=>{
 const s=server(),app=device(s),web=device(s);
 await app.api.refresh();await web.api.refresh();
 app.root.navigator.onLine=false;web.root.navigator.onLine=false;
 app.data.printArchive.corrections.push(proposal("COR-MOBILE"));
 web.data.printArchive.corrections.push(proposal("COR-WEB","Different reason"));
 app.api.track(app.data);web.api.track(web.data);await tick();
 app.root.navigator.onLine=true;await app.api.refresh();await tick();
 web.root.navigator.onLine=true;await web.api.refresh();
 assert.equal(web.api.status().state,"conflict");
 assert.equal(web.data.printArchive.corrections.length,1);
 assert.equal(web.data.printArchive.corrections[0].id,"COR-WEB");
 assert.equal(s.rows.filter(x=>x.kind==="correction_proposal").length,1);
 assert.equal(web.api.conflicts().some(x=>x.reviewable===true),false);
});
test("confirmed correction is never treated as an editable cloud proposal",async()=>{
 const s=server(),app=device(s);
 await app.api.refresh();
 const c={...proposal("COR-SIGNED"),confirmedAt:"2026-10-15T15:00:00Z"};
 app.data.printArchive.corrections.push(c);
 app.api.track(app.data);await tick();
 assert.equal(s.rows.filter(x=>x.kind==="correction_proposal").length,0);
 assert.equal(app.api.status().pending,0);
});
test("UI allows a correction draft on the installed app but not printing the addendum",()=>{
 const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
 const start=html.indexOf("function startArchivedCorrection(id){");
 const end=html.indexOf("function recordArchiveCorrection(",start);
 assert.ok(start>=0&&end>start);
 const method=html.slice(start,end);
 assert.doesNotMatch(method,/Archived corrections require a printed and signed addendum\. Open HeliLog on your desktop/);
 assert.match(method,/if\(isSimulatorSession\(f\)\)addSimulator\(id\)/);
 assert.match(html,/if\(isInstalledTouchApp\(\)\)\{\s*flight\(id\)/);
 assert.match(html,/Open HeliLog in a web browser to print and confirm/);
});
test("migration enforces proposal account ownership and atomic retirement",()=>{
 const sql=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","20261015010000_v282_correction_proposals.sql"),"utf8");
 assert.match(sql,/kind in \('aircraft'.*'correction_proposal'\)/);
 assert.match(sql,/create unique index if not exists helilog_unique_pending_flight_correction/);
 assert.match(sql,/e\.record_kind='flight'/);
 assert.match(sql,/after insert on public\.helilog_archive_addenda/);
 assert.match(sql,/delete from public\.helilog_records/);
});
