// Dedicated local PostgreSQL fixture; all changes roll back. Never uses production credentials.
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
const files=readdirSync(new URL('supabase/migrations/',root));
const migration=suffix=>read(`supabase/migrations/${files.find(name=>name.endsWith(`_${suffix}.sql`))}`);
const strip=sql=>sql.replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
let setup=read('scripts/test-patient-portal.sql').split('-- MIGRATION INSERTION POINT --')[0];
for(const name of ['patient_superlink','patient_portal_plan_and_manual_code','portal_objectives_and_plan_exports','initial_treatment_objective'])setup+='\n'+strip(migration(name));
setup+=`
alter table public.consultation_snapshots add column id uuid default gen_random_uuid(),add column clinical_records jsonb default '{}';
create table public.consultation_interventions(id uuid primary key default gen_random_uuid(),snapshot_id uuid,professional_id uuid,draft jsonb,approved jsonb,state text,version integer default 1,created_at timestamptz default now());
create function private.require_portal_capability(uuid,text,text) returns void language plpgsql set search_path='' as $$begin
 if $2 not in ('view','goal_candidates') and current_setting('nuthrick.test.readonly',true)='true' then raise exception 'entitlement_required'; end if;
end $$;
create function private.require_retention_patient(uuid,uuid) returns void language sql as $$select$$;
grant select on public.consultation_interventions to service_role;
grant execute on function private.require_portal_capability(uuid,text,text),private.require_retention_patient(uuid,uuid) to service_role;
`;
const latest=migration('synchronize_published_plan_removal');
setup+='\n'+latest.slice(latest.indexOf('CREATE OR REPLACE FUNCTION public.patient_portal('),latest.indexOf('end $function$;')+'end $function$;'.length);
const sql=`begin;\n${setup}\n${strip(migration('clinical_documents_and_shared_guidance'))}\n${read('scripts/test-clinical-sharing.sql')}\nrollback;`;
const result=spawnSync('psql',['-X','-q','-h','/tmp','-p',process.env.NUTHRICK_TEST_PG_PORT||'5432','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:8*1024*1024});
if(result.error)throw result.error;
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exitCode=result.status??1;
