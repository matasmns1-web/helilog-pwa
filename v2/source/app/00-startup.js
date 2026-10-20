const LIVE_KEY='helilog_v2_complete_test_data'; // Separate V2 test browser key.
const SANDBOX_KEY='helilog_v2_complete_test_sandbox';
const MODE_KEY='helilog_v2_complete_test_mode';
const TEST_MODE=localStorage.getItem(MODE_KEY)==='test';
let KEY=TEST_MODE?SANDBOX_KEY:LIVE_KEY;
// All existing logbook saves, migrations, imports and archive snapshots use KEY.
// Test and live records therefore reside in distinct browser-storage entries.
document.documentElement.classList.toggle('helilog-test-mode',TEST_MODE);
const seed={pilot:{name:'Matas',licence:'CPL(H)',authority:'TKA'},aircraft:[
{id:'a1',reg:'LY-ABC',manufacturer:'Guimbal',model:'Cabri',variant:'G2',icao:'G2CA',engine:'Single engine'},
{id:'a2',reg:'LY-H125',manufacturer:'Airbus',model:'H125',variant:'',icao:'AS50',engine:'Single engine'},
{id:'a3',reg:'LY-R44',manufacturer:'Robinson',model:'R44',variant:'Raven II',icao:'R44',engine:'Single engine'},
{id:'a_ec135_demo',reg:'LY-EC1',manufacturer:'Airbus Helicopters',model:'EC135',variant:'',icao:'EC35',engine:'Multi engine'}
],people:[
{id:'p1',name:'Matas'},{id:'p2',name:'Jonas Instructor'},{id:'p3',name:'Marco Rossi'},{id:'p4',name:'Anna Pilot'}
],flights:[
{id:'f101',date:'2026-10-01',aid:'a1',dep:'EYVI',arr:'EYVI',off:'10:15',on:'11:35',mins:80,role:'PIC',picName:'Matas',nightMin:0,ifrMin:0,takeoffDay:3,takeoffNight:0,landingDay:3,landingNight:0,crossCountry:false,remarks:'Local handling flight'},
{id:'f102',date:'2026-09-29',aid:'a1',dep:'EYVI',arr:'EYKA',off:'09:30',on:'10:55',mins:85,role:'PIC',picName:'Matas',nightMin:0,ifrMin:0,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'Cross-country to Kaunas'},
{id:'f103',date:'2026-09-27',aid:'a1',dep:'EYVI',arr:'EYVI',off:'13:10',on:'14:05',mins:55,role:'DUAL',picName:'Jonas Instructor',nightMin:0,ifrMin:0,takeoffDay:4,takeoffNight:0,landingDay:4,landingNight:0,crossCountry:false,remarks:'Advanced handling training'},
{id:'f104',date:'2026-09-24',aid:'a1',dep:'EYVI',arr:'EYPN',off:'15:05',on:'16:25',mins:80,role:'SOLO',picName:'Matas',nightMin:0,ifrMin:0,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'Solo navigation exercise'},
{id:'f105',date:'2026-09-20',aid:'a1',dep:'EYVI',arr:'EYVI',off:'19:10',on:'20:25',mins:75,role:'PIC',picName:'Matas',nightMin:35,ifrMin:0,takeoffDay:1,takeoffNight:2,landingDay:1,landingNight:2,crossCountry:false,remarks:'Night circuits'},
{id:'f106',date:'2026-09-17',aid:'a2',dep:'EYVI',arr:'EYSA',off:'08:20',on:'10:05',mins:105,role:'PICUS',picName:'Marco Rossi',nightMin:0,ifrMin:30,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'Supervised cross-country with IFR segment'},
{id:'f107',date:'2026-09-14',aid:'a2',dep:'EYSA',arr:'EYVI',off:'11:00',on:'12:30',mins:90,role:'PICUS',picName:'Marco Rossi',nightMin:0,ifrMin:20,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'Return sector under supervision'},
{id:'f108',date:'2026-09-10',aid:'a2',dep:'EYVI',arr:'EYVI',off:'17:40',on:'18:35',mins:55,role:'CO-PILOT',picName:'Anna Pilot',nightMin:0,ifrMin:0,takeoffDay:2,takeoffNight:0,landingDay:2,landingNight:0,crossCountry:false,remarks:'Familiarisation flight'},
{id:'f109',date:'2026-09-06',aid:'a1',dep:'EYVI',arr:'EYVI',off:'07:15',on:'08:05',mins:50,role:'SPIC',picName:'Jonas Instructor',nightMin:0,ifrMin:0,takeoffDay:3,takeoffNight:0,landingDay:3,landingNight:0,crossCountry:false,remarks:'SPIC local training'},
{id:'f110',date:'2026-09-02',aid:'a3',dep:'EYVI',arr:'EYKA',off:'12:25',on:'13:50',mins:85,role:'DUAL',picName:'Anna Pilot',nightMin:0,ifrMin:0,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'R44 conversion navigation'},
{id:'f111',date:'2026-08-29',aid:'a3',dep:'EYKA',arr:'EYVI',off:'14:10',on:'15:30',mins:80,role:'DUAL',picName:'Anna Pilot',nightMin:0,ifrMin:0,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'R44 return navigation'},
{id:'f112',date:'2026-08-25',aid:'a1',dep:'EYVI',arr:'EYVI',off:'20:20',on:'21:25',mins:65,role:'PIC',picName:'Matas',nightMin:65,ifrMin:0,takeoffDay:0,takeoffNight:4,landingDay:0,landingNight:4,crossCountry:false,remarks:'Night proficiency'},
{id:'f113',date:'2026-08-19',aid:'a2',dep:'EYVI',arr:'EYPA',off:'09:00',on:'10:40',mins:100,role:'CO-PILOT',picName:'Marco Rossi',nightMin:0,ifrMin:45,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'IFR training sector'},
{id:'f114',date:'2026-08-15',aid:'a2',dep:'EYPA',arr:'EYVI',off:'12:30',on:'14:05',mins:95,role:'CO-PILOT',picName:'Marco Rossi',nightMin:0,ifrMin:40,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'IFR return sector'},
{id:'f115',date:'2026-08-09',aid:'a1',dep:'EYVI',arr:'EYMO',off:'16:00',on:'17:10',mins:70,role:'PIC',picName:'Matas',nightMin:0,ifrMin:0,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'Cross-country navigation'},
{id:'f116',date:'2026-08-03',aid:'a1',dep:'EYMO',arr:'EYVI',off:'10:40',on:'11:50',mins:70,role:'PIC',picName:'Matas',nightMin:0,ifrMin:0,takeoffDay:1,takeoffNight:0,landingDay:1,landingNight:0,crossCountry:true,remarks:'Return navigation'},
{id:'f117',date:'2026-07-28',aid:'a1',dep:'EYVI',arr:'EYVI',off:'06:50',on:'07:45',mins:55,role:'PIC',picName:'Matas',nightMin:0,ifrMin:0,takeoffDay:5,takeoffNight:0,landingDay:5,landingNight:0,crossCountry:false,remarks:'Circuits and confined area practice'},
{id:'f118',date:'2026-07-22',aid:'a3',dep:'EYVI',arr:'EYVI',off:'18:10',on:'19:00',mins:50,role:'DUAL',picName:'Anna Pilot',nightMin:0,ifrMin:0,takeoffDay:3,takeoffNight:0,landingDay:3,landingNight:0,crossCountry:false,remarks:'R44 handling'}
]}; 
let S;
try{
  const stored=localStorage.getItem(KEY);
  if(TEST_MODE&&!stored)throw new Error('The test sandbox is missing. Exit Test Mode via the sandbox settings; main logbook data has not been modified.');
  S=JSON.parse(stored||'null')||seed;
}
catch(e){
  // Never overwrite corrupt stored records with the demo seed.
  const root=document.getElementById('app');
  if(root)root.innerHTML='<div class="card"><h2>Stored HeliLog data cannot be read</h2>'+
    '<p>Your existing browser data has NOT been reset or overwritten. Do not clear site storage. '+
    'Restore from a known-good backup only after preserving the original browser data.</p>'+
    (TEST_MODE?'<button class="btn" onclick="localStorage.removeItem(\'helilog_v2_complete_test_mode\');location.reload()">Return to main logbook safely</button>':'')+
    '</div>';
  throw new Error('HeliLog stopped to protect unreadable stored data: '+String(e.message||e));
}
const $=s=>document.querySelector(s), app=$('#app');

