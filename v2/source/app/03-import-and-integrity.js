const IMPORT_HEADERS=[
  'date','icao_type','registration','manufacturer','model','variant','engine_configuration',
  'departure','departure_time','arrival','arrival_time',
  'pilot_configuration','total_time',
  'pilot_function','pic_name','takeoffs_day','takeoffs_night',
  'landings_day','landings_night','night_time','ifr_time',
  'cross_country','remarks','special_ops',
  'entry_type','sim_category','sim_device','sim_qualification','sim_session_time'
];
const OPTIONAL_IMPORT_HEADERS=['engine_configuration','pilot_configuration','special_ops','entry_type','sim_category','sim_device','sim_qualification','sim_session_time'];
const LEGACY_CONFIG_HEADERS=['single_pilot_se_time','single_pilot_me_time','multi_pilot_time'];

// A conservative identity test: same date, aircraft registration, route and both
// times. Similar flights with different times are never removed automatically.
function flightFingerprint(date,registration,departure,off,arrival,on){
  const clean=v=>String(v||'').trim().toUpperCase().replace(/\s+/g,'');
  const parts=[date,registration,departure,off,arrival,on].map(clean);
  return parts.every(Boolean)?parts.join('|'):'';
}
function simulatorFingerprint(date,category,device,qualification,minutes,remarks){
  const clean=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
  if(!date||(!device&&!category)||!Number.isSafeInteger(Number(minutes))||Number(minutes)<=0)return '';
  return ['SIM',date,category,device,qualification,minutes,remarks].map(clean).join('|');
}
function flightFingerprintForRecord(f,data=S){
  if(isSimulatorSession(f)){
    return simulatorFingerprint(f.date,f.simCategory,f.simDevice,f.simQualification,f.stdMin,f.remarks);
  }
  const a=(data.aircraft||[]).find(x=>x.id===f.aid);
  return flightFingerprint(f.date,a?.reg,f.dep,f.off,f.arr,f.on);
}
function flightFingerprintForImport(f){
  if(f.entryType==='simulator'){
    return simulatorFingerprint(f.date,f.simCategory,f.simDevice,f.simQualification,f.stdMin,f.remarks);
  }
  return flightFingerprint(f.date,f.aircraft?.reg,f.dep,f.off,f.arr,f.on);
}

