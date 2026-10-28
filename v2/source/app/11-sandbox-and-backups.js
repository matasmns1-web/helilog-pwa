function freshLogbookData(from,forTest=false){
  const pilotName=forTest?'HeliLog Test Pilot':String(from?.pilot?.name||'Pilot').trim()||'Pilot';
  const authority=forTest?'TEST ONLY':String(from?.pilot?.authority||'');
  return {
    cleanStart:true,
    pilot:{name:pilotName,licence:'',licenceType:'',licenceNumber:'',authority,
      medical:{class:'',number:'',issueDate:'',validUntil:'',notes:''}},
    people:[{id:'p_owner',name:pilotName,isAccountHolder:true,role:'Account holder',licence:'',notes:''}],
    aircraft:[],flights:[],qualifications:[],endorsements:[],siteLocations:[],
    broughtForward:{},broughtForwardByType:[],broughtForwardImported:false,broughtForwardImportedAt:'',
    printArchive:{firstPage:1,paperReference:forTest?'TEST ONLY — not a real paper logbook':'',batches:[],corrections:[]}
  };
}
function makeSandboxData(){
  const data=freshLogbookData(null,true);
  data.aircraft=JSON.parse(JSON.stringify(seed.aircraft));
  data.people.push({id:'test_instructor',name:'Training Instructor (TEST)',role:'Instructor',licence:'TEST ONLY',notes:'Fictional'});
  data.people.push({id:'test_captain',name:'Test Captain',role:'Pilot',licence:'TEST ONLY',notes:'Fictional'});
  const routes=['EYVI','EYKA','EYPA','EYSA','EYPN','EYMO','EYKL'];
  const roles=['PIC','PIC','SOLO','DUAL','PICUS','CO-PILOT','SPIC'];
  for(let i=0;i<48;i++){
    const day=new Date(Date.UTC(2026,5,8+i*2)).toISOString().slice(0,10);
    if(i===13||i===34){
      const simCategory=i===13?'FNPT II':'FFS';
      const simDevice=i===13?'':'H135';
      data.flights.push({
        id:'sandbox_sim_'+String(i+1).padStart(2,'0'),
        entryType:'simulator',date:day,simCategory,simDevice,simQualification:'TEST-'+(i+1),
        stdType:[simCategory,simDevice,'(TEST-'+(i+1)+')'].filter(Boolean).join(' '),
        stdMin:i===13?135:250,mins:0,aid:'',dep:'',off:'',arr:'',on:'',role:'',picName:'',
        takeoffDay:0,takeoffNight:0,landingDay:0,landingNight:0,nightMin:0,ifrMin:0,
        crossCountry:false,specialOps:{},remarks:'TEST DATA ONLY — fictional simulator proficiency session'
      });
      continue;
    }
    const role=roles[i%roles.length],night=i%11===0;
    const minutes=45+(i%9)*10;
    const starting=night?19*60+(i%3)*20:8*60+(i%8)*35;
    const clock=t=>String(Math.floor(t/60)%24).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
    const aid=['a1','a2','a3','a_ec135_demo'][i%4];
    const dep=routes[i%routes.length],arr=i%4===0?dep:routes[(i+2)%routes.length];
    const nightMinutes=night?minutes:0;
    const specialOps=i%9===0?{VRLL:Math.min(minutes,35),HESLO2:Math.min(minutes,35)}:
      night?{NVIS:Math.min(minutes,40)}:
      i%14===0?{HEC:Math.min(minutes,25)}:{};
    const instructor=role==='DUAL'?Math.min(40,minutes):0;
    data.flights.push({
      id:'sandbox_flight_'+String(i+1).padStart(2,'0'),
      date:day,aid,dep,arr,off:clock(starting),on:clock(starting+minutes),
      mins:minutes,role,
      picName:['PIC','SOLO'].includes(role)?'SELF':'Training Instructor (TEST)',
      picPersonId:['PIC','SOLO'].includes(role)?'p_owner':'test_instructor',
      pilotConfig:aid==='a_ec135_demo'&&i%3===0?'multi':'single',
      nightMin:nightMinutes,ifrMin:i%7===0?Math.min(minutes,30):0,
      takeoffDay:night?0:i%5===0?2:1,takeoffNight:night?2:0,
      landingDay:night?0:i%5===0?2:1,landingNight:night?2:0,
      crossCountry:dep!==arr,instrMin:instructor,instructorSelected:instructor>0,
      stdType:'',stdMin:0,specialOps,
      remarks:'TEST DATA ONLY — fabricated flight #'+String(i+1)
    });
  }
  return data;
}
// Write a new environment atomically without changing the other environment.
// On failed persistence, the previous saved bytes are restored where possible.
function verifiedEnvironmentWrite(key,data){
  const old=localStorage.getItem(key);
  const serialized=JSON.stringify(data);
  try{
    localStorage.setItem(key,serialized);
    if(localStorage.getItem(key)!==serialized)throw new Error('Stored bytes could not be verified.');
  }catch(e){
    try{if(old===null)localStorage.removeItem(key);else localStorage.setItem(key,old);}catch(x){}
    throw e;
  }
}
function enterTestMode(){
  if(v23AccountWorkspace()){alert('Legacy Test Mode is unavailable inside a signed-in cloud workspace.');return;}
  if(TEST_MODE)return;
  try{
    const existing=localStorage.getItem(SANDBOX_KEY);
    if(existing===null)verifiedEnvironmentWrite(SANDBOX_KEY,makeSandboxData());
    else{
      const data=JSON.parse(existing);
      if(!data||!data.pilot||!Array.isArray(data.flights)||!Array.isArray(data.aircraft))
        throw new Error('An existing test sandbox cannot be read. Do not overwrite it; use a safety backup.');
    }
    localStorage.setItem(MODE_KEY,'test');
    window.location.reload();
  }catch(e){alert('Could not enter Test Mode. Main logbook is unchanged. '+String(e.message||e));}
}
function exitTestMode(){
  if(!TEST_MODE)return;
  try{
    localStorage.removeItem(MODE_KEY);
    if(localStorage.getItem(MODE_KEY)==='test')throw new Error('Mode flag did not clear.');
    window.location.reload();
  }catch(e){alert('Could not leave Test Mode: '+String(e.message||e));}
}
function resetSandbox(withSamples){
  if(!TEST_MODE||KEY!==SANDBOX_KEY)return;
  const action=withSamples?'REBUILD with 48 fictional entries':'CLEAR to an empty sandbox';
  if(!confirm('This will '+action+' and permanently replace only the TEST sandbox records, including all confirmed TEST print archive batches.\n\nYour MAIN logbook is NOT affected. Continue?'))return;
  try{
    const data=withSamples?makeSandboxData():freshLogbookData(null,true);
    verifiedEnvironmentWrite(SANDBOX_KEY,data);
    window.location.reload();
  }catch(e){alert('Could not reset sandbox. Existing data was retained if storage rollback succeeded. '+String(e.message||e));}
}
let cleanStartBackupFingerprint=null;
async function prepareLiveCleanStart(){
  if(v23AccountWorkspace()){alert('Clean-start reset is disabled in an authenticated cloud workspace.');return;}
  if(TEST_MODE)return;
  try{
    const before=JSON.stringify(S);
    const backup=await makeFullBackup();
    if(JSON.stringify(S)!==before)throw new Error('Logbook changed while preparing the safety backup. Try again.');
    offerBackupFile(backup,'HeliLog_MAIN_SAFETY_Before_Clean_Start');
    cleanStartBackupFingerprint=before;
    const button=document.getElementById('confirmLiveCleanStart');
    if(button)button.disabled=false;
    const status=document.getElementById('cleanStartStatus');
    if(status)status.innerHTML='<div class="note"><b>Safety backup download requested.</b> Open the downloaded JSON and verify it was saved before continuing. The next step replaces the MAIN logbook only after two further confirmations.</div>';
  }catch(e){
    cleanStartBackupFingerprint=null;
    alert('Could not prepare a safety backup. Clean start is blocked. '+String(e.message||e));
  }
}
function confirmLiveCleanStart(){
  if(v23AccountWorkspace()){alert('Clean-start reset is disabled in an authenticated cloud workspace.');return;}
  if(TEST_MODE || KEY!==LIVE_KEY || !cleanStartBackupFingerprint)return;
  if(JSON.stringify(S)!==cleanStartBackupFingerprint){
    cleanStartBackupFingerprint=null;
    alert('The main logbook changed after the safety backup. Download a new backup before resetting.');return;
  }
  const words=prompt('DANGER: This will erase MAIN flight records, aircraft, qualifications, previous totals, endorsements and signed print archive history in THIS browser.\n\nVerify your safety backup is saved and readable.\n\nType RESET LIVE LOGBOOK to continue:');
  if(words!=='RESET LIVE LOGBOOK')return;
  if(!confirm('Final confirmation: replace the MAIN logbook with a new empty logbook?\n\nOnly your pilot name and authority will be retained. Test sandbox data stays separate.'))return;
  if(JSON.stringify(S)!==cleanStartBackupFingerprint){
    cleanStartBackupFingerprint=null;
    alert('Data changed while confirming. Reset cancelled.');return;
  }
  try{
    const empty=freshLogbookData(S,false);
    verifiedEnvironmentWrite(LIVE_KEY,empty);
    cleanStartBackupFingerprint=null;
    window.location.reload();
  }catch(e){alert('MAIN reset FAILED: previous data was not intentionally changed. Keep your backup. '+String(e.message||e));}
}
function testmode(){
  const sandboxPresent=localStorage.getItem(SANDBOX_KEY)!==null;
  const batches=S.printArchive?.batches?.length||0;
  app.innerHTML=header('Test Mode & safe reset',
    'A separate browser-local sandbox for experimenting with flight logging and paper archives.',
    `<button class="btn" onclick="go('dashboard')">← Dashboard</button>`)+
    `<div class="note" style="margin-bottom:16px"><b>Legacy sandbox records:</b> Earlier local test entries remain separate from this sandbox. Review them in the <a href="./alpha.html" target="_blank" rel="noopener noreferrer">previous Alpha workspace</a> on this device. These test records are not merged automatically; save a separate backup if you need them.</div>`+
    `<div class="card">
      <div class="head"><h2>Current environment: ${TEST_MODE?'⚗ TEST SANDBOX':'MAIN LOGBOOK'}</h2></div>
      <p>${TEST_MODE?
        'You are using a separately stored fictional logbook. All entries, imports, totals, archive previews, confirmations and restores on this screen belong to the sandbox only.':
        'Your current flights and print archives remain in the main browser logbook. Entering Test Mode switches to a separate stored dataset without copying or altering them.'}</p>
      <div class="grid stats">
        <div class="card"><div class="label">Entries here</div><div class="big">${S.flights.length}</div></div>
        <div class="card"><div class="label">Simulator sessions</div><div class="big">${S.flights.filter(isSimulatorSession).length}</div></div>
        <div class="card"><div class="label">Confirmed print batches</div><div class="big">${batches}</div></div>
      </div>
      <div class="actions">
        ${TEST_MODE?
          '<button class="btn primary" type="button" onclick="exitTestMode()">Return to main logbook</button>':
          '<button class="btn primary" type="button" onclick="enterTestMode()">⚗ Enter Test Mode</button>'}
      </div>
      <div class="mini">Each environment uses a different localStorage key on this device. An installed PWA and a desktop browser may have independent storage. This is not cloud sync.</div>
    </div>
    ${TEST_MODE?`
    <div class="card" style="margin-top:16px">
      <div class="head"><h2>Manage sandbox records</h2></div>
      <p>The sample generator creates <b>48 fictional entries</b> (46 flights and 2 simulator sessions) across four A4 logbook pages, with varied ICAO types, PIC functions, night/IFR time, instructor time and specialised operations. The fourth page has 6 entries.</p>
      <div class="actions">
        <button class="btn primary" type="button" onclick="resetSandbox(true)">Rebuild 48 test entries</button>
        <button class="btn dangerbtn" type="button" onclick="resetSandbox(false)">Clear test sandbox</button>
        <button class="btn" type="button" onclick="go('printarchive')">Test print archive →</button>
      </div>
      <div class="note">Rebuild and Clear delete TEST archive history and test entries only. The main logbook is not accessible while Test Mode is active. Download a test backup first if you want to retain sandbox work.</div>
    </div>`:`
    <div class="card" style="margin-top:16px">
      <div class="head"><h2>Test sandbox</h2></div>
      <p>${sandboxPresent?'Existing sandbox saved. Enter Test Mode to resume previous test flights and archive history.':'No sandbox created yet. The first visit generates 48 fictional entries automatically.'}</p>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="head"><h2>Clean production start</h2></div>
      <p class="muted">Only use this when you are ready to replace all MAIN records in this browser. This removes flights, archived batches, imported paper totals, aircraft, endorsements and ratings, but retains your pilot name and competent authority.</p>
      <p class="mini">Nothing will be reset by downloading the safety copy. HeliLog will also require an exact typed phrase and a final confirmation. An existing test sandbox is not removed.</p>
      <div class="actions">
        <button class="btn" type="button" onclick="prepareLiveCleanStart()">1. Download mandatory MAIN backup</button>
        <button id="confirmLiveCleanStart" class="btn dangerbtn" type="button" onclick="confirmLiveCleanStart()" ${cleanStartBackupFingerprint?'':'disabled'}>2. Initialise empty MAIN logbook</button>
      </div>
      <div id="cleanStartStatus" class="mini"></div>
    </div>`}
    <div class="note" style="margin-top:16px">TEST DATA MUST NOT be used as a genuine pilot logbook. Sandbox archives are not official flying records, even when signed in a print preview.</div>`;
}

