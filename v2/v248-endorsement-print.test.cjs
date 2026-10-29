'use strict';
/* V2.48: readable endorsement printed credentials, versioned layout and immutable archive snapshots. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const B=require('./endorsement-bridge.js');
const P=require('./print.js');
const D=require('./domain.js');
const SIG='data:image/png;base64,aGVsbG8=';
const T='2026-10-29T08:00:00.000Z';
const T2='2026-10-29T09:00:00.000Z';
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
function fixture(){
 return {
  people:[{id:'trainer',name:'Demo Instructor',licence:'FI(H)',licenceNumber:'LT-54321',
   fiFeNumber:'FI(H)-0098'}],
  qualifications:[{id:'q17931904106813c42',category:'Type rating',name:'EC35',number:'TR-2026-007'}],
  endorsements:[{
   id:'e1793271465602jtma',date:'2026-10-29',category:'Proficiency check / revalidation',
   title:'EC35 proficiency check',text:'A signed test endorsement',
   location:'Vilnius',qualificationId:'q17931904106813c42',
   signatoryPersonId:'trainer',signatureData:SIG,signedName:'Demo Instructor',signedLicence:'FI(H)',
   signedAt:T
  }]
 };
}
test('new printed endorsements use name and number, not internal endorsement or qualification IDs',()=>{
 const db=fixture(), batch=B.draft(db,[db.endorsements[0].id],'END-009',T);
 assert.equal(batch.layout,'endorsement-sheet-v2');
 const html=B.printBatch(batch);
 assert.match(html,/ENTRY 1<\/div>/);
 assert.doesNotMatch(html,/e1793271465602jtma/);
 assert.doesNotMatch(html,/q17931904106813c42/);
 assert.match(html,/Related licence \/ rating:<\/b> EC35 · No. TR-2026-007/);
 assert.match(html,/Licence No\.:<\/b> LT-54321/);
 assert.match(html,/FI \/ FE No\.:<\/b> FI\(H\)-0098/);
 assert.match(html,/Demo Instructor/);
 assert.match(html,/Endorsement page 1/);
});
test('print preview and confirmed reprint stay identical even after qualification and person-profile edits',()=>{
 const db=fixture();
 const preview=B.draft(db,[db.endorsements[0].id],'END-010',T);
 const before=B.printBatch(preview);
 db.endorsementV2Archive=B.confirm(db,preview,T2);
 db.qualifications[0].name='UPDATED TYPE';
 db.qualifications[0].number='UPDATED-NUMBER';
 db.people[0].licenceNumber='NEW-LICENCE';
 db.people[0].fiFeNumber='NEW-FI';
 assert.doesNotThrow(()=>B.workspace(db));
 const after=B.printBatch(db.endorsementV2Archive.batches[0]);
 assert.equal(after,before);
 assert.match(after,/TR-2026-007/);
 assert.doesNotMatch(after,/UPDATED TYPE|NEW-LICENCE|NEW-FI/);
});
test('signed stored licence and FI/FE numbers override later profile changes',()=>{
 const db=fixture();
 db.endorsements[0].signedLicenceNumber='SIGNED-LIC-001';
 db.endorsements[0].signedFiFeNumber='SIGNED-FE-002';
 db.people[0].licenceNumber='NEW-LIC';
 db.people[0].fiFeNumber='NEW-FE';
 const html=B.printBatch(B.draft(db,[db.endorsements[0].id],'END-011',T));
 assert.match(html,/SIGNED-LIC-001/);
 assert.match(html,/SIGNED-FE-002/);
 assert.doesNotMatch(html,/NEW-LIC|NEW-FE/);
});
test('missing qualifications are omitted rather than exposing opaque ID strings',()=>{
 const db=fixture();db.qualifications=[];
 const html=B.printBatch(B.draft(db,[db.endorsements[0].id],'END-012',T));
 assert.doesNotMatch(html,/q17931904106813c42/);
 assert.doesNotMatch(html,/Related licence \/ rating:/);
});
test('new print metadata is HTML escaped and never executed',()=>{
 const db=fixture();
 db.qualifications[0].name='<img onerror=alert(1)>';
 db.qualifications[0].number='<script>bad</script>';
 db.people[0].licenceNumber='<lic&no>';
 const html=B.printBatch(B.draft(db,[db.endorsements[0].id],'END-013',T));
 assert.match(html,/&lt;img onerror=alert\(1\)&gt;/);
 assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
 assert.match(html,/&lt;lic&amp;no&gt;/);
 assert.doesNotMatch(html,/<script>bad<\/script>|<img onerror/);
});
test('legacy v1 archived pages retain original internal references on exact reprint',()=>{
 const db=fixture();
 const old=B.draft(db,[db.endorsements[0].id],'END-014',T);
 old.layout='endorsement-sheet-v1';
 delete old.items[0].snapshot.qualificationPrintName;
 delete old.items[0].snapshot.qualificationPrintNumber;
 delete old.items[0].snapshot.signature.licenceNumber;
 delete old.items[0].snapshot.signature.fiFeNumber;
 const oldHTML=P.renderEndorsementBatch(old);
 assert.match(oldHTML,/ENTRY 1 &nbsp;·&nbsp; e1793271465602jtma/);
 assert.match(oldHTML,/Related licence\/rating:<\/b> q17931904106813c42/);
 db.endorsementV2Archive={batches:[{...old,confirmedAt:T2}],amendments:[]};
 assert.doesNotThrow(()=>B.workspace(db));
 db.qualifications[0].name='Changed after signing';
 db.people[0].fiFeNumber='FE-CHANGED';
 assert.equal(B.printBatch(db.endorsementV2Archive.batches[0]),oldHTML);
});
test('pilot profile includes separate number fields and signed snapshot stores them without future mutation',()=>{
 const src=read('source/app/07-aircraft-and-people.js');
 assert.match(src,/id="personLicenceNumber"/);
 assert.match(src,/id="personFiFeNumber"/);
 assert.match(src,/p\.licenceNumber=licenceNumber/);
 assert.match(src,/p\.fiFeNumber=fiFeNumber/);
 const start=src.indexOf('function v227WriteEndorsementSignature(');
 const end=src.indexOf('function v227UseSavedSignature(',start);
 assert.ok(start>0 && end>start);
 const ctx=vm.createContext({
  v2ArchiveBridge:{isArchived:()=>false},
  S:{},v227IsPNG:()=>true,
  save:()=>true
 });
 vm.runInContext(src.slice(start,end),ctx);
 const person={id:'teacher',name:'Instructor',licence:'FI(H)',licenceNumber:'L-123',fiFeNumber:'FI-123'};
 const e={id:'test',signatoryPersonId:'teacher',signatureData:''};
 assert.equal(ctx.v227WriteEndorsementSignature(e,person,SIG,'drawn'),true);
 assert.equal(e.signedLicenceNumber,'L-123');
 assert.equal(e.signedFiFeNumber,'FI-123');
 person.licenceNumber='CHANGED';
 assert.equal(e.signedLicenceNumber,'L-123');
});
test('older endorsements and unnumbered profiles remain printable',()=>{
 const db=fixture();
 db.people[0].licenceNumber='';
 db.people[0].fiFeNumber='';
 const html=B.printBatch(B.draft(db,[db.endorsements[0].id],'END-015',T));
 assert.doesNotMatch(html,/Licence No\.:|FI \/ FE No\.:/);
 assert.match(html,/Qualification \/ ID: FI\(H\)/);
 assert.equal(typeof D.ENDORSEMENTS_PER_PAGE,'number');
});
