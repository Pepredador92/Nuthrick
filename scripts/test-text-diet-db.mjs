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
 +migration('diet_supplement_snapshot_validation')+'\n'+migration('diet_ai_supplement_validation_permission')+'\n';
sql+=`alter table professional_profiles add column full_name text,add column professional_title text;
alter table nutrition_plans add column title text default 'Synthetic text plan',add column assigned_at date default current_date,add column energy_calculation jsonb,add column current_version_id uuid;
create schema extensions;create extension pgcrypto with schema extensions;
create function private.require_my_entitlement(text) returns void language plpgsql as $$begin end$$;
create table nutrition_plan_versions(id uuid primary key default gen_random_uuid(),plan_id uuid,professional_id uuid,patient_id uuid,consultation_id uuid,version_number int,draft_revision bigint,snapshot_schema_version int,validation_rules_version text,content_hash text,idempotency_key uuid,snapshot jsonb,published_by uuid,published_at timestamptz default now());
alter table nutrition_plans enable row level security;
create policy owner_plan on nutrition_plans to authenticated using(professional_id=auth.uid()) with check(professional_id=auth.uid());
grant select,update on nutrition_plans to authenticated;grant select on nutrition_plan_versions to authenticated;
`;
const publication=migration('nutrition_plan_versions');
sql+=publication.slice(publication.indexOf('create or replace function private.bump_nutrition_plan_draft_revision'),publication.indexOf('create or replace function private.nutrition_plan_publication_errors'));
sql+=publication.slice(publication.indexOf('create or replace function private.nutrition_plan_version_snapshot'),publication.indexOf('create or replace function public.publish_nutrition_plan_version'));
sql+=migration('allow_manual_diet_confirmation')+'\n'+migration('narrative_diet_drafts')+'\n';
sql+=read('./test-guided-diet-db.sql').split('do $$')[0]+'\n'+read('./test-text-diet-db.sql');
const r=spawnSync('psql',['-X','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1);
