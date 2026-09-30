// Disposable local database; synthetic provider proofs; never calls Stripe/OpenAI.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const base=execFileSync(process.execPath,[new URL('scripts/test-live-one.mjs',root).pathname],{env:{...process.env,LIVE_KEEP_DB:'1'},encoding:'utf8',maxBuffer:25*1024*1024});
const database=base.match(/LOCAL_DATABASE=(nuthrick_billing_\d+)/)?.[1];
assert.ok(database);
const sql=q=>execFileSync('docker',['exec','-i','supabase_db_Nuthrick','psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',maxBuffer:25*1024*1024});
try {
 let q=`begin;
 insert into private.billing_live_allowlist(professional_id,enabled,authorized_by,reason) values('1e000000-0000-4000-8000-000000000001',true,(select user_id from private.platform_admins limit 1),'Synthetic regression') on conflict(professional_id) do update set enabled=true;
 update public.professional_profiles set onboarding_completed=true where id='1e000000-0000-4000-8000-000000000001';
 insert into private.ai_feature_config(feature,prompt_version) values('recall_24h','recall_24h@1'),('pes_diagnosis','pes_diagnosis@1'),('diet_draft','diet_draft@2');\n`;
 for(const file of ['20260930200548_controlled_ai_credit_pilot.sql','20260930204511_live_ai_production.sql']) {
  q+=readFileSync(new URL('supabase/migrations/'+file,root),'utf8').replace(/^begin;/,'').replace(/commit;\s*$/,'');
 }
 q+=readFileSync(new URL('scripts/test-live-ai.sql',root),'utf8')+'\nrollback;';
 sql(q);
 console.log('PASS production migration, consent, plan permissions, Live/Test isolation, idempotent credits and refunds');
} finally {
 execFileSync('docker',['exec','supabase_db_Nuthrick','psql','-U','postgres','-d','postgres','-c',`drop database ${database} with (force)`]);
}