let v244Prepared=null,v244Busy=false,v244Notice='';

function v244ResetPanel(){
 const account=v23AccountWorkspace();
 const sync=account?window.HeliLogV23Sync.status():null;
 const ready=account&&sync.state==="synced"&&sync.pending===0&&sync.conflicts===0&&Number.isSafeInteger(sync.resetGeneration);
 const valid=ready&&v244Prepared?.owner===sync.owner&&v244Prepared?.generation===sync.resetGeneration&&v244Prepared?.snapshot===JSON.stringify(S);
 return '<p class="muted">Permanently erase this account’s flights, simulator sessions, aircraft, licences, people, endorsements, signatures, imported totals, signed archive history, correction addenda and cloud snapshots. Your sign-in account remains active. Independently downloaded backups cannot be erased remotely.</p>'+
  '<div class="note"><b>Important:</b> This also removes confirmed archive evidence. Keep the required flight records and a verified external backup before using this action. The action cannot be undone through HeliLog.</div>'+
  (!account?'<p class="mini">Sign in to a cloud account to manage account-wide deletion. The old local-only sandbox reset remains separate.</p>':
  '<p class="mini">Cloud status: <b>'+v23Escape(sync.state)+'</b>. Reset is disabled while offline, syncing, or reviewing conflicts.</p>'+
  '<button type="button" class="btn" onclick="v244PrepareReset()"'+(!ready||v244Busy?' disabled':'')+'>1. Download required safety backup</button>'+
  (valid?'<form class="form" onsubmit="v244ExecuteReset(event)" style="margin-top:15px">'+
  '<p class="note"><b>Safety backup requested.</b> Open the downloaded file, save it outside HeliLog and verify that it is readable before continuing.</p>'+
  '<div class="field"><label for="v244ResetPassword">Re-enter account password</label><input id="v244ResetPassword" type="password" autocomplete="current-password" required></div>'+
  '<div class="field"><label for="v244ResetPhrase">Type DELETE MY LOGBOOK</label><input id="v244ResetPhrase" type="text" autocomplete="off" required></div>'+
  '<label><input id="v244ResetBackupVerified" type="checkbox" required> I have saved and verified an independent copy, and understand that all account logbook data and cloud snapshots will be erased.</label>'+
  '<button type="submit" class="btn dangerbtn"'+(v244Busy?' disabled':'')+'>Permanently delete logbook data</button></form>':'')+
  (v244Notice?'<div role="status" class="note" style="margin-top:10px">'+v23Escape(v244Notice)+'</div>':''));
}

