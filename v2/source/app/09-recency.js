/* HeliLog V2.33 TEST — FCL.060 summary and per-type details.
 * Values are documented evidence, NOT a legal determination of privileges.
 */
function recencyToday(){return new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Vilnius'}).replace(/\//g,'-');}
function recencyCurrent(){
 const today=new Date(),yyyy=today.getFullYear(),mm=String(today.getMonth()+1).padStart(2,'0'),dd=String(today.getDate()).padStart(2,'0');
 return yyyy+'-'+mm+'-'+dd;
}
function recencyRows(){return window.HeliLogV233Recency.groups(effectiveFlights(),S.aircraft,recencyCurrent());}
function recencyDaysTo(iso){
 if(!iso)return null;
 const n=Date.parse(iso+'T00:00:00Z')-Date.parse(recencyCurrent()+'T00:00:00Z');
 return Math.round(n/86400000);
}
function recencyStatus(row,kind){
 const documented=kind==='night'?row.nightDocumented:row.generalDocumented;
 const count=kind==='night'?row.night:row.general;
 const target=kind==='night'?1:3;
 const change=kind==='night'?row.nextNightLoss:row.nextGeneralLoss;
 const days=recencyDaysTo(change);
 return {count,target,documented,change,days,
   text:documented?(days!==null&&days<=14?'Review soon':'Documented'):'Not established'};
}
function recencySummaryMarkup(){
 const data=recencyRows(),preferred=effectiveFlights().filter(f=>!isSimulatorSession(f)&&f.date<=recencyCurrent())
   .sort(compareFlightsNewest)[0];
 const main=data.find(x=>preferred&&x.type===window.HeliLogV233Recency.typeCode(preferred,S.aircraft)&&
   x.config===flightPilotConfig(preferred))||data[0];
 if(!main)return '<div class="card" style="margin-top:16px"><div class="head"><h2>Recent experience</h2><button class="btn" onclick="go(\'recency\')">View recency</button></div><p class="muted">Add aircraft and flights to track FCL.060 evidence.</p></div>';
 const gen=recencyStatus(main,'general'),night=recencyStatus(main,'night');
 const item=(label,v)=>`<div class="recency-mini"><div class="muted">${label}</div><b>${v.count}/${v.target}</b><span class="mini">${v.text}</span></div>`;
 return `<div class="card" style="margin-top:16px">
 <div class="head"><div><h2>Recent experience</h2><div class="muted">FCL.060 · ${htmlEscape(main.type)} · ${main.config==='multi'?'Multi-pilot':'Single-pilot'} · rolling 90 days</div></div><button class="btn" onclick="go('recency')">View recency</button></div>
 <div class="recency-mini-grid">${item('Passenger / CAT PF sequences',gen)}${item('Night PIC PF sequences',night)}</div>
 <div class="mini" style="margin-top:10px">${main.unverifiedFlights?main.unverifiedFlights+' flight(s) have unverified movement counts. ':''}Documented counts require explicit pilot-flying approach evidence. Licence, IR and operator requirements still need manual confirmation.</div>
 </div>`;
}
function recency(){
 const rows=recencyRows();
 const asOf=recencyCurrent();
 const renderOne=(row)=>{
   const gen=recencyStatus(row,'general'),night=recencyStatus(row,'night');
   const cell=(title,v)=>`<div class="recency-panel">
     <b>${title}</b><div class="recency-count">${v.count}/${v.target}</div>
     <div class="mini">${v.documented?'Documented PF sequences':'Insufficient documented evidence'}</div>
     ${v.change?`<div class="mini">Next 90-day change: ${displayDate(v.change)}${v.days!==null&&v.days<=30?' ('+v.days+' days)':''}</div>`:''}
   </div>`;
   return `<div class="card" style="margin-top:14px">
     <div class="head"><h2>${htmlEscape(row.type)} <span class="muted" style="font-size:14px">· ${row.config==='multi'?'Multi-pilot':'Single-pilot'}</span></h2></div>
     <div class="recency-grid">${cell('Passenger / CAT — FCL.060(b)(1)',gen)}${cell('Night PIC — FCL.060(b)(2)',night)}</div>
     <div class="mini" style="margin-top:12px">${row.unverifiedFlights?
       row.unverifiedFlights+' flight(s) with up to '+row.unverifiedPotential+' unverified take-off/landing pairs are excluded from documented credit.':
       'No unverified take-off/landing pairs in this window.'}</div>
   </div>`;
 };
 app.innerHTML=header('Recency','FCL.060 · documented pilot-flying experience in the preceding 90 days',
    '<button class="btn" onclick="go(\'dashboard\')">← Dashboard</button>')+
   `<div class="card">
     <div class="head"><h2>Passenger-carrying and night recent experience</h2></div>
     <p>Calculation window: ${displayDate(window.HeliLogV233Recency.dateShift(asOf,-89))} to ${displayDate(asOf)} (90 calendar dates, UTC-stored flight dates).</p>
     <p class="mini">General: 3 take-offs, approaches and landings as pilot flying in 90 days, on the applicable type/class and pilot configuration. Night PIC: 1 night take-off, approach and landing as pilot flying in 90 days, or the IR alternative. HeliLog does not automatically assess the IR alternative, licence, operator approval, multi-type grouping, supervised 120-day CAT extension or FFS credit.</p>
     <p class="mini"><b>Documented is not a certification of legal currency.</b> Only explicitly confirmed complete PF sequences count. Ordinary landing counts, brought-forward totals and simulators without qualifying evidence do not count. Older archived flights are not automatically modified.</p>
     <p class="mini">Reference: EASA Part-FCL FCL.060(b)(1)–(2), (b)(5), (c). <a target="_blank" rel="noopener noreferrer" href="https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aircrew-regulation-eu-no-11782011">EASA Easy Access Rules for Aircrew</a>.</p>
   </div>
   ${rows.length?rows.map(renderOne).join(''):'<div class="card" style="margin-top:14px">No aircraft types available yet.</div>'}
   <div class="card" style="margin-top:14px"><h2>How to record qualifying events</h2><p>Open <b>Add Flight → Full details → More details → FCL.060 recency evidence</b>. Tick the pilot-flying confirmation and enter only complete take-off, approach and landing sequences. The counts cannot exceed the flight’s day/night take-off and landing numbers.</p><p class="mini">Specialised recency (NVIS, hoist, offshore and external-load operations) will follow in Phase 2.</p></div>`;
}
