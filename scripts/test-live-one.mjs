// Entirely local schema clone. No Stripe/OpenAI calls and no remote legal changes.
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
const run = promisify(execFile);
const root = new URL('../', import.meta.url);
const base = execFileSync(process.execPath, [new URL('scripts/test-billing.mjs', root).pathname], {
  env: {...process.env, BILLING_SCHEMA_ONLY:'1', BILLING_KEEP_DB:'1'}, encoding:'utf8', maxBuffer:25*1024*1024,
});
const database = base.match(/LOCAL_DATABASE=(nuthrick_billing_\d+)/)?.[1];
assert.ok(database);
const sql = query => execFileSync('docker',['exec','-i','supabase_db_Nuthrick','psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'], {input:query,encoding:'utf8',maxBuffer:25*1024*1024});
try {
  const names = readdirSync(new URL('supabase/migrations/',root)).filter(name => /_(ai_credit_purchases|credit_admin_catalog_queries|pre_live_readiness|pre_live_readiness_credentials|live_ready_operational|live_readiness_operational_checks|operations_job_snapshot|live_ready_rpc_fixes|public_legal_projection|public_legal_projection_table|live_ready_fk_indexes|fix_billing_job_result|fix_operations_job_snapshot|live_one_environment_preparation)\.sql$/.test(name)).sort();
  for (const name of names) sql(readFileSync(new URL('supabase/migrations/'+name,root),'utf8'));
  console.log('PASS LIVE-1 migration sequence compiles');
  sql('delete from private.promotion_campaigns'); // Seed templates only, in this empty LOCAL clone.
  sql(readFileSync(new URL('scripts/test-billing.sql',root),'utf8'));
  console.log('PASS TEST subscription regression after environment isolation');
  sql(readFileSync(new URL('scripts/test-credit-purchases.sql',root),'utf8'));
  console.log('PASS ADMIN-3 TEST regression after environment isolation');
  sql(readFileSync(new URL('scripts/test-live-one.sql',root),'utf8'));
  console.log('PASS LIVE-1 isolation, legal gate and simulated subscription lifecycle');
  const concurrent = query => run('docker',['exec','supabase_db_Nuthrick','psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-c',query]);
  const before=sql("select jsonb_build_array((select count(*) from private.billing_payments where mode='live'),(select count(*) from private.transactional_email_outbox where mode='live'),(select count(*) from private.admin_audit where metadata->>'mode'='live'))").trim();
  await Promise.all(Array.from({length:8},()=>concurrent("select live_one_test.event(owner,'evt_live_concurrent',snapshot) from live_one_test.snapshots where owner='1e000000-0000-4000-8000-000000000002'")));
  const after=sql("select jsonb_build_array((select count(*) from private.billing_payments where mode='live'),(select count(*) from private.transactional_email_outbox where mode='live'),(select count(*) from private.admin_audit where metadata->>'mode'='live'))").trim();
  assert.equal(after,before,'8 concurrent deliveries must not duplicate payment, audit or email');
  await Promise.all(Array.from({length:8},()=>concurrent("select private.billing_tick(now()+interval '1 month 1 day')")));
  assert.equal(sql("select count(*) from private.ai_credit_ledger where professional_id='1e000000-0000-4000-8000-000000000002' and type='PLAN_ALLOCATION'").trim(),'2','8 ticks grant exactly one next month for annual Live subscription');
  console.log('PASS 8 concurrent Live webhooks + 8 monthly jobs: no duplicate payment/audit/email/credits');

} catch (error) {
  console.error(error.stderr?.toString() || error.message); process.exitCode=1;
} finally {
  execFileSync('docker',['exec','supabase_db_Nuthrick','psql','-X','-qAt','-U','postgres','-d','postgres','-c',`drop database ${database} with (force)`]);
}
