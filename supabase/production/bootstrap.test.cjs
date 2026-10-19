/* Production-only Supabase bootstrap safety tests; no database access or data writes. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const dir=__dirname;
const sql=fs.readFileSync(path.join(dir,"20261019093000_production_backup_scheduler.sql"),"utf8");
const prod="helilog-production-daily-snapshots";
const old="helilog-v29-daily-test-snapshots";
test("production overlay renames only the local pg_cron job",()=>{
 assert.match(sql,/begin;[\s\S]*commit;/i);
 assert.match(sql,/cron\.unschedule\('helilog-v29-daily-test-snapshots'\)/);
 assert.match(sql,/cron\.schedule\('helilog-production-daily-snapshots','0 3 \* \* \*'/);
 assert.match(sql,/public\.helilog_daily_cloud_backups\(\)/);
 assert.equal((sql.match(new RegExp(prod,"g"))||[]).length,4);
});
test("backup health monitors the production job and preserves verified owner scope",()=>{
 assert.match(sql,/function public\.helilog_backup_health\(\)/);
 assert.match(sql,/select auth\.uid\(\)/);
 assert.match(sql,/owner_id=v_owner/);
 assert.match(sql,/public\.helilog_backup_hash\(v_snapshot\.content\)/);
 assert.match(sql,/security definer set search_path=''/);
 const ddl=sql.slice(sql.indexOf("create or replace function"));
 assert.doesNotMatch(ddl,/helilog-v29-daily-test-snapshots/);
});
test("production overlay contains no data deletion or account migration",()=>{
 assert.doesNotMatch(sql,/\b(delete\s+from|truncate\s+|drop\s+table|update\s+public\.helilog_|insert\s+into\s+public\.helilog_)\b/i);
 assert.doesNotMatch(sql,/cabfifnsxpaalgsyicbo/);
 assert.doesNotMatch(sql,/xvmzvoldlajvnfxonrvn/);
});