function reconstructArchivedOpening(data,previous,batches){
  const out={...previous.closingTotals};
  if(['single','engineSE','engineME'].every(k=>Number.isFinite(out[k])))return out;
  const bf=data.broughtForward||{};
  let totals={
    single:Number(bf.single??(Number(bf.spSE||0)+Number(bf.spME||0))),
    engineSE:Number(bf.engineSE??bf.spSE??0),
    engineME:Number(bf.engineME??bf.spME??0)
  };
  for(const b of batches){
    const x=sumLogbookFields(b.flights||[],b.aircraft||data.aircraft);
    totals=addExportTotals(totals,x);
    const applied=(data.printArchive?.corrections||[]).filter(c=>c.confirmedAt&&(b.correctionsApplied||[]).includes(c.id));
    totals=addExportTotals(totals,sumCorrectionDeltas(applied,data.aircraft));
  }
  for(const k of ['single','engineSE','engineME']){
    if(!Number.isFinite(out[k]))out[k]=totals[k]||0;
  }
  return out;
}
function inspectHeliLogData(data){
  const errors=[],warnings=[];
  if(!data || typeof data!=='object')return {errors:['Data is not an object.'],warnings};
  if(!Array.isArray(data.flights) || !Array.isArray(data.aircraft))return {errors:['Flight or aircraft list is missing.'],warnings};
  const flightIds=new Set(),aircraftIds=new Set(),seenSignatures=new Map();
  for(const a of data.aircraft){
    if(!a || !a.id || !a.reg || !a.icao){errors.push('An aircraft record is incomplete.');continue;}
    if(aircraftIds.has(a.id))errors.push('Duplicate aircraft record ID: '+a.id);
    aircraftIds.add(a.id);
  }
  for(const f of data.flights){
    if(!f || !f.id){errors.push('A flight record is missing its ID.');continue;}
    if(flightIds.has(f.id))errors.push('Duplicate flight record ID: '+f.id);
    flightIds.add(f.id);
    const label=String(f.date||'?')+' / '+String(f.id);
    if(isSimulatorSession(f)){
      const simKey=flightFingerprintForRecord(f,data);
      if(simKey){
        if(seenSignatures.has(simKey))warnings.push('Possible duplicate simulator sessions: '+seenSignatures.get(simKey)+' and '+f.id+' ('+f.date+').');
        else seenSignatures.set(simKey,f.id);
      }
      if(!parseExternalDate(f.date))errors.push('Simulator '+label+' has an invalid date.');
      if(!String(f.simDevice||'').trim()&&!String(f.simCategory||'').startsWith('FNPT'))errors.push('Simulator '+label+' has no device/type.');
      if(!Number.isSafeInteger(f.stdMin)||f.stdMin<=0)errors.push('Simulator '+label+' has an invalid session time.');
      if(Number(f.mins||0)!==0)errors.push('Simulator '+label+' must have zero actual flight time.');
      continue;
    }
    if(!aircraftIds.has(f.aid))errors.push('Flight '+label+' references an unknown aircraft.');
    if(!parseExternalDate(f.date))errors.push('Flight '+label+' has an invalid date.');
    if(!importClock(f.off)||!importClock(f.on))errors.push('Flight '+label+' has invalid departure/arrival time.');
    const mins=Number(f.mins);
    if(!Number.isSafeInteger(mins)||mins<=0)errors.push('Flight '+label+' has invalid total time.');
    for(const field of ['nightMin','ifrMin','instrMin']){
      let n=Number(f[field]||0);
      if(!Number.isSafeInteger(n)||n<0||(Number.isFinite(mins)&&n>mins))
        errors.push('Flight '+label+' has invalid '+field+'.');
    }
    for(const field of ['takeoffDay','takeoffNight','landingDay','landingNight']){
      const n=Number(f[field]||0);
      if(!Number.isSafeInteger(n)||n<0)errors.push('Flight '+label+' has invalid '+field+'.');
    }
    const opsCheck=validSpecialOps(f.specialOps,mins);
    if(!opsCheck.valid)errors.push('Flight '+label+': '+opsCheck.error);
    if(opsCheck.valid && Number(opsCheck.ops.NVIS||0)>Number(f.nightMin||0))
      warnings.push('Flight '+label+' has NVIS time greater than recorded night flight time.');
    const sig=flightFingerprintForRecord(f,data);
    if(sig){
      if(seenSignatures.has(sig))warnings.push('Possible duplicate flights: '+seenSignatures.get(sig)+' and '+f.id+' ('+f.date+').');
      else seenSignatures.set(sig,f.id);
    }
  }
  const rawCorrections=data.printArchive?.corrections;
  const corrections=Array.isArray(rawCorrections)?rawCorrections:[];
  const batches=data.printArchive?.batches;
  if(rawCorrections!==undefined&&!Array.isArray(rawCorrections)){
    errors.push('Archive correction ledger is malformed.');
  }else{
    const correctionIDs=new Set(),lastConfirmed=new Map();
    for(const c of corrections){
      if(!c||!c.id||!c.flightId||!c.before||!c.after||!c.reason||!c.createdAt){
        errors.push('An archive correction record is incomplete.');continue;
      }
      if(correctionIDs.has(c.id))errors.push('Duplicate correction ID: '+c.id);
      correctionIDs.add(c.id);
      const archivedBatch=Array.isArray(batches)?batches.find(b=>b.id===c.sourceBatch):null;
      const index=archivedBatch?.flightIds?.indexOf(c.flightId)??-1;
      if(index<0)errors.push('Correction '+c.id+' does not reference an archived entry.');
      else if(c.sourcePage!==archivedBatch.firstPage+Math.floor(index/LOGBOOK_ROWS_PER_PAGE)
          ||c.sourceRow!==(index%LOGBOOK_ROWS_PER_PAGE)+1)
        errors.push('Correction '+c.id+' has an invalid source page or row.');
      if(c.before.id!==c.flightId||c.after.id!==c.flightId)
        errors.push('Correction '+c.id+' has mismatched record IDs.');
      if(isSimulatorSession(c.before)!==isSimulatorSession(c.after))
        errors.push('Correction '+c.id+' cannot convert a flight into a simulator or vice versa.');
      if(!correctionDifferences(c.before,c.after).length)
        errors.push('Correction '+c.id+' has no changed fields.');
      if(c.confirmedAt){
        const prior=lastConfirmed.get(c.flightId)||
          archivedBatch?.flights?.[index];
        if(prior&&correctionDifferences(prior,c.before).length)
          errors.push('Correction '+c.id+' does not chain from the previous confirmed value.');
        lastConfirmed.set(c.flightId,c.after);
      }else warnings.push('Pending unsigned correction addendum: '+c.id+'.');
      const revised=c.after;
      if(!parseExternalDate(revised.date))errors.push('Correction '+c.id+' has an invalid revised date.');
      if(isSimulatorSession(revised)){
        if(!Number.isSafeInteger(revised.stdMin)||revised.stdMin<=0)
          errors.push('Correction '+c.id+' has invalid simulator time.');
        if(!String(revised.simDevice||'').trim()&&!String(revised.simCategory||'').startsWith('FNPT'))
          errors.push('Correction '+c.id+' lacks its simulator device/type.');
      }else{
        const mins=Number(revised.mins);
        if(!Number.isSafeInteger(mins)||mins<=0)
          errors.push('Correction '+c.id+' has invalid revised flight time.');
        for(const field of ['nightMin','ifrMin','instrMin']){
          const n=Number(revised[field]||0);
          if(!Number.isSafeInteger(n)||n<0||n>mins)
            errors.push('Correction '+c.id+' has invalid '+field+'.');
        }
        const opsCheck=validSpecialOps(revised.specialOps,mins);
        if(!opsCheck.valid)errors.push('Correction '+c.id+': '+opsCheck.error);
      }
    }
  }
  if(batches!==undefined&&!Array.isArray(batches)){
    errors.push('Print archive batches are malformed.');
  }else if(Array.isArray(batches)){
    const archivedIDs=new Set(),appliedIDs=new Set();
    let previous=null;
    for(const b of batches){
      if(!b||!Array.isArray(b.flightIds)||!Array.isArray(b.flights)||!b.openingTotals||!b.closingTotals||
         !Number.isSafeInteger(b.firstPage)||!Number.isSafeInteger(b.pageCount)||b.pageCount<1){
        errors.push('An archived print batch is incomplete.');continue;
      }
      if(b.flightIds.length!==b.flights.length)errors.push('Archive '+b.id+' has mismatched flight counts.');
      if(b.pageCount!==Math.ceil(b.flights.length/LOGBOOK_ROWS_PER_PAGE))
        errors.push('Archive '+b.id+' has an invalid page count.');
      const calculated=sumLogbookFields(b.flights,Array.isArray(b.aircraft)?b.aircraft:data.aircraft);
      const expectedClosing=addExportTotals(b.openingTotals,calculated);
      const archiveFields=['total','spSE','spME','multi','pic','copilot','dual','instructor','night','ifr','toDay','toNight','ldgDay','ldgNight','std'];
      if(b.paperLayoutVersion===2)archiveFields.push('single','engineSE','engineME');
      for(const field of archiveFields){
        if(Number(expectedClosing[field]||0)!==Number(b.closingTotals[field]||0))
          errors.push('Archive '+b.id+' closing '+field+' does not match its printed flights.');
      }
      const ids=b.correctionsApplied||[];
      if(!Array.isArray(ids))errors.push('Archive '+b.id+' correction references are malformed.');
      const items=Array.isArray(ids)?ids.map(id=>corrections.find(c=>c.id===id)).filter(Boolean):[];
      if(Array.isArray(ids)){
        for(const id of ids){
          if(appliedIDs.has(id))errors.push('Correction '+id+' was carried into multiple archive batches.');
          appliedIDs.add(id);
          const c=corrections.find(x=>x.id===id);
          if(!c?.confirmedAt)errors.push('Archive '+b.id+' includes an unconfirmed or missing correction '+id+'.');
        }
      }
      const expectedAdjustment=sumCorrectionDeltas(items,data.aircraft);
      for(const field of ['total','pic','dual','copilot','spSE','spME','multi','night','ifr','instructor','toDay','toNight','ldgDay','ldgNight','std']){
        if(Number(b.openingCorrectionsDelta?.[field]||0)!==Number(expectedAdjustment[field]||0))
          errors.push('Archive '+b.id+' correction adjustment '+field+' is inconsistent.');
      }
      if(previous){
        if(b.firstPage!==previous.firstPage+previous.pageCount)errors.push('Archive page numbering is discontinuous at '+b.id+'.');
        // Old confirmed batches may not contain independent engine totals.
        // Reconstruct only those new fields; preserve all old signed totals.
        const priorBatches=batches.slice(0,batches.indexOf(b));
        const expectedBase=b.paperLayoutVersion===2?
          reconstructArchivedOpening(data,previous,priorBatches):previous.closingTotals;
        const expectedOpening=addExportTotals(expectedBase,expectedAdjustment);
        const forwardFields=['total','pic','dual','copilot','spSE','spME','multi','night','ifr','instructor','toDay','toNight','ldgDay','ldgNight','std'];
        if(b.paperLayoutVersion===2)forwardFields.push('single','engineSE','engineME');
        for(const field of forwardFields){
          if(Number(b.openingTotals[field]||0)!==Number(expectedOpening[field]||0))
            errors.push('Archive '+b.id+' has mismatched carried-forward '+field+' totals.');
        }
      }
      for(let i=0;i<b.flightIds.length;i++){
        const id=b.flightIds[i];
        if(archivedIDs.has(id))errors.push('Flight '+id+' appears in multiple print batches.');
        archivedIDs.add(id);
        if(b.flights[i]?.id!==id)errors.push('Archived flight snapshot does not match flight ID '+id+'.');
        const live=data.flights.find(f=>f.id===id);
        if(!live){errors.push('Archived flight '+id+' is missing from the electronic logbook.');continue;}
        const copy=b.flights[i];
        if(isSimulatorSession(live) || isSimulatorSession(copy)){
          for(const key of ['entryType','date','simCategory','simDevice','simQualification','stdType','stdMin','remarks']){
            if(String(live[key]??'')!==String(copy[key]??'')){
              warnings.push('Archived simulator '+id+' differs from its saved printed copy ('+key+').');
              break;
            }
          }
        }
        if(JSON.stringify(live.specialOps||{})!==JSON.stringify(copy.specialOps||{})){
          warnings.push('Archived flight '+id+' differs from its printed specialised operations.');
        }
        for(const key of ['date','aid','dep','off','arr','on','mins','role','picName','nightMin','ifrMin','takeoffDay','takeoffNight','landingDay','landingNight','remarks']){
          if(String(live[key]??'')!==String(copy[key]??'')){
            warnings.push('Archived flight '+id+' differs from its saved printed copy ('+key+').');
            break;
          }
        }
      }
      previous=b;
    }
  }
  return {errors,warnings};
}

