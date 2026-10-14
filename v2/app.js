/* HeliLog V2 alpha: standalone endorsement workflow, no V1 writes. */
(function(){
"use strict";
const D=window.HeliLogV2Domain, Store=window.HeliLogV2Storage, Print=window.HeliLogV2Print, Flight=window.HeliLogV2Flights;
const app=document.getElementById("app");
if(!D||!Store||!Print||!Flight){app.textContent="V2 scripts are unavailable; check the development files.";return;}
const repo=Store.createRepository(window.localStorage,D,Flight.validateState);
let state=null, page="overview", editingId="", signingId="", signingProposal=null;
let pendingBatch=null, batchPreviewOpened=false, pendingAmendment=null, amendmentPreviewOpened=false;
let flash="", signatureDirty=false, signCanvas=null;
let editingAircraftId="",editingFlightId="",manualLandingDay=false,manualLandingNight=false;
let dashboardDays=null, logFilters={search:"",role:"",aircraft:"",xc:"",night:"",ifr:""};
const esc=Print.escapeHTML, now=()=>new Date().toISOString();
const uid=prefix=>prefix+"-"+(typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2,10));
const showDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))?s.slice(8)+"-"+s.slice(5,7)+"-"+s.slice(0,4):String(s||"");
function parseDate(text){
 const s=String(text||"").trim();
 const m=/^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
 if(!m)throw Error("Enter the date as DD-MM-YYYY.");
 const iso=m[3]+"-"+m[2]+"-"+m[1],day=new Date(iso+"T00:00:00Z");
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==iso)throw Error("Invalid date.");
 return iso;
}
function currentDate(){
 const d=new Date();
 return String(d.getDate()).padStart(2,"0")+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+d.getFullYear();
}
function button(action,label,style,id,disabled){
 return '<button class="btn '+(style||"")+'" type="button" data-action="'+esc(action)+'"'+
 (id?' data-id="'+esc(id)+'"':"")+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
}
function head(title,desc,actions){
 return '<div class="pagehead"><div><h1>'+esc(title)+'</h1><p class="sub">'+esc(desc)+'</p></div>'+
 '<div class="actions">'+(actions||"")+'</div></div>';
}
function banner(message,type){return '<div role="alert" class="notice '+(type||"")+'">'+esc(message)+'</div>';}
function setNotice(message){flash=message;}
function go(to){
 page=to;pendingBatch=null;batchPreviewOpened=false;pendingAmendment=null;amendmentPreviewOpened=false;
 render();
}
function person(id){return state.people.find(p=>p.id===id);}
function commit(next){
 const expected=state.meta.revision;
 repo.save(next,expected);
 state=next;
 pendingBatch=null;batchPreviewOpened=false;
}
function safeRun(fn){
 try{fn();}
 catch(err){console.error("V2 operation failed",err);flash="Operation not completed: "+String(err.message||err);render();}
}
function render(){
 const rootPage=page==="flight-editor"||page==="flights"?"flights":page==="aircraft-editor"?"aircraft":
 page==="flight-totals"?"flight-totals":page==="people"?"people":
 ["editor","amend","sign","endorsements"].includes(page)?"endorsements":
 ["amend-preview","archive"].includes(page)?"archive":page;
 document.querySelectorAll("[data-nav]").forEach(btn=>btn.classList.toggle("active",btn.dataset.nav===rootPage));
 let html="";
 if(flash){html+=banner(flash,/not completed|Invalid|error|failed|unavailable|blocked/i.test(flash)?"warning":"success");flash="";}
 if(page==="overview")html+=overview();
 else if(page==="people")html+=peopleView();
 else if(page==="more")html+=moreView();
 else if(page==="aircraft")html+=aircraftView();
 else if(page==="aircraft-editor")html+=aircraftEditorView();
 else if(page==="flights")html+=flightsView();
 else if(page==="flight-editor")html+=flightEditorView();
 else if(page==="flight-totals")html+=flightTotalsView();
 else if(page==="endorsements")html+=endorsementsView();
 else if(page==="editor")html+=editorView(false);
 else if(page==="amend")html+=editorView(true);
 else if(page==="sign")html+=signView();
 else if(page==="archive")html+=archiveView();
 else if(page==="amend-preview")html+=amendPreviewView();
 else if(page==="settings")html+=settingsView();
 else html+=overview();
 app.innerHTML=html;
 if(page==="sign")setupSignaturePad();
}
function dashboardRows(records){
 return records.map(f=>'<tr><td>'+esc(showDate(f.date))+'</td><td><b>'+esc(f.aircraftSnapshot?.icao||"—")+'</b></td>'+
 '<td>'+esc(f.dep)+' → '+esc(f.arr)+'</td><td>'+fmtTime(f.durationMin)+'</td>'+
 '<td><span class="tag">'+esc(f.role)+'</span></td></tr>').join("");
}
function dashboardStats(records){
 const t=Flight.totals(state,records);
 return '<div class="grid stats">'+[
 ["Total",t.total],["PIC",t.pic],["Co-pilot",t.copilot],["Dual",t.dual]
 ].map(([label,value])=>'<div class="card"><div class="label">'+label+'</div><div class="big">'+fmtTime(value)+'</div></div>').join("")+'</div>'+
 '<div class="grid stats dashboard-secondary" style="margin-top:10px">'+
 [["Night",t.night],["IFR",t.ifr]].map(([label,value])=>
 '<div class="card"><div class="label">'+label+'</div><div class="big">'+fmtTime(value)+'</div></div>').join("")+
 '</div>';
}
function overview(){
 const owner=Flight.accountHolder(state);
 const latest=[...state.flights].sort((a,b)=>b.date.localeCompare(a.date)||b.off.localeCompare(a.off));
 const period=dashboardDays===null?latest:latest.filter(f=>{
   const d=new Date(f.date+"T00:00:00Z").getTime();
   const limit=Date.now()-dashboardDays*86400000;
   return d>=limit;
 });
 const byAircraft=state.aircraft.map(a=>{
   const mins=state.flights.filter(f=>f.aircraftId===a.id).reduce((sum,f)=>sum+f.durationMin,0);
   return {a,mins};
 }).sort((a,b)=>b.mins-a.mins);
 const signed=state.endorsements.filter(e=>e.signature&&!D.isArchived(state,e.id)).length;
 const pending=state.endorsements.filter(e=>e.signature).length;
 const latestEndorsements=[...state.endorsements].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
 return head("Dashboard","Welcome back"+(owner?", "+owner.name:"")+" · V2 development workspace",
 button("new-flight","＋ Add flight","primary")+button("nav-settings","⚗ Test settings"))+
 banner("V2 testing environment — fictional flight data only. No cloud synchronization or regulatory signature approval.","")+
 '<div class="card" style="margin-bottom:14px"><div class="head"><div><h2>Flight-time overview</h2>'+
 '<div class="muted">'+period.length+' flights in selected period</div></div></div>'+
 '<div class="dashboard-range">'+[
  [30,"30 days"],[90,"90 days"],[365,"12 months"],["all","All time"]
 ].map(([days,label])=>button("dashboard-range",label,
 (dashboardDays===null&&days==="all"||dashboardDays===days)?"active":"",String(days))).join("")+'</div>'+
 dashboardStats(period)+'</div>'+
 '<div class="dashboard-actions">'+[
  ["new-flight","＋","Add flight","Create a new logbook entry"],
  ["nav-aircraft","🚁","Aircraft","Manage your fleet"],
  ["nav-endorsements","✎","Endorsements","Memoranda and signatures"],
  ["nav-archive","▤","Print archive","Confirmed paper pages"]
 ].map(([action,icon,title,subtitle])=>
 '<button type="button" class="card" data-action="'+action+'"><span>'+icon+'</span><b>'+title+'</b>'+
 '<span class="muted">'+subtitle+'</span></button>').join("")+'</div>'+
 '<div class="grid two" style="margin-bottom:16px"><div class="card"><div class="head"><h2>Recent flights</h2>'+
 button("nav-flights","View all")+'</div>'+
 '<div class="table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Route</th><th>Time</th><th>Function</th></tr></thead>'+
 '<tbody>'+dashboardRows(latest.slice(0,6))+'</tbody></table></div>'+
 (!latest.length?'<p class="muted" style="padding-top:12px">No flights recorded yet.</p>':"")+'</div>'+
 '<div class="card"><div class="head"><h2>Upcoming dates</h2>'+button("nav-people","Profiles")+'</div>'+
 '<p class="muted">Licence, medical and rating expiry reminders will return in a later V2 milestone.</p>'+
 '<p class="hint">V2 does not currently determine rating currency or regulatory validity.</p></div></div>'+
 '<div class="grid two"><div class="card"><div class="head"><h2>Recent endorsements</h2>'+
 button("nav-endorsements","View all")+'</div>'+
 (latestEndorsements.length?latestEndorsements.map(e=>
 '<div class="item"><b>'+esc(e.title)+'</b><div class="details">'+esc(showDate(e.date))+' · '+
 (D.isArchived(state,e.id)?"Archived":e.signature?"Signed":"Draft")+'</div></div>').join(""):
 '<p class="muted">No endorsements recorded yet.</p>')+
 '<div class="hint">'+signed+' signed endorsement(s) awaiting archiving out of '+pending+' signed.</div></div>'+
 '<div class="card"><div class="head"><h2>Aircraft time</h2>'+button("nav-aircraft","Manage")+'</div>'+
 (byAircraft.length?byAircraft.map(x=>'<div class="detail-line"><span><b>'+esc(x.a.icao)+'</b> · '+
 esc(x.a.registration)+'</span><strong>'+fmtTime(x.mins)+'</strong></div>').join(""):
 '<p class="muted">No aircraft yet.</p>')+'</div></div>';
}
function moreView(){
 return head("More","Aircraft, pilot profiles, endorsements and your V2 test workspace.")+
 '<div class="more-links">'+[
 ["nav-aircraft","🚁 Aircraft","Manage registrations and ICAO types"],
 ["nav-people","👤 Pilot profiles","Your account holder and instructors"],
 ["nav-endorsements","✎ Endorsements","Memoranda and signatures"],
 ["nav-archive","▤ Print archive","Endorsement paper pages"],
 ["nav-settings","○ Test settings","JSON backup and sandbox reset"]
 ].map(([action,name,desc])=>'<button type="button" class="card more-link" data-action="'+action+'">'+
 '<b>'+name+'</b><span class="muted">'+desc+'</span></button>').join("")+'</div>';
}
function fmtTime(n){return Flight.fmtMinutes(n);}
function aircraftLabel(a){return a.registration+" · "+a.icao+(a.model?" · "+a.model:"");}
function aircraftView(){
 const list=[...state.aircraft].sort((a,b)=>a.registration.localeCompare(b.registration));
 return head("Aircraft","Register helicopters using ICAO aircraft type designators. SE/ME engine type is independent of single/multi-pilot operation.",
 button("new-aircraft","+ Add aircraft","primary"))+
 '<div class="card"><h2>Saved aircraft ('+list.length+')</h2>'+
 (list.length?list.map(a=>'<div class="item"><div class="itemhead"><div>'+
 '<span class="itemtitle">'+esc(a.registration)+'</span> <span class="badge">'+esc(a.icao)+'</span>'+
 '<div class="details">'+esc([a.manufacturer,a.model,a.variant].filter(Boolean).join(" ")||"Unspecified model")+
 ' · '+(a.engine==="ME"?"Multi-engine":"Single-engine")+'</div></div>'+
 '<div class="actions">'+button("edit-aircraft","Edit","small",a.id)+
 button("delete-aircraft","Delete","small danger",a.id)+'</div></div>'+
 '</div>').join(""):'<p class="muted">No aircraft recorded yet. Add one before creating a flight.</p>')+'</div>';
}
function aircraftEditorView(){
 const a=editingAircraftId?Flight.getAircraft(state,editingAircraftId):null;
 return head(a?"Edit aircraft":"Add aircraft","Use the ICAO aircraft type designator in the logbook.",
 button("nav-aircraft","← Aircraft"))+
 '<div class="card"><form id="aircraft-form"><div class="formgrid">'+
 field("Registration","registration",a?.registration||"",18,true)+
 field("ICAO type designator (e.g. G2CA)","icao",a?.icao||"",8,true)+
 field("Manufacturer","manufacturer",a?.manufacturer||"",100,false)+
 field("Model","model",a?.model||"",100,false)+
 field("Variant","variant",a?.variant||"",100,false)+
 '<div class="field"><label for="engine">Engine configuration</label><select id="engine" name="engine">'+
 '<option value="SE"'+(a?.engine!=="ME"?' selected':'')+'>Single-engine (SE)</option>'+
 '<option value="ME"'+(a?.engine==="ME"?' selected':'')+'>Multi-engine (ME)</option></select></div></div>'+
 '<p class="hint">Flights keep a snapshot of engine category, registration, and ICAO type from the time they are entered.</p>'+
 '<div class="actions"><button type="submit" class="btn primary">'+(a?"Save aircraft":"Add aircraft")+'</button>'+
 button("nav-aircraft","Cancel")+'</div></form></div>';
}
function flightsView(){
 const flights=[...state.flights].sort((a,b)=>b.date.localeCompare(a.date)||b.off.localeCompare(a.off));
 return head("Flight logbook","V2 flight entries are test-only. Archive printing and archived-flight corrections will be added in a later milestone.",
 button("new-flight","+ Add Flight","primary"))+
 (state.aircraft.length===0?banner("Add an aircraft before logging your first flight.","warning"):"")+
 '<div class="card"><h2>Flights ('+flights.length+')</h2>'+
 (flights.length?flights.map(f=>{
 const a=f.aircraftSnapshot||{};
 return '<div class="item"><div class="itemhead"><div>'+
 '<div class="itemtitle">'+esc(showDate(f.date))+' · '+esc(a.registration||"Unknown aircraft")+
 ' <span class="badge">'+esc(a.icao||"—")+'</span></div>'+
 '<div class="details">'+esc(f.dep)+' → '+esc(f.arr)+' · '+esc(f.off)+'–'+esc(f.on)+
 ' · <b>'+fmtTime(f.durationMin)+'</b> · '+esc(f.role)+
 ' · '+(f.pilotConfig==="multi"?"Multi-pilot":"Single-pilot")+
 ' · '+(a.engine==="ME"?"ME":"SE")+(f.crossCountry?" · Cross-country":"")+'</div>'+
 '</div><div class="actions">'+button("edit-flight","Edit","small",f.id)+
 button("delete-flight","Delete","small danger",f.id)+'</div></div>'+
 (f.remarks?'<div class="bodytext">'+esc(f.remarks)+'</div>':"")+
 '</div>';
 }).join(""):'<p class="muted">No flights yet. Add a test flight to begin.</p>')+'</div>';
}
function flightTotalsView(){
 const t=Flight.totals(state);
 const types=new Map();
 for(const f of state.flights){
  const key=f.aircraftSnapshot?.icao||"—";
  types.set(key,(types.get(key)||0)+f.durationMin);
 }
 const metric=(label,value)=>'<div class="card"><div class="label">'+label+'</div><div class="big">'+fmtTime(value)+'</div></div>';
 const row=(label,value,asCount=false)=>'<p class="detail-line"><span>'+label+'</span><strong>'+
 (asCount?String(value):fmtTime(value))+'</strong></p>';
 return head("Totals","Your combined career totals · V2 test flights")+
 '<div class="grid stats" style="margin-bottom:16px">'+
 metric("Total",t.total)+metric("PIC",t.pic)+metric("Co-pilot",t.copilot)+metric("Dual",t.dual)+
 '</div>'+
 '<div class="grid two" style="margin-bottom:16px">'+
 '<div class="card"><div class="head"><h2>Aircraft engine experience</h2></div>'+
 row("Single-engine (SE)",t.engineSE)+row("Multi-engine (ME)",t.engineME)+'</div>'+
 '<div class="card"><div class="head"><h2>Pilot configuration time</h2></div>'+
 row("Single-pilot",t.single)+row("Multi-pilot",t.multi)+row("Instructor",t.instructor)+'</div>'+
 '<div class="card"><div class="head"><h2>Additional breakdown</h2></div>'+
 row("SPIC",t.spic)+row("PICUS",t.picus)+row("Night",t.night)+row("IFR",t.ifr)+
 row("Cross-country",t.crossCountry)+'</div></div>'+
 '<div class="card" style="margin-bottom:16px"><div class="head"><h2>Simulator / synthetic training device experience</h2></div>'+
 '<div class="grid stats">'+
 '<div class="card"><div class="label">Dedicated simulator sessions</div><div class="big">—</div></div>'+
 '<div class="card"><div class="label">Simulator session time</div><div class="big">—</div></div>'+
 '<div class="card"><div class="label">Total STD time recorded</div><div class="big">—</div></div></div>'+
 '<div class="section-note" style="margin-top:8px">Simulator recording is not implemented in V2 yet. Synthetic training time will remain separate from flight totals.</div></div>'+
 '<div class="grid two" style="margin-bottom:16px"><div class="card"><div class="head"><h2>Take-offs &amp; landings</h2></div>'+
 row("Take-offs day",t.takeoffDay,true)+row("Take-offs night",t.takeoffNight,true)+
 row("Landings day",t.landingDay,true)+row("Landings night",t.landingNight,true)+'</div>'+
 '<div class="card"><div class="head"><h2>By ICAO type</h2></div>'+
 ([...types].length?[...types.entries()].sort((a,b)=>b[1]-a[1]).map(([type,minutes])=>
 row('<b>'+esc(type)+'</b>',minutes)).join(""):
 '<div class="muted">No aircraft-type hours recorded yet.</div>')+
 '<div class="section-note" style="margin-top:10px">Based on each flight’s original aircraft snapshot.</div></div></div>'+
 '<div class="card"><div class="head"><h2>Specialised helicopter operations experience</h2></div>'+
 '<div class="section-note">Specialised operations categories (including HESLO and VRLL) are planned for V2. They will be calculated separately without adding overlapping time to total flight time.</div></div>'+
 '<p class="footer">PIC total currently includes PIC, SOLO, SPIC and PICUS as a prototype display convention. Regulatory credit must be verified separately.</p>';
}
function flightField(label,name,val,options={}){
 const {max=25,required=false,type="text",min="",step="1"}=options;
 return '<div class="field"><label for="'+name+'">'+esc(label)+'</label>'+
 '<input id="'+name+'" name="'+name+'" type="'+type+'" '+
 (type==="number"?'min="'+(min||"0")+'" step="'+step+'" inputmode="numeric"':'maxlength="'+max+'"')+
 ' value="'+esc(val??"")+'"'+(required?' required':'')+
 (name==="off"||name==="on"?' inputmode="numeric" autocomplete="off" placeholder="HHmm or HH:mm" data-time-field="1"':'')+
 '>'+((name==="off"||name==="on")?timePickerMarkup(name,val):"")+
 '<div class="error-text" id="'+name+'-error"></div></div>';
function timePickerMarkup(name,val){
 let hh="",mm="";
 try{[hh,mm]=Flight.timeValue(val).split(":");}catch{}
 const options=(max,selected)=>'<option value="">'+(max===23?"HH":"MM")+'</option>'+
 Array.from({length:max+1},(_,i)=>{
  const str=String(i).padStart(2,"0");
  return '<option value="'+str+'"'+(str===selected?' selected':'')+'>'+str+'</option>';
 }).join("");
 return '<div class="time-selectors"><label><span>Hour (24h)</span><select name="'+name+'-hour" data-time-picker="'+name+'">'+options(23,hh)+'</select></label>'+
 '<label><span>Minute</span><select name="'+name+'-minute" data-time-picker="'+name+'">'+options(59,mm)+'</select></label></div>';
}
}
function flightEditorView(){
 const f=editingFlightId?Flight.getFlight(state,editingFlightId):null;
 const owner=Flight.accountHolder(state);
 const defaults={date:parseDate(currentDate()),aircraftId:state.aircraft[0]?.id||"",
  dep:"",arr:"",off:"",on:"",role:"PIC",picPersonId:"",pilotConfig:"single",
  ifrMin:0,nightMin:0,instructorMin:0,takeoffDay:1,takeoffNight:0,
  landingDay:1,landingNight:0,crossCountry:false,remarks:""};
 const v=f||defaults;
 const isSelf=v.role==="PIC"||v.role==="SOLO";
 return head(f?"Edit flight":"Add Flight","All flight records here are for testing only. Times use 24-hour HHmm or HH:mm and support overnight flights.",
 button("nav-flights","← Logbook"))+
 (!owner?banner("Set your own pilot profile as Account Holder under Pilot Profiles to log PIC or SOLO.","warning"):"")+
 '<div class="card"><form id="flight-form"><div class="formgrid">'+
 flightField("Date (DD-MM-YYYY)","date",showDate(v.date),{required:true,max:10})+
 '<div class="field"><label for="aircraftId">Aircraft</label><select id="aircraftId" name="aircraftId" required>'+
 '<option value="">Select aircraft</option>'+
 state.aircraft.map(a=>'<option value="'+esc(a.id)+'"'+(v.aircraftId===a.id?' selected':'')+'>'+esc(aircraftLabel(a))+'</option>').join("")+
 '</select></div>'+
 flightField("Departure aerodrome / location","dep",v.dep,{required:true,max:15})+
 flightField("Arrival aerodrome / location","arr",v.arr,{required:true,max:15})+
 flightField("Off-block / Departure time (24h)","off",v.off,{required:true,max:5})+
 flightField("On-block / Arrival time (24h)","on",v.on,{required:true,max:5})+
 '<div class="field"><label for="role">Pilot function</label><select id="role" name="role">'+
 Flight.ROLES.map(role=>'<option value="'+role+'"'+(role===v.role?' selected':'')+'>'+role+'</option>').join("")+
 '</select></div>'+
 '<div class="field"><label for="picPersonId">Commander / Name of PIC</label>'+
 '<select id="picPersonId" name="picPersonId"'+(isSelf?' disabled':'')+'>'+
 '<option value="">Select commander</option>'+
 state.people.filter(p=>!owner||p.id!==owner.id).map(p=>'<option value="'+esc(p.id)+'"'+(p.id===v.picPersonId?' selected':'')+'>'+esc(p.name)+'</option>').join("")+
 '</select><div class="hint" id="pic-help">'+(isSelf?'PIC/SOLO: '+esc(owner?.name||"Account holder missing")+' (automatic)':
 'SPIC, PICUS, DUAL and CO-PILOT require a different commander')+'</div></div>'+
 '<div class="field"><label for="pilotConfig">Pilot configuration</label><select id="pilotConfig" name="pilotConfig">'+
 '<option value="single"'+(v.pilotConfig==="single"?' selected':'')+'>Single-pilot</option>'+
 '<option value="multi"'+(v.pilotConfig==="multi"?' selected':'')+'>Multi-pilot</option>'+
 '</select><div class="hint">Independent of aircraft SE/ME engine category.</div></div></div>'+
 '<div class="summarybox" id="flight-time-summary">Enter both times to calculate total flight duration.</div>'+
 '<div class="formgrid">'+
 flightField("IFR minutes","ifrMin",v.ifrMin,{type:"number",min:"0"})+
 flightField("Night minutes","nightMin",v.nightMin,{type:"number",min:"0"})+
 flightField("Instructor minutes","instructorMin",v.instructorMin,{type:"number",min:"0"})+
 '<div class="field"><label>Cross-country</label><label class="checkline"><input type="checkbox" id="crossCountry" name="crossCountry"'+(v.crossCountry?' checked':'')+'> Mark as cross-country flight</label></div>'+
 flightField("Day take-offs","takeoffDay",v.takeoffDay,{type:"number",min:"0"})+
 flightField("Day landings","landingDay",v.landingDay,{type:"number",min:"0"})+
 flightField("Night take-offs","takeoffNight",v.takeoffNight,{type:"number",min:"0"})+
 flightField("Night landings","landingNight",v.landingNight,{type:"number",min:"0"})+
 '</div><p class="hint">Landings initially mirror take-offs. You can change either landing count manually.</p>'+
 '<div class="field"><label for="remarks">Remarks</label><textarea id="remarks" name="remarks" maxlength="2000">'+esc(v.remarks||"")+'</textarea></div>'+
 '<div class="notice warning" id="flight-form-error" style="display:none"></div>'+
 '<div class="actions"><button type="submit" class="btn primary">'+(f?"Save flight changes":"Save flight")+'</button>'+
 button("nav-flights","Cancel")+'</div></form></div>';
}
function numberField(form,name){
 const str=String(form.elements.namedItem(name)?.value||"").trim();
 if(!/^\d+$/.test(str))throw Error(name+" must be a non-negative integer.");
 return Number(str);
}
function flightFormValues(form){
 const val=name=>String(form.elements.namedItem(name)?.value||"").trim();
 return {date:parseDate(val("date")),aircraftId:val("aircraftId"),
  dep:val("dep"),arr:val("arr"),off:Flight.timeValue(val("off")),on:Flight.timeValue(val("on")),
  role:val("role"),picPersonId:val("picPersonId"),
  pilotConfig:val("pilotConfig"),ifrMin:numberField(form,"ifrMin"),nightMin:numberField(form,"nightMin"),
  instructorMin:numberField(form,"instructorMin"),takeoffDay:numberField(form,"takeoffDay"),
  takeoffNight:numberField(form,"takeoffNight"),landingDay:numberField(form,"landingDay"),
  landingNight:numberField(form,"landingNight"),
  crossCountry:!!form.elements.namedItem("crossCountry")?.checked,remarks:val("remarks")};
}
function previewFlightDuration(){
 const form=document.getElementById("flight-form");if(!form)return;
 const off=form.elements.namedItem("off")?.value||"",on=form.elements.namedItem("on")?.value||"";
 const panel=document.getElementById("flight-time-summary");
 try{
  const mins=Flight.elapsed(off,on);
  if(panel)panel.textContent="Calculated flight time: "+fmtTime(mins)+
   (Flight.timeValue(on)<Flight.timeValue(off)?" · Arrives following day":"");
 }catch{if(panel)panel.textContent="Enter valid departure and arrival times to calculate flight duration.";}
}
function checkTimeInput(input){
 const raw=String(input.value||"").replace(/\D/g,"").slice(0,4);
 // Accept exactly 4 numeric digits and auto-format to HH:mm.
 if(raw.length===4&&/^\d{4}$/.test(raw))input.value=raw.slice(0,2)+":"+raw.slice(2);
 else if(/^[0-9:]*$/.test(input.value)&&raw.length<=4&&input.value.indexOf(":")===-1)input.value=raw;
 const ok=!input.value.trim()||/^([01]\d|2[0-3]):?[0-5]\d$/.test(input.value.trim());
 input.classList.toggle("invalid",!ok);
 input.setAttribute("aria-invalid",ok?"false":"true");
 if(ok&&input.value.trim()&&document.getElementById("flight-form")){
  try{
   const [hh,mm]=Flight.timeValue(input.value).split(":");
   const h=document.getElementById(input.name+"-hour"),m=document.getElementById(input.name+"-minute");
   if(h)h.value=hh;
   if(m)m.value=mm;
  }catch{}
 }
 const error=document.getElementById(input.name+"-error");
 if(error)error.textContent=ok?"":"Use HHmm or HH:mm in 24-hour format.";
 return ok;
}
function updateRoleSelect(){
 const form=document.getElementById("flight-form");if(!form)return;
 const role=form.elements.namedItem("role")?.value,pic=form.elements.namedItem("picPersonId");
 const owner=Flight.accountHolder(state),self=role==="PIC"||role==="SOLO";
 if(pic){pic.disabled=self;if(self)pic.value="";}
 const help=document.getElementById("pic-help");
 if(help)help.textContent=self?"PIC/SOLO: "+(owner?.name||"Set Account Holder in Pilot Profiles")+" (automatic)":
 "SPIC, PICUS, DUAL and CO-PILOT require a different commander.";
}

