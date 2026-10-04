// Disposable local PostgreSQL only. Builds a transactional synthetic schema.
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if(!['/tmp','127.0.0.1','localhost'].includes(process.env.PGHOST??''))throw Error('Set PGHOST to a local disposable test server');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const migration=s=>read('../supabase/migrations/'+readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(n=>n.endsWith(s+'.sql')));
let sql=read('./test-diet-workshop-ai.sql').split('create function pg_temp.assert')[0]
.replace('-- SETUP --',()=>read('./test-clinical-copilot.sql').split('-- AI CORE --')[0])
.replace('-- CORE --',()=>migration('ai_core_credit_ledger')+'\n'+migration('ai_cost_precision'))
.replace('-- WORKSHOP --',()=>migration('diet_workshop_ai'));
sql+=`alter table nutrition_plans add primary key(id);
alter table nutrition_plans alter column draft_revision type bigint;
alter table consultations add column sequence_number integer default 0,add column consultation_type text default 'follow_up';
alter table consultation_answers add column response_area text;
alter table consultation_calculation_results add column raw_result numeric;
create function private.require_entitlement(uuid,text) returns void language plpgsql as $$begin end$$;
`;
sql+=migration('diet_draft_snapshot')+'\n'+migration('guided_diet_context_and_atomic_apply')+'\n'
  +migration('diet_supplement_snapshot_validation')+'\n'+migration('diet_ai_supplement_validation_permission')+'\n'
  +read('./test-guided-diet-db.sql');
const r=spawnSync('psql',['-X','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1);