function showIntegrityCheck(){
  const box=document.getElementById('integrityCheckResult');
  if(!box)return;
  const report=inspectHeliLogData(S);
  const renderItems=items=>items.slice(0,20).map(v=>'<div style="margin-top:5px">• '+htmlEscape(v)+'</div>').join('')+
    (items.length>20?'<div class="mini">…and '+(items.length-20)+' more issues.</div>':'');
  box.innerHTML='<div class="'+(report.errors.length?'importerrors':report.warnings.length?'note':'successbox')+'">'+
    '<b>'+report.errors.length+' errors · '+report.warnings.length+' warnings</b>'+
    (!report.errors.length&&!report.warnings.length?'<p>No structural issues or exact duplicate flights detected.</p>':'')+
    renderItems(report.errors)+renderItems(report.warnings)+
    '<div class="mini" style="margin-top:8px">This is a record-consistency check, not regulatory certification or verification that a flight actually occurred.</div></div>';
}

function openImportModal(){
  pendingImport=null;
  document.getElementById('csvFileInput').value='';
  document.getElementById('importStatus').innerHTML='';
  document.getElementById('importPreview').innerHTML='';
  document.getElementById('confirmImportBtn').disabled=true;
  document.getElementById('importModal').classList.add('open');
  document.getElementById('csvFileInput').onchange=handleCSVFile;
}
function closeImportModal(){
  pendingImport=null;
  document.getElementById('importModal').classList.remove('open');
}

