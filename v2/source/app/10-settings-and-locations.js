function rememberProfileSection(which,node){
 if(!node?.isConnected)return;
 if(which==="medical"||which==="qualifications")profileExpanded[which]=node.open;
}
function profile(){
 editingQualificationId=null;
 const med=S.pilot.medical||{};
 const qualifications=[...(S.qualifications||[])].sort((a,b)=>{
  const order={'Licence':1,'Type rating':2,'Instrument rating':3,'Instructor rating':4,'Other':5};
  return (order[a.category]||99)-(order[b.category]||99)||a.name.localeCompare(b.name);
 });
 const names=pilotNameParts(),primary=qualifications.find(x=>x.isPrimary);
 app.innerHTML=header('Profile','Your pilot identity and qualifications',
  `<button class="btn" type="button" onclick="go('settings')">Settings</button>`)+
 `<div class="card profile-identity">
   <div class="head"><h2>Pilot details</h2><button type="button" class="btn" onclick="editOwnProfile()">Edit</button></div>
   <div class="profileline"><div class="k">Name</div><div><b>${htmlEscape([names.firstName,names.lastName].filter(Boolean).join(' ')||'—')}</b></div></div>
   <div class="profileline"><div class="k">Licence</div><div>${htmlEscape(S.pilot.licenceType||primary?.name||'—')}${S.pilot.licenceNumber?' · '+htmlEscape(S.pilot.licenceNumber):''}</div></div>
   <div class="profileline"><div class="k">Competent authority</div><div>${htmlEscape(S.pilot.authority||'—')}</div></div>
  </div>
  <details class="profile-accordion" id="medicalSection" ${profileExpanded.medical?'open':''} ontoggle="rememberProfileSection('medical',this)">
   <summary><span class="profile-accordion-heading"><b>Medical</b><span class="muted">${htmlEscape(med.class||'Not recorded')}${med.validUntil?' · Valid until '+displayDate(med.validUntil):''}</span></span><span class="profile-accordion-hint">Details <span aria-hidden="true">⌄</span></span></summary>
   <div class="profile-accordion-body">
    <div class="head"><h2>Certificate details</h2><button type="button" class="btn" onclick="editMedical()">Edit medical</button></div>
    <div class="profileline"><div class="k">Class</div><div>${htmlEscape(med.class||'—')}</div></div>
    <div class="profileline"><div class="k">Certificate / reference</div><div>${htmlEscape(med.number||'—')}</div></div>
    <div class="profileline"><div class="k">Issue date</div><div>${displayDate(med.issueDate)}</div></div>
    <div class="profileline"><div class="k">Valid until</div><div>${displayDate(med.validUntil)}</div></div>
    <div class="profileline"><div class="k">Notes</div><div>${htmlEscape(med.notes||'—')}</div></div>
    <div class="mini" style="margin-top:10px">Dates are records only. HeliLog does not determine medical validity.</div>
   </div>
  </details>
  <details class="profile-accordion" id="qualificationsSection" ${profileExpanded.qualifications?'open':''} ontoggle="rememberProfileSection('qualifications',this)">
   <summary><span class="profile-accordion-heading"><b>Licences &amp; Ratings</b><span class="muted">${qualifications.length} qualification${qualifications.length===1?'':'s'}${primary?' · '+htmlEscape(primary.name):''}</span></span><span class="profile-accordion-hint">Details <span aria-hidden="true">⌄</span></span></summary>
   <div class="profile-accordion-body">
    <div class="head"><h2>Qualifications</h2><button type="button" class="btn primary" onclick="qualificationForm()">＋ Add licence / rating</button></div>
    <div class="qual-list">
      ${qualifications.length?qualifications.map(q=>`
        <div class="qual-item">
          <div class="qual-top">
            <div>
              <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
                <b>${htmlEscape(q.name||'Unnamed qualification')}</b>
                <span class="badge gray">${htmlEscape(q.category||'Other')}</span>
                ${q.isPrimary?'<span class="badge">Primary licence</span>':''}
              </div>
              <div class="qual-meta">
                ${q.number?`<span><b>No.:</b> ${htmlEscape(q.number)}</span>`:''}
                <span><b>Issued:</b> ${displayDate(q.issueDate)}</span>
                <span><b>Valid until:</b> ${displayDate(q.validUntil)}</span>
              </div>
              ${q.notes?`<div class="muted" style="margin-top:7px">${htmlEscape(q.notes)}</div>`:''}
            </div>
            <div class="qual-actions">
              <button class="btn" type="button" onclick="qualificationForm('${q.id}')">Edit</button>
              <button class="btn dangerbtn" type="button" onclick="deleteQualification('${q.id}')">Delete</button>
            </div>
          </div>
        </div>`).join(''):`<div class="empty-state">No licences or ratings recorded yet.</div>`}
    </div>
   </div>
  </details>
  <div class="card profile-links">
   <div class="head"><h2>Account</h2></div>
   <div class="actions profile-action-row">
    <button class="btn" type="button" onclick="go('settings')">⚙ Settings</button>
    ${v23AccountWorkspace()?'<button class="btn" type="button" onclick="v23SignOut()">Log out</button>':''}
   </div>
  </div>`;
}
/* Account-owned locations: managed outside Add Flight. */
function v219LocationsPage(){
 const sites=[...v219Sites()].sort((a,b)=>a.code.localeCompare(b.code));
 app.innerHTML=header('Aerodromes & Helipads',
  'Automatic ICAO coordinates and custom helicopter operating sites',
  '<button class="btn" type="button" onclick="go(\'settings\')">← Settings</button>')+
 `<div class="card">
 <h2>ICAO airport coordinates</h2>
 <p class="muted">For known ICAO aerodromes, HeliLog finds coordinates automatically in Add Flight. Bundled airfields work offline; other ICAO airports are looked up online using the OpenFlights reference database.</p>
 <p class="mini">For an off-airport helicopter base or unknown airfield, save its WGS84 coordinates below. Give it a short code such as BASE-1 and use that in Add Flight. These locations sync with your private account.</p>
 <p class="mini">Reference data: <a href="https://openflights.org/data.php" target="_blank" rel="noopener noreferrer">OpenFlights (ODbL)</a>. Review all airport reference points against the relevant AIP; this is not approved navigation data.</p>
 </div>
 <div class="card" style="margin-top:12px">
 <h2>Add or edit a site</h2>
 <div class="formgrid">
 <div class="field"><label for="v219SiteCode">ICAO / custom site code</label><input id="v219SiteCode" maxlength="12" autocapitalize="characters" placeholder="ICAO code or custom site ID" oninput="uppercasePlaceInput(this)"></div>
 <div class="field"><label for="v219SiteName">Site name (optional)</label><input id="v219SiteName" maxlength="90" placeholder="Helicopter operating base"></div>
 <div class="field"><label for="v219SiteLat">Latitude (WGS84 decimal degrees)</label><input id="v219SiteLat" type="number" min="-90" max="90" step="any"></div>
 <div class="field"><label for="v219SiteLon">Longitude (WGS84 decimal degrees)</label><input id="v219SiteLon" type="number" min="-180" max="180" step="any"></div>
 </div>
 <div id="v219SiteStatus" class="mini" role="status" aria-live="polite" style="margin:10px 0">Look up an ICAO code or enter a helipad’s coordinates manually.</div>
 <div class="actions">
 <button class="btn" type="button" onclick="v219LookupSite()">Find ICAO coordinates</button>
 <button class="btn primary" type="button" onclick="v219SaveSite()">Save site</button>
 <button class="btn" type="button" onclick="v219ClearSite()">Clear</button>
 </div>
 </div>
 <div class="card" style="margin-top:12px">
 <h2>Saved locations (${sites.length})</h2>
 ${sites.length?sites.map(x=>`<div class="profileline" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
  <div><b>${htmlEscape(x.code)}</b> — ${htmlEscape(x.name||'Custom site')}
   <div class="mini">${Number(x.lat).toFixed(6)}, ${Number(x.lon).toFixed(6)} · WGS84</div></div>
  <div style="display:flex;gap:6px">
   <button class="btn" type="button" onclick="v219EditSite('${x.code}')">Edit</button>
   <button class="btn" type="button" onclick="v219DeleteSite('${x.code}')">Delete</button>
  </div></div>`).join(''):'<p class="muted">No custom sites yet. Known ICAO airports do not need to be saved here.</p>'}
 </div>`;
}
function v219Status(message){
 const el=document.getElementById('v219SiteStatus');
 if(el)el.textContent=String(message||'');
}
function v219ClearSite(){
 for(const id of ['v219SiteCode','v219SiteName','v219SiteLat','v219SiteLon']){
  const el=document.getElementById(id);if(el)el.value='';
 }
 v219Status('Ready to add a new site.');
}
function v219EditSite(code){
 const x=v219Sites().find(site=>site.code===code);
 if(!x)return;
 for(const [id,value] of Object.entries({v219SiteCode:x.code,
  v219SiteName:x.name||'',v219SiteLat:x.lat,v219SiteLon:x.lon})){
  const field=document.getElementById(id);if(field)field.value=value;
 }
 v219Status('Editing '+code+'. Changes here do not modify existing flights or archived pages.');
 document.getElementById('v219SiteCode')?.focus();
}
async function v219LookupSite(){
 const input=document.getElementById('v219SiteCode');
 const code=String(input?.value||'').trim().toUpperCase();
 if(!/^[A-Z]{4}$/.test(code)){
  v219Status('Automatic lookup needs a four-letter ICAO code. For a helipad, enter coordinates manually.');return;
 }
 v219Status('Finding '+code+' in the reference airport database…');
 const point=await window.HeliLogAerodromes.lookup(code);
 if(document.getElementById('v219SiteCode')!==input||input.value.trim().toUpperCase()!==code)return;
 if(!point){
  v219Status('Could not find '+code+'. Check your internet connection or enter coordinates manually.');return;
 }
 document.getElementById('v219SiteLat').value=point.lat;
 document.getElementById('v219SiteLon').value=point.lon;
 const name=document.getElementById('v219SiteName');
 if(name&&!name.value.trim())name.value=point.name||'';
 v219Status('Found '+code+' ('+point.source+'). Check the AIP coordinates before saving any override.');
}
function v219SaveSite(){
 const code=String(document.getElementById('v219SiteCode')?.value||'').trim().toUpperCase();
 const name=String(document.getElementById('v219SiteName')?.value||'').trim();
 const lat=document.getElementById('v219SiteLat')?.value||'';
 const lon=document.getElementById('v219SiteLon')?.value||'';
 if(!/^[A-Z0-9_-]{2,12}$/.test(code)){
  v219Status('Site code must contain 2–12 letters, digits, hyphens or underscores.');return;
 }
 if(!lat.trim()||!lon.trim()){
  v219Status('Both WGS84 latitude and longitude are required.');return;
 }
 const point=window.HeliLogNight.coordinates({lat,lon});
 if(!point){v219Status('Invalid latitude (−90…90) or longitude (−180…180).');return}
 const previous=v219Sites().map(x=>({...x}));
 const existing=previous.some(x=>x.code===code);
 S.siteLocations=[...previous.filter(x=>x.code!==code),
  {code,name:name||code,lat:point.lat,lon:point.lon}];
 if(!save()){S.siteLocations=previous;v219Status('Could not save this site. Previous locations remain unchanged.');return}
 v219LocationsPage();
 v219Status((existing?'Updated ':'Saved ')+code+'. This site is available in Add Flight and will sync to your account.');
}
function v219DeleteSite(code){
 if(!v219Sites().some(x=>x.code===code))return;
 if(!confirm('Remove '+code+' from saved locations? Earlier flights and signed archives remain unchanged.'))return;
 const previous=[...v219Sites()];
 S.siteLocations=previous.filter(x=>x.code!==code);
 if(!save()){S.siteLocations=previous;alert('Could not save. Earlier locations remain.');return;}
 v219LocationsPage();
 v219Status('Removed '+code+'. Existing flight records are unchanged.');
}

