'use strict';
/* V2.55 TEST: Help topics should be as compact as What’s new, without hiding content or breaking search. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const source=read('source/app/13-help-guide.js');
function context(document){
 const sandbox={app:{innerHTML:''},header:()=>'',htmlEscape:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),document};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);return sandbox;
}
test('all 17 topics are individually collapsible compact rows, with Start here first',()=>{
 const ctx=context({}),html=(ctx.helpGuide(),ctx.app.innerHTML);
 assert.equal((html.match(/class="guide-topic-row" data-help-topic/g)||[]).length,17);
 assert.equal((html.match(/<details class="guide-topic">/g)||[]).length,17);
 assert.doesNotMatch(html,/<details class="guide-topic"[^>]*\sopen(?:\s|>)/);
 assert.match(html,/<span class="guide-topic-category">Start here<\/span>\s*<details class="guide-topic"><summary><b>First-time setup<\/b>/);
 const rows=[...html.matchAll(/<details class="guide-topic"><summary>(.*?)<\/summary>/g)];
 assert.equal(rows.length,17);
 assert.ok(rows.every(m=>!m[1].includes('guide-topic-body')));
 assert.ok(rows.every(m=>!m[1].includes('guide-topic-label')));
 assert.ok(rows.every(m=>!m[1].includes('muted')),'summaries are hidden until expanded');
 assert.match(html,/<div class="guide-topic-body"><p class="muted">Prepare your profile, aircraft and first entry\.<\/p>/);
 assert.equal((html.match(/class="guide-topic-body"/g)||[]).length,17);
 assert.match(html,/onclick="helpGuideExpand\(true\)"/);
 assert.match(html,/onclick="helpGuideExpand\(false\)"/);
});
test('search finds text inside collapsed topics without expanding every match',()=>{
 const nodes=[
  {textContent:'Start here First-time setup Complete profile',hidden:false,querySelector:()=>({open:false})},
  {textContent:'Flights UTC night time sunrise and sunset',hidden:false,querySelector:()=>({open:false})},
  {textContent:'Specialised operations offshore landings',hidden:false,querySelector:()=>({open:false})}
 ];
 const panels=nodes.map(n=>n.querySelector('details'));
 nodes.forEach((n,i)=>n.querySelector=()=>panels[i]);
 const input={value:'offshore'},message={textContent:''},empty={hidden:true};
 const doc={getElementById:id=>({helpSearch:input,helpSearchResults:message,helpNoResults:empty})[id]||null,
 querySelectorAll:selector=>selector==='[data-help-topic]'?nodes:[]};
 const ctx=context(doc);
 ctx.helpGuideSearch();
 assert.deepEqual(nodes.map(n=>n.hidden),[true,true,false]);
 assert.deepEqual(panels.map(p=>p.open),[false,false,false]);
 assert.equal(message.textContent,'1 topic found');
 ctx.helpGuideExpand(true);
 assert.deepEqual(panels.map(p=>p.open),[false,false,true]);
 ctx.helpGuideExpand(false);
 assert.deepEqual(panels.map(p=>p.open),[false,false,false]);
 input.value='nonexistent task';
 ctx.helpGuideSearch();
 assert.equal(empty.hidden,false);
 input.value='';
 ctx.helpGuideSearch();
 assert.deepEqual(nodes.map(n=>n.hidden),[false,false,false]);
 assert.deepEqual(panels.map(p=>p.open),[false,false,false]);
});
test('What’s new remains collapsible, topic rows use compact mobile styling',()=>{
 const ctx=context({}),html=(ctx.helpGuide(),ctx.app.innerHTML),css=read('guide.css');
 assert.match(html,/class="guide-update-details"/);
 assert.match(html,/class="guide-history"/);
 assert.match(css,/\.guide-topic-row\{display:flex/);
 assert.match(css,/\.guide-topic-category\{/);
 assert.match(css,/\.guide-topic-body\{/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(source,/V2\.53/);
});
test('Help, PWA assets and release labels are versioned together',()=>{
 const html=read('index.html'),template=read('source/index.template.html'),
 manifest=read('manifest.webmanifest'),worker=read('service-worker.js'),
 gate=read('auth-gate.js');
 assert.match(html,/HeliLog V2\.56 — HEMS and HAA Hours · Test/);
 assert.match(html,/V2\.56 · TEST ENVIRONMENT/);
 assert.match(gate,/HELILOG_TEST_VERSION='V2\.56'/);
 assert.match(manifest,/HeliLog V2\.56 — Page Pilot Signature Test/);
 assert.match(template,/guide\.css\?v=2\.53/);
 assert.match(worker,/guide\.css\?v=2\.53/);
 assert.match(worker,/helilog-v2-56-medical-ops-1/);
 assert.match(html,/class="guide-topic-row"/);
});
