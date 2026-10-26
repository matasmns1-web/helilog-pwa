/* HeliLog V2.33.1 — read-only automatic FCL.060 estimates.
 * "CAT" is not a flight classification: FCL.060 applies to passenger/CAT
 * operations, but qualifying prior PF movements may be private/training.
 */
function recencyCurrent(){
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function recencyRows(){return window.HeliLogV233Recency.groups(effectiveFlights(),S.aircraft,recencyCurrent());}
function recencyDaysTo(iso){
 if(!iso)return null;
 return Math.round((Date.parse(iso+'T00:00:00Z')-Date.parse(recencyCurrent()+'T00:00:00Z'))/86400000);
}
function recencyStatus(row,kind){
 const confirmed=kind==='night'?row.nightDocumented:row.generalDocumented;
 const threshold=kind==='night'?row.nightEstimated:row.generalEstimated;
 const count=kind==='night'?row.night:row.general;
 const target=kind==='night'?1:3;
 const change=kind==='night'?row.nextNightLoss:row.nextGeneralLoss;
 const days=recencyDaysTo(change);
 return {count,target,confirmed,threshold,change,days,
   text:confirmed?'Confirmed evidence':threshold?'Estimated from logbook':'Below threshold'};
}
function recencySummaryMarkup(){
 const data=recencyRows(),preferred=effectiveFlights().filter(f=>!isSimulatorSession(f)&&f.date<=recencyCurrent())
   .sort(compareFlightsNewest)[0];
 const main=data.find(x=>preferred&&x.type===window.HeliLogV233Recency.typeCode(preferred,S.aircraft)&&
   x.config===flightPilotConfig(preferred))||data[0];
 if(!main)return '';
 const gen=recencyStatus(main,'general'),night=recencyStatus(main,'night');
 const item=(label,v)=>`<div class="recency-mini"><div class="muted">${label}</div><b>${v.count}/${v.target}</b><span class="mini">${v.text}</span></div>`;
 return `<div class="card" style="margin-top:16px">
 <div class="head"><div><h2>Recent experience</h2><div class="muted">FCL.060 · ${htmlEscape(main.type)} · ${main.config==='multi'?'Multi-pilot':'Single-pilot'} · rolling 90 days</div></div><button class="btn" onclick="go('recency')">View recency</button></div>
 <div class="recency-mini-grid">${item('Passenger-carrying recency',gen)}${main.nightApplicable?item('Night PIC recency',night):''}</div>
 <div class="mini" style="margin-top:10px">${main.estimatedFlights?main.estimatedFlights+' single-pilot PIC/SOLO flight(s) estimated automatically. ':''}${main.unverifiedFlights?main.unverifiedFlights+' flight(s) require PF verification. ':''}Automatic movement pairs do not independently prove approaches or legal eligibility. The IR night alternative and operator requirements need separate checks.</div>
 </div>`;
}
function recency(){
 const rows=recencyRows(),asOf=recencyCurrent();
 const renderOne=row=>{
   const gen=recencyStatus(row,'general'),night=recencyStatus(row,'night');
   const cell=(title,v)=>`<div class="recency-panel">
     <b>${title}</b><div class="recency-count">${v.count}/${v.target}</div>
     <div class="mini">${v.text}</div>
     ${v.change?`<div class="mini">Next 90-day change: ${displayDate(v.change)}${v.days!==null&&v.days<=30?' ('+v.days+' days)':''}</div>`:''}
   </div>`;
   return `<div class="card" style="margin-top:14px">
     <div class="head"><h2>${htmlEscape(row.type)} <span class="muted" style="font-size:14px">· ${row.config==='multi'?'Multi-pilot':'Single-pilot'}</span></h2></div>
     <div class="recency-grid">${cell('Passenger-carrying — FCL.060(b)(1)',gen)}${row.nightApplicable?cell('Night PIC — FCL.060(b)(2)',night):''}</div>
     <div class="mini" style="margin-top:12px">${row.estimatedFlights?row.estimatedFlights+' single-pilot PIC/SOLO flight(s) automatically estimated from paired movements. ':''}${row.unverifiedFlights?
       row.unverifiedFlights+' flight(s) with up to '+row.unverifiedPotential+' unverified take-off/landing pairs require PF evidence.':
       'No additional unverified PF movement pairs in this 90-day window.'}</div>
   </div>`;
 };
 app.innerHTML=header('Recency','FCL.060 · automatic logbook estimates over the preceding 90 days',
    '<button class="btn" onclick="go(\'dashboard\')">← Dashboard</button>')+
   `<div class="card">
     <div class="head"><h2>Passenger-carrying recent experience</h2></div>
     <p>Calculation window: ${displayDate(window.HeliLogV233Recency.dateShift(asOf,-89))} to ${displayDate(asOf)} (90 calendar dates).</p>
     <p class="mini">FCL.060 requires 3 take-offs, approaches and landings as pilot flying for passenger-carrying or CAT operations, with an additional night PIC requirement of 1 night sequence or the IR alternative. <b>The flight earning this experience does not have to be CAT:</b> private and training flights can contribute when the movements qualify.</p>
     <p class="mini"><b>Automatic estimates are not certified recency.</b> Single-pilot PIC/SOLO flights use the lower of recorded take-offs and landings for each day/night category. HeliLog cannot verify each approach or PF from those totals; for DUAL, SPIC, PICUS or multi-pilot flights, manual qualifying PF evidence is required. Night recency only appears for types/configurations with recorded night operations, even if the most recent night movements are now older than 90 days.</p>
     <p class="mini">IR alternative, approved FFS credits, multi-type allowances, 120-day supervised CAT exceptions and licence/operator conditions are not automatically assessed. Recorded movements never overwrite your archived flights or signatures.</p>
     <p class="mini">Reference: <a target="_blank" rel="noopener noreferrer" href="https://www.easa.europa.eu/en/downloads/115485/en">EASA Easy Access Rules for Aircrew, FCL.060(b)</a>.</p>
   </div>
   ${rows.length?rows.map(renderOne).join(''):'<div class="card" style="margin-top:14px">No flights recorded yet. Recency is hidden until you have flying history.</div>'}
   <div class="card" style="margin-top:14px"><h2>How the automatic calculation works</h2>
   <p>For single-pilot PIC/SOLO flights, you only need the ordinary day/night take-off and landing counts. The estimate is calculated from your saved flights, including historical entries, without changing their records. To exclude a flight where you did not complete the approach or landings, edit an unsigned flight and tick <b>Exclude from automatic recency estimate</b> under Full details → More details. Archived records are not changed automatically.</p>
   <p class="mini">Other pilot functions or multi-pilot flying can still use optional explicit PF evidence. Phase 2 will cover specialised-operation recency separately.</p></div>`;
}
