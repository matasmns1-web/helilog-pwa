/* HeliLog V2 alpha: standalone endorsement workflow, no V1 writes. */
(function(){
"use strict";
const D=window.HeliLogV2Domain, Store=window.HeliLogV2Storage, Print=window.HeliLogV2Print;
const app=document.getElementById("app");
if(!D||!Store||!Print){app.textContent="V2 scripts are unavailable; check the development files.";return;}
const repo=Store.createRepository(window.localStorage,D);
let state=null, page="overview", editingId="", signingId="", signingProposal=null;
let pendingBatch=null, batchPreviewOpened=false, pendingAmendment=null, amendmentPreviewOpened=false;
let flash="", signatureDirty=false, signCanvas=null;
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
 document.querySelectorAll("[data-nav]").forEach(btn=>btn.classList.toggle("active",btn.dataset.nav===page));
 let html="";
 if(flash){html+=banner(flash,/not completed|Invalid|error|failed|unavailable|blocked/i.test(flash)?"warning":"success");flash="";}
 if(page==="overview")html+=overview();
 else if(page==="people")html+=peopleView();
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
function overview(){
 const archived=state.archives.endorsements.reduce((n,b)=>n+b.items.length,0);
 const signed=state.endorsements.filter(e=>e.signature&&!D.isArchived(state,e.id)).length;
 return head("V2 development workspace","Test the new endorsement lifecycle without touching V1.43.2.",
 button("create-endorsement","+ Add endorsement","primary") )+
 banner("Development-only local data. No cloud sync, verified identities or approved digital signatures are implemented.","")+
 '<div class="grid"><div class="card"><div class="hint">ENDORSEMENTS</div><div class="stat">'+state.endorsements.length+'</div></div>'+
 '<div class="card"><div class="hint">SIGNED, AWAITING PRINT</div><div class="stat">'+signed+'</div></div>'+
 '<div class="card"><div class="hint">ARCHIVED</div><div class="stat">'+archived+'</div></div></div>'+
 '<div class="card"><h2>Endorsement workflow</h2><div class="flow">'+
 ['Create','Sign','Print preview','Confirm archive','Correct by addendum'].map((s,i)=>'<div class="flowstep">'+(i+1)+'. '+esc(s)+'</div>').join("")+
 '</div><hr class="sep"><p>Start by creating an instructor/examiner profile. Create an endorsement, draw a signature, print a paper-style page, and confirm only after checking it. Subsequent corrections remain separately traceable.</p>'+
 '<div class="actions">'+button("nav-people","Pilot profiles")+
 button("nav-endorsements","Manage endorsements")+
 button("nav-archive","Open print archive","primary")+'</div></div>'+
 '<div class="card"><h2>Flight logbook</h2><p>The V2 flight-entry and totals modules will follow. Existing V1 flight functionality remains on the stable production website.</p>'+
 '<a href="https://helilog-pwa.onrender.com" target="_blank" rel="noopener noreferrer">Open stable HeliLog V1.43.2</a></div>';
}
function peopleView(){
 return head("Pilot profiles","Add fictional test instructors and examiners for signing endorsements.")+
 '<div class="card"><h2>Add instructor / examiner</h2><form id="person-form">'+
 '<div class="formgrid"><div class="field"><label for="person-name">Name</label><input id="person-name" name="name" maxlength="120" required placeholder="e.g. Test Examiner"></div>'+
 '<div class="field"><label for="person-licence">Licence / ID</label><input id="person-licence" name="licence" maxlength="100" placeholder="Optional"></div></div>'+
 '<button class="btn primary" type="submit">Save pilot profile</button></form></div>'+
 '<div class="card"><h2>Saved pilot profiles ('+state.people.length+')</h2>'+
 (state.people.length?state.people.map(p=>'<div class="item"><div class="itemtitle">'+esc(p.name)+'</div>'+
 '<div class="details">'+esc(p.licence||"No licence number")+'</div></div>').join(""):'<p class="muted">No profiles yet. Create one before adding endorsements.</p>')+'</div>';
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
 '<p><b>Integrity:</b> '+esc(D.validateState(state).length?"Review required":"No errors detected")+'</p>'+
 '<div class="actions">'+button("download-backup","Download V2 JSON backup","primary")+
 button("reset-workspace","Reset V2 test data","danger")+'</div>'+
 '<p class="hint" style="margin-top:12px">The reset requires typing RESET_V2_SANDBOX. This operation never clears V1.43.2 storage keys.</p></div>'+
 '<div class="card"><h2>What is not enabled</h2><p>Cloud accounts, cross-device sync, authority-approved signatures, V2 flight logging and regulated audit guarantees remain future work.</p></div>';
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
document.addEventListener("submit",event=>{
 const form=event.target;
 if(!form.matches("form"))return;
 event.preventDefault();
 safeRun(()=>{
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