function v244FreshWorkspace(){
 const name=window.HeliLogCloud.snapshot().displayName||"Pilot";
 const empty=freshLogbookData({pilot:{name}},false);
 empty.cloudWorkspaceV23=true;
 empty.cloudResetV244=true;
 empty.endorsementV2Archive={firstPage:1,batches:[],amendments:[]};
 return empty;
}

async function v244PrepareReset(){
 if(v244Busy||!v23AccountWorkspace())return;
 v244Busy=true;v244Prepared=null;v244Notice="";
 try{
  if(window.navigator.onLine===false||typeof hasUnsavedFlightChanges==="function"&&hasUnsavedFlightChanges())
   throw Error("Connect to the internet and finish any open flight edit first.");
  await v23RefreshSync();
  const sync=window.HeliLogV23Sync.status(),owner=window.HeliLogCloud.snapshot().userId;
  if(sync.state!=="synced"||sync.owner!==owner||sync.pending||sync.conflicts||!Number.isSafeInteger(sync.resetGeneration))
   throw Error("Resolve all unsynchronized changes and verify the account before resetting.");
  const audit=await v28ReadAudit(false);
  if(!audit.ok)throw Error("Cloud archive integrity check did not pass. Preserve both copies and review the findings before deleting.");
  if(window.HeliLogV24Archive?.error?.())
   throw Error("Cloud archive refresh is not healthy. A complete backup cannot be verified.");
  const localArchiveBatches=(S.printArchive?.batches?.length||0)+(S.endorsementV2Archive?.batches?.length||0);
  const localSignedAddenda=(S.printArchive?.corrections||[]).filter(c=>c.confirmedAt).length+
   (S.endorsementV2Archive?.amendments||[]).length;
  if(localArchiveBatches!==audit.counts.batches||localSignedAddenda!==audit.counts.addenda)
   throw Error("This device has not loaded every signed cloud archive or correction. Sync and review the archive before making a deletion backup.");
  const before=JSON.stringify(S),file=await makeFullBackup();
  if(JSON.stringify(S)!==before||window.HeliLogCloud.snapshot().userId!==owner)
   throw Error("Your logbook or account changed during backup. Nothing was deleted.");
  offerBackupFile(file,"HeliLog_SAFETY_Before_Account_Reset");
  v244Prepared={owner,generation:sync.resetGeneration,snapshot:before};
  v244Notice="Backup download requested. Verify it was saved before continuing.";
 }catch(e){v244Notice="Reset preparation stopped: "+String(e.message||e);}
 finally{v244Busy=false;if(location.hash==="#settings")settings();}
}

