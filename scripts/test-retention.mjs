// Disposable LOCAL billing schema; no real charges, accounts or clinical records.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const base = execFileSync(process.execPath, [new URL('scripts/test-billing.mjs', root).pathname], {
  env: {...process.env, BILLING_SCHEMA_ONLY:'1', BILLING_KEEP_DB:'1'}, encoding:'utf8', maxBuffer:25*1024*1024,
});
const database = base.match(/LOCAL_DATABASE=(nuthrick_billing_\d+)/)?.[1];
assert.ok(database);
const sql = query => execFileSync('docker',['exec','-i','supabase_db_Nuthrick','psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'], {input:query,encoding:'utf8',maxBuffer:25*1024*1024});
try {
  const names = readdirSync(new URL('supabase/migrations/',root)).filter(name => /_(ai_credit_purchases|credit_admin_catalog_queries|pre_live_readiness|pre_live_readiness_credentials|live_ready_operational|live_readiness_operational_checks|operations_job_snapshot|live_ready_rpc_fixes|public_legal_projection|public_legal_projection_table|live_ready_fk_indexes|fix_billing_job_result|fix_operations_job_snapshot|live_one_environment_preparation|retention_backup_plan)\.sql$/.test(name)).sort();
  for (const name of names) sql(readFileSync(new URL('supabase/migrations/'+name,root),'utf8'));
  console.log('PASS retention migration compiles');
  sql('delete from private.promotion_campaigns');
  sql(readFileSync(new URL('scripts/test-billing.sql',root),'utf8'));
  console.log('PASS existing billing regression');
  sql(readFileSync(new URL('scripts/test-retention.sql',root),'utf8'));
  console.log('PASS retention authorization, selected patients, expiry, credits and idempotency');
} catch (error) {
  console.error(error.stderr?.toString() || error.message); process.exitCode=1;
} finally {
  execFileSync('docker',['exec','supabase_db_Nuthrick','psql','-X','-qAt','-U','postgres','-d','postgres','-c',`drop database ${database} with (force)`]);
}
