"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,p),"utf8");
const people=read("source/app/07-aircraft-and-people.js"),endorse=read("source/app/08-endorsements.js"),bridge=read("endorsement-bridge.js");
const sample="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAElFTkSuQmCC";
function context(){
 let saves=0,approvals=0;const person={id:"p1",name:"Pilot Test",licence:"EXAM-1",savedSignatureData:sample};
 const e={id:"e1",title:"Training",signatoryPersonId:"p1",signatureData:""};
 const els={v227ApproveSignature:{checked:false}};
 const c={S:{people:[person],endorsements:[e]},personById:id=>id==="p1"?person:null,
 endorsementById:id=>id==="e1"?e:null,v2ArchiveBridge:{isArchived:()=>false},
 document:{getElementById:id=>els[id]},save:()=>{saves++;return true},
 alert:()=>{},confirm:()=>{approvals++;return true},endorsements:()=>{}};
 vm.createContext(c);vm.runInContext(people,c);
 return {c,person,e,els, get saves(){return saves},get approvals(){return approvals}};
}
test("pilot page exposes capture and consent while removing planned placeholders",()=>{
 assert.match(people,/v227EditSignature/);assert.match(people,/v227StoreConsent/);
 assert.match(people,/v227RemoveSignature/);
 assert.doesNotMatch(people,/Signature profile: planned for V2|Signature association will be added later/);
});
test("signature URL validation accepts only bounded base64 PNG",()=>{
 const f=context();assert.equal(f.c.v227IsPNG(sample),true);
 for(const v of ["","javascript:alert(1)","data:image/svg+xml,<svg/>","data:image/png;base64,<script>","data:image/png;base64,"+"A".repeat(250000)])assert.equal(f.c.v227IsPNG(v),false);
});
test("endorsements require signatory approval for a saved profile signature",()=>{
 const f=context();f.c.v227UseSavedSignature("e1");
 assert.equal(f.saves,0);assert.equal(f.approvals,0);assert.equal(f.e.signatureData,"");
 f.els.v227ApproveSignature.checked=true;f.c.v227UseSavedSignature("e1");
 assert.equal(f.saves,1);assert.equal(f.approvals,1);
 assert.equal(f.e.signatureData,sample);assert.equal(f.e.signedName,"Pilot Test");
 assert.equal(f.e.signedSource,"saved-profile");assert.equal(f.e.signedConsentAt,f.e.signedAt);
});
test("replacing profile signature cannot alter prior signed record",()=>{
 const f=context();f.els.v227ApproveSignature.checked=true;f.c.v227UseSavedSignature("e1");
 f.person.savedSignatureData="data:image/png;base64,AAAA";
 assert.equal(f.e.signatureData,sample);
 f.c.v227UseSavedSignature("e1");assert.equal(f.saves,1);
});
test("signature cannot overwrite archived records or change signer",()=>{
 const f=context();f.els.v227ApproveSignature.checked=true;f.c.v2ArchiveBridge.isArchived=()=>true;
 f.c.v227UseSavedSignature("e1");assert.equal(f.saves,0);
 f.c.v2ArchiveBridge.isArchived=()=>false;
 f.e.signatoryPersonId="someone-else";assert.equal(f.c.v227WriteEndorsementSignature(f.e,f.person,sample,"saved-profile"),false);
});
test("drawn and saved signing require approval, and archives record source metadata",()=>{
 assert.match(endorse,/v227SignerApproved\(\)/);assert.match(endorse,/v227WriteEndorsementSignature/);
 assert.match(endorse,/v227UseSavedSignature/);
 assert.match(bridge,/source:e\.signedSource/);assert.match(bridge,/approvedAt:e\.signedConsentAt/);
});
test("existing logbook print and archive formats are not modified",()=>{
 assert.doesNotMatch(read("print.js"),/savedSignatureData/);
 assert.doesNotMatch(read("archive-integrity.js"),/savedSignatureData/);
 assert.match(read("source/index.template.html"),/V2\.46/);
 assert.match(read("service-worker.js"),/helilog-v2-46-mobile-filters-1/);
});
