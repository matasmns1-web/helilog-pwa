function normalizeEngineConfig(v){
  let s=String(v||'').trim().toLowerCase();
  if(s==='me' || s.includes('multi')) return 'Multi engine';
  return 'Single engine';
}
function engineCode(a){
  return normalizeEngineConfig(a?.engine)==='Multi engine'?'ME':'SE';
}
function flightPilotConfig(f){
  if(f?.pilotConfig==='multi' || f?.pilotConfig==='single') return f.pilotConfig;
  return Number(f?.multiPilotMin||0)>0?'multi':'single';
}
function configurationTimes(f){
  let mins=Number(f?.mins||0);
  if(flightPilotConfig(f)==='multi') return {spSE:0,spME:0,multi:mins};
  let a=ac(f?.aid);
  return engineCode(a)==='ME'
    ? {spSE:0,spME:mins,multi:0}
    : {spSE:mins,spME:0,multi:0};
}
function ensureV116Data(){
  if(!Array.isArray(S.aircraft)) S.aircraft=[];
  if(!Array.isArray(S.flights)) S.flights=[];
  if(!Array.isArray(S.people)) S.people=[];

  S.aircraft.forEach(a=>a.engine=normalizeEngineConfig(a.engine));
  if(!S.cleanStart && !S.aircraft.some(a=>String(a.icao||'').toUpperCase()==='EC35')){
    S.aircraft.push({id:'a_ec135_demo',reg:'LY-EC1',manufacturer:'Airbus Helicopters',model:'EC135',variant:'',icao:'EC35',engine:'Multi engine'});
  }

  // Ensure the account holder also has a linked pilot profile.
  let owner=S.people.find(p=>String(p.name||'').trim().toLowerCase()===String(S.pilot.name||'').trim().toLowerCase());
  if(!owner){
    owner={id:'p_owner',name:S.pilot.name,role:'Account holder',licence:S.pilot.licence||'',notes:'',isAccountHolder:true};
    S.people.unshift(owner);
  }
  owner.isAccountHolder=true;
  owner.role=owner.role||'Account holder';
  owner.licence=owner.licence||S.pilot.licence||'';
  owner.notes=owner.notes||'';

  S.people.forEach((p,i)=>{
    if(!p.id) p.id='p'+Date.now()+i;
    p.name=String(p.name||'').trim();
    p.role=p.role||(p.isAccountHolder?'Account holder':'Pilot');
    p.licence=p.licence||'';
    p.notes=p.notes||'';
  });

  S.flights.forEach(f=>{
    if(!f.pilotConfig) f.pilotConfig=Number(f.multiPilotMin||0)>0?'multi':'single';
    if(!f.picPersonId && f.picName){
      let person=S.people.find(p=>p.name.toLowerCase()===String(f.picName).trim().toLowerCase());
      if(person) f.picPersonId=person.id;
    }
  });

  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
}
ensureV116Data();

