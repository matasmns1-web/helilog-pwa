/* HeliLog V2 domain — pure, browser/Node compatible, no persistence side effects.
 * This module is a development foundation, not an approved audit/signature system.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HeliLogV2Domain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 2;
  const ENDORSEMENT_LAYOUT = "endorsement-sheet-v1";
  const ENDORSEMENTS_PER_PAGE = 3;
  const EDITABLE_FIELDS = ["date", "category", "title", "text", "location", "qualificationId", "signatoryPersonId"];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function requireValue(test, message) {
    if (!test) throw new Error(message);
  }

  function iso(value, field) {
    requireValue(typeof value === "string" && Number.isFinite(Date.parse(value)) && value.includes("T"),
      field + " must be an ISO timestamp");
    return value;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(value + "T00:00:00Z");
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }

  function nonempty(value, field) {
    requireValue(typeof value === "string" && value.trim().length > 0, field + " is required");
    return value.trim();
  }

  function newState(workspaceId, createdAt) {
    const at = iso(createdAt, "createdAt");
    return {
      schemaVersion: SCHEMA_VERSION,
      meta: { workspaceId: nonempty(workspaceId, "workspaceId"), environment: "development", revision: 0, createdAt: at, updatedAt: at },
      people: [],
      aircraft: [],
      flights: [],
      endorsements: [],
      archives: { flights: [], endorsements: [] },
      amendments: { flights: [], endorsements: [] }
    };
  }

  function writable(state, at) {
    requireValue(state && state.schemaVersion === SCHEMA_VERSION, "V2 schema required");
    const copy = clone(state);
    copy.meta.revision += 1;
    copy.meta.updatedAt = iso(at, "timestamp");
    return copy;
  }

  function personById(state, id) {
    return state.people.find(person => person.id === id);
  }

  function addPerson(state, person, at) {
    const copy = writable(state, at);
    const id = nonempty(person && person.id, "person.id");
    requireValue(!personById(copy, id), "Person ID already exists");
    copy.people.push({
      id,
      name: nonempty(person.name, "person.name"),
      licence: String(person.licence || ""),
      role: String(person.role || "Instructor/examiner")
    });
    return copy;
  }

  function isArchived(state, endorsementId) {
    return state.archives.endorsements.some(batch => batch.items.some(item => item.endorsementId === endorsementId));
  }

  function getEndorsement(state, id) {
    return state.endorsements.find(e => e.id === id);
  }

  function applyFields(base, values) {
    const out = clone(base);
    for (const field of EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(values, field)) out[field] = values[field];
    }
    requireValue(validDate(out.date), "Endorsement date must be YYYY-MM-DD");
    for (const field of ["category", "title", "text", "signatoryPersonId"]) {
      out[field] = nonempty(out[field], "endorsement." + field);
    }
    out.location = String(out.location || "");
    out.qualificationId = String(out.qualificationId || "");
    return out;
  }

  function createEndorsement(state, data, at) {
    const copy = writable(state, at);
    const id = nonempty(data && data.id, "endorsement.id");
    requireValue(!getEndorsement(copy, id), "Endorsement ID already exists");
    const record = applyFields({
      id, date: "", category: "", title: "", text: "", location: "",
      qualificationId: "", signatoryPersonId: "", signature: null,
      createdAt: iso(at, "createdAt"), updatedAt: iso(at, "updatedAt")
    }, data);
    requireValue(personById(copy, record.signatoryPersonId), "Endorser profile missing");
    copy.endorsements.push(record);
    return copy;
  }

  function editUnsignedEndorsement(state, id, patch, at) {
    const copy = writable(state, at);
    const record = getEndorsement(copy, id);
    requireValue(record, "Endorsement not found");
    requireValue(!record.signature && !isArchived(copy, id), "Signed or archived endorsements require an amendment");
    const revised = applyFields(record, patch);
    requireValue(personById(copy, revised.signatoryPersonId), "Endorser profile missing");
    Object.assign(record, revised, { updatedAt: iso(at, "updatedAt") });
    return copy;
  }

  function signatureFor(state, personId, signatureData, signedAt) {
    const person = personById(state, personId);
    requireValue(person, "Endorser profile missing");
    requireValue(typeof signatureData === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signatureData),
      "Signature must be captured as a PNG data URL");
    return {
      signatoryPersonId: person.id,
      name: person.name,
      licence: person.licence,
      data: signatureData,
      signedAt: iso(signedAt, "signedAt")
    };
  }

  function signEndorsement(state, id, signatureData, at) {
    const copy = writable(state, at);
    const record = getEndorsement(copy, id);
    requireValue(record, "Endorsement not found");
    requireValue(!record.signature && !isArchived(copy, id), "Already signed or archived; create an amendment");
    record.signature = signatureFor(copy, record.signatoryPersonId, signatureData, at);
    record.updatedAt = at;
    return copy;
  }

  function nextEndorsementPage(state) {
    const batches = state.archives.endorsements;
    return batches.length ? batches[batches.length - 1].firstPage + batches[batches.length - 1].pageCount : 1;
  }

  function prepareEndorsementPrint(state, ids, batchId, at) {
    requireValue(state.schemaVersion === SCHEMA_VERSION, "V2 schema required");
    requireValue(Array.isArray(ids) && ids.length > 0, "Select signed endorsements");
    requireValue(new Set(ids).size === ids.length, "Duplicate endorsement in selection");
    requireValue(!state.archives.endorsements.some(batch => batch.id === batchId), "Batch ID already exists");
    const items = ids.map(id => {
      const record = getEndorsement(state, id);
      requireValue(record && record.signature, "Every endorsement must be signed before printing");
      requireValue(!isArchived(state, id), "Endorsement already archived");
      return { endorsementId: id, snapshot: clone(record) };
    });
    const firstPage = nextEndorsementPage(state);
    return {
      id: nonempty(batchId, "batchId"), kind: "endorsement",
      layout: ENDORSEMENT_LAYOUT, itemsPerPage: ENDORSEMENTS_PER_PAGE,
      firstPage, pageCount: Math.ceil(items.length / ENDORSEMENTS_PER_PAGE),
      sourceRevision: state.meta.revision, preparedAt: iso(at, "preparedAt"), items
    };
  }

  function confirmEndorsementPrint(state, draft, confirmedAt) {
    requireValue(draft && draft.kind === "endorsement" && draft.layout === ENDORSEMENT_LAYOUT, "Invalid endorsement print draft");
    requireValue(state.meta.revision === draft.sourceRevision, "Records changed since preview; regenerate it");
    requireValue(draft.firstPage === nextEndorsementPage(state), "Page sequence changed");
    requireValue(!state.archives.endorsements.some(batch => batch.id === draft.id), "Batch already confirmed");
    // Never trust a stale or altered print draft.
    const expected = prepareEndorsementPrint(state, draft.items.map(item => item.endorsementId), draft.id, draft.preparedAt);
    requireValue(JSON.stringify(expected) === JSON.stringify(draft), "Print draft no longer matches signed records");
    const copy = writable(state, confirmedAt);
    const batch = clone(draft);
    delete batch.sourceRevision;
    batch.confirmedAt = iso(confirmedAt, "confirmedAt");
    copy.archives.endorsements.push(batch);
    return copy;
  }

  function effectiveEndorsement(state, id) {
    const original = getEndorsement(state, id);
    if (!original) return null;
    const amendments = state.amendments.endorsements.filter(a => a.endorsementId === id && a.confirmedAt);
    return clone(amendments.length ? amendments[amendments.length - 1].after : original);
  }

  function prepareEndorsementAmendment(state, id, patch, reason, amendmentId, at) {
    requireValue(isArchived(state, id), "Amendments are for archived endorsements");
    const before = effectiveEndorsement(state, id);
    const after = applyFields(before, patch);
    after.signature = null;
    after.updatedAt = iso(at, "preparedAt");
    requireValue(personById(state, after.signatoryPersonId), "Endorser profile missing");
    requireValue(JSON.stringify(before) !== JSON.stringify(after), "Amendment has no changes");
    requireValue(!state.amendments.endorsements.some(a => a.id === amendmentId), "Amendment ID already exists");
    return {
      id: nonempty(amendmentId, "amendmentId"),
      endorsementId: id,
      reason: nonempty(reason, "reason"),
      preparedAt: at,
      sourceRevision: state.meta.revision,
      before, after
    };
  }

  function signEndorsementAmendment(state, proposal, signatureData, at) {
    requireValue(proposal && proposal.endorsementId, "Invalid amendment proposal");
    requireValue(proposal.sourceRevision === state.meta.revision, "Records changed since amendment was prepared");
    requireValue(JSON.stringify(effectiveEndorsement(state, proposal.endorsementId)) === JSON.stringify(proposal.before), "Amendment baseline changed");
    const signed = clone(proposal);
    signed.after.signature = signatureFor(state, signed.after.signatoryPersonId, signatureData, at);
    return signed;
  }

  function confirmEndorsementAmendment(state, signedProposal, confirmedAt) {
    requireValue(signedProposal && signedProposal.after && signedProposal.after.signature, "Amendment must be signed");
    requireValue(signedProposal.sourceRevision === state.meta.revision, "Records changed since amendment was prepared");
    requireValue(isArchived(state, signedProposal.endorsementId), "Original endorsement not archived");
    requireValue(!state.amendments.endorsements.some(a => a.id === signedProposal.id), "Amendment ID already exists");
    requireValue(JSON.stringify(effectiveEndorsement(state, signedProposal.endorsementId)) === JSON.stringify(signedProposal.before), "Amendment baseline changed");
    const copy = writable(state, confirmedAt);
    const amendment = clone(signedProposal);
    delete amendment.sourceRevision;
    amendment.confirmedAt = iso(confirmedAt, "confirmedAt");
    copy.amendments.endorsements.push(amendment);
    return copy;
  }

  function validateState(state) {
    const errors = [];
    if (!state || state.schemaVersion !== SCHEMA_VERSION) return ["Not a V2 document"];
    if (!state.meta || !Number.isInteger(state.meta.revision)) errors.push("Missing V2 metadata");
    for (const key of ["people", "aircraft", "flights", "endorsements"]) {
      if (!Array.isArray(state[key])) errors.push("Missing array: " + key);
    }
    if (!state.archives || !Array.isArray(state.archives.endorsements) ||
        !state.amendments || !Array.isArray(state.amendments.endorsements)) {
      errors.push("Missing archive/amendment collections");
      return errors;
    }
    if (!Array.isArray(state.endorsements) || !Array.isArray(state.people)) return errors;
    for (const key of ["people", "endorsements"]) {
      const ids = state[key].map(item => item.id);
      if (new Set(ids).size !== ids.length) errors.push("Duplicate IDs in " + key);
    }
    let expectedPage = 1;
    const archived = new Set();
    for (const batch of state.archives.endorsements) {
      if (batch.firstPage !== expectedPage) errors.push("Endorsement archive page sequence is broken");
      if (!batch.confirmedAt) errors.push("Unconfirmed batch in archive");
      expectedPage = batch.firstPage + batch.pageCount;
      for (const item of batch.items) {
        if (archived.has(item.endorsementId)) errors.push("Endorsement archived twice: " + item.endorsementId);
        archived.add(item.endorsementId);
        if (!item.snapshot.signature) errors.push("Unsigned endorsement in archive");
        if (JSON.stringify(getEndorsement(state, item.endorsementId)) !== JSON.stringify(item.snapshot)) {
          errors.push("Archived original no longer matches its frozen snapshot: " + item.endorsementId);
        }
      }
    }
    for (const amendment of state.amendments.endorsements) {
      if (!archived.has(amendment.endorsementId)) errors.push("Amendment without archived original");
      if (!amendment.confirmedAt || !amendment.after.signature) errors.push("Unsigned/unconfirmed amendment");
    }
    return errors;
  }

  return Object.freeze({
    SCHEMA_VERSION, ENDORSEMENTS_PER_PAGE, newState, addPerson,
    createEndorsement, editUnsignedEndorsement, signEndorsement,
    prepareEndorsementPrint, confirmEndorsementPrint, isArchived,
    getEndorsement, effectiveEndorsement, prepareEndorsementAmendment,
    signEndorsementAmendment, confirmEndorsementAmendment, validateState
  });
});
