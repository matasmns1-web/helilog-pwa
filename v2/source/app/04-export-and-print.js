function openExportModal(){
  let scope=document.getElementById('exportScope');
  if(scope) scope.value='filtered';
  document.getElementById('exportModal').classList.add('open');
  refreshExportSummary();
}
function closeExportModal(){
  document.getElementById('exportModal').classList.remove('open');
}

function exportFlightsForScope(){
  let scope=document.getElementById('exportScope')?.value||'filtered';
  if(scope==='all') return effectiveFlights().sort(compareFlightsNewest);
  return getFilteredFlights().sort(compareFlightsNewest);
}

function refreshExportSummary(){
  let box=document.getElementById('exportSummary');
  if(!box) return;
  let flights=exportFlightsForScope();
  let total=flights.reduce((n,f)=>n+(Number(f.mins)||0),0);
  let pic=flights.reduce((n,f)=>n+(['PIC','SOLO','SPIC','PICUS'].includes(f.role)?Number(f.mins||0):0),0);
  let copilot=flights.reduce((n,f)=>n+(f.role==='CO-PILOT'?Number(f.mins||0):0),0);
  let dual=flights.reduce((n,f)=>n+(f.role==='DUAL'?Number(f.mins||0):0),0);
  let night=flights.reduce((n,f)=>n+Number(f.nightMin||0),0);
  let ifr=flights.reduce((n,f)=>n+Number(f.ifrMin||0),0);
  let xc=flights.filter(f=>f.crossCountry).length;
  box.innerHTML=`<b>${flights.length} flight${flights.length===1?'':'s'}</b><br>
    Total ${fmt(total)} · PIC ${fmt(pic)} · Co-pilot ${fmt(copilot)} · Dual ${fmt(dual)} · Night ${fmt(night)} · IFR ${fmt(ifr)} · XC ${xc}`;
}

function durationForExport(mins){
  return fmt(Number(mins)||0);
}

function exportLogbookCSV(){
  let flights=exportFlightsForScope();
  if(!flights.length){alert('There are no flights to export.');return;}

  let rows=[IMPORT_HEADERS];
  flights.forEach(f=>{
    if(isSimulatorSession(f)){
      const cells={date:formatDate(f.date),remarks:f.remarks||'',special_ops:'{}',
        entry_type:'simulator',sim_category:f.simCategory||'Other',
        sim_device:f.simDevice||'',sim_qualification:f.simQualification||'',
        sim_session_time:durationForExport(f.stdMin)};
      rows.push(IMPORT_HEADERS.map(k=>cells[k]??''));
      return;
    }
    let a=ac(f.aid)||{};
    rows.push([
      formatDate(f.date),
      a.icao||'',
      a.reg||'',
      a.manufacturer||'',
      a.model||'',
      a.variant||'',
      engineCode(a),
      f.dep||'',
      f.off||'',
      f.arr||'',
      f.on||'',
      flightPilotConfig(f)==='multi'?'multi-pilot':'single-pilot',
      durationForExport(f.mins),
      f.role||'',
      displayPICName(f),
      Number(f.takeoffDay||0),
      Number(f.takeoffNight||0),
      Number(f.landingDay||0),
      Number(f.landingNight||0),
      durationForExport(f.nightMin),
      durationForExport(f.ifrMin),
      f.crossCountry?'yes':'no',
      f.remarks||'',
      JSON.stringify(f.specialOps||{}),
      'flight','','','',''
    ]);
  });

  let csv=rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');
  let b=new Blob([csv],{type:'text/csv;charset=utf-8'});
  let u=URL.createObjectURL(b),a=document.createElement('a');
  let scope=document.getElementById('exportScope')?.value||'filtered';
  a.href=u;
  a.download=`HeliLog_${scope==='all'?'All_Flights':'Filtered_Flights'}_${formatDate(new Date().toISOString().slice(0,10))}.csv`;
  a.click();
  URL.revokeObjectURL(u);
}