function ensureV121Data(){
  if(!S.pilot || typeof S.pilot!=='object') S.pilot={};
  S.pilot.name=S.pilot.name||'';
  S.pilot.licenceType=S.pilot.licenceType||S.pilot.licence||'';
  S.pilot.licenceNumber=S.pilot.licenceNumber||'';
  S.pilot.authority=S.pilot.authority||'';
  // Keep the older field for compatibility with earlier HeliLog versions.
  S.pilot.licence=S.pilot.licenceType;

  if(!S.pilot.medical || typeof S.pilot.medical!=='object'){
    S.pilot.medical={class:'',number:'',issueDate:'',validUntil:'',notes:''};
  }else{
    S.pilot.medical.class=S.pilot.medical.class||'';
    S.pilot.medical.number=S.pilot.medical.number||'';
    S.pilot.medical.issueDate=S.pilot.medical.issueDate||'';
    S.pilot.medical.validUntil=S.pilot.medical.validUntil||'';
    S.pilot.medical.notes=S.pilot.medical.notes||'';
  }

  if(!Array.isArray(S.qualifications)){
    S.qualifications=[];
    if(S.pilot.licenceType){
      S.qualifications.push({
        id:'q_primary_licence',
        category:'Licence',
        name:S.pilot.licenceType,
        number:S.pilot.licenceNumber||'',
        issueDate:'',
        validUntil:'',
        notes:'Primary flight crew licence',
        isPrimary:true
      });
    }
    S.qualifications.push({
      id:'q_g2_demo',
      category:'Type rating',
      name:'Cabri G2',
      number:'',
      issueDate:'',
      validUntil:'',
      notes:'',
      isPrimary:false
    });
  }

  S.qualifications.forEach((q,i)=>{
    if(!q.id) q.id='q'+Date.now()+i;
    q.category=q.category||'Other';
    q.name=q.name||'';
    q.number=q.number||'';
    q.issueDate=q.issueDate||'';
    q.validUntil=q.validUntil||'';
    q.notes=q.notes||'';
    q.isPrimary=!!q.isPrimary;
  });

  let owner=ownerPerson();
  if(owner){
    owner.name=S.pilot.name;
    owner.licence=pilotLicenceDisplay();
  }

  if(!Array.isArray(S.endorsements)) S.endorsements=[];
  S.endorsements.forEach((e,i)=>{
    if(!e.id) e.id='e'+Date.now()+i;
    e.date=e.date||'';
    e.category=e.category||'Other';
    e.title=e.title||'';
    e.text=e.text||'';
    e.location=e.location||'';
    e.qualificationId=e.qualificationId||'';
    e.signatoryPersonId=e.signatoryPersonId||'';
    e.signatureData=e.signatureData||'';
    e.signedAt=e.signedAt||'';
    e.signedName=e.signedName||'';
    e.signedLicence=e.signedLicence||'';
  });

  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
}
function pilotLicenceDisplay(){
  let t=String(S.pilot?.licenceType||S.pilot?.licence||'').trim();
  let n=String(S.pilot?.licenceNumber||'').trim();
  return [t,n].filter(Boolean).join(' · ');
}

// Native date inputs display MM/DD/YYYY in some browser locales.
// Always show DD-MM-YYYY in HeliLog, while persisting ISO YYYY-MM-DD.
function europeanDateField(id,iso='',required=false){
  const str=htmlEscape(formatDate(iso||''));
  return `<div class="helilog-date-entry">
    <input id="${id}" type="text" inputmode="numeric" maxlength="10" autocomplete="off"
      placeholder="DD-MM-YYYY" aria-label="Date in DD-MM-YYYY format"
      value="${str}" ${required?'required':''}
      oninput="europeanDateTyping(this)" onblur="validateEuropeanDate(this)">
    <span class="helilog-date-icon" aria-hidden="true">▦</span>
    <input id="${id}NativePicker" class="helilog-native-picker" type="date"
      aria-label="Choose date from calendar" tabindex="-1"
      value="${htmlEscape(parseExternalDate(iso)||'')}"
      onchange="chooseEuropeanDate('${id}',this)">
  </div>`;
}
function europeanDateTyping(el){
  let raw=el.value.trim();
  // A pasted ISO date also resolves to the agreed day-first format.
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
    el.value=formatDate(raw);
  }else if(/^[\d-]*$/.test(raw)){
    const digits=raw.replace(/\D/g,'').slice(0,8);
    el.value=digits.slice(0,2)+(digits.length>2?'-'+digits.slice(2,4):'')+
      (digits.length>4?'-'+digits.slice(4):'');
  }
  const native=document.getElementById(el.id+'NativePicker');
  const iso=parseExternalDate(el.value);
  if(native)native.value=iso||'';
  el.classList.remove('time-input-invalid');
}
function validateEuropeanDate(el){
  const raw=String(el?.value||'').trim();
  if(!raw){el.classList.remove('time-input-invalid');return true;}
  const iso=parseExternalDate(raw);
  if(!iso){el.classList.add('time-input-invalid');return false;}
  el.value=formatDate(iso);
  el.classList.remove('time-input-invalid');
  const native=document.getElementById(el.id+'NativePicker');
  if(native)native.value=iso;
  return true;
}
function chooseEuropeanDate(id,native){
  const field=document.getElementById(id);
  if(!field)return;
  field.value=native.value?formatDate(native.value):'';
  field.classList.remove('time-input-invalid');
  field.dispatchEvent(new Event('input',{bubbles:true}));
  field.dispatchEvent(new Event('change',{bubbles:true}));
}
function readEuropeanDate(id,required=false){
  const el=document.getElementById(id);
  if(!el)return null;
  const raw=String(el.value||'').trim();
  const iso=raw?parseExternalDate(raw):'';
  if((required&&!iso)||(raw&&!iso)){
    el.classList.add('time-input-invalid');
    el.focus();
    return null;
  }
  if(iso)el.value=formatDate(iso);
  el.classList.remove('time-input-invalid');
  return iso;
}

