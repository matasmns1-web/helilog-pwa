/* Run with: node --test v2/storage.test.cjs */
const test = require("node:test");
const assert = require("node:assert/strict");
const Domain = require("./domain.js");
const Storage = require("./storage.js");

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); }
  };
}

const TIME = "2026-10-14T10:00:00.000Z";

test("V2 development storage does not touch V1 keys", () => {
  const adapter = memoryStorage();
  adapter.setItem("helilog_v111", '{"important":"v1"}');
  adapter.setItem("helilog_v142_sandbox", '{"important":"test"}');
  const repo = Storage.createRepository(adapter, Domain);
  assert.equal(repo.load(), null);
  const state = Domain.newState("dev-workspace", TIME);
  assert.equal(repo.save(state, null), 0);
  assert.deepEqual(repo.load(), state);
  repo.resetForDevelopment(Storage.RESET_PHRASE);
  assert.equal(repo.load(), null);
  assert.equal(adapter.getItem("helilog_v111"), '{"important":"v1"}');
  assert.equal(adapter.getItem("helilog_v142_sandbox"), '{"important":"test"}');
});

test("concurrent/stale writes are rejected", () => {
  const repo = Storage.createRepository(memoryStorage(), Domain);
  const empty = Domain.newState("dev-workspace", TIME);
  repo.save(empty, null);
  const changed = Domain.addPerson(empty, { id: "p1", name: "Test" }, TIME);
  assert.throws(() => repo.save(changed, null), /revision conflict/);
  assert.equal(repo.save(changed, 0), 1);
  assert.throws(() => repo.save(changed, 0), /revision conflict/);
  assert.throws(() => repo.save(changed, 1), /revision must increase/);
});

test("malformed stored data is rejected and never reset automatically", () => {
  const store = memoryStorage();
  store.setItem(Storage.KEY, "not-json");
  const repo = Storage.createRepository(store, Domain);
  assert.throws(() => repo.load(), /cannot be parsed/);
  assert.equal(store.getItem(Storage.KEY), "not-json");
  assert.throws(() => repo.resetForDevelopment("yes"), /confirmation required/);
  assert.equal(store.getItem(Storage.KEY), "not-json");
});

test("the development adapter rejects production-tagged data", () => {
  const repo = Storage.createRepository(memoryStorage(), Domain);
  const state = Domain.newState("dev-workspace", TIME);
  state.meta.environment = "production";
  assert.throws(() => repo.save(state, null), /only stores V2 development data/);
});
