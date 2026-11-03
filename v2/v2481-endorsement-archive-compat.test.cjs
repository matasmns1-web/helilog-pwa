'use strict';
/* Reproduce a legacy signed endorsement archive that becomes unreadable when
   modern display metadata is rebuilt instead of preserving frozen snapshots. */
const test=require('node:test');
const assert=require('node:assert/strict');
const B=require('./endorsement-bridge.js');
const P=require('./print.js');
const SIG='data:image/png;base64,aGVsbG8=';
const T1='2026-10-20T10:00:00.000Z',T2='2026-10-20T11:00:00.000Z';
function fixture(){
 return {
  people:[{id:'instructor',name:'DEMO INSTRUCTOR',licence:'FI(H)',licenceNumber:'FI-LIC-001',fiFeNumber:'FI-NUM-002'}],
  qualifications:[{id:'qold',name:'EC35',number:'LT-EC35-01'}],
  endorsements:[
   {id:'old-1',date:'2026-10-20',category:'Proficiency check / revalidation',
    title:'First signed check',text:'Original wording',location:'Vilnius',
    qualificationId:'qold',signatoryPersonId:'instructor',signatureData:SIG,
    signedName:'DEMO INSTRUCTOR',signedLicence:'FI(H)',signedAt:T1},
   {id:'old-2',date:'2026-10-21',category:'Proficiency check / revalidation',
    title:'Second signed check',text:'Other original wording',location:'',
    qualificationId:'qold',signatoryPersonId:'instructor',signatureData:SIG,
    signedName:'DEMO INSTRUCTOR',signedLicence:'FI(H)',signedAt:T1},
   {id:'new',date:'2026-10-29',category:'Training completion',
    title:'New endorsement',text:'New wording',location:'Vilnius',
    qualificationId:'qold',signatoryPersonId:'instructor',signatureData:SIG,
    signedName:'DEMO INSTRUCTOR',signedLicence:'FI(H)',signedAt:T1}
  ]
 };
}
function addLegacyArchives(db){
 const first=B.draft(db,['old-1','old-2'],'END-OLD',T1);
 first.layout='endorsement-sheet-v1';
 // Historical data can include printable metadata fields and explicit blanks
 // that the modern adapter must not drop or re-order.
 for(const item of first.items){
  delete item.snapshot.qualificationPrintName;
  delete item.snapshot.qualificationPrintNumber;
  delete item.snapshot.signature.licenceNumber;
  delete item.snapshot.signature.fiFeNumber;
  item.snapshot.signature.licenceNumber='';
  item.snapshot.signature.fiFeNumber='';
  item.snapshot.legacyDisplayMarker='original paper page';
 }
 db.endorsementV2Archive={batches:[{...first,confirmedAt:T2}],amendments:[]};
 return db.endorsementV2Archive.batches[0];
}
test('previously signed archive with empty/legacy print keys does not block a new preview',()=>{
 const db=fixture(),archive=addLegacyArchives(db);
 const originalArchive=JSON.stringify(db.endorsementV2Archive);
 const originalPrint=P.renderEndorsementBatch(archive);
 assert.doesNotThrow(()=>B.workspace(db));
 const next=B.draft(db,['new'],'END-NEXT','2026-10-29T12:00:00.000Z');
 assert.equal(next.firstPage,2);
 assert.equal(next.layout,'endorsement-sheet-v2');
 assert.match(B.printBatch(next),/New endorsement/);
 assert.equal(JSON.stringify(db.endorsementV2Archive),originalArchive);
 assert.equal(P.renderEndorsementBatch(archive),originalPrint);
});
test('confirmation and subsequent reprint preserve old snapshots byte-for-byte',()=>{
 const db=fixture(),legacy=addLegacyArchives(db);
 const before=JSON.stringify(legacy);
 const next=B.draft(db,['new'],'END-NEXT','2026-10-29T12:00:00.000Z');
 const newPrint=B.printBatch(next);
 db.endorsementV2Archive=B.confirm(db,next,'2026-10-29T12:05:00.000Z');
 assert.equal(JSON.stringify(db.endorsementV2Archive.batches[0]),before);
 assert.equal(B.printBatch(db.endorsementV2Archive.batches[1]),newPrint);
 assert.equal(B.workspace(db).archives.endorsements.length,2);
});
test('changes to a pilot profile or related qualification never rewrite old archived originals',()=>{
 const db=fixture();const previous=addLegacyArchives(db);
 const originalPrint=B.printBatch(previous);
 db.people[0].licenceNumber='NEW-LICENCE';
 db.people[0].fiFeNumber='NEW-FI';
 db.qualifications[0].name='AS350';
 db.qualifications[0].number='CHANGED';
 assert.doesNotThrow(()=>B.workspace(db));
 assert.equal(B.printBatch(previous),originalPrint);
});
test('tampering with signed wording, date, signature or captured identifiers remains blocked',()=>{
 const changes=[
  f=>f.title='Tampered title',
  f=>f.text='Tampered text',
  f=>f.date='2026-10-22',
  f=>f.signatureData='data:image/png;base64,Tk9US0VZ',
  f=>f.signedLicence='Another credential',
  f=>f.signedLicenceNumber='CHANGED'
 ];
 for(const change of changes){
  const db=fixture();addLegacyArchives(db);change(db.endorsements[0]);
  assert.throws(()=>B.workspace(db),/Archive|Archived endorsement|integrity error/i);
 }
});
test('legacy originals without any printable metadata remain valid',()=>{
 const db=fixture();addLegacyArchives(db);
 for(const item of db.endorsementV2Archive.batches[0].items){
  delete item.snapshot.legacyDisplayMarker;
  delete item.snapshot.signature.licenceNumber;
  delete item.snapshot.signature.fiFeNumber;
 }
 assert.doesNotThrow(()=>B.workspace(db));
 assert.equal(B.draft(db,['new'],'END-SECOND','2026-10-29T12:00:00.000Z').firstPage,2);
});