function formatDate(v){
  let s=String(v||'').trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}-${m[2]}-${m[1]}`:s;
}
function parseExternalDate(v){
  let s=String(v||'').trim();
  let iso=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let eu=s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  let y,m,d;
  if(iso){y=Number(iso[1]);m=Number(iso[2]);d=Number(iso[3]);}
  else if(eu){d=Number(eu[1]);m=Number(eu[2]);y=Number(eu[3]);}
  else return null;
  let dt=new Date(y,m-1,d);
  if(dt.getFullYear()!==y || dt.getMonth()!==m-1 || dt.getDate()!==d) return null;
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function formatDateTime(v){
  if(!v) return '—';
  let d=new Date(v);
  if(Number.isNaN(d.getTime())) return String(v);
  let isoLocal=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `${formatDate(isoLocal)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function displayDate(v){return v?htmlEscape(formatDate(v)):'—'}
function qualificationById(id){return S.qualifications.find(q=>q.id===id)}
ensureV121Data();

function ensureV130Data(){
  const defaults={
    total:0,spSE:0,spME:0,multi:0,
    pic:0,copilot:0,dual:0,spic:0,picus:0,instructor:0,
    night:0,ifr:0,
    toDay:0,toNight:0,ldgDay:0,ldgNight:0
  };
  if(!S.broughtForward || typeof S.broughtForward!=='object') S.broughtForward={};
  Object.entries(defaults).forEach(([k,v])=>{
    let n=Number(S.broughtForward[k]);
    S.broughtForward[k]=Number.isFinite(n) && n>=0?n:v;
  });
  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
}
ensureV130Data();

function ensureV131Data(){
  let hasImportedValues=Object.values(S.broughtForward||{}).some(v=>Number(v||0)>0);
  if(typeof S.broughtForwardImported!=='boolean') S.broughtForwardImported=hasImportedValues;
  if(typeof S.broughtForwardImportedAt!=='string') S.broughtForwardImportedAt='';
  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
}
ensureV131Data();

// Additive migration; existing previous totals remain unchanged.
function ensureV136Data(){
  if(!Array.isArray(S.broughtForwardByType)) S.broughtForwardByType=[];
  S.broughtForwardByType=S.broughtForwardByType
    .filter(e=>e && typeof e==='object')
    .map(e=>({icao:String(e.icao||'').trim().toUpperCase(),minutes:Math.round(Number(e.minutes||0))}))
    .filter(e=>/^[A-Z0-9]{2,4}$/.test(e.icao) && Number.isSafeInteger(e.minutes) && e.minutes>0);
  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
}
ensureV136Data();

// V1.37: persistent print archive, separate from electronic flight records.
function ensureV137Data(){
  if(!S.printArchive || typeof S.printArchive!=='object') S.printArchive={};
  let p=S.printArchive;
  if(!Array.isArray(p.batches)) p.batches=[];
  if(!Number.isSafeInteger(p.firstPage) || p.firstPage<1) p.firstPage=1;
  if(typeof p.paperReference!=='string') p.paperReference='';
  if(!Array.isArray(p.corrections))p.corrections=[];
  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
}
ensureV137Data();

// Preserve legacy full-name storage for exports and existing cloud accounts.
// Only split a legacy name as a display fallback; persist separate names when
// the pilot explicitly saves the profile.
function pilotNameParts(pilot=S.pilot){
 const full=String(pilot?.name||'').trim().replace(/\s+/g,' ');
 if(typeof pilot?.firstName==='string'&&typeof pilot?.lastName==='string')
  return {firstName:pilot.firstName,lastName:pilot.lastName};
 const lastSpace=full.lastIndexOf(' ');
 return lastSpace<0?{firstName:full,lastName:''}:
  {firstName:full.slice(0,lastSpace),lastName:full.slice(lastSpace+1)};
}
function displayPICName(f){
 // A frozen printed/archive original must never be silently rewritten.
 if(!f||isSimulatorSession(f))return f?.picName||'';
 if(['PIC','SOLO'].includes(f.role)&&!isArchivedFlight(f.id))return 'SELF';
 return String(f.picName||'');
}
function ownerPerson(){
  return S.people.find(p=>p.isAccountHolder) ||
    S.people.find(p=>String(p.name||'').toLowerCase()===String(S.pilot.name||'').toLowerCase());
}
function personById(id){return S.people.find(p=>p.id===id)}
function personByName(name){
  let n=String(name||'').trim().toLowerCase();
  return S.people.find(p=>String(p.name||'').trim().toLowerCase()===n);
}
function ensurePersonForName(name){
  let clean=String(name||'').trim();
  if(!clean) return null;
  let existing=personByName(clean);
  if(existing) return existing;
  let p={
    id:'p'+Date.now()+Math.random().toString(36).slice(2,6),
    name:clean,
    firstName:pilotNameParts({name:clean}).firstName,
    lastName:pilotNameParts({name:clean}).lastName,
    role:'Pilot',
    licence:'',
    notes:'',
    isAccountHolder:false
  };
  S.people.push(p);
  return p;
}

let editingFlightId=null;
let correctingArchivedId=null;
let pendingDeleteFlightId=null;
let pendingImport=null;
let editingAircraftId=null;
let editingPersonId=null;
let editingQualificationId=null;
let editingEndorsementId=null;
function save(){
  try{
    localStorage.setItem(KEY,JSON.stringify(S));
    if(v23AccountWorkspace()){
      try{window.HeliLogV23Sync.track(S);}
      catch(syncError){console.error('Changes saved locally; sync queue could not be updated',syncError);
        alert('Saved on this device, but cloud sync requires attention: '+syncError.message);}
    }
    return true;
  }
  catch(e){
    console.error('HeliLog could not save changes:',e);
    alert('HeliLog could not save changes to this device. The browser storage may be full or unavailable. Export a Full Backup and check browser storage before continuing.');
    return false;
  }
}
function fmt(n){n=Math.max(0,Number(n)||0);return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')}
function parseHM(v){if(!v)return 0;let p=v.split(':').map(Number);return (p[0]||0)*60+(p[1]||0)}
function ac(id){return S.aircraft.find(a=>a.id===id)}
function recordedTotals(){
  return effectiveFlights().reduce((t,f)=>{
    let mins=Number(f.mins||0);
    let cfg=configurationTimes(f);
    t.total+=mins;
    t.spSE+=cfg.spSE;t.spME+=cfg.spME;t.multi+=cfg.multi;
    t.single+=flightPilotConfig(f)==='multi'?0:mins;
    if(engineCode(ac(f.aid))==='ME')t.engineME+=mins;
    else if(!isSimulatorSession(f))t.engineSE+=mins;
    t.copilot+=f.role==='CO-PILOT'?mins:0;
    t.dual+=f.role==='DUAL'?mins:0;
    t.pic+=['PIC','SOLO','SPIC','PICUS'].includes(f.role)?mins:0;
    t.spic+=f.role==='SPIC'?mins:0;
    t.picus+=f.role==='PICUS'?mins:0;
    t.instructor+=Number(f.instrMin||0);
    t.night+=Number(f.nightMin||0);
    t.ifr+=Number(f.ifrMin||0);
    t.toDay+=Number(f.takeoffDay||0);
    t.toNight+=Number(f.takeoffNight||0);
    t.ldgDay+=Number(f.landingDay||0);
    t.ldgNight+=Number(f.landingNight||0);
    return t;
  },{total:0,spSE:0,spME:0,single:0,multi:0,engineSE:0,engineME:0,pic:0,copilot:0,dual:0,spic:0,picus:0,instructor:0,night:0,ifr:0,toDay:0,toNight:0,ldgDay:0,ldgNight:0});
}
function calcTotals(){
  let t=recordedTotals(), b=S.broughtForward||{};
  Object.keys(t).forEach(k=>{
    const previous=k==='single'?(b.single??(Number(b.spSE||0)+Number(b.spME||0))):
      k==='engineSE'?(b.engineSE??Number(b.spSE||0)):
      k==='engineME'?(b.engineME??Number(b.spME||0)):
      b[k];
    t[k]+=Number(previous||0);
  });
  return t;
}
// Paper type-breakdowns are only used in aircraft-type totals, never career totals.
function combinedTotalsByType(){
  let by=new Map();
  (S.broughtForwardByType||[]).forEach(e=>{
    let icao=String(e.icao||'').trim().toUpperCase();
    if(icao)by.set(icao,(by.get(icao)||0)+Number(e.minutes||0));
  });
  effectiveFlights().forEach(f=>{
    let icao=String(ac(f.aid)?.icao||'—').trim().toUpperCase();
    by.set(icao,(by.get(icao)||0)+Number(f.mins||0));
  });
  return [...by.entries()].filter(([,mins])=>mins>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
const SPECIAL_OPS=[
  {code:'VRLL',label:'VRLL — Vertical-reference long-line'},
  {code:'HESLO1',label:'HESLO 1 — Short-line external load (up to 20 m)'},
  {code:'HESLO2',label:'HESLO 2 — Long-line external load (over 20 m)'},
  {code:'HESLO3',label:'HESLO 3 — Specialised external load'},
  {code:'HESLO4',label:'HESLO 4 — Advanced external load'},
  {code:'HEC',label:'HEC — Human external cargo'},
  {code:'NVIS',label:'NVG / NVIS — Night-vision operations'},
  {code:'HHO',label:'HHO — Helicopter hoist operations'},
  {code:'OFFSHORE',label:'Offshore operations'},
  {code:'FIRE',label:'Aerial firefighting / water bucket'},
  {code:'MOUNTAIN',label:'Mountain operations'},
  {code:'SURVEY',label:'Aerial survey / patrol'}
];
const SPECIAL_OP_KEYS=new Set(SPECIAL_OPS.map(op=>op.code));
function validSpecialOps(ops,total){
  if(ops===undefined || ops===null)return {valid:true,ops:{}};
  if(!ops || typeof ops!=='object' || Array.isArray(ops))return {valid:false,error:'Special operations must be an object.'};
  const result={};
  for(const [code,mins] of Object.entries(ops)){
    if(!SPECIAL_OP_KEYS.has(code))return {valid:false,error:'Unknown operation code '+code+'.'};
    if(!Number.isSafeInteger(mins) || mins<0 || mins>total)return {valid:false,error:code+' time cannot exceed flight time.'};
    result[code]=mins;
  }
  return {valid:true,ops:result};
}
function specialOpsAnnotation(f){
  const ops=f?.specialOps||{};
  const codes=SPECIAL_OPS.filter(op=>Object.prototype.hasOwnProperty.call(ops,op.code)).map(op=>op.code);
  return codes.length?'OPS: '+codes.join(', '):'';
}
function flightRemarksForDisplay(f){
  return [String(f?.remarks||'').trim(),specialOpsAnnotation(f)].filter(Boolean).join(' | ');
}
function specialisedTotals(){
  const previous=S.broughtForward?.specialOps||{};
  return SPECIAL_OPS.map(op=>{
    const flights=effectiveFlights().filter(f=>Object.prototype.hasOwnProperty.call(f.specialOps||{},op.code));
    const recordedMinutes=flights.reduce((n,f)=>n+Number(f.specialOps[op.code]||0),0);
    const historical=Number(previous?.[op.code]||0);
    const previousMinutes=Number.isSafeInteger(historical)&&historical>=0?historical:0;
    // Count only explicitly captured cycles/landings. Historic hours have no counts.
    const counter=op.code==='NVIS'?'flights':op.code==='OFFSHORE'?'landings':'cycles';
    const counts=flights.reduce((out,f)=>{
      if(op.code==='NVIS'){out.total++;return out;}
      const v=f.specialOpsCycles?.[op.code];
      if(!v||!Number.isSafeInteger(v.day)||!Number.isSafeInteger(v.night)||v.day<0||v.night<0){out.unrecorded++;return out;}
      out.day+=v.day;out.night+=v.night;out.total+=v.day+v.night;
      return out;
    },{day:0,night:0,total:0,unrecorded:0});
    return {...op,flights:flights.length,previousMinutes,recordedMinutes,
      minutes:previousMinutes+recordedMinutes,counter,...counts};
  }).filter(e=>e.flights||e.previousMinutes>0);
}
function broughtForwardInputMinutes(v){return Number(v||0)>0?fmt(Number(v)):'';
}
function parseBroughtForwardMinutes(v){
  let s=String(v||'').trim().replace(',','.');
  if(!s) return 0;
  let hm=s.match(/^(\d{1,5}):([0-5]\d)$/);
  if(hm) return Number(hm[1])*60+Number(hm[2]);
  if(/^\d+(?:\.\d+)?$/.test(s)) return Math.round(Number(s)*60);
  return null;
}

let deferredInstallPrompt=null;

function isStandaloneApp(){
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone===true;
}

function setupInstalledMobileZoomGuard(){
  // Only alter the installed touch-based app. Normal browser pages keep accessibility zoom.
  const touchDevice=('ontouchstart' in window)||navigator.maxTouchPoints>0;
  if(!touchDevice || !isStandaloneApp()) return;
  document.documentElement.classList.add('helilog-no-zoom');

  // Keep the original viewport meta tag unchanged: changing it after initial layout
  // can leave iOS standalone WebKit zoomed/cropped with no way to zoom back out.
  // WebKit's gesture events still need explicit cancellation on some iOS versions.
  const stopPinch=e=>{if(e.cancelable)e.preventDefault()};
  document.addEventListener('gesturestart',stopPinch,{passive:false});
  document.addEventListener('gesturechange',stopPinch,{passive:false});
  document.addEventListener('touchmove',e=>{
    if(e.touches.length>1 && e.cancelable)e.preventDefault();
  },{passive:false});
}
setupInstalledMobileZoomGuard();

function isAppleMobile(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}
function isInstalledTouchApp(){
  return isStandaloneApp() && isAppleMobile();
}
// Detect the installation mode rather than the viewport width: iPad landscape
// and larger iPhones must still use the simplified installed-app Logbook.
if(isInstalledTouchApp()) document.documentElement.classList.add('installed-touch-app');
if(isStandaloneApp()) document.documentElement.classList.add('helilog-installed-app');

function pwaEnvironment(){
  if(isStandaloneApp()) return {kind:'installed',label:'Installed app',detail:'HeliLog is running in standalone app mode.'};
  if(location.protocol==='file:') return {kind:'file',label:'File mode',detail:'Responsive app works, but install/offline PWA features need HTTPS or localhost.'};
  if(location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1'){
    return {kind:'secure',label:'PWA ready',detail:'Secure context detected. HeliLog can use its offline app cache.'};
  }
  return {kind:'http',label:'Web mode',detail:'The app is being served, but full offline PWA features normally require HTTPS.'};
}
function pwaStatusMarkup(){
  let e=pwaEnvironment();
  let cls=e.kind==='installed'||e.kind==='secure'?'ok':e.kind==='file'||e.kind==='http'?'warn':'';
  let extra='';
  if(isAppleMobile() && !isStandaloneApp()){
    extra='<div class="install-help" style="margin-top:7px">iPhone/iPad: Safari → Share → Add to Home Screen.</div>';
  }else if(deferredInstallPrompt && !isStandaloneApp()){
    extra='<div class="install-help" style="margin-top:7px">This browser is ready to show the install prompt.</div>';
  }
  return `<div class="pwa-state"><span class="pwa-dot ${cls}"></span><b>${e.label}</b><span class="muted">${e.detail}</span></div>${extra}`;
}
function updatePWAStatus(){
  ['pwaStatus','mobilePWAStatus'].forEach(id=>{
    let el=document.getElementById(id);
    if(el) el.innerHTML=pwaStatusMarkup();
  });
}
async function installHeliLog(){
  if(isStandaloneApp()){
    alert('HeliLog is already running as an installed app.');
    return;
  }
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    try{await deferredInstallPrompt.userChoice}catch(e){}
    deferredInstallPrompt=null;
    updatePWAStatus();
    return;
  }
  if(isAppleMobile()){
    alert('On iPhone or iPad: open HeliLog in Safari, tap Share, then choose “Add to Home Screen”. For full offline support, use the HTTPS-hosted PWA version.');
    return;
  }
  if(location.protocol==='file:'){
    alert('This HTML file is running in file mode. The responsive interface works, but browser installation and offline caching require HeliLog to be served from localhost or HTTPS. Use the hosted HeliLog PWA.');
    return;
  }
  alert('Use your browser menu and choose “Install HeliLog” or “Install app” if available.');
}

window.addEventListener('beforeinstallprompt',ev=>{
  ev.preventDefault();
  deferredInstallPrompt=ev;
  updatePWAStatus();
});
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;
  updatePWAStatus();
});

if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./service-worker.js').then(()=>updatePWAStatus()).catch(()=>updatePWAStatus());
  });
}

