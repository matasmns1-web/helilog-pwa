/* Run: node --test v2/cloud-foundation.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const dir=__dirname;
const script=fs.readFileSync(path.join(dir,"cloud-foundation.js"),"utf8");
const view=fs.readFileSync(path.join(dir,"cloud-view.js"),"utf8");
const html=fs.readFileSync(path.join(dir,"index.html"),"utf8");
const sql=fs.readFileSync(path.join(dir,"..","supabase","migrations","20261014000000_helilog_v22_foundation.sql"),"utf8");
function boot({configured=false,signedIn=false}={}){
 const calls=[],nodes=new Map();
 const data={user:signedIn?{id:"u-1",email:"pilot@example.test"}:null};
 const fakeDb={
  auth:{
   async getUser(){calls.push("auth.getUser");return {data,error:data.user?null:{name:"AuthSessionMissingError",message:"Auth session missing"}}},
   async signInWithPassword(args){calls.push("auth.signInWithPassword");if(args.email==="pilot@example.test"&&args.password==="pass"){data.user={id:"u-1",email:args.email};return {error:null}}return {error:{message:"Invalid login"}}},
   async signOut(){calls.push("auth.signOut");data.user=null;return {error:null}}
  },
  from(table){calls.push("from:"+table);if(table!=="helilog_accounts")throw Error("No permission for table "+table);
   return {
    select(){return this},
    eq(){return this},
    async maybeSingle(){calls.push("account.read");return {data:data.account||null,error:null}},
    async insert(profile){calls.push("account.insert");data.account={user_id:profile.user_id,display_name:profile.display_name};return {error:null}}
   }
  }
 };
 const cfg=configured?
 {supabaseUrl:"https://sample.supabase.co",publishableKey:"sb_publishable_public_test_key_0123456789",authEnabled:true,environment:"test",inviteOnly:true}:
 {supabaseUrl:"",publishableKey:"",authEnabled:false,environment:"test",inviteOnly:true};
 const env={URL,Date,JSON,Math,Promise,console,
  HeliLogCloudConfig:cfg,
  supabase:{createClient(){calls.push("createClient");return fakeDb}},
  document:{
   getElementById(id){return nodes.get(id)||null},
   querySelector(){return nodes.get("app")},
   createElement(){throw Error("no SDK loading should occur with stub")},
   head:{appendChild(){throw Error("not expected")}}
  },
  app:{innerHTML:""},
  header:(title,sub,action)=>'<h1>'+title+'</h1>'+sub+action,
  S:{pilot:{name:"Demo Pilot"},flights:[{id:"local-1"}]},
  go(){},isStandaloneApp(){return false}
 };
 env.window=env;
 nodes.set("cloudEmail",{value:"pilot@example.test"});
 nodes.set("cloudPassword",{value:"pass"});
 nodes.set("cloudDisplayName",{value:"Pilot Example"});
 const context=vm.createContext(env);
 vm.runInContext(script,context);
 vm.runInContext(view,context);
 function evalJs(src){return vm.runInContext(src,context);}
 return {env,calls,evalJs,data,nodes};
}
test("unconfigured cloud foundation does not touch network or local logbook",async()=>{
 const h=boot();
 const state=await h.env.HeliLogCloud.refresh();
 assert.equal(state.configured,false);
 assert.equal(state.status,"unconfigured");
 h.evalJs("cloud()");
 assert.match(h.env.app.innerHTML,/Not connected yet/);
 assert.match(h.env.app.innerHTML,/No cloud database has been activated/);
 assert.deepEqual(h.calls,[]);
 assert.equal(h.env.S.flights.length,1);
});
test("configured first visit is signed out rather than a connection error",async()=>{
 const h=boot({configured:true});
 const state=await h.env.HeliLogCloud.refresh();
 assert.equal(state.status,"signed_out");
 assert.equal(state.hasProfile,false);
 assert.deepEqual(h.calls,["createClient","auth.getUser"]);
});
test("invited account login and own-profile creation do not upload any flight",async()=>{
 const h=boot({configured:true});
 const state=await h.env.HeliLogCloud.signIn("pilot@example.test","pass");
 assert.equal(state.status,"signed_in");
 assert.equal(state.email,"pilot@example.test");
 assert.equal(state.hasProfile,false);
 const profile=await h.env.HeliLogCloud.initializeProfile("Pilot Example");
 assert.equal(profile.hasProfile,true);
 assert.equal(profile.displayName,"Pilot Example");
 assert.equal(h.env.S.flights[0].id,"local-1");
 assert.ok(h.calls.includes("from:helilog_accounts"));
 assert.ok(!h.calls.some(x=>/flight|endorse|archive/i.test(x)));
 const signedOut=await h.env.HeliLogCloud.signOut();
 assert.equal(signedOut.status,"signed_out");
});
test("secret and production configurations are rejected",()=>{
 const h=boot({configured:true});
 const c=h.env.HeliLogCloud;
 assert.throws(()=>c.validConfig({environment:"production",inviteOnly:true,authEnabled:true,supabaseUrl:"https://test.supabase.co",publishableKey:"sb_publishable_01234567890"}),/invite-only TEST/);
 assert.throws(()=>c.validConfig({environment:"test",inviteOnly:true,authEnabled:true,supabaseUrl:"https://test.supabase.co",publishableKey:"sb_secret_01234567890123456789"}),/secret/);
});
test("cloud UI route and version label coexist with V1 logbook",()=>{
 assert.match(html,/HeliLog V2\.2/);
 assert.match(html,/data-v="cloud"/);
 assert.match(html,/cloud-config\.js/);
 assert.match(html,/cloud-foundation\.js/);
 assert.match(html,/cloud-view\.js/);
 assert.match(html,/function add\(/);
 assert.match(html,/function totals\(/);
 assert.match(html,/helilog_v2_complete_test_data/);
 assert.doesNotMatch(html,/const LIVE_KEY='helilog_v111'/);
});
test("cloud schema has RLS, owner identity, anonymous grant revocation, and append-only archive grants",()=>{
 for(const table of ["helilog_accounts","helilog_records","helilog_print_archives","helilog_archive_entries","helilog_archive_addenda"]){
  assert.ok(sql.includes("create table if not exists public."+table),table);
  assert.ok(sql.includes("alter table public."+table+" enable row level security;"),table);
 }
 assert.match(sql,/revoke all on table/);
 assert.match(sql,/from anon,authenticated/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/grant select,insert on public\.helilog_print_archives to authenticated/);
 assert.match(sql,/create trigger helilog_record_guard/);
});
