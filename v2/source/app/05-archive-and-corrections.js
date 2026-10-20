function archivedBatches(){return S.printArchive?.batches||[]}
function archiveCorrections(data=S){
  return Array.isArray(data.printArchive?.corrections)?data.printArchive.corrections:[];
}
function confirmedCorrections(data=S){
  return archiveCorrections(data).filter(c=>c.confirmedAt);
}
function pendingCorrectionFor(id){
  return archiveCorrections().find(c=>c.flightId===id&&!c.confirmedAt);
}
function archiveBatchForFlight(id){
  const b=archivedBatches().find(x=>x.flightIds?.includes(id));
  if(!b)return null;
  const pos=b.flightIds.indexOf(id);
  return {batch:b,entry:pos+1,page:b.firstPage+Math.floor(pos/LOGBOOK_ROWS_PER_PAGE),row:(pos%LOGBOOK_ROWS_PER_PAGE)+1};
}
function effectiveFlight(f,data=S){
  if(!f)return f;
  const recent=confirmedCorrections(data).filter(c=>c.flightId===f.id).at(-1);
  return recent?recent.after:f;
}
function effectiveFlights(data=S){return data.flights.map(f=>effectiveFlight(f,data));}
function correctionFieldTotals(f,aircraftSnapshot){
  return sumLogbookFields([f],aircraftSnapshot);
}
function correctionDelta(c,aircraftSnapshot=S.aircraft){
  const before=correctionFieldTotals(c.before,aircraftSnapshot);
  const after=correctionFieldTotals(c.after,aircraftSnapshot);
  const result={};
  for(const k of Object.keys(before))result[k]=(after[k]||0)-(before[k]||0);
  return result;
}
function sumCorrectionDeltas(items,aircraftSnapshot=S.aircraft){
  const out={};
  for(const c of items){
    const delta=correctionDelta(c,aircraftSnapshot);
    for(const [k,v] of Object.entries(delta))out[k]=(out[k]||0)+v;
  }
  return out;
}
function signedHours(n){
  return (n<0?'−':n>0?'+':'')+fmt(Math.abs(n));
}
function unappliedCorrections(batches=archivedBatches()){
  const applied=new Set(batches.flatMap(b=>b.correctionsApplied||[]));
  return confirmedCorrections().filter(c=>!applied.has(c.id));
}
function correctionDifferences(before,after){
  const fields=isSimulatorSession(before)?
    ['date','simCategory','simDevice','simQualification','stdMin','remarks']:
    ['date','aid','dep','off','arr','on','mins','role','picName','pilotConfig','nightMin','ifrMin',
     'takeoffDay','takeoffNight','landingDay','landingNight','instrMin','crossCountry','remarks','specialOps'];
  const labels={
    date:'Date',aid:'Aircraft',dep:'Departure',off:'Departure time',arr:'Arrival',on:'Arrival time',
    mins:'Flight time',role:'Pilot function',picName:'PIC name',pilotConfig:'Pilot configuration',
    nightMin:'Night time',ifrMin:'IFR time',takeoffDay:'Day take-offs',takeoffNight:'Night take-offs',
    landingDay:'Day landings',landingNight:'Night landings',instrMin:'Instructor time',
    crossCountry:'Cross-country',remarks:'Remarks',specialOps:'Specialised operations',
    simCategory:'Simulator category',simDevice:'Simulator type',
    simQualification:'Device qualification',stdMin:'Simulator session time'
  };
  const timeFields=new Set(['mins','nightMin','ifrMin','instrMin','stdMin']);
  const value=(record,k)=>{
    if(k==='date')return formatDate(record[k]||'');
    if(k==='specialOps')return Object.entries(record[k]||{}).map(([x,n])=>x+' '+fmt(n)).join(', ')||'None';
    if(timeFields.has(k))return fmt(record[k]||0);
    if(k==='crossCountry')return record[k]?'Yes':'No';
    return String(record[k]??'');
  };
  const canonical=(f,k)=>k==='specialOps'?JSON.stringify(Object.entries(f[k]||{}).sort((a,b)=>a[0].localeCompare(b[0]))):JSON.stringify(f[k]??null);
  return fields.filter(k=>canonical(before,k)!==canonical(after,k))
    .map(k=>({key:k,label:labels[k]||k,before:value(before,k),after:value(after,k)}));
}
function correctionHistoryMarkup(id){
  if(!isArchivedFlight(id))return '';
  const source=archiveBatchForFlight(id);
  const arr=archiveCorrections().filter(c=>c.flightId===id);
  return `<div class="card" style="margin-top:16px">
    <div class="head"><h2>Signed print archive & corrections</h2></div>
    <p>Original: <b>${htmlEscape(source?.batch.id||'—')} · Page ${source?.page||'—'} · Row ${source?.row||'—'}</b></p>
    <p class="muted">The original signed page remains immutable. A corrected version takes effect only after its separate addendum is confirmed printed and signed.</p>
    <button class="btn primary" onclick="startArchivedCorrection('${id}')">
      ${pendingCorrectionFor(id)?'Review pending correction':'Propose a correction'}</button>
    ${arr.map(c=>`<div style="border-top:1px solid var(--line);padding:10px 0;margin-top:10px">
      <b>${htmlEscape(c.id)}</b> · ${c.confirmedAt?'Confirmed '+htmlEscape(formatDateTime(c.confirmedAt)):'Pending printed addendum'}
      <div class="mini">${htmlEscape(c.reason)}</div>
      ${isInstalledTouchApp()?'<div class="mini">Open HeliLog in a web browser to print and confirm.</div>':`<button class="btn" onclick="printCorrectionAddendum('${c.id}')">Print/reprint addendum</button>`}
    </div>`).join('')}
  </div>`;
}
function startArchivedCorrection(id){
  if(!isArchivedFlight(id))return;
  if(pendingCorrectionFor(id)){
    if(isInstalledTouchApp()){
      alert('Your correction proposal is saved. It will synchronize when connected; use the web browser to print, sign and confirm it.');
      return;
    }
    go('printarchive');return;
  }
  correctingArchivedId=id;
  const f=effectiveFlight(S.flights.find(x=>x.id===id));
  if(isSimulatorSession(f))addSimulator(id);
  else add(id);
}
function recordArchiveCorrection(id,after,reason){
  if(!isArchivedFlight(id)||correctingArchivedId!==id)
    return showFormError('The entry is not in correction mode.');
  if(pendingCorrectionFor(id))return showFormError('An unconfirmed correction already exists for this entry.');
  const source=archiveBatchForFlight(id);
  if(!source)return showFormError('Original archive entry could not be found.');
  const before=JSON.parse(JSON.stringify(effectiveFlight(S.flights.find(x=>x.id===id))));
  const proposed=JSON.parse(JSON.stringify(after));
  const changes=correctionDifferences(before,proposed);
  if(!changes.length)return showFormError('No values were changed.');
  if(!String(reason||'').trim())return showFormError('Please explain the reason for the correction.');
  const item={
    id:'COR-'+Date.now()+'-'+Math.random().toString(36).slice(2,6).toUpperCase(),
    flightId:id,sourceBatch:source.batch.id,sourcePage:source.page,sourceRow:source.row,
    pilot:JSON.parse(JSON.stringify(source.batch.pilot||{name:S.pilot.name||''})),
    before,after:proposed,reason:String(reason).trim(),createdAt:new Date().toISOString(),confirmedAt:''
  };
  S.printArchive.corrections.push(item);
  if(!save()){S.printArchive.corrections.pop();return;}
  correctingArchivedId=null;editingFlightId=null;clearFlightFormGuard();
  if(isInstalledTouchApp()){
    flight(id);
    alert('Correction proposal saved. It will sync to the web when this device is connected. The signed original is unchanged; print and confirm the addendum on the website.');
  }else go('printarchive');
}
function archivedFlightIds(){
  return new Set(archivedBatches().flatMap(b=>Array.isArray(b.flightIds)?b.flightIds:[]));
}
function isArchivedFlight(id){return archivedFlightIds().has(id)}
function archivedFlightIdsForAircraft(aid){
  return archivedBatches().some(b=>Array.isArray(b.flights)&&b.flights.some(f=>f.aid===aid));
}
// Recover the new independent engine/pilot totals when a new-layout
// archive follows a batch signed in the historical three-column format.
// The old signed closing totals remain authoritative for existing fields.
function newLayoutOpeningFromHistory(previous,batches){
  const base=previous?JSON.parse(JSON.stringify(previous.closingTotals)):broughtForwardExportTotals();
  if(!previous||['single','engineSE','engineME'].every(k=>Number.isFinite(base[k])))return base;
  let computed=broughtForwardExportTotals();
  for(const batch of batches){
    computed=addExportTotals(computed,sumLogbookFields(batch.flights||[],batch.aircraft||S.aircraft));
    const applied=archiveCorrections().filter(c=>(batch.correctionsApplied||[]).includes(c.id)&&c.confirmedAt);
    computed=addExportTotals(computed,sumCorrectionDeltas(applied));
  }
  for(const field of ['single','engineSE','engineME']){
    if(!Number.isFinite(base[field]))base[field]=computed[field]||0;
  }
  return base;
}
function previousEngineUnallocated(){
  const b=S.broughtForward||{};
  const se=Number(b.engineSE??b.spSE??0);
  const me=Number(b.engineME??b.spME??0);
  return Math.max(0,Number(b.total||0)-se-me);
}
function previousPilotUnallocated(){
  const b=S.broughtForward||{};
  const single=Number(b.single??(Number(b.spSE||0)+Number(b.spME||0)));
  return Math.max(0,Number(b.total||0)-single-Number(b.multi||0));
}
function nextArchiveDraft(){
  const batches=archivedBatches();
  const previous=batches[batches.length-1];
  const stored=archivedFlightIds();
  const pendingFlights=S.flights.filter(f=>!stored.has(f.id)).sort(compareFlightsOldest);
  const availablePages=Math.ceil(pendingFlights.length/LOGBOOK_ROWS_PER_PAGE);
  const selectedPages=selectedArchivePageCount===null
    ? availablePages
    : Math.min(availablePages,Math.max(1,selectedArchivePageCount));
  const flights=pendingFlights.slice(0,selectedPages*LOGBOOK_ROWS_PER_PAGE)
    .map(f=>JSON.parse(JSON.stringify(f)));
  const firstPage=previous?previous.firstPage+previous.pageCount:S.printArchive.firstPage;
  const seq=previous?previous.seq+1:1;
  const lastDate=previous?.lastFlightDate||'';
  const lateFlights=lastDate?flights.filter(f=>String(f.date||'')<lastDate):[];
  const ambiguousSimulatorDays=new Set(flights.filter(isSimulatorSession)
    .filter(f=>flights.some(other=>!isSimulatorSession(other)&&other.date===f.date))
    .map(f=>f.date)).size;
  const aircraft=JSON.parse(JSON.stringify(S.aircraft));
  const pendingCorrections=unappliedCorrections(batches);
  const openingCorrectionsDelta=sumCorrectionDeltas(pendingCorrections);
  const baseOpening=newLayoutOpeningFromHistory(previous,batches);
  const openingTotals=addExportTotals(baseOpening,openingCorrectionsDelta);
  const pageCount=Math.ceil(flights.length/LOGBOOK_ROWS_PER_PAGE);
  const flightTotals=sumLogbookFields(flights,aircraft);
  const closingTotals=addExportTotals(openingTotals,flightTotals);
  const pilot={name:S.pilot.name||'',licence:pilotLicenceDisplay(),authority:S.pilot.authority||''};
  return {
    id:'HL-'+String(seq).padStart(3,'0'),seq,
    paperLayoutVersion:2,
    paperFooterVersion:2, // V1.43.2: no engine/pilot summary footer on new pages
    unclassifiedPriorEngineMinutes:previousEngineUnallocated(),
    unclassifiedPriorPilotMinutes:previousPilotUnallocated(),
    firstPage,pageCount,flightIds:flights.map(f=>f.id),flights,aircraft,pilot,
    availablePages,totalUnarchived:pendingFlights.length,remainingFlights:pendingFlights.length-flights.length,
    unusedRowsBlocked:true,
    correctionsApplied:pendingCorrections.map(c=>c.id),
    openingCorrectionsDelta,
    openingTotals,flightTotals,closingTotals,
    paperReference:S.printArchive.paperReference,
    lastFlightDate:flights.length?flights[flights.length-1].date:lastDate,
    lateCount:lateFlights.length,
    ambiguousSimulatorDays,
    demoCount:flights.filter(isUnchangedDemoFlight).length
  };
}
function setArchivePageCount(value){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1)return;
  selectedArchivePageCount=n;
  pendingArchivePreview=null; // A preview must match exactly the selected flight set.
  printarchive();
}
function archiveRange(d){
  return d.pageCount>1?'Pages '+d.firstPage+'–'+(d.firstPage+d.pageCount-1):'Page '+d.firstPage;
}
function archiveSummaryMarkup(d){
  return `<div class="grid stats">
    <div class="card"><div class="label">Batch</div><div class="big" style="font-size:20px">${htmlEscape(d.id)}</div></div>
    <div class="card"><div class="label">Next page</div><div class="big">${d.firstPage}</div></div>
    <div class="card"><div class="label">New entries</div><div class="big">${d.flights.length}</div></div>
    <div class="card"><div class="label">Pages to print</div><div class="big">${d.pageCount}</div></div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card">
      <h3 style="margin-top:0">Running totals</h3>
      <p>Previous pages <span style="float:right"><b>${fmt(d.openingTotals.total)}</b></span></p>
      <p>This batch <span style="float:right"><b>${fmt(d.flightTotals.total)}</b></span></p>
      <p>Simulator in this batch <span style="float:right"><b>${fmt(d.flightTotals.std)}</b></span></p>
      <p>Closing total <span style="float:right"><b>${fmt(d.closingTotals.total)}</b></span></p>
      <div class="mini">PIC ${fmt(d.closingTotals.pic)} · Dual ${fmt(d.closingTotals.dual)} · Night ${fmt(d.closingTotals.night)} · IFR ${fmt(d.closingTotals.ifr)}</div>
      <div class="mini">SE ${fmt(d.closingTotals.engineSE)} · ME ${fmt(d.closingTotals.engineME)} · Single-pilot ${fmt(d.closingTotals.single)} · Multi-pilot ${fmt(d.closingTotals.multi)}</div>
      ${d.correctionsApplied?.length?`<div class="note">Signed correction addenda carried into this batch: ${htmlEscape(d.correctionsApplied.join(', '))}; flight-time adjustment ${signedHours(d.openingCorrectionsDelta?.total||0)}. Original earlier pages remain unchanged.</div>`:''}
    </div>
    <div class="card">
      <h3 style="margin-top:0">Paper logbook continuity</h3>
      <p>Starting page <b>${d.firstPage}</b> · ${htmlEscape(archiveRange(d))}</p>
      ${!archivedBatches().length&&d.paperReference?'<p>Previous handwritten logbook: '+htmlEscape(d.paperReference)+'</p>':''}
      <div class="mini">Each printed page has individual totals, carried-forward totals and a signature area.</div>
    </div>
  </div>`;
}
function saveArchiveSetup(){
  if(isInstalledTouchApp())return;
  if(archivedBatches().length){alert('The archive already has signed batches; page numbering and opening references are locked.');return;}
  const page=Number(document.getElementById('archiveFirstPage')?.value);
  if(!Number.isSafeInteger(page)||page<1||page>99999){
    alert('Enter a valid positive first page number.');return;
  }
  S.printArchive.firstPage=page;
  S.printArchive.paperReference=String(document.getElementById('archivePaperRef')?.value||'').trim().slice(0,120);
  pendingArchivePreview=null;
  save();
  printarchive();
}
function previewNextArchive(){
  if(isInstalledTouchApp())return;
  const draft=nextArchiveDraft();
  if(!draft.flights.length){alert('There are no new flights to archive.');return;}
  // Preview opens a printable PDF. This DOES NOT mark any flight as printed.
  const opened=exportPrintableLogbook({
    flights:draft.flights,openingTotals:draft.openingTotals,firstPage:draft.firstPage,
    archiveBatch:draft.id,aircraft:draft.aircraft,pilot:draft.pilot,
    blockUnusedRows:draft.unusedRowsBlocked,
    correctionsApplied:draft.correctionsApplied,
    openingCorrectionsDelta:draft.openingCorrectionsDelta,
    paperLayoutVersion:draft.paperLayoutVersion,
    paperFooterVersion:draft.paperFooterVersion,
    unclassifiedPriorEngineMinutes:draft.unclassifiedPriorEngineMinutes,
    unclassifiedPriorPilotMinutes:draft.unclassifiedPriorPilotMinutes
  });
  if(opened){
    pendingArchivePreview=JSON.stringify(draft);
    printarchive();
    const msg=document.getElementById('archivePreviewStatus');
    if(msg)msg.innerHTML='<div class="successbox">PDF preview opened. Print it, check every page and sign it. Only then confirm the printed batch below.</div>';
  }
}
async function confirmPrintedArchive(){
  if(isInstalledTouchApp())return;
  if(!pendingArchivePreview){
    alert('Preview and print the new pages first. Nothing has been archived yet.');return;
  }
  const draft=nextArchiveDraft();
  if(JSON.stringify(draft)!==pendingArchivePreview){
    pendingArchivePreview=null;
    alert('Flights, aircraft or opening balances changed since the preview. Generate a new print preview before confirming.');
    printarchive();
    return;
  }
  if(!draft.flights.length)return;
  const pendingCorrections=archiveCorrections().filter(c=>!c.confirmedAt);
  if(pendingCorrections.length){
    alert('There are '+pendingCorrections.length+' unsigned archive correction addendum(s). Confirm them after printing and signing, or discard the pending proposals, before confirming another paper logbook batch.');
    printarchive();
    return;
  }
  if(draft.demoCount){
    alert('This batch still includes '+draft.demoCount+' unchanged demonstration flight(s). Remove them from your logbook before confirming an official signed paper archive.');
    return;
  }
  const lateNotice=draft.lateCount
    ? '\nWARNING: '+draft.lateCount+' new flight(s) have dates before the previous archived batch. Verify their placement and annotate them as late entries.\n'
    : '';
  const agree=confirm(
    'Confirm '+draft.id+' — '+archiveRange(draft)+'?\n\n'+
    draft.flights.length+' entries · '+fmt(draft.flightTotals.total)+' actual flight time · '+
    fmt(draft.flightTotals.std)+' simulator/STD time\n'+
    'Opening '+fmt(draft.openingTotals.total)+' → Closing '+fmt(draft.closingTotals.total)+
    lateNotice+'\nOnly confirm if you have printed, checked and signed the pages. Archived flights will become read-only. This action cannot be undone within HeliLog.'
  );
  if(!agree)return;
  const finalBatch=JSON.parse(JSON.stringify(draft));
  finalBatch.confirmedAt=new Date().toISOString();
  if(v23AccountWorkspace()){
   try{await window.HeliLogV24Archive.confirmBatch('flight',finalBatch,finalBatch.flightIds);}
   catch(err){alert('Printed pages were NOT marked archived: '+(err.message||err)+'. Check Cloud account before retrying.');return;}
  }
  S.printArchive.batches.push(finalBatch);
  // Archive records are more sensitive than ordinary UI changes. Confirm that
  // the browser actually persisted them; never report success after a quota failure.
  try{
    localStorage.setItem(KEY,JSON.stringify(S));
    const stored=JSON.parse(localStorage.getItem(KEY)||'{}');
    const confirmed=stored.printArchive?.batches?.at(-1);
    if(!confirmed || confirmed.id!==finalBatch.id || confirmed.confirmedAt!==finalBatch.confirmedAt){
      throw new Error('The saved archive could not be verified.');
    }
  }catch(e){
    S.printArchive.batches.pop();
    alert('Could not save the confirmed print archive. Your pages have NOT been marked archived. Export a full backup and check available browser storage before trying again. '+String(e.message||e));
    return;
  }
  pendingArchivePreview=null;
  selectedArchivePageCount=null; // next batch defaults to all remaining pages
  printarchive();
}
function reprintArchiveBatch(seq){
  const b=archivedBatches().find(x=>x.seq===seq);
  if(!b)return;
  exportPrintableLogbook({
    flights:b.flights,aircraft:b.aircraft,pilot:b.pilot,
    openingTotals:b.openingTotals,firstPage:b.firstPage,archiveBatch:b.id,
    blockUnusedRows:b.unusedRowsBlocked===true,
    correctionsApplied:b.correctionsApplied||[],
    openingCorrectionsDelta:b.openingCorrectionsDelta||{},
    paperLayoutVersion:b.paperLayoutVersion===2?2:1,
    // Batches printed on V1.43.1 reprint with their original summary footer.
    showEngineTotalsFooter:b.paperLayoutVersion===2 && b.paperFooterVersion!==2,
    unclassifiedPriorEngineMinutes:b.unclassifiedPriorEngineMinutes||0,
    unclassifiedPriorPilotMinutes:b.unclassifiedPriorPilotMinutes||0
  });
}