function peopleView(){
 return head("Pilot profiles","Add test pilots and choose an Account Holder for PIC/SOLO flights.")+
 '<div class="card"><h2>Add pilot / instructor / examiner</h2><form id="person-form">'+
 '<div class="formgrid"><div class="field"><label for="person-name">Name</label><input id="person-name" name="name" maxlength="120" required placeholder="e.g. Test Examiner"></div>'+
 '<div class="field"><label for="person-licence">Licence / ID</label><input id="person-licence" name="licence" maxlength="100" placeholder="Optional"></div></div>'+
 '<button class="btn primary" type="submit">Save pilot profile</button></form></div>'+
 '<div class="card"><h2>Saved pilot profiles ('+state.people.length+')</h2>'+
 (state.people.length?state.people.map(p=>'<div class="item"><div class="itemhead"><div><div class="itemtitle">'+esc(p.name)+(p.isAccountHolder?' <span class="badge archive">Account Holder</span>':"")+'</div>'+
 '<div class="details">'+esc(p.licence||"No licence number")+'</div></div>'+
 '<div class="actions">'+(!p.isAccountHolder?button("set-owner","Set as account holder","small",p.id):"")+'</div></div></div>').join(""):'<p class="muted">No profiles yet. Create one before adding endorsements.</p>')+'</div>';
}
function endorsementsView(){
 const records=[...state.endorsements].sort((a,b)=>b.date.localeCompare(a.date));
 return head("Pilot Memoranda / Endorsements","Records are immutable after signing. Archived changes require separately signed addenda.",
 button("create-endorsement","+ Add endorsement","primary"))+
 (!state.people.length?banner("Add a pilot profile before creating an endorsement.","warning"):"")+
 '<div class="card"><h2>Endorsement records</h2>'+
 (records.length?records.map(e=>{
 const archived=D.isArchived(state,e.id),effective=D.effectiveEndorsement(state,e.id);
 const number=state.amendments.endorsements.filter(a=>a.endorsementId===e.id).length;
 const signer=person(effective.signatoryPersonId);
 return '<div class="item"><div class="itemhead"><div><span class="itemtitle">'+esc(effective.title)+'</span> '+
 '<span class="badge '+(archived?"archive":e.signature?"signed":"")+'">'+(archived?"Archived":e.signature?"Signed":"Draft")+'</span>'+
 (number?' <span class="badge">'+number+' correction(s)</span>':'')+
 '<div class="details"><span>'+esc(showDate(effective.date))+'</span><span>'+esc(effective.category)+'</span>'+
 '<span>'+esc(signer?.name||effective.signature?.name||"Unknown signer")+'</span></div></div>'+
 '<div class="actions">'+(!e.signature?button("edit-endorsement","Edit","small",e.id)+button("sign-endorsement","Sign","small primary",e.id):"")+
 (archived?button("amend-endorsement","Create correction","small",e.id):"")+'</div></div>'+
 '<div class="bodytext">'+esc(effective.text)+'</div>'+
 (effective.signature?'<div class="hint">Signed by '+esc(effective.signature.name)+' · '+esc(effective.signature.signedAt)+'</div>':"")+
 '</div>';
 }).join(""):'<p class="muted">No endorsements yet. Add one to begin.</p>')+
 '</div>';
}
function editorView(amending){
 const original=editingId?D.getEndorsement(state,editingId):null;
 const record=amending?D.effectiveEndorsement(state,editingId):original;
 if((amending||editingId)&&!record)return banner("Selected endorsement not found.","warning");
 const r=record||{date:parseDate(currentDate()),category:"Proficiency check / revalidation",title:"",location:"",text:"",signatoryPersonId:"",qualificationId:""};
 return head(amending?"Create correction addendum":editingId?"Edit draft endorsement":"New endorsement",
 amending?"The original archived page remains unchanged. A correction needs a reason and a fresh signature.":"Endorser reviews the text and signs it explicitly.",
 button("nav-endorsements","← Back"))+
 '<div class="card"><form id="'+(amending?"amend-form":"endorsement-form")+'">'+
 (amending?'<div class="notice">This prepares an amendment for the archived record; it does not alter the original.</div>':"")+
 '<div class="formgrid">'+
 field("Date (DD-MM-YYYY)","date",showDate(r.date),32,true)+
 '<div class="field"><label for="category">Category</label><select id="category" name="category">'+
 ["Skill test","Proficiency check / revalidation","Type rating endorsement","Licence endorsement","Training completion","Other"].map(c=>
 '<option'+(r.category===c?' selected':'')+'>'+esc(c)+'</option>').join("")+'</select></div>'+
 field("Title","title",r.title,160,true)+
 field("Location","location",r.location,140,false)+
 field("Related licence/rating","qualificationId",r.qualificationId,120,false)+
 '<div class="field"><label for="signatoryPersonId">Instructor / examiner</label><select id="signatoryPersonId" name="signatoryPersonId" required>'+
 '<option value="">Select saved pilot</option>'+
 state.people.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===r.signatoryPersonId?' selected':'')+'>'+
 esc(p.name)+(p.licence?' — '+esc(p.licence):'')+'</option>').join("")+'</select></div>'+
 '</div>'+
 '<div class="field"><label for="text">Endorsement wording</label><textarea id="text" name="text" maxlength="1800" required>'+esc(r.text)+'</textarea></div>'+
 (amending?'<div class="field"><label for="reason">Reason for amendment (required)</label><textarea id="reason" name="reason" maxlength="750" required></textarea></div>':"")+
 '<div class="actions"><button class="btn primary" type="submit">'+(amending?"Review and sign correction":"Save draft endorsement")+'</button>'+
 button("nav-endorsements","Cancel")+'</div></form></div>';
}
function field(label,name,value,max,required){
 return '<div class="field"><label for="'+name+'">'+esc(label)+'</label><input id="'+name+'" name="'+name+'" value="'+esc(value||"")+'" maxlength="'+max+'"'+(required?' required':'')+'></div>';
}
function signView(){
 const amend=!!signingProposal;
 const r=amend?signingProposal.after:D.getEndorsement(state,signingId);
 if(!r)return banner("Endorsement not found.","warning");
 const profile=person(r.signatoryPersonId);
 return head(amend?"Sign correction addendum":"Sign endorsement",
 "The selected signer must review the complete wording before applying a signature.",
 button("nav-endorsements","Cancel"))+
 '<div class="card"><div class="notice warning"><b>Development signature capture only.</b> The signer is not identity-verified and authority acceptance has not been established.</div>'+
 '<h2>'+esc(r.title)+'</h2><div class="details">'+esc(showDate(r.date))+' · '+esc(r.category)+' · '+esc(r.location||"No location")+'</div>'+
 '<div class="bodytext">'+esc(r.text)+'</div>'+
 (amend?'<div class="notice">Correction reason: '+esc(signingProposal.reason)+'</div>':"")+
 '<hr class="sep"><p><b>Signatory:</b> '+esc(profile?.name||"Unknown")+' ('+esc(profile?.licence||"no licence ID")+')</p>'+
 '<p class="hint">Use a mouse, stylus, or finger to draw in the box. Only apply a signature when the named endorser is present and agrees to the wording.</p>'+
 '<canvas id="sign-canvas" class="sigpad" width="900" height="230" aria-label="Draw a signature"></canvas>'+
 '<div class="actions" style="margin-top:13px">'+button("clear-signature","Clear signature")+
 button("apply-signature",amend?"Sign correction":"Apply endorsement signature","primary")+'</div></div>';
}
function archiveView(){
 const unarchived=state.endorsements.filter(e=>e.signature&&!D.isArchived(state,e.id))
 .sort((a,b)=>a.date.localeCompare(b.date));
 const unsigned=state.endorsements.filter(e=>!e.signature).length;
 const batches=state.archives.endorsements;
 return head("Print Archive","Endorsements are numbered independently from flight logbook pages.")+
 '<div class="card"><h2>Flight logbook pages</h2><p class="muted">The V2 flight print archive will be connected in a later iteration. V1.43.2 continues to support flight pages.</p></div>'+
 '<div class="card"><h2>New endorsement print batch</h2><p class="muted">Choose signed endorsements, preview the printable A4 pages, then explicitly confirm after printing and checking.</p>'+
 (unsigned?'<p class="hint">'+unsigned+' unsigned draft(s) cannot be archived.</p>':"")+
 (pendingBatch?
 '<div class="notice success">Preview opened for batch '+esc(pendingBatch.id)+': '+pendingBatch.items.length+
 ' endorsement(s), '+pendingBatch.pageCount+' page(s), starting at page '+pendingBatch.firstPage+'.</div>'+
 '<div class="actions">'+button("reopen-batch-preview","Open preview again")+'</div>'+
 '<p><label><input id="batch-checked" type="checkbox"> I have printed or saved and carefully reviewed every page and completed any required paper signatures.</label></p>'+
 '<div class="actions">'+button("confirm-batch","Confirm printed endorsement batch","primary")+
 button("cancel-batch","Discard preview")+'</div>':
 (unarchived.length?'<form id="archive-select-form">'+unarchived.map(e=>
 '<label class="selection"><input type="checkbox" name="endorsement" value="'+esc(e.id)+'" checked>'+
 '<span><b>'+esc(e.title)+'</b><span class="details">'+esc(showDate(e.date))+' · signed by '+esc(e.signature.name)+'</span></span></label>').join("")+
 '<button class="btn primary" type="submit">Preview selected endorsement pages</button></form>':
 '<p class="muted">No signed, unarchived endorsements are available.</p>'))+
 '</div>'+
 '<div class="card"><h2>Confirmed endorsement batches ('+batches.length+')</h2>'+
 (batches.length?batches.map(batch=>
 '<div class="item"><div class="itemhead"><div><b>'+esc(batch.id)+'</b> <span class="badge archive">Archived</span>'+
 '<div class="details">'+batch.items.length+' endorsement(s) · pages '+batch.firstPage+
 '–'+(batch.firstPage+batch.pageCount-1)+' · confirmed '+esc(batch.confirmedAt)+'</div></div>'+
 '<div class="actions">'+button("reprint-batch","Reprint original","small",batch.id)+'</div></div>'+
 '<p class="hint">Archived originals remain unchanged when later corrections are confirmed.</p></div>').join(""):'<p class="muted">No confirmed endorsement batches yet.</p>')+
 '</div>'+
 '<div class="card"><h2>Signed correction history ('+state.amendments.endorsements.length+')</h2>'+
 (state.amendments.endorsements.length?state.amendments.endorsements.map(a=>
 '<div class="item"><div class="itemhead"><div><b>'+esc(a.id)+'</b> · '+esc(a.reason)+
 '<div class="details">Endorsement '+esc(a.endorsementId)+' · signed by '+esc(a.after.signature?.name||"")+
 ' · confirmed '+esc(a.confirmedAt)+'</div></div>'+
 '<div class="actions">'+button("reprint-amendment","Reprint correction","small",a.id)+'</div></div></div>').join(""):'<p class="muted">No signed amendments yet.</p>')+
 '</div>';
}
function amendPreviewView(){
 const a=pendingAmendment;
 if(!a)return head("No pending correction","Start from an archived endorsement.");
 const ref=findArchiveFor(a.endorsementId);
 return head("Review correction addendum","The original archived endorsement remains intact.",
 button("nav-archive","← Print Archive"))+
 '<div class="card"><h2>Amendment '+esc(a.id)+'</h2>'+
 '<p><b>Original archive:</b> '+esc(ref?.batch.id||"—")+' · page '+esc(ref?.page||"—")+'</p>'+
 '<p><b>Reason:</b> '+esc(a.reason)+'</p>'+
 '<div class="notice">The revised text has been signed by '+esc(a.after.signature?.name||"")+
 '. Print this addendum and keep it with the original page.</div>'+
 '<div class="actions">'+button("preview-amendment","Preview / Print addendum","primary")+'</div>'+
 (amendmentPreviewOpened?'<hr class="sep"><label><input id="amend-checked" type="checkbox"> I printed or saved and reviewed the signed correction addendum.</label>'+
 '<div class="actions" style="margin-top:14px">'+button("confirm-amendment","Confirm correction archive","primary")+'</div>':"")+'</div>';
}
function settingsView(){
 return head("Development data & backup","These controls affect V2 development storage only.")+
 '<div class="card"><h2>Development workspace</h2>'+
 '<p><b>Workspace:</b> '+esc(state.meta.workspaceId)+'</p>'+
 '<p><b>Storage revision:</b> '+state.meta.revision+'</p>'+
 '<p><b>Integrity:</b> '+esc(D.validateState(state).length||Flight.validateState(state).length?"Review required":"No errors detected")+'</p>'+
 '<div class="actions">'+button("download-backup","Download V2 JSON backup","primary")+
 button("reset-workspace","Reset V2 test data","danger")+'</div>'+
 '<p class="hint" style="margin-top:12px">The reset requires typing RESET_V2_SANDBOX. This operation never clears V1.43.2 storage keys.</p></div>'+
 '<div class="card"><h2>What is not enabled</h2><p>Cloud accounts, cross-device sync, authority-approved signatures, V2 flight archive printing and regulated audit guarantees remain future work.</p></div>';
}
function readFields(form){
 const val=name=>String(form.elements.namedItem(name)?.value||"").trim();
 return {date:parseDate(val("date")),category:val("category"),title:val("title"),text:val("text"),
 location:val("location"),qualificationId:val("qualificationId"),signatoryPersonId:val("signatoryPersonId")};
}
function openPrint(html){
 const w=window.open("","_blank");
 if(!w)throw Error("Popup blocked. Allow print-preview windows and try again.");
 w.document.open();w.document.write(html);w.document.close();w.focus();
 return true;
}
function findArchiveFor(id){
 for(const batch of state.archives.endorsements){
   const index=batch.items.findIndex(item=>item.endorsementId===id);
   if(index>=0)return {batch,page:batch.firstPage+Math.floor(index/(batch.itemsPerPage||D.ENDORSEMENTS_PER_PAGE))};
 }
 return null;
}
function setupSignaturePad(){
 const canvas=document.getElementById("sign-canvas");if(!canvas)return;
 const ctx=canvas.getContext("2d"); if(!ctx)return;
 signCanvas=canvas;signatureDirty=false;
 ctx.lineWidth=3.3;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#142a47";
 let active=false,last=null;
 function pos(e){
  const r=canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
 }
 canvas.addEventListener("pointerdown",e=>{
  e.preventDefault();active=true;last=pos(e);canvas.setPointerCapture(e.pointerId);
  ctx.beginPath();ctx.arc(last.x,last.y,1.8,0,Math.PI*2);ctx.fillStyle="#142a47";ctx.fill();
  signatureDirty=true;
 });
 canvas.addEventListener("pointermove",e=>{
  if(!active)return;e.preventDefault();const next=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);
  ctx.lineTo(next.x,next.y);ctx.stroke();last=next;signatureDirty=true;
 });
 const finish=()=>{active=false;last=null;};
 canvas.addEventListener("pointerup",finish);
 canvas.addEventListener("pointercancel",finish);
 canvas.addEventListener("lostpointercapture",finish);
}
function handleClick(action,id){
 switch(action){
  case "nav-aircraft":go("aircraft");return;
  case "nav-flights":go("flights");return;
  case "nav-flight-totals":go("flight-totals");return;
  case "new-aircraft":editingAircraftId="";go("aircraft-editor");return;
  case "edit-aircraft":editingAircraftId=id;go("aircraft-editor");return;
  case "delete-aircraft":{
   const a=Flight.getAircraft(state,id);
   if(a&&!window.confirm("Delete aircraft "+a.registration+"? Aircraft used in flights cannot be deleted."))return;
   commit(Flight.deleteAircraft(state,id,now()));
   setNotice("Aircraft deleted.");go("aircraft");return;
  }
  case "set-owner":{
   const pilot=person(id);
   if(pilot&&!window.confirm("Set "+pilot.name+" as the account holder? PIC and SOLO flights will use this pilot as commander."))return;
   commit(Flight.setAccountHolder(state,id,now()));
   setNotice("Account holder selected.");go("people");return;
  }
  case "new-flight":
   if(!state.aircraft.length)throw Error("Add an aircraft before logging a flight.");
   editingFlightId="";manualLandingDay=false;manualLandingNight=false;go("flight-editor");return;
  case "edit-flight":
   editingFlightId=id;manualLandingDay=false;manualLandingNight=false;go("flight-editor");return;
  case "delete-flight":{
   const f=Flight.getFlight(state,id);
   if(!f||!window.confirm("Delete test flight "+showDate(f.date)+" / "+f.dep+"–"+f.arr+"?"))return;
   commit(Flight.deleteFlight(state,id,now()));
   setNotice("Test flight deleted.");go("flights");return;
  }
  case "nav-people":go("people");return;
  case "nav-endorsements":go("endorsements");return;
  case "nav-archive":go("archive");return;
  case "create-endorsement":
   if(!state.people.length)throw Error("Add a pilot profile before creating an endorsement");
   editingId="";go("editor");return;
  case "edit-endorsement":editingId=id;go("editor");return;
  case "amend-endorsement":editingId=id;go("amend");return;
  case "sign-endorsement":signingId=id;signingProposal=null;go("sign");return;
  case "clear-signature":
   if(signCanvas){signCanvas.getContext("2d").clearRect(0,0,signCanvas.width,signCanvas.height);signatureDirty=false;}return;
  case "apply-signature":{
   if(!signCanvas||!signatureDirty)throw Error("Draw a signature in the signature box first.");
   const image=signCanvas.toDataURL("image/png"),at=now();
   if(signingProposal){
    pendingAmendment=D.signEndorsementAmendment(state,signingProposal,image,at);
    amendmentPreviewOpened=false;signingProposal=null;page="amend-preview";
    render();return;
   }
   commit(D.signEndorsement(state,signingId,image,at));
   signingId="";setNotice("Endorsement signed. You can include it in a print archive.");go("endorsements");return;
  }
  case "reopen-batch-preview":
   if(!pendingBatch)throw Error("No preview pending");
   openPrint(Print.renderEndorsementBatch(pendingBatch));batchPreviewOpened=true;return;
  case "cancel-batch":pendingBatch=null;batchPreviewOpened=false;render();return;
  case "confirm-batch":{
   if(!pendingBatch||!batchPreviewOpened)throw Error("Generate print preview first");
   if(!document.getElementById("batch-checked")?.checked)throw Error("Confirm you reviewed and printed the pages");
   if(!window.confirm("Confirm "+pendingBatch.id+" permanently archived? Verify the printed pages and signatures. This cannot be undone."))return;
   const batchId=pendingBatch.id;
   commit(D.confirmEndorsementPrint(state,pendingBatch,now()));
   setNotice("Endorsement batch "+batchId+" confirmed. Original pages are now protected.");
   render();return;
  }
  case "reprint-batch":{
   const batch=state.archives.endorsements.find(b=>b.id===id);
   if(!batch)throw Error("Archived batch missing");
   openPrint(Print.renderEndorsementBatch(batch));return;
  }
  case "preview-amendment":{
   if(!pendingAmendment)throw Error("No amendment prepared");
   const ref=findArchiveFor(pendingAmendment.endorsementId);
   if(!ref)throw Error("Original archive reference missing");
   openPrint(Print.renderAmendment(pendingAmendment,{id:ref.batch.id,page:ref.page}));
   amendmentPreviewOpened=true;render();return;
  }
  case "confirm-amendment":{
   if(!pendingAmendment||!amendmentPreviewOpened)throw Error("Preview the addendum first");
   if(!document.getElementById("amend-checked")?.checked)throw Error("Confirm you printed and reviewed the addendum");
   if(!window.confirm("Archive the signed correction? The original record remains unchanged."))return;
   const amendId=pendingAmendment.id;
   commit(D.confirmEndorsementAmendment(state,pendingAmendment,now()));
   pendingAmendment=null;amendmentPreviewOpened=false;
   setNotice("Signed correction "+amendId+" confirmed and archived.");go("archive");return;
  }
  case "reprint-amendment":{
   const a=state.amendments.endorsements.find(item=>item.id===id);
   if(!a)throw Error("Correction not found");
   const ref=findArchiveFor(a.endorsementId);
   if(!ref)throw Error("Original archive reference missing");
   openPrint(Print.renderAmendment(a,{id:ref.batch.id,page:ref.page}));return;
  }
  case "download-backup":{
   const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
   const url=URL.createObjectURL(blob),link=document.createElement("a");
   link.href=url;link.download="helilog-v2-development-backup.json";link.click();
   URL.revokeObjectURL(url);return;
  }
  case "reset-workspace":{
   const phrase=window.prompt("To delete ALL V2 development data only, type RESET_V2_SANDBOX");
   if(phrase===null)return;
   repo.resetForDevelopment(phrase);
   state=D.newState(uid("v2-sandbox"),now());repo.save(state,null);
   setNotice("V2 test workspace reset. No V1 data was touched.");go("overview");return;
  }
 }
}
document.addEventListener("click",event=>{
 const nav=event.target.closest("[data-nav]");
 if(nav){safeRun(()=>go(nav.dataset.nav));return;}
 const el=event.target.closest("[data-action]");
 if(el)safeRun(()=>handleClick(el.dataset.action,el.dataset.id||""));
});
document.addEventListener("input",event=>{
 const el=event.target;
 if(!document.getElementById("flight-form"))return;
 if(el.matches?.('[data-time-field]')){checkTimeInput(el);previewFlightDuration();}
 if(el.name==="landingDay")manualLandingDay=true;
 if(el.name==="landingNight")manualLandingNight=true;
 if(el.name==="takeoffDay"&&!manualLandingDay){
  const landing=document.getElementById("landingDay");if(landing)landing.value=el.value;
 }
 if(el.name==="takeoffNight"&&!manualLandingNight){
  const landing=document.getElementById("landingNight");if(landing)landing.value=el.value;
 }
});
document.addEventListener("change",event=>{
 if(event.target?.name==="role")updateRoleSelect();
 const key=event.target?.dataset?.timePicker;
 if(key==="off"||key==="on"){
  const form=document.getElementById("flight-form");
  if(!form)return;
  const h=form.elements.namedItem(key+"-hour")?.value;
  const m=form.elements.namedItem(key+"-minute")?.value;
  const input=form.elements.namedItem(key);
  if(input&&h!==""&&m!==""){
   input.value=h+":"+m;
   checkTimeInput(input);previewFlightDuration();
  }
 }
});
document.addEventListener("submit",event=>{
 const form=event.target;
 if(!form.matches("form"))return;
 event.preventDefault();
 safeRun(()=>{
  if(form.id==="aircraft-form"){
   const val=name=>String(form.elements.namedItem(name)?.value||"").trim();
   const data={registration:val("registration"),icao:val("icao"),manufacturer:val("manufacturer"),
    model:val("model"),variant:val("variant"),engine:val("engine")};
   commit(editingAircraftId?
    Flight.editAircraft(state,editingAircraftId,data,now()):
    Flight.addAircraft(state,{...data,id:uid("aircraft")},now()));
   editingAircraftId="";setNotice("Aircraft saved.");go("aircraft");return;
  }
  if(form.id==="flight-form"){
   try{
    const fields=flightFormValues(form);
    const next=editingFlightId?
     Flight.editFlight(state,editingFlightId,fields,now()):
     Flight.addFlight(state,{...fields,id:uid("flight")},now());
    commit(next);editingFlightId="";setNotice("Test flight saved.");go("flights");
   }catch(e){
    const area=document.getElementById("flight-form-error");
    if(area){area.textContent=String(e.message||e);area.style.display="block";}
    for(const name of ["off","on"]){
     const input=document.getElementById(name);
     if(input)checkTimeInput(input);
    }
    // Invalid flight fields remain in place so the pilot can correct them.
   }
   return;
  }
  if(form.id==="person-form"){
   const name=form.elements.namedItem("name").value.trim(),licence=form.elements.namedItem("licence").value.trim();
   commit(D.addPerson(state,{id:uid("pilot"),name,licence},now()));
   setNotice("Saved pilot profile.");render();return;
  }
  if(form.id==="endorsement-form"){
   const values=readFields(form);
   const next=editingId?
    D.editUnsignedEndorsement(state,editingId,values,now()):
    D.createEndorsement(state,{...values,id:uid("endorsement")},now());
   commit(next);editingId="";setNotice("Draft endorsement saved.");go("endorsements");return;
  }
  if(form.id==="amend-form"){
   const values=readFields(form);
   const reason=String(form.elements.namedItem("reason").value||"").trim();
   signingProposal=D.prepareEndorsementAmendment(state,editingId,values,reason,uid("amendment"),now());
   signingId=editingId;page="sign";render();return;
  }
  if(form.id==="archive-select-form"){
   const ids=Array.from(form.querySelectorAll('input[name="endorsement"]:checked')).map(e=>e.value);
   pendingBatch=D.prepareEndorsementPrint(state,ids,uid("END"),now());
   openPrint(Print.renderEndorsementBatch(pendingBatch));
   batchPreviewOpened=true;render();return;
  }
 });
});
try{
 state=repo.load();
 if(!state){state=D.newState(uid("v2-sandbox"),now());repo.save(state,null);}
 render();
}catch(error){
 console.error("V2 initialization blocked",error);
 app.innerHTML=banner("V2 development workspace cannot open safely: "+String(error.message||error)+
 ". Stored data has not been reset. Do not clear browser storage automatically.","warning");
}
})();