async function v244ExecuteReset(event){
 event?.preventDefault?.();
 if(v244Busy||!v244Prepared||!v23AccountWorkspace())return;
 const field=document.getElementById("v244ResetPassword");
 let password=field?.value||"";
 if(field)field.value="";
 const phrase=document.getElementById("v244ResetPhrase")?.value||"";
 const acknowledged=!!document.getElementById("v244ResetBackupVerified")?.checked;
 if(phrase!=="DELETE MY LOGBOOK"||!acknowledged||!password){v244Notice="Enter your account password, the exact phrase and confirm your verified safety backup.";settings();return;}
 const owner=v244Prepared.owner,generation=v244Prepared.generation,before=v244Prepared.snapshot;
 if(!confirm("FINAL WARNING: Delete ALL logbook information, signed print archives, endorsements and cloud snapshots from this account? Your account login stays active. This operation cannot be undone."))return;
 v244Busy=true;v244Notice="";
 let serverReset=false;
 try{
  if(window.navigator.onLine===false||window.HeliLogCloud.snapshot().userId!==owner||JSON.stringify(S)!==before)
   throw Error("Your account, data or network changed. Start again with a new backup.");
  const sync=window.HeliLogV23Sync.status();
  if(sync.state!=="synced"||sync.pending||sync.conflicts||sync.resetGeneration!==generation)
   throw Error("Synchronization changed. A new backup and review are required.");
  const db=await window.HeliLogCloud.client();
  const email=window.HeliLogCloud.snapshot().email;
  const verified=await db.auth.signInWithPassword({email,password});
  password="";
  if(verified.error||verified.data?.user?.id!==owner)
   throw Error("Account password verification failed. Nothing was deleted.");
  if(!await window.HeliLogV23Sync.ensureGeneration()||
   window.HeliLogV23Sync.status().resetGeneration!==generation||
   JSON.stringify(S)!==before)throw Error("Account changed during password confirmation. No deletion was requested.");
  const outcome=await db.rpc("helilog_reset_logbook",{
   p_expected_generation:generation,p_confirmation:"DELETE MY LOGBOOK"
  });
  if(outcome.error)throw Error(outcome.error.message||"Cloud reset was rejected.");
  serverReset=true;
  const next=Number(outcome.data);
  window.HeliLogV24Archive.stop();
  window.HeliLogV23Sync.adoptGenerationAfterReset(next,v244FreshWorkspace());
  v244Prepared=null;
  window.location.reload();
 }catch(e){
  v244Prepared=null;
  v244Notice=(serverReset?
   "Cloud deletion SUCCEEDED but this device could not finish updating. Preserve your external backup and reload HeliLog so the reset protection can take effect. ":
   "Deletion did not complete. Your records should remain unchanged. ")+String(e.message||e);
 }finally{
  password="";v244Busy=false;
  if(location.hash==="#settings")settings();
 }
}

