'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Help & Guide is discoverable on desktop and mobile',()=>{
 assert.match(read('v2/index.html'),/data-v="help"/);
 assert.match(read('v2/source/app/01-domain-and-navigation.js'),/Help &amp; User Guide/);
 assert.match(read('v2/source/app/13-routing-and-boot.js'),/help:helpGuide/);
});
test('Guide contains searchable task instructions and release notes',()=>{
 const s=read('v2/source/app/13-help-guide.js');
 for(const text of ['Quick Flight Entry','UTC and automatic night time','Export, PDF and Print Archive','Cloud sync and offline flights','Backups and recovery','V2.26','helpGuideSearch','helpGuideExpand'])assert.ok(s.includes(text),text);
 assert.match(s,/htmlEscape\(step\)/);
 assert.match(s,/data-help-topic/);
});
test('Guide is cached offline and does not alter the print engine',()=>{
 assert.match(read('v2/service-worker.js'),/helilog-v2-26-help-guide-1/);
 assert.match(read('v2/service-worker.js'),/guide\.css\?v=2\.26/);
 assert.match(read('v2/source/index.template.html'),/guide\.css\?v=2\.26/);
 assert.match(read('scripts/build-helilog-v2.cjs'),/13-help-guide\.js/);
});