function header(title,sub,action=''){
 const banner=v23AccountWorkspace()?'<div id="v23SyncStatus" class="v23-syncbanner">'+v23SyncInfo()+'</div>':'';
 return `<div class="top"><div class="v220-page-heading"><div><h1>${title}</h1><div class="sub">${sub||''}</div></div>${banner}</div>${action?`<div class="v220-top-actions">${action}</div>`:''}</div>`;
}

let flightFormDirty=false;
let restoringFlightHistory=false;

function hasUnsavedFlightChanges(){
  return flightFormDirty && !!document.getElementById('flightForm');
}
function confirmLeaveFlightForm(){
  if(!hasUnsavedFlightChanges()) return true;
  return window.confirm('You have unsaved flight changes. Leave this page and discard them?');
}
function clearFlightFormGuard(){
  flightFormDirty=false;
}
function markFlightFormDirty(){
  if(document.getElementById('flightForm')) flightFormDirty=true;
}
function cancelFlightForm(returnFlightId=''){
  if(!confirmLeaveFlightForm()) return;
  correctingArchivedId=null;
  clearFlightFormGuard();
  if(returnFlightId) flight(returnFlightId);
  else go('dashboard');
}
function go(v){
  if(!v23Unlocked){v23LoginView();return;}
  if(!confirmLeaveFlightForm()) return;
  correctingArchivedId=null;
  clearFlightFormGuard();
  if(location.hash==='#'+v) render();
  else location.hash=v;
}
function handleHeliLogHashChange(){
  if(restoringFlightHistory){
    restoringFlightHistory=false;
    return;
  }
  if(hasUnsavedFlightChanges() && !confirmLeaveFlightForm()){
    restoringFlightHistory=true;
    history.forward();
    return;
  }
  clearFlightFormGuard();
  render();
}
document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>go(b.dataset.v));
window.onhashchange=handleHeliLogHashChange;
window.addEventListener('beforeunload',e=>{
  if(!hasUnsavedFlightChanges()) return;
  e.preventDefault();
  e.returnValue='';
});