function v244ResetRequiredView(){
 const sync=window.HeliLogV23Sync.status();
 app.innerHTML='<div class="v23-auth-container"><div class="v23-auth-card">'+
  '<h2>Account logbook reset detected</h2>'+
  '<p>The account logbook was erased on another device. HeliLog has blocked all older cached records and pending uploads from being synchronized again.</p>'+
  '<p class="note">Records still on THIS device have not been deleted. Download a safety copy if you need to retain evidence of them. Accepting the new empty account will clear this device’s logbook cache and unsent changes.</p>'+
  '<p class="mini">Pending changes on this device: '+Number(sync.pending||0)+'.</p>'+
  '<button class="btn dangerbtn" type="button" onclick="v244AcknowledgeRemoteReset()"'+(v244Busy?' disabled':'')+'>Download backup and clear this device</button>'+
  (v244Notice?'<div class="note" role="alert">'+v23Escape(v244Notice)+'</div>':'')+
  '</div></div>';
}

async function v244AcknowledgeRemoteReset(){
 if(v244Busy||!v23AccountWorkspace()||window.HeliLogV23Sync.status().state!=="reset_required")return;
 v244Busy=true;v244Notice="";
 try{
  if(window.navigator.onLine===false)throw Error("Reconnect to check the latest cloud reset.");
  await window.HeliLogV23Sync.ensureGeneration();
  if(window.HeliLogV23Sync.status().state!=="reset_required")
   throw Error("The account state changed. Reload before proceeding.");
  const before=JSON.stringify(S),backup=await makeFullBackup();
  if(JSON.stringify(S)!==before)throw Error("Local data changed during backup.");
  offerBackupFile(backup,"HeliLog_STALE_DEVICE_Before_Clear");
  const words=prompt("Your local logbook was superseded by an account reset. Verify your downloaded backup is saved and readable. Type CLEAR THIS DEVICE to discard the old local records:");
  if(words!=="CLEAR THIS DEVICE")return;
  if(!confirm("Replace THIS device’s cached logbook and pending uploads with the reset account’s empty workspace?"))return;
  if(JSON.stringify(S)!==before)throw Error("This device changed after the backup. Start again.");
  window.HeliLogV24Archive.stop();
  window.HeliLogV23Sync.acceptRemoteReset(v244FreshWorkspace());
  window.location.reload();
 }catch(e){v244Notice="Local reset not acknowledged: "+String(e.message||e);}
 finally{v244Busy=false;if(window.HeliLogV23Sync.status().state==="reset_required")v244ResetRequiredView();}
}

