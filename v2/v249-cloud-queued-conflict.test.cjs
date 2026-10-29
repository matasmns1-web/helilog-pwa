'use strict';
// V2.49: the user's iPad can safely compare a newer siteLocations edit
// against both a stale unsent queue and the authenticated cloud record.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const sync=read('cloud-sync.js'),view=read('cloud-view.js'),guide=read('source/app/13-help-guide.js');
test('three-way compare renders current device, earlier queued and cloud choices',()=>{
 assert.match(view,/p\.queueDiverged/);
 assert.match(view,/Current cloud/);
 assert.match(view,/Earlier unsent device copy/);
 assert.match(view,/Keep current device copy/);
 assert.match(view,/Use earlier unsent copy/);
 assert.match(view,/Use current cloud copy/);
 assert.match(view,/v27ResolveRecordConflict\(\\'queued\\'\)/);
});
test('three-way review performs no silent rebase and checks all versions before resolution',()=>{
 assert.match(sync,/queueDiverged=action==="put"/);
 assert.match(sync,/queued:queueDiverged\?clone\(q\.payload\):null/);
 assert.match(sync,/queueHash:canonical\(q\.payload\)/);
 assert.match(sync,/canonical\(q\.payload\)!==reviewed\.queueHash/);
 assert.match(sync,/const backup=JSON\.stringify\(/);
 assert.match(sync,/root\.localStorage\.getItem\(backupKey\)!==backup/);
 assert.match(sync,/q\.baseRevision=row\?Number\(row\.revision\):null/);
 assert.match(sync,/q\.generation=\(q\.generation\|\|0\)\+1/);
 assert.match(sync,/if\(choice==="cloud"\|\|choice==="queued"\)/);
 assert.match(sync,/isProtectedRecord\(reviewed\.kind,reviewed\.id\)/);
 assert.match(guide,/three-way cloud conflicts safely/);
});
test('new release uses separate test cache; production remains gated',()=>{
 assert.match(read('service-worker.js'),/helilog-v2-49-cloud-conflict-review-1/);
 assert.match(read('source/index.template.html'),/HeliLog V2\.49 — Cloud Conflict Review/);
 assert.match(read('auth-gate.js'),/HELILOG_TEST_VERSION='V2\.49'/);
 assert.doesNotMatch(sync,/localStorage\.clear\(\)/);
});
