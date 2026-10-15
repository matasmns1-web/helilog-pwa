/* HeliLog V2.8.3 — cloud-before-local correction confirmation regression. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const begin=html.indexOf("let correctionConfirmationBusy=false;");
const end=html.indexOf("function discardPendingCorrection(id){",begin);
assert.ok(begin>=0&&end>begin,"Correction handler was located");
const method=html.slice(begin,end);
const clone=x=>JSON.parse(JSON.stringify(x));
const proposal=()=>({
  id:"COR-123",flightId:"f-123",sourceBatch:"HL-01",sourcePage:1,sourceRow:2,
  before:{id:"f-123",mins:40},after:{id:"f-123",mins:45},
  reason:"Correct test duration",createdAt:"2026-10-15T12:00:00Z",confirmedAt:""
});
function harness(opts={}){
 const state={workspace:{
  printArchive:{batches:[{id:"HL-01",flightIds:["f-123"]}],corrections:[proposal()]},
  flights:[{id:"f-123",mins:40}]
 }, cloudAcknowledged:false,oldError:!!opts.oldError,printed:0};
 const calls=[],messages=[],storage=new Map();
 const deps={state,calls,messages,storage,
  async preflight(get,commit){
   calls.push({kind:"preflight",workspace:clone(state.workspace)});
   if(state.workspace.printArchive.corrections.some(x=>x.confirmedAt)&&!state.cloudAcknowledged){
    state.oldError=true;return false;
   }
   if(opts.failRefresh)return false;
   state.oldError=false;
   commit(clone(get()));
   state.commit=commit;
   return true;
  },
  async rpc(signed){
   calls.push({kind:"rpc",workspace:clone(state.workspace),signed:clone(signed)});
   if(opts.failRPC)throw Error("Remote rejected addendum");
   if(opts.onRPC)await opts.onRPC(state,signed);
   state.cloudAcknowledged=true;return "remote-uuid";
  }
 };
 const setup=[
  'let S=deps.state.workspace,KEY="workspace",pendingCorrectionPrint=JSON.stringify(S.printArchive.corrections[0]),pendingArchivePreview={id:"p"},selectedArchivePageCount=1;',
  'const window={HeliLogV24Archive:{refresh:(get,commit)=>deps.preflight(get,commit),error:()=>deps.state.oldError?"Unsynchronized flight correction remains on this device.":"",confirmAddendum:(kind,id,signed)=>{if(kind!=="flight"||id!=="f-123")throw Error("Incorrect archive target");return deps.rpc(signed);}}};',
  'const localStorage={getItem:k=>deps.storage.get(k)??null,setItem:(k,v)=>deps.storage.set(k,v)};',
  'function archiveCorrections(){return S.printArchive.corrections;}',
  'function isInstalledTouchApp(){return !!opts.installed;}',
  'function v23AccountWorkspace(){return !opts.noCloud;}',
  'function alert(v){deps.messages.push(v);}',
  'function confirm(){return opts.confirm!==false;}',
  'function v24CommitArchiveRefresh(value){S=value;deps.state.workspace=value;}',
  'function verifiedEnvironmentWrite(key,value){if(opts.failStore)throw Error("Local storage unavailable");localStorage.setItem(key,JSON.stringify(value));}',
  'function printarchive(){deps.state.printed++;}',
  method,
  'return {confirmCorrectionAddendum,get workspace(){return S;},get busy(){return correctionConfirmationBusy;}};'
 ].join("\n");
 const app=new Function("deps","opts",setup)(deps,opts);
 return {state,calls,messages,storage,app};
}
test("web checks cloud while the draft remains pending, then saves acknowledged confirmation",async()=>{
 const h=harness({oldError:true});
 await h.app.confirmCorrectionAddendum("COR-123");
 assert.deepEqual(h.calls.map(x=>x.kind),["preflight","rpc"]);
 assert.equal(h.calls[0].workspace.printArchive.corrections[0].confirmedAt,"");
 assert.equal(h.calls[1].workspace.printArchive.corrections[0].confirmedAt,"");
 assert.ok(h.calls[1].signed.confirmedAt);
 assert.ok(h.app.workspace.printArchive.corrections[0].confirmedAt);
 assert.equal(h.app.workspace.flights[0].mins,40);
 assert.equal(h.state.printed,1);
 assert.deepEqual(h.messages,[]);
 assert.ok(JSON.parse(h.storage.get("workspace")).printArchive.corrections[0].confirmedAt);
});
test("an old temporary archive refresh discrepancy clears on a successful recheck",async()=>{
 const h=harness({oldError:true});
 await h.app.confirmCorrectionAddendum("COR-123");
 assert.equal(h.state.oldError,false);
 assert.equal(h.state.cloudAcknowledged,true);
});
test("RPC errors retain the pending draft and do not save a signed local correction",async()=>{
 const h=harness({failRPC:true});
 await h.app.confirmCorrectionAddendum("COR-123");
 assert.equal(h.state.cloudAcknowledged,false);
 assert.equal(h.app.workspace.printArchive.corrections[0].confirmedAt,"");
 assert.equal(h.state.printed,0);
 assert.match(h.messages[0],/not archived in the cloud/);
});
test("failed archive refresh prevents confirmation and preserves draft",async()=>{
 const h=harness({failRefresh:true});
 await h.app.confirmCorrectionAddendum("COR-123");
 assert.deepEqual(h.calls.map(x=>x.kind),["preflight"]);
 assert.equal(h.app.workspace.printArchive.corrections[0].confirmedAt,"");
});
test("after a successful RPC, a local storage failure never suggests re-confirming",async()=>{
 const h=harness({failStore:true});
 await h.app.confirmCorrectionAddendum("COR-123");
 assert.equal(h.state.cloudAcknowledged,true);
 assert.equal(h.app.workspace.printArchive.corrections[0].confirmedAt,"");
 assert.match(h.messages[0],/Do NOT confirm it again/);
 assert.doesNotMatch(h.messages[0],/The proposal remains pending/);
});
test("a concurrent cloud pull of signed JSONB data is accepted without duplicate signature",async()=>{
 const h=harness({onRPC:async(state,signed)=>{
  const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==="object"?
   Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
  const updated=clone(state.workspace);
  updated.printArchive.corrections=[sort(clone(signed))];
  state.commit(updated);
 }});
 await h.app.confirmCorrectionAddendum("COR-123");
 assert.equal(h.state.cloudAcknowledged,true);
 assert.equal(h.state.printed,1);
 assert.deepEqual(h.messages,[]);
});
test("installed apps cannot confirm signed paper addenda",async()=>{
 const h=harness({installed:true});
 await h.app.confirmCorrectionAddendum("COR-123");
 assert.equal(h.calls.length,0);
 assert.match(h.messages[0],/web browser/);
});
test("double clicks cannot submit two signed addendum RPCs",async()=>{
 let release;
 const gate=new Promise(ok=>release=ok);
 const h=harness({onRPC:()=>gate});
 const first=h.app.confirmCorrectionAddendum("COR-123");
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 const second=h.app.confirmCorrectionAddendum("COR-123");
 release();
 await Promise.all([first,second]);
 assert.equal(h.calls.filter(x=>x.kind==="rpc").length,1);
});
