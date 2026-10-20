/* V2.20 — compact cloud sync status that keeps all sync warnings accessible. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const gate=read('auth-gate.js'),html=read('index.html'),css=read('dark-cockpit.css');
const source=gate.slice(gate.indexOf('function v23SyncInfo(){'),gate.indexOf('function v23LoginView(){'));
function bubble(state,extended=true){
 const root={HeliLogV23Sync:{status:()=>state,extended:()=>extended}};
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return new Function('window','v23Escape',source+';return v23SyncInfo;')(root,escape)();
}
test('synced displays a compact, tappable pill while explanatory text stays in a bubble',()=>{
 const out=bubble({state:'synced',pending:0});
 assert.match(out,/<details class="v220-sync-pop" data-tone="ok">/);
 assert.match(out,/<summary class="v220-sync-pill"/);
 assert.match(out,/v220-sync-label">Synced/);
 assert.match(out,/v220-sync-bubble"><b>Cloud synced<\/b>/);
 assert.match(out,/Print archive snapshots and signed corrections require separate confirmation/);
 assert.doesNotMatch(out,/class="note" role="status"/);
});
test('offline, pending, conflict and errors never present a false green synced badge',()=>{
 const pending=bubble({state:'synced',pending:3});
 assert.match(pending,/data-tone="warn"/);
 assert.match(pending,/v220-sync-label">3 pending/);
 const offline=bubble({state:'offline',pending:0});
 assert.match(offline,/data-tone="warn"/);
 assert.match(offline,/v220-sync-label">Offline/);
 const conflict=bubble({state:'conflict',pending:0});
 assert.match(conflict,/data-tone="problem"/);
 assert.match(conflict,/v220-sync-label">Conflict/);
 const error=bubble({state:'error',pending:0,error:'Bad <script>'});
 assert.match(error,/v220-sync-label">Sync issue/);
 assert.match(error,/Bad &lt;script&gt;/);
 assert.doesNotMatch(error,/Bad <script>/);
});
test('compact pill sits beside the heading and live updates keep its expanded state',()=>{
 assert.match(html,/class="v220-page-heading"/);
 assert.match(html,/id="v23SyncStatus" class="v23-syncbanner"/);
 assert.match(gate,/const wasOpen=!!el\.querySelector\('details\[open\]'\)/);
 assert.match(gate,/if\(wasOpen\)el\.querySelector\('details'\)\?\.setAttribute\('open',''\)/);
 assert.match(css,/\.v220-sync-bubble \{/);
 assert.match(css,/max-width:calc\(100vw - 28px\)/);
 assert.match(css,/@media \(max-width:850px\)/);
});
