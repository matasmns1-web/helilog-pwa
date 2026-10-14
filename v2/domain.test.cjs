/* Run with: node --test v2/domain.test.cjs */
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("./domain.js");

const TIME = "2026-10-14T10:00:00.000Z";
const T2 = "2026-10-14T11:00:00.000Z";
const T3 = "2026-10-14T12:00:00.000Z";
const T4 = "2026-10-14T13:00:00.000Z";
// Synthetic PNG test data only; not a real signature.
const SIGNATURE = "data:image/png;base64,aGVsbG8=";

function fixture() {
  let s = D.newState("sandbox-dev-1", TIME);
  s = D.addPerson(s, { id: "instructor-1", name: "Test Instructor", licence: "TEST-123" }, TIME);
  s = D.createEndorsement(s, {
    id: "endorsement-1", date: "2026-10-14", category: "Proficiency check",
    title: "Test flight endorsement", text: "FI(H) test sign-off",
    signatoryPersonId: "instructor-1"
  }, TIME);
  return s;
}

function archivedFixture() {
  let s = D.signEndorsement(fixture(), "endorsement-1", SIGNATURE, T2);
  const draft = D.prepareEndorsementPrint(s, ["endorsement-1"], "END-001", T3);
  s = D.confirmEndorsementPrint(s, draft, T4);
  return s;
}

test("creates an empty isolated V2 document", () => {
  const s = D.newState("workspace-one", TIME);
  assert.equal(s.schemaVersion, 2);
  assert.equal(s.meta.environment, "development");
  assert.deepEqual(s.flights, []);
  assert.deepEqual(s.archives, { flights: [], endorsements: [] });
  assert.deepEqual(D.validateState(s), []);
});

test("edits unsigned endorsements but never signed or archived originals", () => {
  const s = fixture();
  const revised = D.editUnsignedEndorsement(s, "endorsement-1", { title: "Updated heading" }, T2);
  assert.equal(revised.endorsements[0].title, "Updated heading");
  assert.equal(s.endorsements[0].title, "Test flight endorsement");
  const signed = D.signEndorsement(revised, "endorsement-1", SIGNATURE, T3);
  assert.throws(() => D.editUnsignedEndorsement(signed, "endorsement-1", { title: "Tampered" }, T4),
    /amendment/);
  assert.throws(() => D.signEndorsement(signed, "endorsement-1", SIGNATURE, T4), /Already signed/);
});

test("refuses unsigned or repeated print archives", () => {
  assert.throws(() => D.prepareEndorsementPrint(fixture(), ["endorsement-1"], "END-001", T3), /signed/);
  const s = archivedFixture();
  assert.equal(s.archives.endorsements.length, 1);
  assert.equal(s.archives.endorsements[0].firstPage, 1);
  assert.equal(s.archives.endorsements[0].pageCount, 1);
  assert.throws(() => D.prepareEndorsementPrint(s, ["endorsement-1"], "END-002", T4), /already archived/);
  assert.deepEqual(D.validateState(s), []);
});

test("preview confirmation fails when data changed or preview was tampered with", () => {
  const s = D.signEndorsement(fixture(), "endorsement-1", SIGNATURE, T2);
  const draft = D.prepareEndorsementPrint(s, ["endorsement-1"], "END-001", T3);
  const altered = { ...draft, firstPage: 999 };
  assert.throws(() => D.confirmEndorsementPrint(s, altered, T4), /Page sequence/);
  const updated = D.addPerson(s, { id: "instructor-2", name: "Other Person" }, T4);
  assert.throws(() => D.confirmEndorsementPrint(updated, draft, T4), /Records changed/);
});

test("an amendment preserves the original paper archive and leaves a signed audit record", () => {
  const s = archivedFixture();
  const oldBatchJson = JSON.stringify(s.archives.endorsements);
  const before = D.effectiveEndorsement(s, "endorsement-1");
  let proposal = D.prepareEndorsementAmendment(s, "endorsement-1",
    { text: "Corrected check wording" }, "Typographical error", "AM-001", T4);
  assert.equal(proposal.after.signature, null);
  proposal = D.signEndorsementAmendment(s, proposal, SIGNATURE, T4);
  const newer = D.confirmEndorsementAmendment(s, proposal, T4);
  assert.equal(JSON.stringify(newer.archives.endorsements), oldBatchJson);
  assert.deepEqual(D.getEndorsement(newer, "endorsement-1"), before);
  assert.equal(D.effectiveEndorsement(newer, "endorsement-1").text, "Corrected check wording");
  assert.equal(newer.amendments.endorsements.length, 1);
  assert.equal(newer.amendments.endorsements[0].reason, "Typographical error");
  assert.equal(newer.amendments.endorsements[0].after.signature.name, "Test Instructor");
  assert.deepEqual(D.validateState(newer), []);
});

test("an amendment cannot be unsigned, no-op, or based on a stale version", () => {
  const s = archivedFixture();
  assert.throws(() => D.prepareEndorsementAmendment(s, "endorsement-1",
    { title: "Test flight endorsement" }, "No change", "AM-000", T4), /no content changes/);
  const p = D.prepareEndorsementAmendment(s, "endorsement-1", { title: "Revised title" },
    "Correction", "AM-002", T4);
  assert.throws(() => D.confirmEndorsementAmendment(s, p, T4), /must be signed/);
  const editedState = D.addPerson(s, { id: "other", name: "Other" }, T4);
  assert.throws(() => D.signEndorsementAmendment(editedState, p, SIGNATURE, T4), /Records changed/);
});

test("a JSON full-data round-trip retains archives and amendment history", () => {
  const before = archivedFixture();
  const restored = JSON.parse(JSON.stringify(before));
  assert.deepEqual(restored, before);
  assert.deepEqual(D.validateState(restored), []);
});

test("data check detects changes to an archived original snapshot", () => {
  const s = archivedFixture();
  s.endorsements[0].text = "changed behind archive";
  assert.match(D.validateState(s).join(" "), /no longer matches/);
});
