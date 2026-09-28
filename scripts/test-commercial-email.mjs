// Entirely local schema clone. No Stripe/OpenAI calls and no remote legal changes.
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
  const names = readdirSync(new URL('supabase/migrations/',root)).filter(name => /_(ai_credit_purchases|credit_admin_catalog_queries|pre_live_readiness|pre_live_readiness_credentials|live_ready_operational|live_readiness_operational_checks|operations_job_snapshot|live_ready_rpc_fixes|public_legal_projection|public_legal_projection_table|live_ready_fk_indexes|fix_billing_job_result|fix_operations_job_snapshot|live_one_environment_preparation)\.sql$/.test(name)).sort();
  for (const name of names) sql(readFileSync(new URL('supabase/migrations/'+name,root),'utf8'));
  console.log('PASS LIVE-1 migration sequence compiles');
  sql(readFileSync(new URL('supabase/migrations/20260925162150_live_one_b_legal_email.sql',root),'utf8'));
  console.log('PASS LIVE-1B migration compiles');
  sql('delete from private.promotion_campaigns');
  sql(readFileSync(new URL('scripts/test-billing.sql',root),'utf8'));
  sql(readFileSync(new URL('scripts/test-credit-purchases.sql',root),'utf8'));
  console.log('PASS subscription and credit regressions after LIVE-1B');
  sql(readFileSync(new URL('scripts/test-live-one-b.sql',root),'utf8'));
  console.log('PASS LIVE-1B baseline');
  for (const suffix of ['transactional_email_gmail_transport','transactional_email_runtime_verify','transactional_email_gmail_queue','gmail_sender_verification_guard','commercial_email_pre_live','billing_optional_credit_purchase','email_transport_required_proofs']) {
    const file=readdirSync(new URL('supabase/migrations/',root)).find(n=>n.endsWith('_'+suffix+'.sql'));
    assert.ok(file, suffix);
    sql(readFileSync(new URL('supabase/migrations/'+file,root),'utf8'));
  }
  sql(readFileSync(new URL('scripts/test-commercial-email.sql',root),'utf8'));
  console.log('PASS commercial mail event isolation, idempotency, privacy, retry and readiness gates');
  if (process.env.COMMERCIAL_EMAIL_KEEP_DB === '1') console.log(`LOCAL_DATABASE=${database}`);

} catch (error) {
  console.error(error.stderr?.toString() || error.message); process.exitCode=1;
} finally {
  if (process.env.COMMERCIAL_EMAIL_KEEP_DB !== '1' || process.exitCode) {
    execFileSync('docker',['exec','supabase_db_Nuthrick','psql','-X','-qAt','-U','postgres','-d','postgres','-c',`drop database ${database} with (force)`]);
  }
}
