document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){closeDeleteModal();closeImportModal();closeExportModal();closeBroughtForwardSpecialOps();}
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
/* V2.31.4: prevent unused-space rubber-band scrolling in compact Quick.
 * Never lock a form that would need scrolling, including expanded options and
 * warnings. Release immediately for keyboard focus and on route changes.
 * State is ephemeral: no changes to flight data or account storage. */
let quickViewportObserver=null,quickViewportObservedForm=null;
let quickScrollUpdatePending=false;
function syncQuickFlightScrollLock(){
  const root=document.documentElement;
  const form=document.getElementById('flightForm');
  const quick=!!form?.classList.contains('quick-entry-active');
  const mobile=window.innerWidth<=850;
  const typing=document.body.classList.contains('keyboard-open')||
    isMobileTypingField(document.activeElement);
  const eligible=mobile&&quick&&!typing;
  const nav=document.querySelector('.mobile');
  let fits=false;
  if(eligible&&nav){
    const navStyle=window.getComputedStyle?.(nav);
    if(navStyle?.display!=='none'){
      const availableBottom=nav.getBoundingClientRect().top;
      const scrollY=window.scrollY||document.documentElement.scrollTop||0;
      // Compare at the top of the page, regardless of current scroll.
      const formBottom=form.getBoundingClientRect().bottom+scrollY;
      const heading=document.querySelector('#app > .top');
      const headingTop=heading?.getBoundingClientRect().top??0;
      fits=Number.isFinite(formBottom)&&Number.isFinite(availableBottom)&&
        formBottom<=availableBottom-8&&headingTop+scrollY>=0;
    }
  }
  const shouldLock=eligible&&fits;
  if(!shouldLock){
    root.classList.remove('helilog-quick-scroll-locked');
  }else{
    // Reset a residual scroll from keyboard input before locking the body.
    // Never do this if expanded content actually needs scrolling.
    if(!root.classList.contains('helilog-quick-scroll-locked')){
      window.scrollTo(0,0);
      root.classList.add('helilog-quick-scroll-locked');
    }
  }
  if(typeof ResizeObserver==='function'){
    if(!quickViewportObserver){
      quickViewportObserver=new ResizeObserver(()=>scheduleQuickFlightScrollLock());
    }
    if(quickViewportObservedForm!==form){
      quickViewportObserver.disconnect();
      quickViewportObservedForm=quick?form:null;
      if(quickViewportObservedForm){
        quickViewportObserver.observe(quickViewportObservedForm);
        const heading=document.querySelector('#app > .top');
        if(heading)quickViewportObserver.observe(heading);
      }
    }
  }
}
function scheduleQuickFlightScrollLock(){
  if(quickScrollUpdatePending)return;
  quickScrollUpdatePending=true;
  window.requestAnimationFrame(()=>{
    quickScrollUpdatePending=false;
    syncQuickFlightScrollLock();
  });
}
function updateMobileKeyboardUI(){
  document.body.classList.toggle('keyboard-open',isMobileTypingField(document.activeElement));
  // Focus must release the locked viewport before iOS scrolls the input
  // above its keyboard; refreeze only after it closes and the form fits.
  syncQuickFlightScrollLock();
}
document.addEventListener('focusin',updateMobileKeyboardUI);
document.addEventListener('focusout',()=>setTimeout(updateMobileKeyboardUI,60));
window.addEventListener('resize',updateMobileKeyboardUI);
if(window.visualViewport) window.visualViewport.addEventListener('resize',updateMobileKeyboardUI);

function render(){
  document.documentElement.classList.remove('helilog-quick-scroll-locked');
  if(!v23Unlocked){v23LoginView();return;}
  let v=location.hash.slice(1)||'dashboard';
  if(v23AccountWorkspace()&&v==='testmode'){
    v='dashboard';if(location.hash!=='#dashboard')location.hash='#dashboard';
  }
  if(v23AccountWorkspace()&&(v==='printarchive'||v==='archivereview'||v==='endorsementarchive')&&v23PreventUnsupportedArchive()){
    v='dashboard';
    if(location.hash!=='#dashboard')location.hash='#dashboard';
  }
  if(isStandaloneApp()&&(v==='printarchive'||v==='archivereview'||v==='endorsementarchive')){
    v='endorsements';
    if(location.hash!=='#endorsements')location.hash='#endorsements';
  }
  try{
    if(v!=='add'&&v!=='quickadd') editingFlightId=null;
    ({dashboard,logbook,add,quickadd:quickAdd,aircraft,pilots,endorsements,printarchive,archivereview:v229PreArchiveReview,endorsementarchive:v2EndorsementArchive,totals,recency,profile,settings,locations:v219LocationsPage,backups,cloud,testmode,mobilemore,help:helpGuide}[v]||dashboard)();
    let moreViews=['mobilemore','aircraft','pilots','endorsements','endorsementarchive','totals','recency','profile','settings','locations','backups','cloud','testmode','help'];
    document.querySelectorAll('[data-v]').forEach(b=>{
      let active=b.dataset.v===v || (b.dataset.v==='quickadd'&&v==='add') || (b.dataset.v==='settings' && (v==='cloud'||v==='backups'||v==='locations')) || (b.dataset.v==='mobilemore' && moreViews.includes(v));
      b.classList.toggle('on',active);
    });
    setTimeout(updatePWAStatus,0);
    scheduleQuickFlightScrollLock();
  }catch(e){
    document.documentElement.classList.remove('helilog-quick-scroll-locked');
    app.innerHTML=`<div class="card"><h2>HeliLog could not load this screen</h2><p class="muted">${String(e)}</p></div>`;
  }
}
v23Boot();
// Refresh aircraft and flights when returning to HeliLog or reconnecting.
window.addEventListener('online',()=>{if(v23AccountWorkspace()&&!hasUnsavedFlightChanges())v23RefreshSync();});
window.addEventListener('focus',()=>{if(v23AccountWorkspace()&&!hasUnsavedFlightChanges())v23RefreshSync();});
setInterval(()=>{if(v23AccountWorkspace()&&!hasUnsavedFlightChanges()&&document.visibilityState==='visible')
  v23RefreshSync();},30000);
