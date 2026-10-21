// LOCAL PostgreSQL only. Exact clinical/retention functions, synthetic fixtures,
// and rollback. Unrelated billing and diet integrations are outside this suite.
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const migration = suffix => {
  const name = readdirSync(new URL('supabase/migrations/', root)).find(name => name.endsWith(`_${suffix}.sql`));
  if (!name) throw new Error(`Missing migration: ${suffix}`);
  return read(`supabase/migrations/${name}`);
};
const strip = sql => sql.replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
export function clinicalFixtureSQL({retentionFix=true}={}) {
let setup = read('scripts/test-clinical-copilot.sql').split('-- AI CORE --')[0]
  .replace(/create role (\w+)[^;]*;/g, statement => `do $$ begin ${statement} exception when duplicate_object then null; end $$;`)
  .replace('returns void language plpgsql as $$', () => "returns void language plpgsql set search_path='' as $$");
setup += `
alter table patients alter column id set default gen_random_uuid();
alter table patients add column weight_kg numeric, add column height_cm numeric, add column birth_date date, add column equation_sex text, add column updated_at timestamptz default clock_timestamp();
alter table consultations alter column id set default gen_random_uuid();
alter table consultations add column consultation_date timestamptz default now(), add column sequence_number integer default 0, add column consultation_type text default 'follow_up', add column updated_at timestamptz default clock_timestamp();
alter table consultation_answers add column section_key text, add column response_area text;
alter table consultation_measurements add column data_type text default 'number', add column device_session_id uuid;
alter table measurement_types add column code text;
create table consultation_device_sessions(id uuid primary key, professional_id uuid, device_snapshot jsonb);
create function private.can_use_feature(uuid,text) returns boolean language sql set search_path='' as $$select true$$;
create function private.can_read_feature(uuid,text) returns boolean language sql set search_path='' as $$select true$$;
create function private.require_my_entitlement(text) returns void language plpgsql set search_path='' as $$begin
 if current_setting('nuthrick.test_account_read_only',true)='true' then raise exception 'account_read_only' using errcode='42501'; end if;
end $$;
create table private.plans(id uuid primary key,code text unique);
create table private.professional_access(professional_id uuid primary key,plan_id uuid,billing_mode text);
create table private.billing_retention(professional_id uuid,mode text,starts_at timestamptz,ends_at timestamptz,patient_ids uuid[]);
`;
for (const name of ['ai_core_credit_ledger','ai_cost_precision','clinical_copilot','clinical_patient_identity_field','clinical_treatment_objective_context','clinical_pes_objective_review','pes_longitudinal_context_and_required_etiology','pes_evidence_and_measurement_context','smart_objectives_from_pes']) setup += '\n' + strip(migration(name));
const strategies = migration('clinical_intervention_strategies');
setup += '\n' + strategies.slice(strategies.indexOf('create table public.consultation_interventions'), strategies.indexOf('-- Reuse the same owner-scoped source'));
const retention = migration('retention_backup_plan');
setup += '\n' + retention.slice(retention.indexOf('create function private.require_retention_patient('), retention.indexOf('create function private.enforce_retention_patient_write()'));
if (retentionFix) setup += '\n' + strip(migration('enforce_intervention_retention_patient'));
return setup;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
const setup=clinicalFixtureSQL({retentionFix:!process.argv.includes('--without-fix')});
const sql = setup + '\n' + read('scripts/test-intervention-retention.sql') + '\nrollback;';
const result = spawnSync('psql', ['-X','-q','-h','/tmp','-d','postgres','-v','ON_ERROR_STOP=1'], { input: sql, encoding:'utf8', maxBuffer:8*1024*1024 });
if (result.error) throw result.error;
process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
process.exitCode = result.status ?? 1;

}