function settings(){
 app.innerHTML=header('Settings','Logbook, aerodromes, cloud account, backups and device preferences',
   `<button class="btn" type="button" onclick="go('profile')">← Profile</button>`)+
   `<div class="settings-grid">
     <div class="card">
      <div class="head">
       <div><h2>Aerodromes &amp; helipads</h2>
       <div class="muted">Automatic ICAO coordinates and saved custom helicopter operating sites, synced to your account.</div></div>
       <button class="btn primary" type="button" onclick="go('locations')">Manage locations</button>
      </div>
     </div>
     <div class="card">
      <div class="head"><div><h2>Cloud account</h2><div class="muted">Connection, synchronization, conflicts and archive integrity.</div></div>
      <button class="btn" type="button" onclick="go('cloud')">Manage cloud account</button>
     </div>
    </div>
     <div class="card">
      <div class="head"><div><h2>Backup &amp; recovery</h2><div class="muted">Encrypted exports, cloud snapshots and recovery verification.</div></div>
      <button class="btn" type="button" onclick="go('backups')">Manage backups</button>
     </div>
    </div>
  <div class="card">
    <div class="head">
      <div>
        <h2>Existing logbook import</h2>
        <div class="muted">Carry forward the cumulative totals from the paper logbook you used before HeliLog.</div>
      </div>
      ${S.broughtForwardImported
        ? '<button class="btn" type="button" onclick="editBroughtForwardTotals()">Correct imported totals</button>'
        : '<button class="btn primary" type="button" onclick="editBroughtForwardTotals()">Import previous logbook totals</button>'}
    </div>
    ${S.broughtForwardImported
      ? `<div class="successbox" style="margin-top:0"><b>Previous logbook totals imported ✓</b>${S.broughtForwardImportedAt?`<br><span style="font-weight:400">Imported ${htmlEscape(formatDateTime(S.broughtForwardImportedAt))}</span>`:''}</div>
         <div class="mini" style="margin-top:9px">These values are already included in your career totals. Use “Correct imported totals” only if the original figures were entered incorrectly.</div>`
      : '<div class="note">You only need this if you already have flight time in a previous paper or electronic logbook. It does not create historical flight entries.</div>'}
  </div>


  <div class="card">
    <div class="head">
      <div><h2>Data integrity check</h2>
      <div class="muted">Review duplicate flights, invalid values and continuity of confirmed print archives.</div></div>
      <button class="btn" type="button" onclick="showIntegrityCheck()">Run check</button>
    </div>
    <div id="integrityCheckResult" class="mini">No records will be changed by the check.</div>
  </div>

  <div class="card" id="settings-testmode-card">
    <div class="head">
      <div><h2>Test Mode &amp; safe reset</h2>
      <div class="muted">Use a separate test logbook without modifying your main flight records.</div></div>
      <button class="btn" type="button" onclick="go('testmode')">⚗ Manage Test Mode</button>
    </div>
    <div class="mini">Current environment: <b>${TEST_MODE?'TEST SANDBOX':'MAIN LOGBOOK'}</b>. This browser stores each environment separately.</div>
  </div>

  <div class="card settings-wide">
    <div class="head">
      <div>
        <h2>App &amp; device</h2>
        <div class="muted">Install HeliLog on a phone or tablet and check offline-app status.</div>
      </div>
      <button class="btn primary" type="button" onclick="installHeliLog()">Install HeliLog</button>
    </div>
    <div id="pwaStatus"></div>
    <div class="install-help" style="margin-top:10px">On iPhone/iPad, open the hosted HeliLog site in Safari, use <b>Share → Add to Home Screen</b>. Full offline PWA support requires HeliLog to be served over HTTPS. Opening this prototype directly as a file still works for testing, but it cannot register the offline service worker.</div>
  </div>


   </div>
   `;
 updatePWAStatus();
}
function backups(){
 app.innerHTML=header('Backup & Recovery','Cloud snapshots, secure exports and verified recovery',
   `<button class="btn" type="button" onclick="go('settings')">← Settings</button>`)+
   `${v29BackupPanel()}
  <div class="card" style="margin-top:16px">
    <div class="head">
      <div>
        <h2>Backup &amp; restore</h2>
        <div class="muted">Keep a complete copy of your HeliLog data outside this browser.</div>
      </div>
    </div>
    <div class="profilegrid">
      <div>
        <p><b>Full HeliLog backup</b></p>
        <p class="muted">Includes flights, aircraft, pilots, specialised-operation hours, imported totals, print archive snapshots, endorsements and signatures. JSON backups include a SHA-256 checksum.</p>
        <button class="btn primary" type="button" onclick="downloadFullBackup()">Download backup</button>
        ${v23AccountWorkspace()?'<button class="btn" style="margin-left:8px" type="button" onclick="v28DownloadCloudRecovery()">Download verified cloud recovery package</button>':''}
      </div>
      <div>
        <p><b>Verify a saved backup — read-only</b></p>
        <p class="muted">HeliLog uses different JSON backup formats. Select the checker that matches the file you downloaded. Inspection never restores or overwrites any logbook records.</p>
        ${v23AccountWorkspace()?`
          <details open class="card" style="padding:12px;margin:12px 0">
            <summary style="font-weight:700;cursor:pointer">Encrypted cloud snapshot (V2.9+)</summary>
            <p class="mini">Use for files downloaded with <b>Download encrypted backup</b>. The encrypted file and passphrase stay in your browser. This also works from the sign-in screen without cloud access.</p>
            <form class="form" onsubmit="v232VerifyOfflineFile(event)">
              <div class="field"><label for="v232OfflineFile">Encrypted snapshot JSON</label>
                <input id="v232OfflineFile" type="file" accept=".json,application/json" required></div>
              <div class="field"><label for="v232OfflinePass">Encryption passphrase</label>
                <input id="v232OfflinePass" type="password" autocomplete="off" minlength="12" required></div>
              <button class="btn primary" id="v232OfflineButton" type="submit">Verify encrypted backup offline</button>
            </form>
            <div id="v232OfflineResult" class="note" role="status" aria-live="polite" hidden></div>
          </details>
          <p><b>Verified cloud recovery package (V2.8)</b></p>
          <p class="mini">Use only for a file created with <b>Download verified cloud recovery package</b>. This format does not require an encryption passphrase; the exported JSON contains private records and signatures.</p>
          <input id="v28RecoveryInput" type="file" accept=".json,application/json" style="display:none" onchange="v28InspectCloudRecovery(event)">
          <button class="btn" type="button" onclick="document.getElementById('v28RecoveryInput').click()">Inspect V2.8 recovery package</button>
        `: `
          <p class="mini">Local workspace backups can be checked with the legacy local restore flow. This option is disabled for signed-in cloud accounts to protect synchronized history.</p>
          <input id="restoreBackupInput" type="file" accept=".json,application/json" style="display:none" onchange="handleBackupRestoreFile(event)">
          <button class="btn" type="button" onclick="document.getElementById('restoreBackupInput').click()">Choose local backup file</button>
        `}
      </div>
    </div>
    <div id="backupRestoreStatus" style="margin-top:12px"></div>
    ${v23AccountWorkspace()?'<div class="mini" style="margin-top:12px">Cloud recovery packages are SHA-256 verified and should be stored securely off-device. Downloads contain personal details and signatures. This version inspects files but intentionally does not overwrite synced cloud history.</div>'+ (v28Notice?'<div class="note" role="status" style="margin-top:8px">'+htmlEscape(v28Notice)+'</div>':''):''}
  </div>


   `;
}