function backupSummary(data){
  return {
    flights:Array.isArray(data?.flights)?data.flights.length:0,
    aircraft:Array.isArray(data?.aircraft)?data.aircraft.length:0,
    pilots:Array.isArray(data?.people)?data.people.length:0,
    qualifications:Array.isArray(data?.qualifications)?data.qualifications.length:0,
    endorsements:Array.isArray(data?.endorsements)?data.endorsements.length:0
  };
}


async function sha256Hex(text){
  if(!globalThis.crypto?.subtle)throw new Error('SHA-256 verification requires the secure hosted HeliLog website (HTTPS).');
  const raw=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',raw);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function makeFullBackup(){
  const data=JSON.parse(JSON.stringify(S));
  return {
    app:'HeliLog',
    format:'helilog-full-backup',
    backupSchema:2,
    appVersion:'2.19',
    exportedAt:new Date().toISOString(),
    environment:v23AccountWorkspace()?'cloud-test':TEST_MODE?'test':'production',
    integrity:{algorithm:'SHA-256',sha256:await sha256Hex(JSON.stringify(data))},
    data
  };
}
function offerBackupFile(backup,prefix='HeliLog_Backup'){
  const json=JSON.stringify(backup,null,2);
  const blob=new Blob([json],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const safeName=String(S.pilot?.name||'Pilot').trim()
    .replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'')||'Pilot';
  a.href=url;
  a.download=prefix+'_'+safeName+'_'+formatDate(new Date().toISOString().slice(0,10))+'.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function downloadFullBackup(){
  try{
    const backup=await makeFullBackup();
    offerBackupFile(backup);
    const info=backupSummary(S);
    const box=document.getElementById('backupRestoreStatus');
    if(box){
      box.innerHTML='<div class="successbox"><b>Backup prepared.</b> The JSON download contains a SHA-256 checksum and '+
        info.flights+' flights, '+info.aircraft+' aircraft and '+(S.printArchive?.batches?.length||0)+
        ' flight archive batches and '+(S.endorsementV2Archive?.batches?.length||0)+
        ' signed endorsement print batches. Verify the download is saved somewhere safe, preferably outside this device.</div>';
    }
  }catch(e){alert('Could not create a verified backup: '+String(e.message||e));}
}
function extractBackupData(parsed){
  if(!parsed || typeof parsed!=='object')throw new Error('The selected file does not contain valid HeliLog data.');
  if(parsed.format==='helilog-full-backup'){
    if(parsed.app!=='HeliLog')throw new Error('This backup is not identified as HeliLog.');
    if(!parsed.data || typeof parsed.data!=='object')throw new Error('The backup has no data section.');
    return parsed.data;
  }
  if(parsed.pilot && Array.isArray(parsed.flights) && Array.isArray(parsed.aircraft))return parsed;
  throw new Error('This is not a recognised HeliLog full-backup file.');
}
function validateRestoreData(data){
  const errors=[];
  if(!data || typeof data!=='object')return ['Missing HeliLog data object.'];
  if(!data.pilot || typeof data.pilot!=='object')errors.push('Pilot profile is missing.');
  if(!Array.isArray(data.flights))errors.push('Flights list is missing.');
  if(!Array.isArray(data.aircraft))errors.push('Aircraft list is missing.');
  if(errors.length)return errors;
  errors.push(...inspectHeliLogData(data).errors);
  if(data.endorsementV2Archive){
    try{v2ArchiveBridge.workspace(data);}
    catch(e){errors.push('Invalid signed endorsement archive: '+String(e.message||e));}
  }
  return errors;
}