function htmlEscape(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function functionTime(f, kind){
  let m=Number(f.mins||0);
  if(kind==='pic') return ['PIC','SOLO','SPIC','PICUS'].includes(f.role)?m:0;
  if(kind==='copilot') return f.role==='CO-PILOT'?m:0;
  if(kind==='dual') return f.role==='DUAL'?m:0;
  if(kind==='instructor') return Number(f.instrMin||0);
  return 0;
}

function broughtForwardExportTotals(){
  let b=S.broughtForward||{};
  return {
    spSE:Number(b.spSE||0),spME:Number(b.spME||0),
    single:Number(b.single??(Number(b.spSE||0)+Number(b.spME||0))),
    multi:Number(b.multi||0),
    engineSE:Number(b.engineSE??b.spSE??0),engineME:Number(b.engineME??b.spME??0),
    total:Number(b.total||0),
    toDay:Number(b.toDay||0),toNight:Number(b.toNight||0),ldgDay:Number(b.ldgDay||0),ldgNight:Number(b.ldgNight||0),
    night:Number(b.night||0),ifr:Number(b.ifr||0),pic:Number(b.pic||0),copilot:Number(b.copilot||0),
    dual:Number(b.dual||0),instructor:Number(b.instructor||0),std:0
  };
}
function addExportTotals(a,b){
  let out={};
  ['spSE','spME','single','multi','engineSE','engineME','total','toDay','toNight','ldgDay','ldgNight','night','ifr','pic','copilot','dual','instructor','std']
    .forEach(k=>out[k]=Number(a?.[k]||0)+Number(b?.[k]||0));
  return out;
}

const LOGBOOK_ROWS_PER_PAGE=14;
function sumLogbookFields(list,aircraftSnapshot=null){
  let lookup=id=>aircraftSnapshot
    ? aircraftSnapshot.find(a=>a.id===id)
    : ac(id);
  let cfg=f=>{
    let mins=Number(f.mins||0);
    if(flightPilotConfig(f)==='multi') return {spSE:0,spME:0,multi:mins};
    return engineCode(lookup(f.aid))==='ME'
      ? {spSE:0,spME:mins,multi:0}
      : {spSE:mins,spME:0,multi:0};
  };
  return {
    spSE:list.reduce((n,f)=>n+cfg(f).spSE,0),
    spME:list.reduce((n,f)=>n+cfg(f).spME,0),
    multi:list.reduce((n,f)=>n+cfg(f).multi,0),
    single:list.reduce((n,f)=>n+(flightPilotConfig(f)==='multi'?0:Number(f.mins||0)),0),
    engineSE:list.reduce((n,f)=>n+(!isSimulatorSession(f)&&engineCode(lookup(f.aid))!=='ME'?Number(f.mins||0):0),0),
    engineME:list.reduce((n,f)=>n+(!isSimulatorSession(f)&&engineCode(lookup(f.aid))==='ME'?Number(f.mins||0):0),0),
    total:list.reduce((n,f)=>n+Number(f.mins||0),0),
    toDay:list.reduce((n,f)=>n+Number(f.takeoffDay||0),0),
    toNight:list.reduce((n,f)=>n+Number(f.takeoffNight||0),0),
    ldgDay:list.reduce((n,f)=>n+Number(f.landingDay||0),0),
    ldgNight:list.reduce((n,f)=>n+Number(f.landingNight||0),0),
    night:list.reduce((n,f)=>n+Number(f.nightMin||0),0),
    ifr:list.reduce((n,f)=>n+Number(f.ifrMin||0),0),
    pic:list.reduce((n,f)=>n+functionTime(f,'pic'),0),
    copilot:list.reduce((n,f)=>n+functionTime(f,'copilot'),0),
    dual:list.reduce((n,f)=>n+functionTime(f,'dual'),0),
    instructor:list.reduce((n,f)=>n+functionTime(f,'instructor'),0),
    std:list.reduce((n,f)=>n+Number(f.stdMin||0),0)
  };
}

function exportPrintableLogbook(options={}){
  let flights=options.flights||exportFlightsForScope();
  if(!flights.length){alert('There are no flights to export.');return false;}
  let archiveAircraft=options.aircraft||null;
  let archivePilot=options.pilot||null;
  // Batches confirmed before V1.43.1 retain their EXACT three-column print layout.
  // New exports and new batches use the four-column engine/pilot layout.
  const legacyPaperLayout=options.paperLayoutVersion===1;
  // Only preserve the former footer when reprinting an already signed V1.43.1 batch.
  const showEngineTotalsFooter=options.showEngineTotalsFooter===true && !legacyPaperLayout;
  let aircraftFor=id=>archiveAircraft?archiveAircraft.find(a=>a.id===id):ac(id);
  let cfgFor=f=>{
    let mins=Number(f.mins||0);
    if(flightPilotConfig(f)==='multi') return {spSE:0,spME:0,multi:mins};
    return engineCode(aircraftFor(f.aid))==='ME'
      ? {spSE:0,spME:mins,multi:0}
      : {spSE:mins,spME:0,multi:0};
  };
  const ROWS_PER_PAGE=LOGBOOK_ROWS_PER_PAGE;
  const sumFields=list=>sumLogbookFields(list,archiveAircraft);

  function totalCells(t,label,signatureCell=false,remarksCovered=false){
    let remarksCell='';
    if(signatureCell){
      remarksCell=`<td class="totals-signature-cell" rowspan="3">
        <div class="totals-signature-title">PILOT SIGNATURE</div>
        <div class="totals-signature-space"></div>
      </td>`;
    }else if(!remarksCovered){
      remarksCell='<td></td>';
    }

    return `
      <tr class="totals-row">
        <td colspan="4" class="totals-label">${label}</td>
        <td></td><td></td><td></td>
        ${legacyPaperLayout?
          `<td class="num">${fmt(t.spSE)}</td><td class="num">${fmt(t.spME)}</td><td class="num">${fmt(t.multi)}</td>`:
          `<td></td><td></td><td class="num">${fmt(t.single)}</td><td class="num">${fmt(t.multi)}</td>`}
        <td class="num">${fmt(t.total)}</td>
        <td></td>
        <td class="num">${t.toDay}</td>
        <td class="num">${t.toNight}</td>
        <td class="num">${t.ldgDay}</td>
        <td class="num">${t.ldgNight}</td>
        <td class="num">${fmt(t.night)}</td>
        <td class="num">${fmt(t.ifr)}</td>
        <td class="num">${fmt(t.pic)}</td>
        <td class="num">${fmt(t.copilot)}</td>
        <td class="num">${fmt(t.dual)}</td>
        <td class="num">${fmt(t.instructor)}</td>
        <td></td><td></td>
        <td class="num">${fmt(t.std)}</td>
        ${remarksCell}
      </tr>`;
  }

  function flightRow(f){
    if(isSimulatorSession(f)){
      return `<tr class="flight-row simulator-row">
        ${'<td></td>'.repeat(legacyPaperLayout?22:23)}
        <td>${displayDate(f.date)}</td>
        <td class="sim-device-cell">${htmlEscape(f.stdType||simulatorDeviceLabel(f))}</td>
        <td class="num">${fmt(f.stdMin||0)}</td>
        <td class="remarks">${htmlEscape(f.remarks||'')}</td>
      </tr>`;
    }
    let a=aircraftFor(f.aid)||{};
    let picVal=functionTime(f,'pic');
    let copVal=functionTime(f,'copilot');
    let dualVal=functionTime(f,'dual');
    let instrVal=functionTime(f,'instructor');
    let cfg=cfgFor(f);

    // Historical archives retain their stored PIC wording; new PIC/SOLO
    // records use SELF. This note belongs in JS, never in the HTML table.
    return `<tr class="flight-row">
      <td>${displayDate(f.date)}</td>
      <td>${htmlEscape(f.dep||'')}</td>
      <td>${htmlEscape(f.off||'')}</td>
      <td>${htmlEscape(f.arr||'')}</td>
      <td>${htmlEscape(f.on||'')}</td>
      <td class="type">${htmlEscape(a.icao||'')}</td>
      <td>${htmlEscape(a.reg||'')}</td>

      ${legacyPaperLayout?
        `<td class="num">${cfg.spSE?fmt(cfg.spSE):''}</td>
          <td class="num">${cfg.spME?fmt(cfg.spME):''}</td>
          <td class="num">${cfg.multi?fmt(cfg.multi):''}</td>`:
        `<td class="engine-check">${engineCode(a)==='ME'?'':'&#10003;'}</td>
          <td class="engine-check">${engineCode(a)==='ME'?'&#10003;':''}</td>
          <td class="num">${flightPilotConfig(f)==='multi'?'':fmt(f.mins||0)}</td>
          <td class="num">${flightPilotConfig(f)==='multi'?fmt(f.mins||0):''}</td>`}
      <td class="num">${fmt(f.mins||0)}</td>
      <td class="pic-name">${htmlEscape(f.picName||'')}</td>

      <td class="num">${Number(f.takeoffDay||0)||''}</td>
      <td class="num">${Number(f.takeoffNight||0)||''}</td>
      <td class="num">${Number(f.landingDay||0)||''}</td>
      <td class="num">${Number(f.landingNight||0)||''}</td>

      <td class="num">${Number(f.nightMin||0)>0?fmt(f.nightMin):''}</td>
      <td class="num">${Number(f.ifrMin||0)>0?fmt(f.ifrMin):''}</td>

      <td class="num">${picVal?fmt(picVal):''}</td>
      <td class="num">${copVal?fmt(copVal):''}</td>
      <td class="num">${dualVal?fmt(dualVal):''}</td>
      <td class="num">${instrVal?fmt(instrVal):''}</td>

      <td></td>
      <td>${htmlEscape(f.stdType||'')}</td>
      <td class="num">${Number(f.stdMin||0)>0?fmt(f.stdMin):''}</td>

      <td class="remarks">${htmlEscape(flightRemarksForDisplay(f))}</td>
    </tr>`;
  }

  let pages=[];
  for(let i=0;i<flights.length;i+=ROWS_PER_PAGE){
    pages.push(flights.slice(i,i+ROWS_PER_PAGE));
  }

  let broughtForward=options.openingTotals||broughtForwardExportTotals();
  let cumulativeBefore=[];
  let running=[];
  pages.forEach((p,idx)=>{
    cumulativeBefore[idx]=addExportTotals(broughtForward,sumFields(running));
    running=running.concat(p);
  });

  let pageHtml=pages.map((pageFlights,pageIndex)=>{
    let thisPage=sumFields(pageFlights);
    let prev=cumulativeBefore[pageIndex];
    let cumulative=addExportTotals(broughtForward,sumFields(flights.slice(0,(pageIndex*ROWS_PER_PAGE)+pageFlights.length)));

    let blanks='';
    for(let i=pageFlights.length;i<ROWS_PER_PAGE;i++){
      // Block spare places only in new archive batches, never in flexible exports.
      // Old confirmed archives keep their original format when reprinted.
      blanks+=options.archiveBatch && options.blockUnusedRows===true
        ? `<tr class="blank-row unused-row">${'<td>—</td>'.repeat(legacyPaperLayout?25:26)}<td class="unused-note">— UNUSED —</td></tr>`
        : `<tr class="blank-row">${'<td></td>'.repeat(legacyPaperLayout?26:27)}</tr>`;
    }

    return `<section class="logbook-page">
      <div class="page-header">
        <div class="titleblock">
          <div class="title">PILOT LOG BOOK</div>
          <div class="subtitle">${TEST_MODE?'TEST MODE — FICTIONAL RECORDS — NOT FOR OFFICIAL USE':'HeliLog — EASA-style flight record export'}</div>
        </div>
        <div class="pilotblock">
          <div><b>Pilot:</b> ${htmlEscape(archivePilot?archivePilot.name:(S.pilot.name||''))}</div>
          <div><b>Licence:</b> ${htmlEscape(archivePilot?archivePilot.licence:(pilotLicenceDisplay()||'—'))}</div>
          <div><b>Authority:</b> ${htmlEscape(archivePilot?archivePilot.authority:(S.pilot.authority||'—'))}</div>
          <div><b>Page:</b> ${options.archiveBatch?Number(options.firstPage)+pageIndex:pageIndex+1}${options.archiveBatch?' · Batch '+htmlEscape(options.archiveBatch):' / '+pages.length}</div>
        </div>
      </div>

      <table class="logbook-table">
        <colgroup>
          <col class="c-date">
          <col class="c-place"><col class="c-time">
          <col class="c-place"><col class="c-time">
          <col class="c-type"><col class="c-reg">
          ${legacyPaperLayout?
            '<col class="c-sp"><col class="c-sp"><col class="c-mp">':
            '<col class="c-check"><col class="c-check"><col class="c-pilot"><col class="c-pilot">'}
          <col class="c-total">
          <col class="c-picname">
          <col class="c-small"><col class="c-small">
          <col class="c-small"><col class="c-small">
          <col class="c-small"><col class="c-small">
          <col class="c-func"><col class="c-func"><col class="c-func"><col class="c-func">
          <col class="c-fstd-date"><col class="c-fstd-type"><col class="c-fstd-time">
          <col class="c-remarks">
        </colgroup>
        <thead>
          <tr class="group-row">
            <th rowspan="3">DATE<br><span style="font-size:5.1px;font-weight:500;letter-spacing:0;white-space:nowrap">(DD-MM-YYYY)</span></th>
            <th colspan="2">DEPARTURE</th>
            <th colspan="2">ARRIVAL</th>
            <th colspan="2">AIRCRAFT</th>
            ${legacyPaperLayout?
              '<th colspan="2">SINGLE-PILOT TIME</th><th rowspan="3">MULTI-<br>PILOT<br>TIME</th>':
              '<th colspan="2">ENGINE (✓)</th><th colspan="2">PILOT CONFIGURATION TIME</th>'}
            <th rowspan="3">TOTAL<br>TIME OF<br>FLIGHT</th>
            <th rowspan="3">NAME OF PIC</th>
            <th colspan="2">TAKE-OFFS</th>
            <th colspan="2">LANDINGS</th>
            <th colspan="2">OPERATIONAL<br>CONDITION TIME</th>
            <th colspan="4">PILOT FUNCTION TIME</th>
            <th colspan="3">SYNTHETIC TRAINING DEVICE SESSION</th>
            <th rowspan="3">REMARKS AND ENDORSEMENTS</th>
          </tr>
          <tr class="subgroup-row">
            <th rowspan="2">PLACE</th><th rowspan="2">TIME</th>
            <th rowspan="2">PLACE</th><th rowspan="2">TIME</th>
            <th rowspan="2">TYPE</th><th rowspan="2">REG.</th>
            <th rowspan="2">SE</th><th rowspan="2">ME</th>
            ${legacyPaperLayout?'':'<th rowspan="2">SINGLE-<br>PILOT</th><th rowspan="2">MULTI-<br>PILOT</th>'}
            <th rowspan="2">DAY</th><th rowspan="2">NIGHT</th>
            <th rowspan="2">DAY</th><th rowspan="2">NIGHT</th>
            <th rowspan="2">NIGHT</th><th rowspan="2">IFR</th>
            <th rowspan="2">PIC</th><th rowspan="2">CO-<br>PILOT</th><th rowspan="2">DUAL</th><th rowspan="2">INSTR.</th>
            <th rowspan="2">DATE</th><th rowspan="2">TYPE</th><th rowspan="2">TOTAL<br>TIME</th>
          </tr>
          <tr></tr>
        </thead>
        <tbody>
          ${pageFlights.map(flightRow).join('')}
          ${blanks}
          ${totalCells(thisPage,'TOTAL THIS PAGE',true,false)}
          ${totalCells(prev,'TOTAL FROM PREVIOUS PAGES',false,true)}
          ${totalCells(cumulative,'TOTAL TIME',false,true)}
        </tbody>
      </table>

      <div class="page-footer">
        ${showEngineTotalsFooter?`<div class="engine-totals-print">
          ENGINE TIME — SE ${fmt(cumulative.engineSE||0)} · ME ${fmt(cumulative.engineME||0)}
          &nbsp;&nbsp; | &nbsp;&nbsp; PILOT TIME — SINGLE ${fmt(cumulative.single||0)} · MULTI ${fmt(cumulative.multi||0)}
          ${options.unclassifiedPriorEngineMinutes>0?` · Prior paper engine type not allocated: ${fmt(options.unclassifiedPriorEngineMinutes)}`:''}
          ${options.unclassifiedPriorPilotMinutes>0?` · Prior paper SP/MP time not allocated: ${fmt(options.unclassifiedPriorPilotMinutes)}`:''}
        </div>`:''}
        ${options.correctionsApplied?.length?`<div style="font-size:7px;font-weight:700;margin-bottom:2px">
        CORRECTIONS CARRIED FORWARD: ${htmlEscape(options.correctionsApplied.join(', '))} —
        flight-time adjustment ${signedHours(Number(options.openingCorrectionsDelta?.total||0))}.
        Signed correction addendum(s) must be retained with the paper logbook.
        </div>`:''}
        <div class="certification">
          ${TEST_MODE?'TEST MODE — FICTIONAL FLIGHTS AND SIMULATOR SESSIONS. NOT AN OFFICIAL LOGBOOK.':
          'I certify that the entries on this page are a true record of the flights shown above.'}
        </div>
      </div>
    </section>`;
  }).join('');

  let report=`<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${TEST_MODE?'TEST MODE — ':''}HeliLog Pilot Log Book</title>
    <style>
      @page{size:A4 landscape;margin:12mm}
      *{box-sizing:border-box}
      body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
      .toolbar{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #bbb;position:sticky;top:0;background:#fff;z-index:20}
      .toolbar strong{font-size:14px}
      .toolbar button{font-size:13px;padding:8px 12px}
      .logbook-page{page-break-after:always;min-height:0;padding:0;break-inside:avoid;page-break-inside:avoid}
      .logbook-page:last-child{page-break-after:auto}
      .page-header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:5px}
      .title{font-weight:800;font-size:16px;letter-spacing:.06em}
      .subtitle{font-size:8px;color:#555;margin-top:2px}
      .pilotblock{font-size:8px;display:grid;grid-template-columns:auto auto;column-gap:14px;row-gap:2px;text-align:left}
      table{border-collapse:collapse;width:100%;max-width:100%;table-layout:fixed}
      .logbook-table th,.logbook-table td{border:1px solid #222;padding:2px 2px;text-align:center;vertical-align:middle}
      .logbook-table th{font-size:6.6px;font-weight:700;line-height:1.05;background:#f2f2f2;overflow-wrap:break-word}
      .group-row th{background:#e8e8e8;font-size:6.7px}
      .subgroup-row th{background:#f5f5f5}
      .flight-row td,.blank-row td{height:7.6mm;font-size:7px;line-height:1.05}
      .flight-row td:first-child{white-space:nowrap;font-size:6.8px}
      .blank-row td{height:7.6mm}
      .simulator-row .sim-device-cell{font-size:6px;white-space:normal;overflow-wrap:anywhere;line-height:1.05}
      .unused-row td{
        background:repeating-linear-gradient(135deg,#fafafa 0px,#fafafa 8px,#e1e1e1 8px,#e1e1e1 9px);
        color:#555;font-size:8px;font-weight:700;white-space:nowrap;
      }
      .unused-row td.unused-note{font-size:6.8px;letter-spacing:.05em;white-space:nowrap}
      .num{font-variant-numeric:tabular-nums}
      .type{font-weight:700}
      .pic-name{font-size:6.7px!important}
      .remarks{text-align:left!important;padding-left:3px!important;font-size:6.5px!important;overflow-wrap:anywhere}
      .totals-row td{height:5.3mm;font-size:6.8px;font-weight:700;background:#f8f8f8}
      .totals-label{text-align:right!important;padding-right:5px!important}
      .page-footer{margin-top:4px;font-size:7.5px}
      .certification{font-style:italic}
      .totals-signature-cell{
        padding:0!important;
        background:#fff!important;
        vertical-align:stretch!important;
      }
      .totals-signature-cell > div{box-sizing:border-box}
      .totals-signature-title{
        height:5.3mm;
        display:flex;
        align-items:center;
        justify-content:center;
        border-bottom:1px solid #222;
        font-size:6.7px;
        font-weight:700;
        letter-spacing:.04em;
        background:#f2f2f2
      }
      .totals-signature-space{
        height:10.6mm;
        background:#fff
      }

      .c-date{width:17mm}
      .c-place{width:9.5mm}
      .c-time{width:8.2mm}
      .c-type{width:10.5mm}
      .c-reg{width:12mm}
      .c-sp{width:8mm}
      .c-mp{width:9mm}
      .c-check{width:5.2mm}
      .c-pilot{width:9mm}
      .engine-check{font-family:Arial,'DejaVu Sans',sans-serif;font-size:13px!important;font-weight:800}
      .engine-totals-print{font-size:7px;font-weight:700;margin-bottom:3px}
      .c-total{width:10mm}
      .c-picname{width:21mm}
      .c-small{width:6.7mm}
      .c-func{width:8mm}
      .c-fstd-date{width:9mm}
      .c-fstd-type{width:9mm}
      .c-fstd-time{width:9mm}
      .c-remarks{width:${legacyPaperLayout?'42mm':'38mm'}}

      @media print{
        .toolbar{display:none}
        body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <strong>HeliLog — Pilot Log Book Export</strong>
      <button onclick="window.print()">Print / Save as PDF</button>
    </div>
    ${pageHtml}
  </body>
  </html>`;

  let w=window.open('','_blank');
  if(!w){
    alert('The printable logbook could not open because the browser blocked the new window. Please allow pop-ups for this local page and try again.');
    return;
  }
  w.document.open();
  w.document.write(report);
  w.document.close();
  w.focus();
  return true;
}


let pendingArchivePreview=null;
let selectedArchivePageCount=null; // null means print all available pages

// A fresh HeliLog installation ships with example flights. Never certify those
// as actual flying. Match against unchanged seeded values, not merely IDs.
function isUnchangedDemoFlight(f){
  const sample=seed.flights.find(x=>x.id===f.id);
  return !!sample &&
    ['date','aid','dep','arr','off','on','mins','role'].every(k=>String(f[k]??'')===String(sample[k]??''));
}
function removeUnchangedDemoFlights(){
  const ids=new Set(S.flights.filter(f=>isUnchangedDemoFlight(f)&&!isArchivedFlight(f.id)).map(f=>f.id));
  if(!ids.size)return;
  const ok=confirm('Delete '+ids.size+' unchanged HeliLog demonstration flight(s)?\\n\\nThese were example entries supplied with the prototype, not real flight records. Only entries still matching the original examples will be deleted. Create a full backup first if you might want them later.');
  if(!ok)return;
  S.flights=S.flights.filter(f=>!ids.has(f.id));
  pendingArchivePreview=null;
  save();
  printarchive();
}

