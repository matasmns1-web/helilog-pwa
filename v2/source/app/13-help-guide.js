/* V2.36.1. Searchable, offline-friendly guide and current release notes. */
const HELILOG_GUIDE_TOPICS=[
  {
    "category": "Flight operations",
    "title": "Advanced recency — custom operator profiles",
    "summary": "Configure separate operator thresholds without changing EASA recency calculations.",
    "steps": [
      "Open Recency → Manage operator rules.",
      "Create an operator profile, select Manage, then Add rule.",
      "Enter a rule name, ICAO helicopter type, crew configuration, minimum, measurement unit and rolling period.",
      "Select flight, approved FFS, check or training as permissible sources only where the operator requirements allow them.",
      "Use Set active to choose the applicable operator profile; other profiles can remain inactive.",
      "Operator profiles, rules and associated evidence synchronize with the signed-in account. Check cloud sync before changing rules from another device.",
      "Record supporting FFS, check or training references where the operator rule permits them. Only pilot-reviewed evidence is eligible for operator tracking; HeliLog does not upload those files or certify regulatory credit."
    ],
    "route": "operatorrules",
    "action": "Manage operator rules"
  },
  {
    "category": "Flight operations",
    "title": "Specialised operations — cycles and recent experience",
    "summary": "Record operational cycles alongside hours, then review the dedicated NVIS, HHO and offshore 90-day counters.",
    "steps": [
      "Open Full Flight Entry → More details → Specialised helicopter operations.",
      "Tick the operations flown and enter Operation time (H:MM). For operations with cycles, enter completed Day cycles and Night cycles; OFFSHORE Day landings and Night landings count qualifying landings at offshore locations (platforms, helidecks or vessels), including the corresponding take-off, departure and approach.",
      "A flight marked NVIS counts as one NVIS flight for the 90-day indicator, even if its operation-time entry is zero. NVIS does not use a cycle counter.",
      "For HHO, only count hoist cycles containing a transition to and from hover. Night counts require recorded night flight time. Old entries without cycle counts remain unknown and are never silently credited.",
      "Open Recency to see NVIS and Hoist thresholds combined across SP/MP records within an aircraft type, while offshore and passenger-carrying retain separate pilot configurations. Select dashboard indicators as desired.",
      "These are record-based indicators, not authorisations. Operator approval, relevant crew role, training/checking, supervised operations and approved simulator alternatives must be checked separately."
    ],
    "route": "recency",
    "action": "Open Recency"
  },
  {
    "category": "Flight operations",
    "title": "Recent experience — passenger and night (FCL.060)",
    "summary": "Automatically estimate 90-day recency from single-pilot PIC/SOLO movements, with optional manual PF evidence.",
    "steps": [
      "Open Recency from the desktop navigation, the mobile More menu, or the dashboard Recent experience summary.",
      "Under Show on dashboard, tick any combination of Passenger-carrying and Night PIC recency for each aircraft type and pilot configuration. Choices save automatically on this device; if none is selected, no recency card appears on the dashboard.",
      "Recency follows a rolling preceding 90-day window, not a fixed certificate. The dashboard and details show a status instead of an ever-increasing x/3 counter; when enough qualifying movements are recorded, HeliLog shows when the recorded threshold would lapse if you make no further qualifying flights.",
      "The Dashboard shows compact recent-experience rows next to Upcoming dates. On the Recency page, expand an item under All recencies to see counts, rule references and more detailed qualification notes.",
      "Indicators are grouped under their aircraft type with Passenger-carrying and Night PIC as the row names. Single-/multi-pilot labels only appear when the same recency type exists in both pilot configurations.",
      "A recorded threshold is labelled Met for simplicity; open the recency details to see whether the evidence was independently confirmed or estimated from paired movements. HeliLog does not certify privileges.",
      "Review each type separately; single-pilot and multi-pilot flying are not automatically combined.",
      "For single-pilot PIC/SOLO, normal day/night take-off and landing counts automatically provide a recency estimate, including earlier logbook flights. There is no need to enter the same movements again.",
      "To exclude an exceptional PIC/SOLO flight from the estimate, edit the unsigned flight and tick Exclude from automatic recency estimate under Full details → More details. Other pilot functions and multi-pilot operations still offer manual PF evidence fields.",
      "Only aircraft types/configurations with real flying history appear; Night PIC recency stays hidden where no night flights have been recorded. Old night experience remains visible even when the 90-day threshold has lapsed.",
      "Private and training flights may count toward FCL.060 recency when qualified as PF; this does not classify them as CAT. Automatic paired-movement estimates cannot independently verify an approach, and the app never certifies legal currency. Archive history remains unchanged."
    ],
    "route": "recency",
    "action": "Open Recency"
  },
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
    "category": "Safety",
    "title": "Verify an independent encrypted backup offline",
    "summary": "Check a saved encrypted file even if Supabase or your account is unavailable.",
    "steps": [
      "When signed in, open Settings → Backup & Recovery, make a fresh cloud snapshot, and choose Download encrypted backup. Select a strong passphrase and store it separately from the encrypted file.",
      "Copy the downloaded encrypted JSON file to independently managed storage such as a secure drive or a separate storage provider. HeliLog does not upload it elsewhere automatically.",
      "On the sign-in screen expand Verify an encrypted backup without signing in, or while signed in use Backup & Recovery → Verify encrypted backup offline. Both accept the saved encrypted cloud snapshot JSON and its original passphrase.",
      "Use the encrypted snapshot verifier only for files downloaded through Download encrypted backup. Full HeliLog backups are a separate JSON format and cannot be checked with this verifier. Checking a file does not restore data.",
      "A successful check confirms the file decrypted, its archived records and signed addenda passed structural checks, and its contents reconstructed with matching SHA-256 fingerprints in memory. No data is uploaded or restored.",
      "Review the backup date, age and encrypted-file SHA-256 fingerprint. Check that the file you stored independently has the same fingerprint and is recent enough for your needs.",
      "If a check fails, keep the original file unchanged and make a fresh encrypted backup when the cloud is available. Never uninstall your only working app or overwrite live records while troubleshooting.",
      "An independent verified file is useful for future disaster recovery, but actually rebuilding a lost Supabase project remains a separate supervised process; this screen is not a restore tool."
    ],
    "route": "backups",
    "action": "Open Backup & Recovery"
  },
  {
    "category": "Start here",
    "title": "First-time setup",
    "summary": "Prepare your profile, aircraft and first entry.",
    "steps": [
      "Sign in to your private HeliLog account. Your first device initializes the shared cloud logbook; a new, clean device joins the same records after signing in.",
      "In Profile check your name, licence, authority, ratings and medical details. Add your helicopter in Aircraft, including its registration and ICAO type designator.",
      "Add commanders or instructors under Pilots. Saved signatures require the pilot’s consent and may only be used on endorsements with separate approval.",
      "If moving from an older paper logbook, enter brought-forward flight totals under Settings and verify them against the paper record before entering new flights.",
      "Enter a flight using UTC time, review it in Logbook, then use the cloud status pill to confirm Synced. Keep a separate recovery backup of important records."
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
      "The compact Quick Flight screen pairs date/aircraft, departure/UTC time, arrival/UTC time, flight duration/function, take-offs and Night/IFR. Save stays above the phone navigation bar.",
      "Quick Flight stays at the top and does not drift when you swipe if all fields fit above the phone navigation. Opening the keyboard unlocks normal scrolling; expanding fields or showing a long warning also permits scrolling whenever needed.",
      "For PIC or SOLO, the Name of PIC is SELF automatically; DUAL, SPIC, PICUS and CO-PILOT show the commander's PIC field.",
      "Night time stays on automatic UTC/civil-twilight calculation by default. If coordinates are unavailable, an on-screen warning tells you to choose manual night time or set up your site.",
      "Open Cross-country & remarks only when needed. Use Full details for multi-pilot configuration, independent landing counts, instructor and specialised operations.",
      "Switching Quick/Full retains anything you entered, and Save still uses exactly the same validation as the full form. Small screens or additional warnings may require scrolling."
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
      "Under Settings → Import previous logbook totals, enter your carried-forward flight time, pilot/engine breakdown and aircraft-type hours.",
      "For historical specialist operations, use Specialised operations… to open a compact popup. Enter hours for VRLL, HESLO, HEC, NVIS, HHO, offshore and other categories as H:MM or decimal hours.",
      "Apply the popup values, then confirm Import totals / Save correction on the main form. Cancelling the popup discards only the edits made within the popup.",
      "On Totals, Previous + Recorded here = Combined specialised-operation hours. Historical hours do not create flights, and overlapping categories are not added to Total flying time.",
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
      "On the web (not the installed iPhone app), open Print Archive and choose the number of pages to include in the next batch.",
      "Pre-archive safety checks run automatically for the selected batch. When there are no findings, Preview / Print pages is available immediately. Otherwise select Review flights before printing to inspect possible duplicates, PIC identity, UTC time issues and totals.",
      "If any findings or page-order warnings are shown, inspect the flagged entries and acknowledge that exact selection. Changing flight data, selected pages or findings requires a fresh check and, if necessary, another review.",
      "Whether the checks are clean or findings have been acknowledged, preview the numbered pages, verify the running totals, print and physically sign them, and separately confirm the printed batch in HeliLog.",
      "Printing a PDF alone does not create a signed archive. Confirmed pages are locked; amend them through a signed correction addendum."
    ],
    "route": "logbook",
    "action": "Open logbook"
  },
  {
    "category": "Review",
    "title": "Pre-archive flight review",
    "summary": "Check the exact flights about to be printed for common issues before signing.",
    "steps": [
      "On the web open Print Archive, then choose how many pages to include in the next batch.",
      "HeliLog automatically runs read-only checks against the selected pages and the entire logbook, including earlier archived entries. If there are no findings, skip the acknowledgement page and select Preview / Print pages.",
      "Check missing PIC information and pilot links, flight duration versus UTC off/on times (including overnight flights), unusual very short or long flights, Night/IFR/instructor minutes and take-off versus landing counts.",
      "Review the independent calculations of PIC/Co-pilot/Dual, engine and single-/multi-pilot experience, and carried-forward plus closing totals.",
      "Review overlapping flight intervals, including multiple flights on the same day or an overnight arrival on the next UTC day. Flights that end when another starts are not overlaps.",
      "Use View entry or View related entry to inspect a flagged flight, then select Back to review to return to the same finding. A ticked acknowledgement stays checked only if the selected batch has not changed.",
      "Edit only an unarchived entry through its normal form. After any flight or page change, HeliLog rechecks the batch and requires acknowledgement if findings remain. Records are never silently changed or deleted.",
      "When findings exist, select Review flights before printing and acknowledge the exceptions before preview. A clean batch requires no acknowledgement, but HeliLog rechecks safety before both preview and final confirmation.",
      "Print, verify and sign the paper pages before separately confirming the archive. Archived records remain protected."
    ],
    "route": "printarchive",
    "action": "Open Print Archive"
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
      "HeliLog uses one shared cloud logbook per account, not a permanent primary or secondary device. All signed-in devices should ultimately use the same cloud records.",
      "A brand-new device normally joins the existing account automatically. A previously used device with its own local records may need a review before adopting cloud copies.",
      "Finish cloud setup under Settings → Cloud account. When joining existing cloud data, HeliLog preserves the device’s earlier records in a downloadable pre-sync safety snapshot.",
      "Synced means the active workspace has completed record synchronization; Pending means unsent edits; Offline means local changes await internet; Conflict means you must review different copies.",
      "Flights may be entered offline. Reconnect and allow synchronization before editing the same entries on another device.",
      "The Check sign-in connection button confirms authentication; use Check / sync now to synchronize records. A valid sign-in is not proof that all records are synced.",
      "Resolve conflicts on the specific device reporting them. Compare copies and choose deliberately; HeliLog never automatically merges conflicting signatures or signed archives.",
      "Never clear iPhone app data, uninstall your only copy or force-upload while records are unsynced or being recovered."
    ],
    "route": "cloud",
    "action": "Cloud account"
  },
  {
    "category": "Cloud & safety",
    "title": "Backups and recovery",
    "summary": "Preserve a safe copy of your logbook and signed records.",
    "steps": [
      "Settings → Backup & Recovery has download, health-check and restoration tools. Keep independent backups before important archive operations.",
      "Downloads may include personal details, licences and images of signatures: save them securely and do not publish or share backup files.",
      "If a pilot or signed endorsement vanishes after joining an existing cloud account, do not reinstall the app or import an old full workspace over the newer one.",
      "On the original device open Settings → Cloud account → Download preserved pre-sync data. Then choose Review preserved pilots and endorsements.",
      "After resolving any local sync conflict using Check / sync now, select Preview safe restoration. It checks which records are truly missing from the active device and cloud.",
      "Read the list and choose Restore these missing records only if it is correct. The recovery creates a device-local safety copy first and syncs the recovered pilot/signature and endorsement without replacing other records.",
      "Signed endorsements retain their stored signatures and dates. A collision or unavailable signatory cannot be restored automatically and needs separate attention."
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
 {v:"V2.44",name:"Protected account-wide data reset",detail:"The Data management area prepares a mandatory safety backup and requires fresh account-password verification before deleting logbook records, frozen print archives and cloud snapshots. Account login is retained. Other devices must explicitly acknowledge a reset before syncing."},
 {v:"V2.43",name:"Clearer, neutral guidance across HeliLog",detail:"Refresh outdated help and account messages, remove prototype labels from established features, and replace overly specific form examples with generic prompts. The CSV import template now starts blank. Existing records are unchanged."},
 {v:"V2.42",name:"Faster clean printing and simpler Help & Guide",detail:"Getting-started instructions now appear first, with a compact expandable update history. Pre-archive checks run automatically; no findings means direct access to print preview. Findings still need explicit review and acknowledgement, and printed-and-signed confirmation remains separate."},
 {v:"V2.41.2",name:"Cleaner simulator session details",detail:"Simulator details show only the recorded simulator duration. Removed the unnecessary Actual flight time: 0:00 box. Simulator sessions still do not add helicopter flight time or EASA recency."},
 {v:"V2.41.1",name:"Simplify simulator helicopter type entry",detail:"The Represented helicopter ICAO type field is the only aircraft-type input for simulator sessions. Removed the older Device / aircraft type field without deleting legacy device descriptions or previously reviewed linked evidence."},
 {v:"V2.41",name:"Match FFS sessions to operator recency",detail:"An FFS session with an explicit ICAO helicopter type and crew configuration suggests matching operator rules. Review the supporting document and enter qualifying manoeuvres before credit is counted. Linked approval becomes ineligible after the simulator session is edited or deleted until reviewed again. Legacy evidence stays intact; no automatic EASA recency credit."},
 {v:"V2.40",name:"Phase 3C — simulator, check and training evidence",detail:"Add FFS, proficiency/check and training references to operator-specific rules. Draft entries are never counted. Pilot-reviewed entries count only with a document reference and an allowed source; mixed flight/evidence rolling dates remain traceable. The encrypted and revision-checked account cloud carries evidence with its operator profile. No file uploads, official EASA recency credits or operator approval are implied."},
 {v:"V2.39.1",name:"Custom operator recency rules synchronize between devices",
 detail:"Operator profiles and rules now sync through the private account cloud. Previous browser-only profiles remain preserved for recovery. Conflicting web/app versions require manual review with a verified backup. EASA recency calculations and signed archives are unchanged."},
  {
    "v": "V2.39",
    "name": "Safer cloud recovery after interrupted local changes",
    "detail": "If an existing flight or aircraft was edited or removed on this device but its cloud queue was never saved, HeliLog now stops instead of silently overwriting or restoring it. Open Cloud Account and review both copies before choosing, with a verified safety backup. Archived and signed records remain protected."
  },
  {
    "v": "V2.38.1",
    "name": "Night VFR uses existing IFR and night-time entries",
    "detail": "Removed the separate VFR/IFR selector. For custom Night VFR recency, each distinct flight with positive night time and zero IFR minutes counts once. This is a user-selected heuristic; actual VFR flight rules are not independently verified. Existing flight records and archives are unchanged."
  },
  {
    "v": "V2.38",
    "name": "Recorded flight rules and Night VFR operator monitoring",
    "detail": "Earlier test-only release introducing a VFR/IFR selector. Superseded by V2.38.1: flight entry again uses only the existing Night and IFR time fields, and custom Night VFR uses zero recorded IFR minutes as the VFR assumption."
  },
  {
    "v": "V2.37",
    "name": "Operator recency dashboard and night-flight monitoring",
    "detail": "Active custom operator rules now use the same expandable Met / Below threshold recency cards and dashboard checkboxes as EASA. The Night flights source counts validated flights with positive recorded night minutes, but does not independently establish Night VFR."
  },
  {
    "v": "V2.36.2",
    "name": "Custom rules read recorded flight operations",
    "detail": "Choose the precise activity source for each operator rule (HESLO cycles, hoist, offshore landings, NVIS or all flights). Recency shows read-only counts. Older unlinked rules require an explicit source selection. The duplicate Settings card was removed."
  },
  {
    "v": "V2.36.1",
    "name": "Operator rule editor: visible form and validation",
    "detail": "Add Rule now brings the form into view. Save Rule shows invalid field feedback without discarding entered text or changing flight records."
  },
  {
    "v": "V2.36",
    "name": "Phase 3B — Custom operator recency profiles",
    "detail": "Add operator profiles and editable rule thresholds, types, periods, configurations, units and permitted credit sources. All custom rules stay device-local, scoped to the account, and separate from EASA recency results."
  },
  {
    "v": "V2.35",
    "name": "Phase 3A — advanced recency foundation",
    "detail": "Simplified Met badges retain their evidence explanations. Add an in-memory custom operator rule and pilot-reviewed credit model for future simulator, check and training evidence. No credits change EASA indicators or synchronized logbook data."
  },
  {
    "v": "V2.34.1",
    "name": "Offshore landings, compact entry, and clearer specialist recency",
    "detail": "Offshore now records Day landings and Night landings at qualifying offshore locations (with complete take-off/departure/approach requirements). NVIS and HHO use combined SP/MP records within type, offshore remains SP/MP-specific, and specialised Totals show captured day/night cycles or offshore landings without manufacturing previous-logbook counts."
  },
  {
    "v": "V2.34",
    "name": "Specialised operations cycles and recency (Phase 2)",
    "detail": "Full Flight Entry now stores day/night cycles next to operation hours, and complete offshore sequences where appropriate. NVIS counts one flight automatically. Recency shows recorded NVIS, hoist and offshore 90-day thresholds without overwriting historic entries or certifying legal privileges."
  },
  {
    "v": "V2.33.6",
    "name": "Recency grouped by helicopter type",
    "detail": "Group dashboard and Recency page entries by helicopter type and put Passenger-carrying or Night PIC first; show single-/multi-pilot only when necessary to distinguish otherwise identical requirements. No change to flight evidence or calculation."
  },
  {
    "v": "V2.33.5",
    "name": "Clearer recency names",
    "detail": "Highlight Passenger-carrying and Night PIC in the Recency dashboard, selector and detailed lists, leaving dates and supporting information normal-weight. Compact layout and calculations are unchanged."
  },
  {
    "v": "V2.33.4",
    "name": "Compact recent-experience dashboard and Recency page",
    "detail": "Move selected recency into a compact list alongside Upcoming dates, with concise colour-coded statuses. Show all recencies as expandable rows, keeping details and explanations out of the default view."
  },
  {
    "v": "V2.33.3",
    "name": "Clear rolling recency statuses",
    "detail": "Condensed dashboard selector; replace growing x/3 counters with requirement/threshold statuses, supporting recorded counts, and the date the 90-day threshold is projected to lapse if no further qualifying flights occur."
  },
  {
    "v": "V2.33.2",
    "name": "Choose dashboard recency indicators",
    "detail": "Select passenger-carrying and night recent-experience cards per aircraft type from the Recency page. The dashboard shows only selected indicators; preferences are stored per account on this device without changing flight or cloud records."
  },
  {
    "v": "V2.33.1",
    "name": "Automatic single-pilot recency and relevant night indicators",
    "detail": "Auto-estimate PIC/SOLO single-pilot PF movements without extra sequence entry. Hide unused night recency and clarify passenger-carrying eligibility versus the classification of a CAT flight. Keep exceptional-flight opt-out and separate verified evidence."
  },
  {
    "v": "V2.33",
    "name": "Passenger and night recent experience (Phase 1)",
    "detail": "Dedicated Recency page and dashboard glance. Separate types/configurations and count only explicitly confirmed PF take-off/approach/landing sequences; older flights remain unverified. No account migrations or archive changes."
  },
  {
    "v": "V2.32.2",
    "name": "Simpler backup verification",
    "detail": "Removed legacy unencrypted V2.8 recovery-package download and inspection controls from Backup & Restore. The encrypted snapshot verifier and cloud archive safeguards remain available."
  },
  {
    "v": "V2.32.1",
    "name": "Clear backup format selection",
    "detail": "Added signed-in encrypted-file verification with format-specific errors. Inspections remain read-only and never restore data."
  },
  {
    "v": "V2.32",
    "name": "Offline encrypted recovery verification",
    "detail": "Verify a separately saved encrypted snapshot from the sign-in screen even without access to the cloud. Decrypts and checks archive consistency in memory; never restores records."
  },
  {
    "v": "V2.31.4",
    "name": "Quick Flight scroll behavior",
    "detail": "When the compact Quick Flight form fits on a phone screen, it stays fixed while swiping. Focusing a typing field unlocks normal scrolling; closing the keyboard locks it again if everything fits."
  },
  {
    "v": "V2.31.3",
    "name": "Return from flight review",
    "detail": "Viewing a flagged flight now offers Back to review, resuming the same warning and the checkbox if the batch remains unchanged. Editing flights or page selection requires renewed acknowledgement."
  },
  {
    "v": "V2.31.2",
    "name": "Quick Flight header and positioning",
    "detail": "Restores the preferred top-aligned Quick Flight screen and gives the iPhone status-bar area more clearance for a clearer heading."
  },
  {
    "v": "V2.31.2",
    "name": "One-hand Quick Flight reach",
    "detail": "On phones, Quick Flight sits lower when spare screen space is available, without hiding fields on shorter displays. Keyboard entry restores normal scrolling."
  },
  {
    "v": "V2.31",
    "name": "Compact Quick Flight entry",
    "detail": "Paired fields and reduced vertical space on phones, automatic SELF PIC display, optional cross-country and remarks, and an always-accessible Save control. Existing validation is unchanged."
  },
  {
    "v": "V2.30",
    "name": "Previous logbook specialised operations",
    "detail": "Enter historical HESLO, VRLL, HEC, NVIS, hoist and other helicopter activity hours in a popup, with separate previous, recorded and combined totals."
  },
  {
    "v": "V2.29.1",
    "name": "Pre-archive review, including overlapping UTC flights",
    "detail": "Now flags overlapping UTC flight intervals (including overnight and earlier archived entries) as well as duplicates, PIC information and running totals. Expanded onboarding and recovery guidance."
  },
  {
    "v": "V2.28.4",
    "name": "Selective iPhone record recovery",
    "detail": "Preserved pilots, saved signatures and signed endorsements can be reviewed and restored without replacing existing cloud records."
  },
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
 // Put onboarding immediately before specialist topics, preserving the order
 // of everything else, including search and expand-all behaviour.
 const orderedTopics=[...HELILOG_GUIDE_TOPICS].sort((a,b)=>
  Number(b.category==='Start here')-Number(a.category==='Start here'));
 const recentUpdates=HELILOG_GUIDE_UPDATES.slice(0,3);
 const pastUpdates=HELILOG_GUIDE_UPDATES.slice(3);
 const html=orderedTopics.map(topic=>`<details class="card guide-topic" data-help-topic>
  <summary><span class="guide-topic-label"><small>${htmlEscape(topic.category)}</small><b>${htmlEscape(topic.title)}</b><span class="muted">${htmlEscape(topic.summary)}</span></span><span class="guide-chevron" aria-hidden="true">⌄</span></summary>
  <div class="guide-topic-body"><ol>${topic.steps.map(step=>`<li>${htmlEscape(step)}</li>`).join('')}</ol><div class="guide-topic-actions"><button class="btn" type="button" onclick="go('${topic.route}')">${htmlEscape(topic.action)} →</button></div></div>
 </details>`).join('');
 app.innerHTML=header('Help & User Guide','Learn the essentials and find instructions for every part of HeliLog')+
 `<section class="card guide-intro"><span class="guide-eyebrow">GETTING STARTED</span><h2>New to HeliLog?</h2><p class="muted">Sign in, complete your pilot profile, add your aircraft, enter a flight and check cloud synchronization. Another new device joins the same account—no primary/secondary setup is required.</p>
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
 <section class="card guide-updates"><h2>What's new</h2><p class="muted">Recent improvements. Select an update to read details.</p>
 ${recentUpdates.map((x,i)=>`<div class="guide-update"><span class="guide-version">${htmlEscape(x.v)}</span><details class="guide-update-details" ${i===0?'open':''}><summary><b>${htmlEscape(x.name)}</b></summary><p class="muted">${htmlEscape(x.detail)}</p></details></div>`).join('')}
 ${pastUpdates.length?`<details class="guide-history"><summary>Older updates (${pastUpdates.length})</summary>
  ${pastUpdates.map(x=>`<div class="guide-update"><span class="guide-version">${htmlEscape(x.v)}</span><details class="guide-update-details"><summary><b>${htmlEscape(x.name)}</b></summary><p class="muted">${htmlEscape(x.detail)}</p></details></div>`).join('')}
 </details>`:''}</section>
 <p class="guide-disclaimer">HeliLog helps maintain records. Pilots remain responsible for accurate entries and meeting the rules of their competent authority.</p>`;
}