let pendingCorrectionPrint=null;
function printCorrectionAddendum(id){
  if(isInstalledTouchApp()){
    alert('Print and sign correction addenda from the HeliLog web browser. The app can save and synchronize proposals.');
    return;
  }
  const c=archiveCorrections().find(x=>x.id===id);
  if(!c)return;
  const edits=correctionDifferences(c.before,c.after);
  const delta=correctionDelta(c);
  const rows=edits.map(x=>`<tr><td>${htmlEscape(x.label)}</td><td>${htmlEscape(x.before)||'—'}</td><td>${htmlEscape(x.after)||'—'}</td></tr>`).join('');
  const categories=[
    ['Actual flight time','total'],['PIC','pic'],['Co-pilot','copilot'],['Dual','dual'],
    ['Single-pilot SE','spSE'],['Single-pilot ME','spME'],['Multi-pilot','multi'],
    ['Night','night'],['IFR','ifr'],['Instructor','instructor'],['Simulator','std'],
    ['Take-offs day','toDay'],['Take-offs night','toNight'],
    ['Landings day','ldgDay'],['Landings night','ldgNight']
  ];
  const deltaRows=categories.filter(([,k])=>delta[k])
    .map(([name,k])=>`<tr><td>${htmlEscape(name)}</td><td>${k.startsWith('to')||k.startsWith('ldg')?(delta[k]>0?'+':'')+delta[k]:signedHours(delta[k])}</td></tr>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>HeliLog ${htmlEscape(c.id)} correction addendum</title>
  <style>@page{size:A4 portrait;margin:15mm}
  body{font:12px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:0}
  h1{font-size:21px;margin-bottom:3px}h2{font-size:15px;margin-top:22px}
  .small{font-size:10px;color:#555}table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid #999;padding:6px 9px;text-align:left;vertical-align:top}
  th{background:#eee}td{overflow-wrap:anywhere}.alert{border:2px solid #222;padding:10px;margin:18px 0}
  .signature{margin-top:40px;display:flex;gap:25px}.signature>div{flex:1;border-top:1px solid #333;padding-top:4px}
  .toolbar{padding:8px;margin-bottom:15px;background:#eee}
  @media print{.toolbar{display:none}body{margin:0}}
  </style></head><body>
  <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
  <h1>${TEST_MODE?'TEST ONLY — ':''}HeliLog Correction Addendum</h1>
  <div class="small">Append-only amendment record, NOT a replacement of the original signed page</div>
  <div class="alert"><b>Correction ID:</b> ${htmlEscape(c.id)}<br>
    <b>Original source:</b> ${htmlEscape(c.sourceBatch)} — Page ${c.sourcePage}, row ${c.sourceRow}<br>
    <b>Flight/session ID:</b> ${htmlEscape(c.flightId)}<br>
    <b>Created:</b> ${htmlEscape(formatDateTime(c.createdAt))}<br>
    <b>Document:</b> Correction addendum to be signed and retained<br>
    <b>Pilot:</b> ${htmlEscape(c.pilot?.name||'')}
  </div>
  <h2>Reason for correction</h2><p>${htmlEscape(c.reason)}</p>
  <h2>Original versus revised entry</h2>
  <table><thead><tr><th>Field</th><th>As originally recorded</th><th>Revised value</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <h2>Change in cumulative totals</h2>
  ${deltaRows?`<table><thead><tr><th>Category</th><th>Adjustment</th></tr></thead><tbody>${deltaRows}</tbody></table>`:
  '<p>No change to numerical totals.</p>'}
  <p class="small">Retain this signed addendum with the original archived page. Corrections are carried into the next newly printed logbook batch without altering earlier signed totals or page numbers. Authority-specific amendment acceptance has not been verified.</p>
  ${TEST_MODE?'<p><b>TEST MODE — FICTIONAL DATA. NOT AN OFFICIAL LOGBOOK RECORD.</b></p>':''}
  <div class="signature"><div>Pilot signature</div><div>Date (DD-MM-YYYY)</div></div>
  </body></html>`;
  const w=window.open('','_blank');
  if(!w){alert('Your browser blocked the correction print preview. Allow pop-ups for HeliLog, then retry.');return;}
  w.document.open();w.document.write(html);w.document.close();w.focus();
  pendingCorrectionPrint=JSON.stringify(c);
  printarchive();
}
let correctionConfirmationBusy=false;
async function confirmCorrectionAddendum(id){
  if(correctionConfirmationBusy)return;
  if(isInstalledTouchApp()){
    alert('Only the web browser can confirm a printed and signed correction addendum.');
    return;
  }
  const c=archiveCorrections().find(x=>x.id===id);
  if(!c||c.confirmedAt)return;
  const preview=JSON.stringify(c);
  if(pendingCorrectionPrint!==preview){
    alert('Preview the current correction addendum first, then check and sign it.');return;
  }
  if(!confirm('Confirm that correction '+c.id+' was PRINTED, CHECKED and SIGNED?\n\n'+
    'The original signed archive page will remain unchanged.\n'+
    'The revised entry will affect electronic totals and future paper carried-forward totals.\n'+
    'Confirmed corrections cannot be edited or deleted in HeliLog.'))return;
  // Build the signed addendum separately: NEVER mark the local draft confirmed
  // before the owner-verified cloud archive RPC has acknowledged it. Otherwise
  // a concurrent archive refresh sees an unconfirmed cloud addendum and blocks.
  const signed={...JSON.parse(preview),confirmedAt:new Date().toISOString()};
  const cloudAccount=v23AccountWorkspace();
  correctionConfirmationBusy=true;
  let cloudAcknowledged=false;
  try{
    if(cloudAccount){
      // Also clears an old temporary "unsynchronized correction" warning from
      // the previous confirmation-order bug, but does not mask real errors.
      const refreshed=await window.HeliLogV24Archive.refresh(()=>S,v24CommitArchiveRefresh);
      if(!refreshed)throw Error(window.HeliLogV24Archive.error()||
        'Could not refresh cloud archive history. The proposal remains pending.');
      const current=archiveCorrections().find(x=>x.id===id);
      if(!current||current.confirmedAt||JSON.stringify(current)!==preview)
        throw Error('Correction changed during cloud refresh. Preview and sign the current proposal again.');
      await window.HeliLogV24Archive.confirmAddendum('flight',signed.flightId,signed);
      cloudAcknowledged=true;
    }
    // A concurrent protected cloud pull may have imported this confirmed
    // addendum already. Apply the confirmed timestamp to a new workspace
    // snapshot, rather than mutating S while network operations are in flight.
    const next=JSON.parse(JSON.stringify(S));
    const saved=next.printArchive?.corrections?.find(x=>x.id===id);
    if(!saved)throw Error('The cloud confirmed the addendum, but this browser no longer has its matching correction.');
    const stable=value=>JSON.stringify((function sort(x){
      if(Array.isArray(x))return x.map(sort);
      if(x&&typeof x==='object'){
        const out={};for(const k of Object.keys(x).sort())out[k]=sort(x[k]);return out;
      }
      return x;
    })(value));
    if(saved.confirmedAt&&stable(saved)!==stable(signed))
      throw Error('The cloud confirmed the addendum, but the local confirmed copy differs. Do not retry.');
    if(!saved.confirmedAt){
      if(JSON.stringify(saved)!==preview)
        throw Error('The cloud confirmed the addendum, but the local draft changed. Preserve both copies.');
      saved.confirmedAt=signed.confirmedAt;
    }
    verifiedEnvironmentWrite(KEY,next);
    S=next;
    pendingCorrectionPrint=null;
    pendingArchivePreview=null;
    selectedArchivePageCount=null;
    printarchive();
  }catch(e){
    if(cloudAcknowledged){
      // The cloud is now authoritative. Do not revert or suggest retrying
      // confirmation: that could create a duplicate signed addendum.
      alert('Cloud confirmed the signed correction, but this browser could not finish updating its local copy: '+
        String(e.message||e)+'. Do NOT confirm it again. Keep this device data; reconnect or reopen HeliLog to retrieve the signed addendum.');
    }else{
      alert('Correction was not archived in the cloud: '+String(e.message||e)+
        '. The proposal remains pending. Do not clear stored data.');
    }
  }finally{
    correctionConfirmationBusy=false;
  }
}
function discardPendingCorrection(id){
  const list=archiveCorrections();
  const index=list.findIndex(x=>x.id===id&&!x.confirmedAt);
  if(index<0)return;
  if(!confirm('Discard pending correction '+id+'? The original archived flight remains unchanged.'))return;
  const item=list.splice(index,1)[0];
  if(!save()){list.splice(index,0,item);return;}
  pendingCorrectionPrint=null;printarchive();
}
function printarchive(){
  if(v23PreventUnsupportedArchive())return;
  if(isStandaloneApp()){go('dashboard');return;}
  const batches=archivedBatches();
  const draft=nextArchiveDraft();
  const previewReady=!!pendingArchivePreview && pendingArchivePreview===JSON.stringify(draft);
  const canPrint=draft.flights.length>0;
  const first=!batches.length;
  app.innerHTML=header('Print logbook & archive',
    'Continuous numbered A4 pages with cumulative totals and a permanent printing history.',
    `<button class="btn" onclick="go('logbook')">← Logbook</button>`)+
    `<div class="card" style="margin-bottom:16px"><div class="head"><h2>Endorsement print archive — V2</h2></div><p class="mini">Print and permanently archive instructor/examiner endorsements on separately numbered pages. Corrections use signed addenda.</p><button class="btn primary" onclick="go('endorsementarchive')">Open endorsement archive</button></div>`+
    `<div class="card" style="margin-bottom:16px">
      <div class="head"><h2>Archive settings</h2></div>
      ${first?`<div class="formgrid">
        <div class="field"><label>First HeliLog printed page</label>
          <input id="archiveFirstPage" type="number" min="1" max="99999" value="${S.printArchive.firstPage}">
        </div>
        <div class="field"><label>Previous paper logbook reference (optional)</label>
          <input id="archivePaperRef" maxlength="120" placeholder="Original paper logbook, final page 42"
            value="${htmlEscape(S.printArchive.paperReference)}">
        </div>
      </div>
      <button class="btn" style="margin-top:10px" onclick="saveArchiveSetup()">Save setup</button>`
      :`<div class="muted">The page sequence is locked after the first confirmed batch. The last archived page is
         <b>${batches[batches.length-1].firstPage+batches[batches.length-1].pageCount-1}</b>.
         ${S.printArchive.paperReference?'Original paper logbook: '+htmlEscape(S.printArchive.paperReference):''}</div>`}
      <div class="mini" style="margin-top:10px">By default, HeliLog starts a new printed volume at Page 1 and carries forward the imported totals from your earlier paper logbook. Keep the original handwritten logbook. Print archives and confirmation records live in this browser and are included in Full Backup.</div>
    </div>
    ${archiveSummaryMarkup(draft)}
    ${canPrint?`<div class="card" style="margin-top:14px">
      <div class="head"><h2>Pages to print now</h2></div>
      <div class="field" style="max-width:330px">
        <label>Number of pages</label>
        <select id="archivePageCount" onchange="setArchivePageCount(this.value)">
          ${Array.from({length:draft.availablePages},(_,i)=>{
            const pages=i+1;
            return `<option value="${pages}"${pages===draft.pageCount?' selected':''}>${pages} ${pages===1?'page':'pages'}</option>`;
          }).join('')}
        </select>
      </div>
      <p class="mini" style="margin-top:10px">
        ${draft.flights.length} of ${draft.totalUnarchived} unarchived logbook entries will be printed in chronological order.
        ${draft.remainingFlights?`The remaining <b>${draft.remainingFlights}</b> flight${draft.remainingFlights===1?'':'s'} will stay unarchived for your next printing batch.`:'All pending flights are included.'}
        You can also print a partly filled final page; any unused rows will be crossed out with dashes and marked UNUSED.
      </p>
    </div>`:''}
    ${draft.demoCount?`<div class="note" style="margin-top:14px;border-color:#b42318">
       <b>Example flights detected:</b> ${draft.demoCount} unchanged demonstration entries are present in this print batch.
       Do not sign these as genuine flight records. You may preview the layout, but archive confirmation is blocked until they are removed.
       <div style="margin-top:10px"><button class="btn" onclick="removeUnchangedDemoFlights()">Remove unchanged demo flights</button></div>
     </div>`:''}
    ${archiveCorrections().some(c=>!c.confirmedAt)?`<div class="note" style="margin-top:14px;border-color:#dd9b2b">
      <b>Unresolved archive correction:</b> Confirm or discard each pending correction addendum before signing a new print batch. Printing previews is still possible.
    </div>`:''}
    ${draft.lateCount?`<div class="note" style="margin-top:14px;border-color:#dd9b2b"><b>Late entries:</b> ${draft.lateCount} unarchived flight(s) are older than the last archived flight. They will appear in this later batch, not between already signed pages. Check and annotate them before printing.</div>`:''}
    ${draft.ambiguousSimulatorDays?`<div class="note" style="margin-top:14px"><b>Same-date simulator sessions:</b> ${draft.ambiguousSimulatorDays} day(s) include both simulator and flight entries. Simulator sessions have no recorded start time and are placed after timed flights on the same date. Please review the entry order before confirming these paper pages.</div>`:''}
    <div class="card" style="margin-top:16px">
      <div class="head"><h2>Next print batch</h2></div>
      ${canPrint?
        `<p class="muted">1. Preview and print the A4 landscape pages. 2. Check totals and sign them. 3. Confirm the printed batch to lock the records.</p>
         <div style="display:flex;flex-wrap:wrap;gap:9px">
           <button class="btn primary" onclick="previewNextArchive()">Preview / Print pages</button>
           <button class="btn" ${previewReady?'':'disabled'} onclick="confirmPrintedArchive()">Confirm printed & signed</button>
         </div>`:
        '<p class="muted">All current flights have been archived. New flights will appear here automatically.</p>'}
      <div id="archivePreviewStatus" style="margin-top:10px"></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="head"><h2>Archived-entry correction addenda</h2></div>
      <p class="mini">Original pages remain unaltered. Proposed corrections do not affect totals until the addendum is printed, checked, signed and confirmed here.</p>
      ${archiveCorrections().length?[...archiveCorrections()].reverse().map(c=>{
        const d=correctionDelta(c);
        const ready=pendingCorrectionPrint===JSON.stringify(c);
        return `<div style="border-top:1px solid var(--line);padding:12px 0">
          <div><b>${htmlEscape(c.id)}</b> — ${htmlEscape(c.sourceBatch)} · Page ${c.sourcePage}, row ${c.sourceRow}</div>
          <div class="mini">${htmlEscape(c.reason)} · ${c.confirmedAt?'Confirmed '+htmlEscape(formatDateTime(c.confirmedAt)):'PENDING'} · Flight time ${signedHours(d.total||0)} · Simulator ${signedHours(d.std||0)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
            <button class="btn" onclick="printCorrectionAddendum('${c.id}')">${c.confirmedAt?'Reprint exact addendum':'Preview / Print addendum'}</button>
            ${!c.confirmedAt?`<button class="btn primary" ${ready?'':'disabled'} onclick="confirmCorrectionAddendum('${c.id}')">Confirm printed & signed</button>
            <button class="btn dangerbtn" onclick="discardPendingCorrection('${c.id}')">Discard proposal</button>`:''}
            <button class="btn" onclick="flight('${c.flightId}')">View entry</button>
          </div>
        </div>`;
      }).join(''):'<div class="muted">No corrections recorded. Open an archived flight or simulator session to propose a correction.</div>'}
      ${unappliedCorrections().length?`<div class="note">There are ${unappliedCorrections().length} confirmed correction(s) not yet carried into a new printed batch. The next batch will show their adjustments. Keep the signed addenda with the paper logbook.</div>`:''}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="head"><h2>Confirmed print history</h2></div>
      ${batches.length?[...batches].reverse().map(b=>`
        <div class="archive-entry" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--line);padding:12px 0">
          <div><b>${htmlEscape(b.id)} · ${htmlEscape(archiveRange(b))}</b>
            <div class="mini">${b.flightIds.length} entries · Printed ${formatDateTime(b.confirmedAt)} · Flight time ${fmt(b.closingTotals.total)} · STD ${fmt(b.closingTotals.std)}</div>
            <div class="mini">Opening ${fmt(b.openingTotals.total)} · This batch ${fmt(b.flightTotals.total)}</div>
          </div>
          <button class="btn" onclick="reprintArchiveBatch(${b.seq})">Reprint exact batch</button>
        </div>`).join(''):
        '<p class="muted">No confirmed batches yet. Previewing or saving a PDF does not mark flights as archived.</p>'}
    </div>
    <div class="note" style="margin-top:16px"><b>Important:</b> This is a local record of manually confirmed paper printouts, not proof that a printer completed a job or that the CAA approved the logbook. Keep the signed pages and full JSON backups. Confirm acceptance and countersignature requirements with your licensing authority. V1.43 corrections use a separate signed addendum; the original print batch is immutable. This does not certify compliance with your aviation authority's correction procedures.</div>`;
}

