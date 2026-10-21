/* V2.26. Maintain topic instructions and release updates here. */
const HELILOG_GUIDE_TOPICS=[
  {
    "category": "Records & signatures",
    "title": "Reusable pilot signatures",
    "summary": "Capture a profile signature and approve use for each endorsement.",
    "steps": [
      "Open Pilots and choose Signature on the relevant person’s card.",
      "Have the named pilot draw a signature and explicitly consent to saving it.",
      "Create an endorsement and select the correct saved instructor or examiner.",
      "The signer must review the record and approve it before applying either their saved signature or a newly drawn signature.",
      "Every signed endorsement keeps its own copy; updating the profile cannot change previously signed records.",
      "The capture feature does not independently verify identity or create a qualified electronic signature."
    ],
    "route": "pilots",
    "action": "Manage pilot signatures"
  },
  {
    "category": "Start here",
    "title": "First-time setup",
    "summary": "Prepare your profile, aircraft and first entry.",
    "steps": [
      "Sign in and check your name, licence and authority in Profile.",
      "Add your helicopter in Aircraft, using its registration and ICAO type designator.",
      "Add other commanders or instructors under Pilots when relevant.",
      "Enter a flight, review it in Logbook and wait for the cloud indicator to show Synced."
    ],
    "route": "profile",
    "action": "Open profile"
  },
  {
    "category": "Start here",
    "title": "Aircraft and pilot profiles",
    "summary": "Save details that can be reused between flights.",
    "steps": [
      "In Aircraft, enter registration, manufacturer, model, ICAO type and engine configuration.",
      "Engine configuration is assigned by helicopter; single-/multi-pilot configuration is chosen for each flight.",
      "In Pilots, save the people who can be selected as PIC or endorse records.",
      "Verify the correct aircraft and commander for every new flight."
    ],
    "route": "aircraft",
    "action": "Manage aircraft"
  },
  {
    "category": "Flights",
    "title": "Quick Flight Entry",
    "summary": "Log a routine flight using the shorter form.",
    "steps": [
      "On mobile tap Flight, or use Quick flight from the dashboard.",
      "Review aircraft and departure/arrival locations and enter the correct flight date.",
      "Enter both times in UTC (24-hour HH:mm or HHmm).",
      "Choose pilot function, operational conditions, take-offs and remarks, then Save.",
      "Use Full details for extra fields; switching keeps values you already entered."
    ],
    "route": "quickadd",
    "action": "Open Quick Flight"
  },
  {
    "category": "Flights",
    "title": "Full flight entry and editing",
    "summary": "Detailed entries, PIC names and protected corrections.",
    "steps": [
      "Use Full entry for pilot configuration, independent landing counts and specialist times.",
      "For PIC/SOLO, HeliLog records SELF in the Name of PIC field; for other functions select the actual PIC.",
      "Edit unarchived records from Logbook.",
      "Archived pages are protected. Propose a correction and use the required addendum process rather than changing a signed page."
    ],
    "route": "logbook",
    "action": "Open logbook"
  },
  {
    "category": "Flights",
    "title": "UTC and automatic night time",
    "summary": "How night minutes are estimated and overridden.",
    "steps": [
      "Enter flight times in UTC and confirm the flight date, especially across midnight.",
      "Night time uses civil twilight and location reference coordinates; it is an estimate.",
      "Known ICAO airport coordinates can be looked up. Add custom helipads in Settings → Aerodromes & Helipads.",
      "Uncheck automatic night calculation to enter night minutes manually when necessary.",
      "Always follow the applicable authority’s definition of night and verify results independently."
    ],
    "route": "locations",
    "action": "Aerodromes & Helipads"
  },
  {
    "category": "Review",
    "title": "Search, filters and flight totals",
    "summary": "Review flights, PIC, Dual, IFR/Night and other experience.",
    "steps": [
      "Use Logbook to search by route, registration, remarks and other fields.",
      "Apply date and operation filters; the filtered totals reflect your selection.",
      "Open Totals for PIC, Co-pilot, Dual, aircraft engine and pilot-configuration breakdowns.",
      "Historical paper logbook time can be entered as brought-forward totals in Settings.",
      "Review all totals against original documents before using them in official applications."
    ],
    "route": "totals",
    "action": "View totals"
  },
  {
    "category": "Review",
    "title": "Export, PDF and Print Archive",
    "summary": "Understand the difference between a PDF copy and archived logbook pages.",
    "steps": [
      "On the desktop website, use Logbook → Export for CSV or a printable PDF copy.",
      "Exporting a PDF does not create numbered, permanently archived pages.",
      "Use Print Archive in a web browser to review and confirm continuous numbered pages and cumulative totals.",
      "Keep signed records safely; if archived records require changes, use an addendum or correction workflow."
    ],
    "route": "logbook",
    "action": "Open logbook"
  },
  {
    "category": "Review",
    "title": "Endorsements and signatures",
    "summary": "Instructor/examiner memoranda and separately archived endorsements.",
    "steps": [
      "Save an instructor or examiner under Pilots before creating an endorsement when needed.",
      "Under Endorsements, enter the date, title, wording and optional related rating.",
      "Review the endorsing person's details and explicitly sign the individual endorsement.",
      "Print and archive endorsement pages through the web browser; signed records have a correction trail."
    ],
    "route": "endorsements",
    "action": "Open endorsements"
  },
  {
    "category": "Cloud & safety",
    "title": "Cloud sync and offline flights",
    "summary": "Read the compact sync indicator and protect pending changes.",
    "steps": [
      "The cloud pill indicates Synced, pending changes, offline status or a sync issue. Tap it for details.",
      "Flights may be entered offline. Reconnect and allow synchronization before using another device.",
      "Resolve any reported conflicts carefully; do not assume one device always has the correct record.",
      "One shared cloud logbook belongs to the account. A fresh device joins existing cloud records automatically after signing in.",
      "If setup finds older local records, review the confirmation and download the preserved pre-sync safety snapshot if needed.",
      "Conflicts are local to the device where they occurred. Review them on that device; a clean web status does not clear a phone conflict.",
      "Do not clear browser or app storage while records are pending or troubleshooting sync."
    ],
    "route": "cloud",
    "action": "Cloud account"
  },
  {
    "category": "Cloud & safety",
    "title": "Backups and recovery",
    "summary": "Preserve a safe copy of your logbook and signed records.",
    "steps": [
      "Settings → Backups shows available backup, verification and recovery functions.",
      "Keep downloaded packages securely: they may include personal details and signatures.",
      "Cloud recovery can verify a package without permitting it to overwrite your synced history.",
      "Avoid resetting the app or deleting storage before preserving records or consulting support."
    ],
    "route": "backups",
    "action": "Backup & recovery"
  },
  {
    "category": "Cloud & safety",
    "title": "Profile, qualifications and settings",
    "summary": "Manage identity, licences, medical details and operating locations.",
    "steps": [
      "Profile stores pilot identity, medical dates, licences and ratings.",
      "Settings contains aircraft-related operating sites, cloud account management, backups and brought-forward totals.",
      "Medical and rating dates are informational records only; HeliLog does not certify currency or regulatory validity.",
      "Review the Help guide again whenever a new version introduces features."
    ],
    "route": "settings",
    "action": "Open settings"
  }
];
const HELILOG_GUIDE_UPDATES=[
  {
    "v": "V2.28",
    "name": "Safer cloud account setup",
    "detail": "New devices join existing cloud records automatically; setup conflicts stay visible and reviewable per device."
  },
  {
    "v": "V2.27",
    "name": "Reusable pilot signatures",
    "detail": "Signatures stored in pilot profiles and applied only with consent on each endorsement."
  },
  {
    "v": "V2.26",
    "name": "Help & User Guide",
    "detail": "A searchable in-app guide and release notes."
  },
  {
    "v": "V2.25",
    "name": "Print preview cleanup",
    "detail": "Removed repeated internal text from export and archive printouts."
  },
  {
    "v": "V2.24",
    "name": "Universal forms",
    "detail": "Examples no longer assume a particular country or helicopter type."
  },
  {
    "v": "V2.23",
    "name": "Quick Flight Entry",
    "detail": "Compact entry mode with Full details when needed."
  },
  {
    "v": "V2.19",
    "name": "UTC & aerodrome tools",
    "detail": "Clear UTC labels and operating-site coordinate management."
  },
  {
    "v": "V2.18",
    "name": "Automatic night minutes",
    "detail": "Civil-twilight estimate with manual override."
  }
];
function helpGuideSearch(){
 const query=String(document.getElementById('helpSearch')?.value||'').trim().toLowerCase();let shown=0;
 document.querySelectorAll('[data-help-topic]').forEach(el=>{const visible=String(el.textContent||'').toLowerCase().includes(query);el.hidden=!visible;if(visible){shown++;if(query)el.open=true;}});
 const result=document.getElementById('helpSearchResults');if(result)result.textContent=shown+' topic'+(shown===1?'':'s')+(query?' found':'');
 const empty=document.getElementById('helpNoResults');if(empty)empty.hidden=shown!==0;
}
function helpGuideExpand(open){
 document.querySelectorAll('[data-help-topic]').forEach(el=>{if(!el.hidden)el.open=!!open;});
}
function helpGuide(){
 const html=HELILOG_GUIDE_TOPICS.map(topic=>`<details class="card guide-topic" data-help-topic>
  <summary><span class="guide-topic-label"><small>${htmlEscape(topic.category)}</small><b>${htmlEscape(topic.title)}</b><span class="muted">${htmlEscape(topic.summary)}</span></span><span class="guide-chevron" aria-hidden="true">⌄</span></summary>
  <div class="guide-topic-body"><ol>${topic.steps.map(step=>`<li>${htmlEscape(step)}</li>`).join('')}</ol><div class="guide-topic-actions"><button class="btn" type="button" onclick="go('${topic.route}')">${htmlEscape(topic.action)} →</button></div></div>
 </details>`).join('');
 app.innerHTML=header('Help & User Guide','Learn the essentials and find instructions for every part of HeliLog')+
 `<section class="card guide-intro"><span class="guide-eyebrow">GETTING STARTED</span><h2>New to HeliLog?</h2><p class="muted">Start with your pilot profile, add your aircraft, enter a flight and check that it is synced.</p>
  <div class="guide-first-steps">
   <button onclick="go('profile')"><span>01</span><b>Profile</b><small>Check your identity</small></button>
   <button onclick="go('aircraft')"><span>02</span><b>Aircraft</b><small>Save a helicopter</small></button>
   <button onclick="go('quickadd')"><span>03</span><b>Quick flight</b><small>Log a flight</small></button>
   <button onclick="go('logbook')"><span>04</span><b>Logbook</b><small>Review & sync</small></button>
  </div>
 </section>
 <section class="guide-library"><div class="guide-library-head"><div><h2>Browse instructions</h2><p class="muted">Search by task, or expand a topic for detailed steps.</p></div>
 <div class="guide-actions"><button class="btn" onclick="helpGuideExpand(true)">Expand all</button><button class="btn" onclick="helpGuideExpand(false)">Collapse all</button></div></div>
 <label for="helpSearch" class="guide-search-label">Search instructions</label><input id="helpSearch" class="guide-search" type="search" placeholder="Try: UTC, PIC, archive, backup…" oninput="helpGuideSearch()" autocomplete="off">
 <div class="mini" id="helpSearchResults" role="status" aria-live="polite">${HELILOG_GUIDE_TOPICS.length} topics</div>
 <div class="guide-topics">${html}</div><div id="helpNoResults" class="card" hidden>No matching topics. Try another keyword.</div></section>
 <section class="card guide-updates"><h2>What's new</h2><p class="muted">We update this guide when HeliLog gains new features.</p>
 ${HELILOG_GUIDE_UPDATES.map(x=>`<div class="guide-update"><span class="guide-version">${htmlEscape(x.v)}</span><div><b>${htmlEscape(x.name)}</b><div class="muted">${htmlEscape(x.detail)}</div></div></div>`).join('')}</section>
 <p class="guide-disclaimer">HeliLog helps maintain records. Pilots remain responsible for accurate entries and meeting the rules of their competent authority.</p>`;
}
