/* V2 development storage adapter. Strictly separate from every V1 storage key.
 * Browser localStorage is a temporary development backend, NOT cloud sync.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HeliLogV2Storage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const KEY = "helilog_v2_dev_workspace";
  const RESET_PHRASE = "RESET_V2_SANDBOX";

  function createRepository(storage, domain, additionalValidate) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("A browser-compatible storage adapter is required");
    }
    if (!domain || typeof domain.validateState !== "function") throw new Error("V2 domain is required");

    function inspect(state) {
      const errors = domain.validateState(state);
      if (typeof additionalValidate === "function" && !errors.length) {
        errors.push(...additionalValidate(state));
      }
      return errors;
    }

    function load() {
      const raw = storage.getItem(KEY);
      if (raw === null) return null;
      let state;
      try { state = JSON.parse(raw); }
      catch (error) { throw new Error("V2 development data cannot be parsed; preserve it for investigation"); }
      const errors = inspect(state);
      if (errors.length) throw new Error("Invalid V2 data: " + errors.join("; "));
      return state;
    }

    function save(state, expectedRevision) {
      const errors = inspect(state);
      if (errors.length) throw new Error("Refusing invalid V2 state: " + errors.join("; "));
      if (state.meta.environment !== "development") {
        throw new Error("This adapter only stores V2 development data");
      }
      const previous = load();
      const actual = previous ? previous.meta.revision : null;
      if (expectedRevision !== actual) {
        throw new Error("V2 revision conflict; reload before saving");
      }
      if (previous && state.meta.revision <= actual) {
        throw new Error("V2 revision must increase when saving changes");
      }
      storage.setItem(KEY, JSON.stringify(state));
      return state.meta.revision;
    }

    function resetForDevelopment(phrase) {
      if (phrase !== RESET_PHRASE) throw new Error("Explicit V2 sandbox reset confirmation required");
      storage.removeItem(KEY);
      // Never touch any V1 localStorage keys, signatures, or archives.
    }

    return Object.freeze({ load, save, resetForDevelopment });
  }

  return Object.freeze({ KEY, RESET_PHRASE, createRepository });
});
