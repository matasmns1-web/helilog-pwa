/* Run with node --test v2/endorsement-bridge.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const B=require("./endorsement-bridge.js");
const SIG="data:image/png;base64,aGVsbG8=";
const T1="2026-10-14T09:00:00.000Z";
const T2="2026-10-14T10:00:00.000Z";
const T3="2026-10-14T11:00:00.000Z";
function fixture(){
 return {people:[
   {id:"p1",name:"Pilot Account",isAccountHolder:true,licence:"CPL(H)"},
   {id:"p2",name:"Test Instructor",licence:"FI(H)"}],
  endorsements:[{id:"e1",date:"2026-10-14",category:"Proficiency check / revalidation",
    title:"Cabri G2 <test>",text:"Signed example only",location:"Vilnius",qualificationId:"",
    signatoryPersonId:"p2",signatureData:SIG,signedName:"Test Instructor",
    signedLicence:"FI(H)",signedAt:T1}]};
}
test("bridge creates valid V2 domain from the V1-style endorsement record",()=>{
 const db=fixture();
 const state=B.workspace(db);
 assert.equal(state.schemaVersion,2);
 assert.equal(state.endorsements[0].signature.name,"Test Instructor");
 assert.equal(state.endorsements[0].signature.data,SIG);
 assert.equal(state.endorsements[0].title,"Cabri G2 <test>");
});
test("preview does not mutate original data; confirmation snapshots signed endorsement",()=>{
 const db=fixture();
 const preview=B.draft(db,["e1"],"END-001",T2);
 assert.equal(db.endorsementV2Archive,undefined);
 assert.equal(preview.firstPage,1);
 assert.equal(preview.items.length,1);
 const html=B.printBatch(preview);
 assert.match(html,/A4 portrait/);
 assert.match(html,/Cabri G2 &lt;test&gt;/);
 db.endorsementV2Archive=B.confirm(db,preview,T3);
 assert.equal(B.isArchived(db,"e1"),true);
 assert.equal(db.endorsementV2Archive.batches.length,1);
 assert.equal(B.printBatch(db.endorsementV2Archive.batches[0]),html);
 assert.throws(()=>B.draft(db,["e1"],"END-002",T3),/already archived/);
});
test("confirmed signed correction leaves original and original printed archive unchanged",()=>{
 const db=fixture();
 const preview=B.draft(db,["e1"],"END-001",T2);
 db.endorsementV2Archive=B.confirm(db,preview,T3);
 const original=JSON.stringify(db.endorsements);
 const snapshot=JSON.stringify(db.endorsementV2Archive.batches);
 const change=B.amendmentDraft(db,"e1",{text:"Revised signed wording"},
   "Corrected wording","AM-001",T3);
 const signed=B.signAmendment(db,change,SIG,T3);
 assert.match(B.printAmendment(signed,B.source(db,"e1")),/Revised signed wording/);
 assert.match(B.printAmendment(signed,B.source(db,"e1")),/Signed example only/);
 db.endorsementV2Archive=B.confirmAmendment(db,signed,T3);
 assert.equal(JSON.stringify(db.endorsements),original);
 assert.equal(JSON.stringify(db.endorsementV2Archive.batches),snapshot);
 assert.equal(B.effective(db,"e1").text,"Revised signed wording");
 assert.equal(db.endorsementV2Archive.amendments.length,1);
 assert.doesNotThrow(()=>B.workspace(JSON.parse(JSON.stringify(db))));
});
test("tampering with the original signed endorsement after archiving is detected",()=>{
 const db=fixture();
 db.endorsementV2Archive=B.confirm(db,B.draft(db,["e1"],"END-001",T2),T3);
 db.endorsements[0].text="Silent overwrite attempt";
 assert.throws(()=>B.workspace(db),/integrity error/);
});
test("stale preview after changing signed wording is rejected",()=>{
 const db=fixture();
 const draft=B.draft(db,["e1"],"END-001",T2);
 db.endorsements[0].title="Illegitimate rewrite";
 assert.throws(()=>B.confirm(db,draft,T3),/no longer matches signed records/);
});
test("old V2 alpha development data is not referenced by the archive bridge",()=>{
 const src=require("node:fs").readFileSync(require("node:path").join(__dirname,"endorsement-bridge.js"),"utf8");
 assert.doesNotMatch(src,/localStorage\.getItem/);
 assert.doesNotMatch(src,/helilog_v2_dev_workspace/);
});