function parseCSV(text){
  let rows=[], row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){
    let ch=text[i];
    if(quoted){
      if(ch==='"' && text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"'){quoted=false;}
      else cell+=ch;
    }else{
      if(ch==='"') quoted=true;
      else if(ch===','){row.push(cell);cell='';}
      else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
      else if(ch!=='\r') cell+=ch;
    }
  }
  if(cell.length || row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(c=>String(c).trim()!==''));
}

function parseDuration(value){
  let v=String(value??'').trim();
  if(v==='') return 0;
  if(/^\d+$/.test(v)) return Number(v);
  let m=v.match(/^(\d{1,3}):([0-5]\d)$/);
  if(!m) return null;
  return Number(m[1])*60+Number(m[2]);
}

function importClock(value){
  let v=String(value??'').trim();
  if(!v) return null;
  let raw=v.replace(/[^0-9]/g,'');
  if(raw.length===3) raw='0'+raw;
  if(raw.length!==4) return null;
  let h=Number(raw.slice(0,2)), m=Number(raw.slice(2,4));
  if(h>23||m>59) return null;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}

function parseBoolean(value){
  let v=String(value??'').trim().toLowerCase();
  if(['1','true','yes','y','x','xc'].includes(v)) return true;
  if(['0','false','no','n',''].includes(v)) return false;
  return null;
}

