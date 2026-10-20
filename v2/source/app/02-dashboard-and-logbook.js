function compareFlightsOldest(a,b){
  const byDate=String(a.date||'').localeCompare(String(b.date||''));
  if(byDate)return byDate;
  const time=f=>isSimulatorSession(f)?'24:00':/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(f.off||'')?f.off:'24:00';
  const byTime=time(a).localeCompare(time(b));
  if(byTime)return byTime;
  const byCreated=String(a.createdAt||'').localeCompare(String(b.createdAt||''));
  if(byCreated)return byCreated;
  return String(a.id||'').localeCompare(String(b.id||''));
}
function compareFlightsNewest(a,b){return compareFlightsOldest(b,a)}
function dashboardPeriodFlights(days){
  if(!days) return effectiveFlights().filter(f=>!isSimulatorSession(f));
  let now=new Date();
  let cutoff=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  cutoff.setDate(cutoff.getDate()-(days-1));
  let cutoffStr=cutoff.toISOString().slice(0,10);
  return effectiveFlights().filter(f=>!isSimulatorSession(f)&&String(f.date||'')>=cutoffStr);
}
function dashboardPeriodTotals(flights){
  return {
    total:flights.reduce((n,f)=>n+Number(f.mins||0),0),
    pic:flights.reduce((n,f)=>n+(['PIC','SOLO','SPIC','PICUS'].includes(f.role)?Number(f.mins||0):0),0),
    copilot:flights.reduce((n,f)=>n+(f.role==='CO-PILOT'?Number(f.mins||0):0),0),
    dual:flights.reduce((n,f)=>n+(f.role==='DUAL'?Number(f.mins||0):0),0),
    night:flights.reduce((n,f)=>n+Number(f.nightMin||0),0),
    ifr:flights.reduce((n,f)=>n+Number(f.ifrMin||0),0)
  };
}
function daysUntil(dateStr){
  if(!dateStr) return null;
  let target=new Date(dateStr+'T00:00:00');
  if(Number.isNaN(target.getTime())) return null;
  let now=new Date();
  let today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.ceil((target-today)/86400000);
}
function dashboardReminders(){
  let r=[];
  let med=S.pilot?.medical;
  if(med?.validUntil) r.push({label:`Medical ${med.class||''}`.trim(),date:med.validUntil,type:'Medical'});
  (S.qualifications||[]).forEach(q=>{
    if(q.validUntil) r.push({label:q.name||q.category||'Qualification',date:q.validUntil,type:q.category||'Qualification'});
  });
  return r.sort((a,b)=>a.date.localeCompare(b.date));
}
function setDashboardRange(days,button){
  let flights=dashboardPeriodFlights(days).sort(compareFlightsNewest);
  let t=days?dashboardPeriodTotals(flights):calcTotals();
  [['dashTotal',t.total],['dashPIC',t.pic],['dashCopilot',t.copilot],['dashDual',t.dual],['dashNight',t.night],['dashIFR',t.ifr]]
    .forEach(([id,val])=>{let el=document.getElementById(id);if(el)el.textContent=fmt(val)});
  let count=document.getElementById('dashFlightCount');if(count)count.textContent=flights.length;
  document.querySelectorAll('.dashboard-range button').forEach(b=>b.classList.toggle('on',b===button));
}
function dashboard(){
  let fs=effectiveFlights().filter(f=>!isSimulatorSession(f)).sort(compareFlightsNewest);
  let t=calcTotals();
  let reminders=dashboardReminders().slice(0,6);
  let endorsements=[...(S.endorsements||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,4);
  let aircraftRows=S.aircraft.map(a=>{
    let mins=effectiveFlights().filter(f=>f.aid===a.id).reduce((n,f)=>n+Number(f.mins||0),0);
    return {a,mins};
  }).sort((a,b)=>b.mins-a.mins);

  app.innerHTML=header('Dashboard',`Welcome back, ${S.pilot.name}`,`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" onclick="go('add')">＋ Add flight</button>${!v23AccountWorkspace()?`<button class="btn" onclick="go('testmode')">⚗ ${TEST_MODE?'Test Mode settings':'Open Test Mode'}</button>`:''}</div>`)+
  `<div class="card">
    <div class="head"><div><h2>Flight-time overview</h2><div class="muted"><span id="dashFlightCount">${fs.length}</span> flights in selected period</div></div></div>
    <div class="dashboard-range">
      <button class="btn" onclick="setDashboardRange(30,this)">30 days</button>
      <button class="btn" onclick="setDashboardRange(90,this)">90 days</button>
      <button class="btn" onclick="setDashboardRange(365,this)">12 months</button>
      <button class="btn on" onclick="setDashboardRange(null,this)">All time</button>
    </div>
    <div class="grid stats">
      <div class="card"><div class="label">Total</div><div class="big" id="dashTotal">${fmt(t.total)}</div></div>
      <div class="card"><div class="label">PIC</div><div class="big" id="dashPIC">${fmt(t.pic)}</div></div>
      <div class="card"><div class="label">Co-pilot</div><div class="big" id="dashCopilot">${fmt(t.copilot)}</div></div>
      <div class="card"><div class="label">Dual</div><div class="big" id="dashDual">${fmt(t.dual)}</div></div>
    </div>
    <div class="grid stats desktop-only" style="margin-top:10px">
      <div class="card"><div class="label">Night</div><div class="big" id="dashNight">${fmt(t.night)}</div></div>
      <div class="card"><div class="label">IFR</div><div class="big" id="dashIFR">${fmt(t.ifr)}</div></div>
    </div>
  </div>

  <div class="grid two" style="margin-top:16px">
    <div class="card">
      <div class="head"><h2>Recent flights</h2><button class="btn" onclick="go('logbook')">View all</button></div>
      <div style="overflow:auto"><table><thead><tr><th>Date</th><th>Type</th><th>Route</th><th>Time</th><th>Function</th></tr></thead><tbody>${fs.slice(0,6).map(row).join('')}</tbody></table></div>
    </div>
    <div class="card">
      <div class="head"><h2>Upcoming dates</h2><button class="btn" onclick="go('profile')">Profile</button></div>
      <div class="reminder-list">
        ${reminders.length?reminders.map(r=>{
          let d=daysUntil(r.date);
          let cls=d<0?'past':d<=60?'soon':'';
          let txt=d<0?`${Math.abs(d)} days past date`:d===0?'Today':`${d} days`;
          return `<div class="reminder-item"><div><b>${htmlEscape(r.label)}</b><div class="muted">${htmlEscape(r.type)} · ${displayDate(r.date)}</div></div><div class="reminder-days ${cls}">${txt}</div></div>`;
        }).join(''):'<div class="muted">No medical or qualification validity dates recorded.</div>'}
      </div>
      <div class="mini" style="margin-top:10px">Date reminders only — HeliLog does not yet determine regulatory validity or recency.</div>
    </div>
  </div>

  <div class="grid two desktop-only" style="margin-top:16px">
    <div class="card">
      <div class="head"><h2>Recent endorsements</h2><button class="btn" onclick="go('endorsements')">View all</button></div>
      ${endorsements.length?endorsements.map(e=>`<div class="endorsement-mini"><b>${htmlEscape(e.title||e.category||'Endorsement')}</b><div class="muted">${displayDate(e.date)} · ${e.signatureData?'Signed':'Unsigned'}</div></div>`).join(''):'<div class="muted">No endorsements recorded yet.</div>'}
    </div>
    <div class="card">
      <div class="head"><h2>Aircraft time</h2><button class="btn" onclick="go('aircraft')">Manage</button></div>
      <div class="aircraft-summary">
        ${aircraftRows.map(x=>`<div class="aircraft-summary-row"><span><b>${htmlEscape(x.a.icao||'—')}</b> · ${htmlEscape(x.a.reg||'—')}</span><b>${fmt(x.mins)}</b></div>`).join('')}
      </div>
    </div>
  </div>`;
}
function row(f){let a=ac(f.aid);return `<tr class="click" onclick="flight('${f.id}')"><td>${displayDate(f.date)}</td><td><b>${isSimulatorSession(f)?'SIM':a?.icao||'—'}</b></td><td>${isSimulatorSession(f)?htmlEscape(f.stdType):f.dep+' → '+f.arr}</td><td>${fmt(isSimulatorSession(f)?f.stdMin:f.mins)}</td><td><span class="tag">${isSimulatorSession(f)?'SIM':f.role}</span></td></tr>`}
function logbook(){
  let aircraftOptions=S.aircraft.map(a=>`<option value="${a.id}">${a.icao} — ${a.reg}</option>`).join('');
  app.innerHTML=header('Logbook',isInstalledTouchApp()?'View your flight records':'Search and filter your flight records',`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn desktop-only web-only-tool" onclick="openImportModal()">Import CSV</button><button class="btn desktop-only web-only-tool" onclick="openExportModal()">Export</button><button class="btn primary" onclick="go('add')">＋ Add flight</button></div>`)+`
  <div class="card logbook-flight-list">
    <div class="filterbar logbook-filter-controls">
      <div class="filterfield"><label>Search</label><input id="logSearch" type="search" placeholder="Route, PIC, registration, remarks…"></div>
      <div class="filterfield desktop-only"><label>From date</label>${europeanDateField('filterFrom')}</div>
      <div class="filterfield desktop-only"><label>To date</label>${europeanDateField('filterTo')}</div>
      <div class="filterfield desktop-only"><label>Aircraft</label><select id="filterAircraft"><option value="">All aircraft</option>${aircraftOptions}</select></div>
    </div>
    <div class="filterbar second desktop-only logbook-filter-controls">
      <div class="filterfield"><label>Pilot function</label><select id="filterRole"><option value="">All functions</option>${['PIC','CO-PILOT','DUAL','SOLO','SPIC','PICUS'].map(r=>`<option>${r}</option>`).join('')}</select></div>
      <div class="filterfield"><label>Cross-country</label><select id="filterXC"><option value="">All flights</option><option value="yes">XC only</option><option value="no">Non-XC only</option></select></div>
      <div class="filterfield"><label>Night</label><select id="filterNight"><option value="">All flights</option><option value="yes">Night time recorded</option><option value="no">No night time</option></select></div>
      <div class="filterfield"><label>IFR</label><select id="filterIFR"><option value="">All flights</option><option value="yes">IFR time recorded</option><option value="no">No IFR time</option></select></div>
      <button type="button" class="btn" onclick="clearLogbookFilters()">Clear filters</button>
    </div>
    <div style="overflow:auto">
      <table class="mobile-logbook">
        <thead><tr><th>Date</th><th>Type</th><th>Reg.</th><th>Departure</th><th>Arrival</th><th>Total</th><th>PIC name</th><th>Function</th><th>Night</th><th>IFR</th><th>XC</th></tr></thead>
        <tbody id="logbookBody"></tbody>
      </table>
    </div>
    <div class="filtermeta">
      <div><span id="resultCount" class="resultcount">0 flights</span> shown</div>
      <div class="filtertotals">
        <span>${isInstalledTouchApp()?'Logbook flight time':'Filtered flight time'}: <b id="filteredTime">0:00</b></span>
        <span>Simulator: <b id="filteredSimulatorTime">0:00</b></span>
        <span id="filteredIFRWrap" style="display:none">Filtered IFR time: <b id="filteredIFRTime">0:00</b></span>
        <span id="filteredNightWrap" style="display:none">Filtered Night time: <b id="filteredNightTime">0:00</b></span>
      </div>
    </div>
  </div>`;

  ['logSearch','filterFrom','filterTo','filterAircraft','filterRole','filterXC','filterNight','filterIFR'].forEach(id=>{
    let el=document.getElementById(id);
    el.addEventListener(['logSearch','filterFrom','filterTo'].includes(id)?'input':'change',applyLogbookFilters);
  });
  applyLogbookFilters();
}

function getFilteredFlights(){
  let q=(document.getElementById('logSearch')?.value||'').trim().toLowerCase();
  let from=readEuropeanDate('filterFrom')||'';
  let to=readEuropeanDate('filterTo')||'';
  let aircraftId=document.getElementById('filterAircraft')?.value||'';
  let role=document.getElementById('filterRole')?.value||'';
  let xc=document.getElementById('filterXC')?.value||'';
  let night=document.getElementById('filterNight')?.value||'';
  let ifr=document.getElementById('filterIFR')?.value||'';

  return effectiveFlights().filter(f=>{
    let a=ac(f.aid);
    let searchable=[
      f.date,f.dep,f.arr,f.off,f.on,f.picName,f.role,f.simCategory,f.simDevice,f.simQualification,f.stdType,flightRemarksForDisplay(f),
      a?.icao,a?.reg,a?.manufacturer,a?.model,a?.variant
    ].filter(Boolean).join(' ').toLowerCase();

    if(q && !searchable.includes(q)) return false;
    if(from && f.date<from) return false;
    if(to && f.date>to) return false;
    if(aircraftId && f.aid!==aircraftId) return false;
    if(role && f.role!==role) return false;
    if(xc==='yes' && !f.crossCountry) return false;
    if(xc==='no' && !!f.crossCountry) return false;
    if(night==='yes' && !(Number(f.nightMin||0)>0)) return false;
    if(night==='no' && Number(f.nightMin||0)>0) return false;
    if(ifr==='yes' && !(Number(f.ifrMin||0)>0)) return false;
    if(ifr==='no' && Number(f.ifrMin||0)>0) return false;
    return true;
  }).sort(compareFlightsNewest);
}

function applyLogbookFilters(){
  let body=document.getElementById('logbookBody');
  if(!body) return;
  let flights=getFilteredFlights();
  body.innerHTML=flights.length?flights.map(f=>{
    let a=ac(f.aid);
    return `<tr class="click" onclick="flight('${f.id}')">
      <td>${displayDate(f.date)}</td><td><b>${isSimulatorSession(f)?'SIM':a?.icao||'—'}</b></td><td>${isSimulatorSession(f)?htmlEscape(f.simCategory||'—'):a?.reg||'—'}</td>
      <td>${isSimulatorSession(f)?htmlEscape(f.stdType||simulatorDeviceLabel(f)):f.dep+' '+(f.off||'')}</td>
      <td>${isSimulatorSession(f)?'—':f.arr+' '+(f.on||'')}</td><td>${fmt(isSimulatorSession(f)?f.stdMin:f.mins)}</td>
      <td>${isSimulatorSession(f)?'—':htmlEscape(displayPICName(f)||'—')}</td><td><span class="tag">${isSimulatorSession(f)?'SIM':f.role}</span></td>
      <td>${fmt(f.nightMin||0)}</td><td>${fmt(f.ifrMin||0)}</td><td>${f.crossCountry?'✓':'—'}</td>
    </tr>`;
  }).join(''):`<tr><td colspan="11" style="text-align:center;padding:28px;color:var(--muted)">No flights match the current filters.</td></tr>`;

  let total=flights.reduce((n,f)=>n+(Number(f.mins)||0),0);
  let ifrTotal=flights.reduce((n,f)=>n+(Number(f.ifrMin)||0),0);
  let nightTotal=flights.reduce((n,f)=>n+(Number(f.nightMin)||0),0);

  const simTotal=flights.filter(isSimulatorSession).reduce((n,f)=>n+Number(f.stdMin||0),0);
  document.getElementById('resultCount').textContent=`${flights.length} entr${flights.length===1?'y':'ies'}`;
  document.getElementById('filteredSimulatorTime').textContent=fmt(simTotal);
  document.getElementById('filteredTime').textContent=fmt(total);
  document.getElementById('filteredIFRTime').textContent=fmt(ifrTotal);
  document.getElementById('filteredNightTime').textContent=fmt(nightTotal);

  let ifrFilter=document.getElementById('filterIFR')?.value||'';
  let nightFilter=document.getElementById('filterNight')?.value||'';

  document.getElementById('filteredIFRWrap').style.display=ifrFilter?'inline':'none';
  document.getElementById('filteredNightWrap').style.display=nightFilter?'inline':'none';
}

function clearLogbookFilters(){
  ['logSearch','filterFrom','filterTo','filterAircraft','filterRole','filterXC','filterNight','filterIFR'].forEach(id=>{
    let el=document.getElementById(id); if(el) el.value='';
  });
  applyLogbookFilters();
}


