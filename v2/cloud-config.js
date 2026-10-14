/* HeliLog V2.2 cloud configuration.
 * Placeholder ONLY. This must be configured after connecting a dedicated
 * Supabase TEST project and applying/reviewing the RLS migration.
 *
 * Only the Supabase PROJECT URL and PUBLISHABLE key may be
 * placed here. NEVER use service_role keys, sb_secret keys or DB passwords
 * in this file: it is publicly served to every website visitor.
 *
 * Until configured, HeliLog remains a local-only test application.
 */
window.HeliLogCloudConfig = Object.freeze({
  supabaseUrl: "",
  publishableKey: "",
  authEnabled: false,
  environment: "test",
  inviteOnly: true
});
