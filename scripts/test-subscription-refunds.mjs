// Disposable local database; never contacts Stripe or a production database.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const base = execFileSync(process.execPath, [new URL('scripts/test-commercial-email.mjs', root).pathname], {
  env: {...process.env, COMMERCIAL_EMAIL_KEEP_DB:'1'}, encoding:'utf8', maxBuffer:25*1024*1024,
});
const database = base.match(/LOCAL_DATABASE=(nuthrick_billing_\d+)/)?.[1];
assert.ok(database);
const sql = query => execFileSync('docker',['exec','-i','supabase_db_Nuthrick','psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'], {input:query,encoding:'utf8',maxBuffer:25*1024*1024});
try {
  const migration = readdirSync(new URL('supabase/migrations/',root)).find(n=>n.endsWith('_billing_subscription_refund_history.sql'));
  assert.ok(migration);
  sql(readFileSync(new URL('supabase/migrations/'+migration,root),'utf8'));
  sql(readFileSync(new URL('scripts/test-subscription-refunds.sql',root),'utf8'));
  console.log('PASS refund totals, replay, malformed input, owner isolation and unchanged access');
} catch (error) {
  console.error(error.stderr?.toString() || error.message); process.exitCode=1;
} finally {
  execFileSync('docker',['exec','supabase_db_Nuthrick','psql','-X','-qAt','-U','postgres','-d','postgres','-c',`drop database ${database} with (force)`]);
}
