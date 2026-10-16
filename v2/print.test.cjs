/* Run: node --test v2/print.test.cjs */
const test=require("node:test");
const assert=require("node:assert/strict");
const D=require("./domain.js");
const P=require("./print.js");
const AT="2026-10-14T10:00:00.000Z";
const SIGNATURE="data:image/png;base64,aGVsbG8=";
function sample(){
 let s=D.newState("dev",AT);
 s=D.addPerson(s,{id:"p1",name:"Examiner & Co",licence:"EX-007"},AT);
 s=D.createEndorsement(s,{id:"e1",date:"2026-10-14",category:"Proficiency check",title:"R44 <test> & rating",
  text:"Test wording that must not be dropped or interpreted as <script>alert(1)</script>.",
  signatoryPersonId:"p1"},AT);
 s=D.signEndorsement(s,"e1",SIGNATURE,AT);
 return {state:s,batch:D.prepareEndorsementPrint(s,["e1"],"END-001",AT)};
}
test("A4 printable endorsement page escapes untrusted wording",()=>{
 const {batch}=sample();
 const html=P.renderEndorsementBatch(batch);
 assert.match(html,/@page\{size:A4 portrait/);
 assert.match(html,/PILOT MEMORANDA \/ ENDORSEMENTS/);
 assert.match(html,/Endorsement page 1/);
 assert.match(html,/R44 &lt;test&gt; &amp; rating/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/Examiner &amp; Co/);
 assert.match(html,/data:image\/png;base64,aGVsbG8=/);
 assert.match(html,/— UNUSED —/);
});
test("printable archived page is byte-identical before/after confirmation",()=>{
 const {state,batch}=sample();
 const preview=P.renderEndorsementBatch(batch);
 const confirmed=D.confirmEndorsementPrint(state,batch,"2026-10-14T11:00:00.000Z");
 const reprint=P.renderEndorsementBatch(confirmed.archives.endorsements[0]);
 assert.equal(reprint,preview);
});
test("amendment print clearly includes original and revised wording and reason",()=>{
 const {state,batch}=sample();
 const archived=D.confirmEndorsementPrint(state,batch,"2026-10-14T11:00:00.000Z");
 const proposal=D.prepareEndorsementAmendment(archived,"e1",{text:"New checked wording"},"Corrected typo",
 "AM-001","2026-10-14T12:00:00.000Z");
 const signed=D.signEndorsementAmendment(archived,proposal,SIGNATURE,"2026-10-14T12:01:00.000Z");
 const html=P.renderAmendment(signed,{id:"END-001",page:1});
 assert.match(html,/ENDORSEMENT CORRECTION ADDENDUM/);
 assert.match(html,/Corrected typo/);
 assert.match(html,/Test wording that must not be dropped/);
 assert.match(html,/New checked wording/);
 assert.match(html,/END-001/);
 assert.match(html,/Amendment AM-001/);
});
test("renderer rejects invalid page counts and signatures in amendment previews",()=>{
 const {batch}=sample();
 assert.throws(()=>P.renderEndorsementBatch({...batch,pageCount:2}),/Page count inconsistent/);
 assert.throws(()=>P.renderAmendment({id:"AM-001"},{}),/signed amendment/);
});
test("HTML escaping covers angle brackets, quotes and ampersands",()=>{
 assert.equal(P.escapeHTML('<x "hi" & \'yo\'>'),'&lt;x &quot;hi&quot; &amp; &#39;yo&#39;&gt;');
});
