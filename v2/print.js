/* HeliLog V2 print renderer. Pure, offline-capable; no archive mutations. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.HeliLogV2Print=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const PER_PAGE=3;

  function escapeHTML(value){
    return String(value??"").replace(/[&<>"']/g,ch=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[ch]));
  }
  function formatDate(value){
    if(!/^\d{4}-\d\d-\d\d$/.test(String(value)))return escapeHTML(value||"");
    return escapeHTML(value.slice(8,10)+"-"+value.slice(5,7)+"-"+value.slice(0,4));
  }
  function signatureSrc(value){
    if(typeof value==="string"&&/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(value))return value;
    return "";
  }
  function signatureBlock(signature){
    if(!signature)return '<div class="sigempty">No signature</div>';
    const src=signatureSrc(signature.data);
    const image=src?'<img alt="Signature captured by signer" src="'+src+'">':'<b>Signature image unavailable</b>';
    return '<div class="signed"><div class="signature-image">'+image+'</div>'+
      '<div class="sigcaption"><strong>'+escapeHTML(signature.name)+'</strong> &nbsp;'+
      escapeHTML(signature.licence||"")+'<div>Signed: '+escapeHTML(signature.signedAt||"")+'</div></div></div>';
  }
  function oneEntry(entry,slot){
    if(!entry)return '<div class="entry empty"><div class="slotline">ENTRY '+slot+'</div><div class="unused">— UNUSED —</div></div>';
    const e=entry.snapshot;
    return '<article class="entry"><div class="slotline">ENTRY '+slot+' &nbsp;·&nbsp; '+escapeHTML(entry.endorsementId)+'</div>'+
      '<div class="meta"><span><b>DATE</b> '+formatDate(e.date)+'</span><span><b>PLACE</b> '+escapeHTML(e.location||"—")+'</span>'+
      '<span><b>CATEGORY</b> '+escapeHTML(e.category)+'</span></div>'+
      '<h2>'+escapeHTML(e.title)+'</h2>'+
      '<div class="endorsement-text">'+escapeHTML(e.text)+'</div>'+
      (e.qualificationId?'<div class="qualification"><b>Related licence/rating:</b> '+escapeHTML(e.qualificationId)+'</div>':'')+
      '<div class="signer"><div><b>ENDORSED BY</b><div>'+escapeHTML(e.signature?.name||"—")+'</div>'+
      '<div class="small">'+escapeHTML(e.signature?.licence||"")+'</div></div>'+
      signatureBlock(e.signature)+'</div></article>';
  }
  function styles(){
    return '<style>'+
    '@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#f1f4f7;color:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:11px}'+
    '.toolbar{padding:12px 16px;background:#0f172a;color:white;display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}.toolbar button{padding:10px 16px;border:0;border-radius:6px;background:white;color:#111827;font-weight:700;cursor:pointer}'+
    '.page{width:186mm;min-height:273mm;margin:15px auto;padding:4mm;background:white;box-shadow:0 2px 12px #0002;break-after:page;page-break-after:always;display:flex;flex-direction:column}'+
    '.page:last-child{break-after:auto;page-break-after:auto}.heading{border-bottom:2px solid #111827;display:flex;justify-content:space-between;padding-bottom:8px;margin-bottom:10px;align-items:end}h1{font-size:17px;letter-spacing:.04em;margin:0 0 3px}h2{font-size:13px;margin:9px 0}.sub{font-size:9px;color:#475569}.page-no{font-weight:bold;font-size:10px}.entries{display:grid;grid-template-rows:repeat(3,1fr);gap:8px;flex:1}.entry{border:1px solid #9ca3af;min-height:0;padding:11px;display:flex;flex-direction:column;break-inside:avoid}.slotline{font-size:8px;letter-spacing:.06em;font-weight:bold;color:#64748b}.meta{display:flex;gap:10px;flex-wrap:wrap;font-size:9px;margin-top:9px}.meta b,.signer b{font-size:8px;letter-spacing:.04em}.endorsement-text{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.38;flex:1;max-height:46mm;overflow:hidden}.qualification{font-size:9px;margin:6px 0}.signer{border-top:1px solid #d1d5db;margin-top:8px;padding-top:6px;display:grid;grid-template-columns:40% 60%;align-items:center;gap:8px;font-size:9px}.signed{display:flex;gap:7px;align-items:end}.signature-image{height:38px;width:90px;display:flex;align-items:center;justify-content:center}.signature-image img{max-height:100%;max-width:100%}.sigcaption{font-size:8px;overflow-wrap:anywhere}.sigcaption div{font-size:7px}.small{font-size:8px;color:#475569}.empty .unused{margin:auto;font-weight:700;letter-spacing:.1em;color:#94a3b8}.foot{border-top:1px solid #111827;padding-top:7px;margin-top:9px;font-size:8px;display:flex;justify-content:space-between;gap:15px}.amendment{border:1px solid #cbd5e1;padding:13px;margin-top:14px;white-space:normal;line-height:1.5}.amendment h2{font-size:14px}.snapshot{padding:9px;border:1px solid #d1d5db;margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}.snap-title{font-size:10px;font-weight:bold;margin-bottom:7px}.reason{font-size:11px}.amend-signer{margin-top:15px;border-top:1px solid #ccc;padding-top:8px}'+
    '@media print{body{background:#fff}.toolbar{display:none}.page{margin:0;padding:0;width:auto;min-height:273mm;box-shadow:none;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}}'+
    '</style>';
  }
  function wrapper(title,body){
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title>'+escapeHTML(title)+'</title>'+styles()+'</head><body>'+
      '<div class="toolbar"><div><b>'+escapeHTML(title)+'</b><div style="font-size:12px">Print preview is not an archive confirmation. Check the pages and physically sign if required.</div></div>'+
      '<button type="button" onclick="window.print()">Print / Save PDF</button></div>'+body+'</body></html>';
  }
  function renderEndorsementBatch(batch){
    if(!batch||batch.kind!=="endorsement"||!Array.isArray(batch.items)||!batch.items.length)
      throw new Error("Valid endorsement batch required");
    const count=Math.ceil(batch.items.length/PER_PAGE);
    if(batch.pageCount!==count)throw new Error("Page count inconsistent with the selected endorsements");
    const pages=[];
    for(let p=0;p<count;p++){
      const items=batch.items.slice(p*PER_PAGE,(p+1)*PER_PAGE);
      const entries=Array.from({length:PER_PAGE},(_,j)=>oneEntry(items[j],p*PER_PAGE+j+1)).join("");
      pages.push('<section class="page"><div class="heading"><div><h1>PILOT MEMORANDA / ENDORSEMENTS</h1>'+
        '<div class="sub">HeliLog V2 · Paper logbook endorsement section</div></div>'+
        '<div class="page-no">Endorsement page '+(batch.firstPage+p)+'<div class="sub">Batch '+escapeHTML(batch.id)+'</div></div></div>'+
        '<div class="entries">'+entries+'</div>'+
        '<div class="foot"><span>Batch '+escapeHTML(batch.id)+' · '+escapeHTML(batch.layout||"")+'</span>'+
        '<span>Print and retain with paper pilot logbook. Signature acceptance must be verified.</span></div></section>');
    }
    return wrapper("HeliLog — Endorsement "+escapeHTML(batch.id),pages.join(""));
  }
  function snapshotText(e){
    return '<div><b>Date:</b> '+formatDate(e.date)+' &nbsp; <b>Category:</b> '+escapeHTML(e.category)+
      ' &nbsp; <b>Place:</b> '+escapeHTML(e.location||"—")+'</div>'+
      '<div><b>Title:</b> '+escapeHTML(e.title)+'</div>'+
      '<div><b>Endorser ID:</b> '+escapeHTML(e.signatoryPersonId)+'</div>'+
      '<div><b>Related rating:</b> '+escapeHTML(e.qualificationId||"—")+'</div>'+
      '<div class="endorsement-text">'+escapeHTML(e.text)+'</div>';
  }
  function renderAmendment(proposal,originalArchive){
    if(!proposal||!proposal.after?.signature||!proposal.before||!proposal.reason)throw new Error("A signed amendment is required");
    if(!originalArchive?.id)throw new Error("Original archive reference required");
    const body='<section class="page"><div class="heading"><div><h1>ENDORSEMENT CORRECTION ADDENDUM</h1>'+
      '<div class="sub">Retain alongside the original signed endorsement page</div></div>'+
      '<div class="page-no">Amendment '+escapeHTML(proposal.id)+'</div></div>'+
      '<div class="amendment"><p><b>Original endorsement:</b> '+escapeHTML(proposal.endorsementId)+
      '<br><b>Original archive batch:</b> '+escapeHTML(originalArchive.id)+
      ' · page '+escapeHTML(originalArchive.page)+
      '<br><b>Reason for amendment:</b> '+escapeHTML(proposal.reason)+'</p>'+
      '<div class="snapshot"><div class="snap-title">ORIGINAL / PREVIOUS CONFIRMED WORDING</div>'+snapshotText(proposal.before)+'</div>'+
      '<div class="snapshot"><div class="snap-title">REVISED ENDORSEMENT</div>'+snapshotText(proposal.after)+'</div>'+
      '<div class="amend-signer"><b>Revised record signed by</b>'+signatureBlock(proposal.after.signature)+'</div>'+
      '<p class="small">The original endorsement remains unchanged. This addendum records the subsequent correction; keep both documents.</p>'+
      '</div><div class="foot"><span>Amendment '+escapeHTML(proposal.id)+'</span><span>HeliLog V2 development print</span></div></section>';
    return wrapper("HeliLog — Endorsement Amendment "+escapeHTML(proposal.id),body);
  }
  return Object.freeze({escapeHTML,renderEndorsementBatch,renderAmendment});
});
