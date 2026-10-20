document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){closeDeleteModal();closeImportModal();closeExportModal();}
});
document.addEventListener('click',function(e){
  if(!e.target.closest('.timewrap')){
    document.querySelectorAll('.timepicker.open').forEach(x=>x.classList.remove('open'));
  }
});
function isMobileTypingField(el){
  if(!el || window.innerWidth>850) return false;
  if(el.tagName==='TEXTAREA' || el.isContentEditable) return true;
  if(el.tagName!=='INPUT') return false;
  let type=String(el.type||'text').toLowerCase();
  return !['button','submit','reset','checkbox','radio','file','date','time','month','week','color','range','hidden'].includes(type);
}
function updateMobileKeyboardUI(){
  document.body.classList.toggle('keyboard-open',isMobileTypingField(document.activeElement));
}
document.addEventListener('focusin',updateMobileKeyboardUI);
document.addEventListener('focusout',()=>setTimeout(updateMobileKeyboardUI,60));
window.addEventListener('resize',updateMobileKeyboardUI);
if(window.visualViewport) window.visualViewport.addEventListener('resize',updateMobileKeyboardUI);

function render(){
  if(!v23Unlocked){v23LoginView();return;}
  let v=location.hash.slice(1)||'dashboard';
  if(v23AccountWorkspace()&&v==='testmode'){
    v='dashboard';if(location.hash!=='#dashboard')location.hash='#dashboard';
  }
  if(v23AccountWorkspace()&&(v==='printarchive'||v==='endorsementarchive')&&v23PreventUnsupportedArchive()){
    v='dashboard';
    if(location.hash!=='#dashboard')location.hash='#dashboard';
  }
  if(isStandaloneApp()&&(v==='printarchive'||v==='endorsementarchive')){
    v='endorsements';
    if(location.hash!=='#endorsements')location.hash='#endorsements';
  }
  try{
    if(v!=='add'&&v!=='quickadd') editingFlightId=null;
    ({dashboard,logbook,add,quickadd:quickAdd,aircraft,pilots,endorsements,printarchive,endorsementarchive:v2EndorsementArchive,totals,profile,settings,locations:v219LocationsPage,backups,cloud,testmode,mobilemore}[v]||dashboard)();
    let moreViews=['mobilemore','aircraft','pilots','endorsements','endorsementarchive','totals','profile','settings','locations','backups','cloud','testmode'];
    document.querySelectorAll('[data-v]').forEach(b=>{
      let active=b.dataset.v===v || (b.dataset.v==='quickadd'&&v==='add') || (b.dataset.v==='settings' && (v==='cloud'||v==='backups'||v==='locations')) || (b.dataset.v==='mobilemore' && moreViews.includes(v));
      b.classList.toggle('on',active);
    });
    setTimeout(updatePWAStatus,0);
  }catch(e){
    app.innerHTML=`<div class="card"><h2>HeliLog could not load this screen</h2><p class="muted">${String(e)}</p></div>`;
  }
}
v23Boot();
// Refresh aircraft and flights when returning to HeliLog or reconnecting.
window.addEventListener('online',()=>{if(v23AccountWorkspace()&&!hasUnsavedFlightChanges())v23RefreshSync();});
window.addEventListener('focus',()=>{if(v23AccountWorkspace()&&!hasUnsavedFlightChanges())v23RefreshSync();});
setInterval(()=>{if(v23AccountWorkspace()&&!hasUnsavedFlightChanges()&&document.visibilityState==='visible')
  v23RefreshSync();},30000);