function mobilemore(){
  app.innerHTML=header('More','Manage aircraft, pilot records and account settings')+
  `<div class="grid more-grid">
    <button class="card more-link" onclick="go('aircraft')"><span>🚁</span><b>Aircraft</b><span class="muted">Fleet and SE/ME setup</span></button>
    <button class="card more-link" onclick="go('pilots')"><span>👤</span><b>Pilot profiles</b><span class="muted">Create PIC, instructor and examiner profiles</span></button>
    <button class="card more-link" onclick="go('endorsements')"><span>✎</span><b>Endorsements</b><span class="muted">Memoranda and signatures</span></button>
    ${!isStandaloneApp()?`<button class="card more-link" onclick="go('endorsementarchive')"><span>▤</span><b>Endorsement archive</b><span class="muted">Printed pages and corrections</span></button>`:''}
    <button class="card more-link" onclick="go('totals')"><span>◉</span><b>Totals</b><span class="muted">Flight-time breakdown</span></button>
    <button class="card more-link" onclick="go('recency')"><span>◷</span><b>Recency</b><span class="muted">90-day passenger and night evidence</span></button>
    <button class="card more-link" onclick="go('profile')"><span>○</span><b>Profile</b><span class="muted">Pilot details, medical, licences and ratings</span></button>
    <button class="card more-link" onclick="go('settings')"><span>⚙</span><b>Settings</b><span class="muted">Logbook, cloud sync, backups and device</span></button>
    ${!v23AccountWorkspace()?`<button class="card more-link" onclick="go('testmode')"><span>⚗</span><b>Test Mode</b><span class="muted">Separate sandbox and safe reset</span></button>`:''}
    <button class="card more-link" onclick="go('help')"><span>ⓘ</span><b>Help &amp; User Guide</b><span class="muted">Instructions and new features</span></button>
    <button class="card more-link" onclick="installHeliLog()"><span>▣</span><b>Install HeliLog</b><span class="muted">Home-screen / PWA setup</span></button>
  </div>
  <div id="mobilePWAStatus" class="card" style="margin-top:14px"></div>`;
  updatePWAStatus();
}

// Dates are ISO YYYY-MM-DD, so their string order matches calendar order.
// Timed flights are placed by departure time; date-only simulator sessions
// follow timed flights on the same date (their precise session time is unknown).
// Both sort directions reverse the same comparator, preserving page continuity.
