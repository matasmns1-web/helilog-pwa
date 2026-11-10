/* V2.57 — read-only flight statistics. Corrected flight snapshots are supplied
 * by effectiveFlights(); previous paper totals and simulator hours do not
 * acquire invented dates or inflate flight-time statistics. */
const FLIGHT_STATS_PIC_ROLES=['PIC','SOLO','SPIC','PICUS'];
const FLIGHT_STATS_ROLES=['PIC','SOLO','SPIC','PICUS','CO-PILOT','DUAL'];
let flightStatsSelection={range:'all',type:'',role:'',operation:'',condition:'',crew:'',from:'',to:''};
function flightStatsTodayISO(){
  const now=new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
    String(now.getDate()).padStart(2,'0')].join('-');
}
function flightStatsValidISO(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return false;
  const [y,m,d]=s.split('-').map(Number);
  const date=new Date(y,m-1,d);
  return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
}
function flightStatsDateBefore(today,days){
  const [y,m,d]=today.split('-').map(Number),date=new Date(y,m-1,d);
  date.setDate(date.getDate()-days);
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),
    String(date.getDate()).padStart(2,'0')].join('-');
}
function flightStatsBounds(filters,today=flightStatsTodayISO()){
  const range=filters.range||'all';
  if(range==='90')return {from:flightStatsDateBefore(today,89),to:today};
  if(range==='365')return {from:flightStatsDateBefore(today,364),to:today};
  if(range==='year')return {from:today.slice(0,4)+'-01-01',to:today};
  if(range==='custom'){
    const from=filters.from||'',to=filters.to||'';
    if((from&&!flightStatsValidISO(from))||(to&&!flightStatsValidISO(to))||(from&&to&&from>to))
      return {from,to,invalid:true};
    return {from,to};
  }
  return {from:'',to:''};
}
function flightStatsMinutes(n){
  const v=Number(n);
  return Number.isSafeInteger(v)&&v>=0?v:0;
}
function flightStatsCompute(entries,aircraft,operations,filters={},today=flightStatsTodayISO()){
  const bounds=flightStatsBounds(filters,today),byAircraft=new Map();
  for(const a of aircraft||[])if(a?.id&&!byAircraft.has(a.id))byAircraft.set(a.id,a);
  const byType=new Map(),byRole=new Map(),byOp=new Map(),byPeriod=new Map();
  const totals={flights:0,minutes:0,pic:0,copilot:0,dual:0,night:0,ifr:0,xc:0,
    engineSE:0,engineME:0,single:0,multi:0,takeoffs:0,landings:0};
  let eligible=0,simulators=0;
  const roleNames=FLIGHT_STATS_ROLES;
  for(const f of entries||[]){
    if(!f)continue;
    if(f.entryType==='simulator'){simulators++;continue;}
    eligible++;
    const date=String(f.date||'');
    if(bounds.invalid||(bounds.from&&date<bounds.from)||(bounds.to&&date>bounds.to))continue;
    const a=byAircraft.get(f.aid);
    const type=String(a?.icao||'—').trim().toUpperCase()||'—';
    const role=String(f.role||'—').toUpperCase();
    const opData=f.specialOps&&typeof f.specialOps==='object'&&!Array.isArray(f.specialOps)?f.specialOps:{};
    if(filters.type&&type!==filters.type)continue;
    if(filters.role&&filters.role!=='PIC_GROUP'&&role!==filters.role)continue;
    if(filters.role==='PIC_GROUP'&&!FLIGHT_STATS_PIC_ROLES.includes(role))continue;
    if(filters.operation&&!Object.prototype.hasOwnProperty.call(opData,filters.operation))continue;
    if(filters.crew&&flightPilotConfig(f)!==filters.crew)continue;
    if(filters.condition==='night'&&!(flightStatsMinutes(f.nightMin)>0))continue;
    if(filters.condition==='ifr'&&!(flightStatsMinutes(f.ifrMin)>0))continue;
    if(filters.condition==='xc'&&!f.crossCountry)continue;
    const minutes=flightStatsMinutes(f.mins),night=Math.min(minutes,flightStatsMinutes(f.nightMin)),
      ifr=Math.min(minutes,flightStatsMinutes(f.ifrMin));
    totals.flights++;
    totals.minutes+=minutes;
    if(FLIGHT_STATS_PIC_ROLES.includes(role))totals.pic+=minutes;
    if(role==='CO-PILOT')totals.copilot+=minutes;
    if(role==='DUAL')totals.dual+=minutes;
    totals.night+=night;totals.ifr+=ifr;
    if(f.crossCountry)totals.xc+=minutes;
    if(engineCode(a)==='ME')totals.engineME+=minutes;else totals.engineSE+=minutes;
    if(flightPilotConfig(f)==='multi')totals.multi+=minutes;else totals.single+=minutes;
    totals.takeoffs+=flightStatsMinutes(f.takeoffDay)+flightStatsMinutes(f.takeoffNight);
    totals.landings+=flightStatsMinutes(f.landingDay)+flightStatsMinutes(f.landingNight);
    const typeRow=byType.get(type)||{key:type,minutes:0,flights:0};
    typeRow.minutes+=minutes;typeRow.flights++;byType.set(type,typeRow);
    const roleRow=byRole.get(role)||{key:role,minutes:0,flights:0};
    roleRow.minutes+=minutes;roleRow.flights++;byRole.set(role,roleRow);
    for(const op of operations||[]){
      if(!Object.prototype.hasOwnProperty.call(opData,op.code))continue;
      const opRow=byOp.get(op.code)||{key:op.code,label:op.label,minutes:0,flights:0};
      opRow.flights++;opRow.minutes+=Math.min(minutes,flightStatsMinutes(opData[op.code]));
      byOp.set(op.code,opRow);
    }
    if(flightStatsValidISO(date)){
      const bucket=(filters.range||'all')==='all'?date.slice(0,4):date.slice(0,7);
      const row=byPeriod.get(bucket)||{key:bucket,minutes:0,flights:0};
      row.minutes+=minutes;row.flights++;byPeriod.set(bucket,row);
    }
  }
  const sort=(map)=>[...map.values()].sort((a,b)=>b.minutes-a.minutes||a.key.localeCompare(b.key));
  return {totals,byType:sort(byType),byRole:sort(byRole),byOp:sort(byOp),
    trend:[...byPeriod.values()].sort((a,b)=>a.key.localeCompare(b.key)),
    bounds,eligible,simulators};
}
function flightStatsBarRows(rows,unit='hours',maxItems=8){
  if(!rows.length)return '<div class="mini">No recorded flight time in this selection.</div>';
  const max=Math.max(1,...rows.map(x=>x.minutes));
  return '<div class="flight-stats-barlist">'+rows.slice(0,maxItems).map(x=>{
    const width=x.minutes>0?Math.max(2,Math.round(100*x.minutes/max)):0;
    const label=htmlEscape(x.label||x.key);
    return '<div class="flight-stats-barrow"><div class="flight-stats-barhead"><b>'+label+
      '</b><span>'+fmt(x.minutes)+' <span class="mini">· '+x.flights+
      ' flight'+(x.flights===1?'':'s')+'</span></span></div>'+
      '<div class="flight-stats-track" aria-hidden="true"><span style="width:'+width+'%"></span></div></div>';
  }).join('')+'</div>'+(rows.length>maxItems?
    '<div class="mini" style="margin-top:9px">Showing the top '+maxItems+' categories by recorded hours.</div>':'');
}
function flightStatsTrendMarkup(rows){
  if(!rows.length)return '<div class="mini">No dated flights match these filters.</div>';
  const max=Math.max(1,...rows.map(x=>x.minutes));
  return '<div class="flight-stats-trend" role="list" aria-label="Recorded flight time by period">'+
    rows.slice(-12).map(x=>{
      const w=x.minutes>0?Math.max(2,Math.round(100*x.minutes/max)):0;
      return '<div role="listitem" class="flight-stats-trendrow"><span>'+htmlEscape(x.key)+'</span>'+
        '<div class="flight-stats-track" aria-hidden="true"><span style="width:'+w+'%"></span></div>'+
        '<b>'+fmt(x.minutes)+'</b></div>';
    }).join('')+'</div>';
}
function flightStatsOption(value,label,selected){
  return '<option value="'+htmlEscape(value)+'"'+(selected===value?' selected':'')+'>'+htmlEscape(label)+'</option>';
}
function flightStatsPage(){
  const active=flightStatsSelection;
  const types=[...new Set((S.aircraft||[]).map(a=>String(a.icao||'').trim().toUpperCase()).filter(Boolean))].sort();
  const usedOps=new Set();
  for(const f of effectiveFlights())if(f?.entryType!=='simulator')
    for(const code of Object.keys(f?.specialOps||{}))usedOps.add(code);
  const options=SPECIAL_OPS.filter(op=>usedOps.has(op.code));
  const select=(id,items)=>'<select id="'+id+'" onchange="flightStatsRefresh()">'+items.join('')+'</select>';
  app.innerHTML=header('Flight statistics','Explore your recorded helicopter experience',
    '<button class="btn" type="button" onclick="go(\'totals\')">Career totals</button>')+
    '<div class="card flight-stats-filters">'+
      '<div class="head"><h2>Filter flights</h2><button class="btn" type="button" onclick="flightStatsReset()">Clear filters</button></div>'+
      '<div class="flight-stats-filtergrid">'+
        '<div class="filterfield"><label for="flightStatsRange">Period</label>'+
        select('flightStatsRange',[
          flightStatsOption('all','All recorded flights',active.range),
          flightStatsOption('90','Last 90 days',active.range),
          flightStatsOption('365','Last 12 months',active.range),
          flightStatsOption('year','This year',active.range),
          flightStatsOption('custom','Custom dates',active.range)])+'</div>'+
        '<div class="filterfield"><label for="flightStatsType">ICAO helicopter type</label>'+
        select('flightStatsType',[flightStatsOption('','All types',active.type),...types.map(t=>flightStatsOption(t,t,active.type))])+'</div>'+
        '<div class="filterfield"><label for="flightStatsRole">Pilot function</label>'+
        select('flightStatsRole',[flightStatsOption('','All functions',active.role),flightStatsOption('PIC_GROUP','PIC total (PIC, SOLO, SPIC, PICUS)',active.role),
          ...FLIGHT_STATS_ROLES.map(r=>flightStatsOption(r,r,active.role))])+'</div>'+
        '<div class="filterfield"><label for="flightStatsOp">Specialised operation</label>'+
        select('flightStatsOp',[flightStatsOption('','All operations',active.operation),
          ...options.map(op=>flightStatsOption(op.code,op.label,active.operation))])+'</div>'+
      '</div>'+
      '<details class="flight-stats-more"'+(active.range==='custom'||active.crew||active.condition?' open':'')+'><summary>More filters · dates, conditions & crew</summary>'+
        '<div class="flight-stats-filtergrid">'+
        '<div class="filterfield"><label for="flightStatsFrom">From</label><input type="date" id="flightStatsFrom" value="'+htmlEscape(active.from)+'" onchange="flightStatsUseCustomDate()"></div>'+
        '<div class="filterfield"><label for="flightStatsTo">To</label><input type="date" id="flightStatsTo" value="'+htmlEscape(active.to)+'" onchange="flightStatsUseCustomDate()"></div>'+
        '<div class="filterfield"><label for="flightStatsCondition">Flight condition</label>'+
          select('flightStatsCondition',[
            flightStatsOption('','All flights',active.condition),
            flightStatsOption('night','Night time recorded',active.condition),
            flightStatsOption('ifr','IFR time recorded',active.condition),
            flightStatsOption('xc','Cross-country flights',active.condition)])+'</div>'+
        '<div class="filterfield"><label for="flightStatsCrew">Crew configuration</label>'+
          select('flightStatsCrew',[
            flightStatsOption('','SP and MP',active.crew),
            flightStatsOption('single','Single-pilot',active.crew),
            flightStatsOption('multi','Multi-pilot',active.crew)])+'</div>'+
        '</div></details>'+
      '<div class="mini" style="margin-top:11px">Read-only statistics from your recorded flights, including confirmed archive corrections. Simulator sessions and previous paper-logbook totals are excluded; see Career totals for combined experience.</div>'+
    '</div><div id="flightStatsResults"></div>';
  flightStatsRefresh();
}
function flightStatsReset(){
  flightStatsSelection={range:'all',type:'',role:'',operation:'',condition:'',crew:'',from:'',to:''};
  flightStatsPage();
}
function flightStatsUseCustomDate(){
  const range=document.getElementById('flightStatsRange');
  if(range)range.value='custom';
  flightStatsRefresh();
}
function flightStatsRefresh(){
  const value=id=>document.getElementById(id)?.value||'';
  const state={
    range:value('flightStatsRange'),type:value('flightStatsType'),role:value('flightStatsRole'),
    operation:value('flightStatsOp'),condition:value('flightStatsCondition'),
    crew:value('flightStatsCrew'),from:value('flightStatsFrom'),to:value('flightStatsTo')
  };
  flightStatsSelection=state;
  const result=document.getElementById('flightStatsResults');
  if(!result)return;
  const stats=flightStatsCompute(effectiveFlights(),S.aircraft,SPECIAL_OPS,state);
  const t=stats.totals;
  const card=(name,value)=>'<div class="card"><div class="label">'+name+'</div><div class="big">'+value+'</div></div>';
  result.innerHTML=(stats.bounds.invalid?
    '<div class="note" role="alert" style="margin-top:12px">Please select a valid date range (From must not be after To).</div>':'')+
    '<div class="grid flight-stats-kpis" style="margin-top:14px">'+
      card('Flights',String(t.flights))+card('Flight time',fmt(t.minutes))+
      card('PIC time',fmt(t.pic))+card('Night',fmt(t.night))+
      card('IFR',fmt(t.ifr))+card('Cross-country',fmt(t.xc))+
    '</div>'+
    '<div class="flight-stats-grid" style="margin-top:14px">'+
      '<div class="card"><div class="head"><h2>By ICAO helicopter type</h2></div>'+
        flightStatsBarRows(stats.byType)+'</div>'+
      '<div class="card"><div class="head"><h2>By pilot function</h2></div>'+
        flightStatsBarRows(stats.byRole)+'</div>'+
      '<div class="card"><div class="head"><h2>Specialised operations</h2></div>'+
        flightStatsBarRows(stats.byOp)+
        '<div class="mini" style="margin-top:10px">Operation hours are subsets of flight time. Categories can overlap and must not be added together.</div></div>'+
      '<div class="card"><div class="head"><h2>Flying-hours trend</h2></div>'+
        flightStatsTrendMarkup(stats.trend)+
        '<div class="mini" style="margin-top:10px">Calendar '+(state.range==='all'?'years':'months')+
        ' · recorded flight time only</div></div>'+
    '</div>'+
    '<div class="card flight-stats-detail" style="margin-top:14px"><div class="head"><h2>Selected experience</h2></div>'+
      '<div><span>Single-engine</span><b>'+fmt(t.engineSE)+'</b></div>'+
      '<div><span>Multi-engine</span><b>'+fmt(t.engineME)+'</b></div>'+
      '<div><span>Single-pilot</span><b>'+fmt(t.single)+'</b></div>'+
      '<div><span>Multi-pilot</span><b>'+fmt(t.multi)+'</b></div>'+
      '<div><span>Co-pilot</span><b>'+fmt(t.copilot)+'</b></div>'+
      '<div><span>Dual</span><b>'+fmt(t.dual)+'</b></div>'+
      '<div><span>Take-offs</span><b>'+t.takeoffs+'</b></div>'+
      '<div><span>Landings</span><b>'+t.landings+'</b></div>'+
    '</div>';
}