let pendingRestoreCandidate=null;
let restoreSafetyDownloaded=false;

async function handleBackupRestoreFile(ev){
  if(v23AccountWorkspace()){
    alert('Restoring an entire logbook is disabled in signed-in cloud workspaces. Your existing test data is preserved separately.');return;
  }
  const file=ev.target.files?.[0];
  const box=document.getElementById('backupRestoreStatus');
  pendingRestoreCandidate=null;
  restoreSafetyDownloaded=false;
  if(!file)return;
  if(box)box.innerHTML='<div class="importsummary">Checking file structure and checksum…</div>';
  try{
    const parsed=JSON.parse(await file.text());
    const data=extractBackupData(parsed);
    if(parsed.environment && parsed.environment!==(TEST_MODE?'test':'production')){
      throw new Error('This is a '+parsed.environment+' backup. Switch to the matching Test/Main environment before restoring. No records were replaced.');
    }
    let verification='Legacy backup without a checksum — structure checked, but original file integrity cannot be verified.';
    if(parsed.format==='helilog-full-backup' && Number(parsed.backupSchema)>=2 && !parsed.integrity){
      throw new Error('A modern HeliLog backup is missing its required checksum.');
    }
    if(parsed.integrity){
      if(parsed.integrity.algorithm!=='SHA-256' || !/^[0-9a-f]{64}$/i.test(parsed.integrity.sha256||'')){
        throw new Error('The backup contains invalid SHA-256 checksum metadata.');
      }
      const actual=await sha256Hex(JSON.stringify(data));
      if(actual.toLowerCase()!==String(parsed.integrity.sha256).toLowerCase()){
        throw new Error('The backup checksum does not match. This file was altered or damaged and cannot be restored.');
      }
      verification='SHA-256 checksum verified successfully.';
    }
    const errors=validateRestoreData(data);
    if(errors.length){
      if(box)box.innerHTML='<div class="importerrors"><b>Restore blocked: '+errors.length+' record errors.</b><br>'+
        errors.slice(0,20).map(e=>'• '+htmlEscape(e)).join('<br>')+
        (errors.length>20?'<br>…and '+(errors.length-20)+' more.':'')+'</div>';
      return;
    }
    const info=backupSummary(data);
    const warnings=inspectHeliLogData(data).warnings;
    pendingRestoreCandidate=JSON.parse(JSON.stringify(data));
    if(box){
      box.innerHTML='<div class="importsummary"><b>Backup ready for restore.</b><br>'+
        htmlEscape(verification)+'<br>'+
        info.flights+' flights · '+info.aircraft+' aircraft · '+(data.printArchive?.batches?.length||0)+' print archive batches'+
        (warnings.length?'<br>'+warnings.length+' consistency warning(s). Review with Data integrity check after restoring.':'')+
        '</div><p class="muted">Step 1: download and retain a safety backup of your current HeliLog data. Step 2: restore the selected file. Nothing has been replaced yet.</p>'+
        '<div style="display:flex;flex-wrap:wrap;gap:9px">'+
        '<button class="btn primary" type="button" onclick="downloadPreRestoreSafetyBackup()">1. Download safety backup</button>'+
        '<button id="restoreCheckedBtn" class="btn" type="button" onclick="restoreCheckedBackup()" disabled>2. Restore selected backup</button></div>'+
        '<div id="restoreStepStatus" class="mini" style="margin-top:10px"></div>';
    }
  }catch(e){
    pendingRestoreCandidate=null;
    if(box)box.innerHTML='<div class="importerrors"><b>Restore rejected.</b><br>'+
      htmlEscape(e.message||String(e))+'</div>';
  }finally{
    ev.target.value='';
  }
}
async function downloadPreRestoreSafetyBackup(){
  if(!pendingRestoreCandidate)return;
  try{
    const copy=await makeFullBackup();
    offerBackupFile(copy,'HeliLog_SAFETY_Before_Restore');
    restoreSafetyDownloaded=true;
    const button=document.getElementById('restoreCheckedBtn');
    if(button)button.disabled=false;
    const status=document.getElementById('restoreStepStatus');
    if(status)status.textContent='Safety backup download requested. Confirm it is saved and readable before you continue.';
  }catch(e){alert('Could not prepare safety backup. Restore is blocked: '+String(e.message||e));}
}
function restoreCheckedBackup(){
  if(v23AccountWorkspace()){
    alert('Full backup restore is paused in cloud workspaces to prevent overwriting synced flights. Keep the file and use a reviewed import once cloud migration is ready.');return;
  }
  if(!pendingRestoreCandidate || !restoreSafetyDownloaded){
    alert('Download the safety backup before restoring.');return;
  }
  const newData=JSON.parse(JSON.stringify(pendingRestoreCandidate));
  const oldData=S,oldRaw=localStorage.getItem(KEY);
  const info=backupSummary(newData);
  if(!confirm('Restore the selected backup with '+info.flights+' flights and '+
     (newData.printArchive?.batches?.length||0)+' print batches?\n\n'+
     'This REPLACES all data in this browser. Check that your safety backup actually downloaded and is stored safely.'))return;

  try{
    S=newData;
    // Older versions migrate in-place. The original state and localStorage bytes
    // are retained for rollback if any migration or final persistence fails.
    ensureV116Data();
    ensureV121Data();
    ensureV130Data();
    ensureV131Data();
    ensureV136Data();
    ensureV137Data();
    const persisted=JSON.stringify(S);
    localStorage.setItem(KEY,persisted);
    if(localStorage.getItem(KEY)!==persisted)throw new Error('Saved data could not be verified.');
  }catch(err){
    S=oldData;
    try{
      if(oldRaw===null)localStorage.removeItem(KEY);
      else localStorage.setItem(KEY,oldRaw);
    }catch(rollbackErr){
      alert('CRITICAL: Restore failed and browser storage could not be rolled back. Keep your safety backup. '+rollbackErr);
    }
    alert('Restore failed. Existing in-memory data was retained. '+String(err.message||err));
    backups();
    return;
  }
  pendingRestoreCandidate=null;
  restoreSafetyDownloaded=false;
  backups();
  const box=document.getElementById('backupRestoreStatus');
  if(box)box.innerHTML='<div class="successbox"><b>Backup restored and saved successfully.</b> '+info.flights+
    ' flights and '+(S.printArchive?.batches?.length||0)+' print archive batches are now available. Keep the pre-restore safety backup.</div>';
}