function csvEscape(v){
  let s=String(v??'');
  if(/[",\n]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
  return s;
}

function downloadImportTemplate(){
  let sample=[
    IMPORT_HEADERS,
    ['02-10-2026','G2CA','LY-XYZ','Guimbal','Cabri','G2','SE','EYVI','0935','EYKA','1055','single-pilot','1:20','PIC','Matas','1','0','1','0','0:00','0:00','yes','Example cross-country flight','{}','flight','','','','']
  ];
  let csv=sample.map(r=>r.map(csvEscape).join(',')).join('\r\n');
  let b=new Blob([csv],{type:'text/csv;charset=utf-8'});
  let u=URL.createObjectURL(b),a=document.createElement('a');
  a.href=u;a.download='HeliLog_Import_Template.csv';a.click();URL.revokeObjectURL(u);
}

async function handleCSVFile(e){
  let file=e.target.files?.[0];
  if(!file) return;
  let status=document.getElementById('importStatus');
  let preview=document.getElementById('importPreview');
  document.getElementById('confirmImportBtn').disabled=true;
  pendingImport=null;

  try{
    let raw=await file.text();
    let rows=parseCSV(raw);
    if(rows.length<2){
      status.innerHTML='<div class="importerrors">The CSV has no flight rows.</div>'; preview.innerHTML=''; return;
    }
    let headers=rows[0].map(x=>String(x).trim().toLowerCase());
    let missing=IMPORT_HEADERS.filter(h=>!OPTIONAL_IMPORT_HEADERS.includes(h) && !headers.includes(h));
    if(missing.length){
      status.innerHTML=`<div class="importerrors">Missing columns: ${missing.join(', ')}</div>`; preview.innerHTML=''; return;
    }

    let idx={}; headers.forEach((h,i)=>idx[h]=i);
    let parsed=[], errors=[];
    const roles=['PIC','CO-PILOT','DUAL','SOLO','SPIC','PICUS'];

    rows.slice(1).forEach((r,n)=>{
      let rowNo=n+2;
      let get=h=>idx[h]===undefined?'':String(r[idx[h]]??'').trim();
      const entryType=get('entry_type').toLowerCase();
      if(entryType==='simulator'){
        const date=parseExternalDate(get('date'));
        const duration=parseDuration(get('sim_session_time'));
        const category=get('sim_category')||'Other';
        const device=get('sim_device');
        const qualification=get('sim_qualification');
        if(!date)errors.push('Row '+rowNo+': simulator session date must be DD-MM-YYYY.');
        if(!device && !category.startsWith('FNPT'))errors.push('Row '+rowNo+': simulator device/type is required for FS/FFS/FTD.');
        if(duration===null||!Number.isSafeInteger(duration)||duration<=0)
          errors.push('Row '+rowNo+': simulator session duration is invalid.');
        parsed.push({entryType:'simulator',date,simCategory:category,simDevice:device,
          simQualification:qualification,stdMin:duration,remarks:get('remarks')});
        return;
      }
      if(entryType && entryType!=='flight')errors.push('Row '+rowNo+': entry_type must be flight or simulator.');
      let dateRaw=get('date');
      let date=parseExternalDate(dateRaw);
      let off=importClock(get('departure_time')), on=importClock(get('arrival_time'));
      let legacySpSE=parseDuration(get('single_pilot_se_time'));
      let legacySpME=parseDuration(get('single_pilot_me_time'));
      let legacyMulti=parseDuration(get('multi_pilot_time'));
      let total=parseDuration(get('total_time')), night=parseDuration(get('night_time')), ifr=parseDuration(get('ifr_time'));
      let xc=parseBoolean(get('cross_country'));
      let specialOps={};
      if(get('special_ops')){
        try{
          const data=JSON.parse(get('special_ops'));
          const checked=validSpecialOps(data,total);
          if(!checked.valid)errors.push('Row '+rowNo+': '+checked.error);
          else specialOps=checked.ops;
        }catch(e){errors.push('Row '+rowNo+': invalid special_ops JSON.');}
      }
      let role=get('pilot_function').toUpperCase();

      let engineRaw=get('engine_configuration').toLowerCase();
      let engine=engineRaw
        ? (['me','multi','multi-engine','multi engine'].includes(engineRaw)?'Multi engine':
           ['se','single','single-engine','single engine'].includes(engineRaw)?'Single engine':null)
        : null;
      if(!engine){
        let existingAircraft=S.aircraft.find(a=>String(a.reg||'').toUpperCase()===get('registration').toUpperCase() || String(a.icao||'').toUpperCase()===get('icao_type').toUpperCase());
        if(existingAircraft) engine=normalizeEngineConfig(existingAircraft.engine);
        else if(get('icao_type').toUpperCase()==='EC35') engine='Multi engine';
        else if((legacySpME||0)>0) engine='Multi engine';
        else engine='Single engine';
      }

      let pilotConfigRaw=get('pilot_configuration').toLowerCase();
      let pilotConfig=pilotConfigRaw
        ? (['multi','multi-pilot','multi pilot','mp'].includes(pilotConfigRaw)?'multi':
           ['single','single-pilot','single pilot','sp'].includes(pilotConfigRaw)?'single':null)
        : null;
      if(!pilotConfig) pilotConfig=(legacyMulti||0)>0?'multi':'single';

      if(!date) errors.push(`Row ${rowNo}: date must be DD-MM-YYYY.`);
      if(!get('icao_type')) errors.push(`Row ${rowNo}: ICAO type is required.`);
      if(!get('registration')) errors.push(`Row ${rowNo}: registration is required.`);
      if(!get('manufacturer')) errors.push(`Row ${rowNo}: manufacturer is required.`);
      if(!get('model')) errors.push(`Row ${rowNo}: model is required.`);
      if(!get('departure')) errors.push(`Row ${rowNo}: departure is required.`);
      if(!get('arrival')) errors.push(`Row ${rowNo}: arrival is required.`);
      if(!off) errors.push(`Row ${rowNo}: invalid departure time.`);
      if(!on) errors.push(`Row ${rowNo}: invalid arrival time.`);
      if(get('engine_configuration') && !['se','me','single','multi','single-engine','multi-engine','single engine','multi engine'].includes(get('engine_configuration').toLowerCase())) errors.push(`Row ${rowNo}: engine_configuration must be SE or ME.`);
      if(get('pilot_configuration') && !pilotConfig) errors.push(`Row ${rowNo}: pilot_configuration must be single-pilot or multi-pilot.`);
      if(total===null || total<=0) errors.push(`Row ${rowNo}: invalid total_time.`);
      if(night===null) errors.push(`Row ${rowNo}: invalid night_time.`);
      if(ifr===null) errors.push(`Row ${rowNo}: invalid ifr_time.`);
      if(total!==null && night!==null && night>total) errors.push(`Row ${rowNo}: night_time exceeds total_time.`);
      if(total!==null && ifr!==null && ifr>total) errors.push(`Row ${rowNo}: ifr_time exceeds total_time.`);
      if(!roles.includes(role)) errors.push(`Row ${rowNo}: pilot_function must be ${roles.join(', ')}.`);
      if(!get('pic_name')) errors.push(`Row ${rowNo}: pic_name is required.`);
      if(xc===null) errors.push(`Row ${rowNo}: cross_country must be yes/no or true/false.`);

      parsed.push({
        date,
        aircraft:{
          icao:get('icao_type').toUpperCase(),
          reg:get('registration').toUpperCase(),
          manufacturer:get('manufacturer'),
          model:get('model'),
          variant:get('variant'),
          engine:engine
        },
        dep:get('departure').toUpperCase(),off,
        arr:get('arrival').toUpperCase(),on,
        pilotConfig:pilotConfig,
        mins:total,role,picName:get('pic_name'),
        takeoffDay:Number(get('takeoffs_day')||0),
        takeoffNight:Number(get('takeoffs_night')||0),
        landingDay:Number(get('landings_day')||0),
        landingNight:Number(get('landings_night')||0),
        nightMin:night,ifrMin:ifr,crossCountry:xc,
        specialOps,remarks:get('remarks')
      });
    });

    if(errors.length){
      status.innerHTML=`<div class="importsummary"><b>${rows.length-1} rows found</b>, but the file has validation errors.</div><div class="importerrors">${errors.slice(0,30).map(x=>'• '+x).join('<br>')}${errors.length>30?'<br>…and more':''}</div>`;
      preview.innerHTML=''; return;
    }

    const existingKeys=new Set([...S.flights,...effectiveFlights()].map(f=>flightFingerprintForRecord(f)).filter(Boolean));
    const fileKeys=new Set();
    let skippedExisting=0,skippedWithinFile=0;
    const newRows=parsed.filter(item=>{
      const key=flightFingerprintForImport(item);
      if(!key)return true;
      if(existingKeys.has(key)){skippedExisting++;return false;}
      if(fileKeys.has(key)){skippedWithinFile++;return false;}
      fileKeys.add(key);
      return true;
    });
    pendingImport=newRows.length?newRows:null;
    status.innerHTML=`<div class="${newRows.length?'successbox':'importerrors'}"><b>${newRows.length} new flights ready to import.</b>
      ${skippedExisting||skippedWithinFile?`<br>${skippedExisting} duplicates already in HeliLog and ${skippedWithinFile} duplicate rows within this CSV were skipped.`:''}
      ${newRows.length?'':'<br>Nothing new to import.'}</div>`;
    preview.innerHTML=`<div class="importpreview"><table><thead><tr><th>Date</th><th>Type</th><th>Engine</th><th>Route</th><th>Total</th><th>Pilot config.</th><th>Function</th><th>XC</th></tr></thead><tbody>${newRows.slice(0,8).map(f=>`<tr><td>${displayDate(f.date)}</td><td><b>${f.entryType==='simulator'?'SIM':f.aircraft.icao}</b></td><td>${f.entryType==='simulator'?'—':engineCode(f.aircraft)}</td><td>${f.entryType==='simulator'?htmlEscape(f.simDevice):f.dep+' → '+f.arr}</td><td>${fmt(f.entryType==='simulator'?f.stdMin:f.mins)}</td><td>${f.entryType==='simulator'?'—':f.pilotConfig==='multi'?'Multi-pilot':'Single-pilot'}</td><td>${f.entryType==='simulator'?'SIM':f.role}</td><td>${f.crossCountry?'✓':'—'}</td></tr>`).join('')}</tbody></table></div>${newRows.length>8?`<div class="mini" style="margin-top:6px">Showing first 8 of ${newRows.length} new flights.</div>`:''}`;
    document.getElementById('confirmImportBtn').disabled=!newRows.length;
  }catch(err){
    status.innerHTML=`<div class="importerrors">Could not read this CSV: ${String(err)}</div>`;
  }
}

function confirmCSVImport(){
  if(!pendingImport?.length) return;
  const keys=new Set([...S.flights,...effectiveFlights()].map(f=>flightFingerprintForRecord(f)).filter(Boolean));
  const additions=pendingImport.filter(item=>{
    const k=flightFingerprintForImport(item);
    if(k&&keys.has(k))return false;
    if(k)keys.add(k);
    return true;
  });
  if(!additions.length){
    alert('There are no new flights to import. All matching records already exist.');
    return;
  }
  let aircraftAdded=0;
  additions.forEach(item=>{
    if(item.entryType==='simulator'){
      S.flights.push({
        id:'sim'+Date.now()+Math.random().toString(36).slice(2,8),
        entryType:'simulator',date:item.date,
        simCategory:item.simCategory,simDevice:item.simDevice,simQualification:item.simQualification,
        stdType:[item.simCategory,item.simDevice,item.simQualification?'('+item.simQualification+')':''].filter(Boolean).join(' '),
        stdMin:item.stdMin,mins:0,aid:'',dep:'',off:'',arr:'',on:'',role:'',picName:'',
        nightMin:0,ifrMin:0,takeoffDay:0,takeoffNight:0,landingDay:0,landingNight:0,
        crossCountry:false,specialOps:{},remarks:item.remarks,
        createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
      });
      return;
    }
    let a=S.aircraft.find(x=>x.reg.toUpperCase()===item.aircraft.reg && x.icao.toUpperCase()===item.aircraft.icao);
    if(!a){
      a={
        id:'a'+Date.now()+Math.random().toString(36).slice(2,7),
        reg:item.aircraft.reg,icao:item.aircraft.icao,
        manufacturer:item.aircraft.manufacturer,model:item.aircraft.model,
        variant:item.aircraft.variant,engine:normalizeEngineConfig(item.aircraft.engine)
      };
      S.aircraft.push(a); aircraftAdded++;
    }

    let importedPerson=item.picName.toLowerCase()===S.pilot.name.toLowerCase()
      ? ownerPerson()
      : ensurePersonForName(item.picName);

    S.flights.push({
      id:'f'+Date.now()+Math.random().toString(36).slice(2,8),
      date:item.date,aid:a.id,dep:item.dep,arr:item.arr,off:item.off,on:item.on,
      mins:item.mins,role:item.role,picName:importedPerson?.name||item.picName,
      picPersonId:importedPerson?.id||'',
      pilotConfig:item.pilotConfig||'single',
      nightMin:item.nightMin,ifrMin:item.ifrMin,
      takeoffDay:item.takeoffDay,takeoffNight:item.takeoffNight,
      landingDay:item.landingDay,landingNight:item.landingNight,
      crossCountry:item.crossCountry,remarks:item.remarks,specialOps:item.specialOps||{},
      instrMin:0,stdType:'',stdMin:0,
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    });
  });
  let count=additions.length;
  if(!save())return;
  pendingImport=null;
  document.getElementById('importModal').classList.remove('open');
  logbook();
  setTimeout(()=>alert(`${count} flight${count===1?'':'s'} imported successfully${aircraftAdded?` and ${aircraftAdded} new aircraft added`:''}.`),50);
}


