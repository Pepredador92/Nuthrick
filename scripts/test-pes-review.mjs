// Local PostgreSQL only. Fixtures and all schema changes are rolled back.
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = suffix => read('../supabase/migrations/' + readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(name => name.endsWith(suffix + '.sql')));
let setup = read('./test-clinical-copilot.sql').split('-- AI CORE --')[0]
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
`;
for (const name of ['ai_core_credit_ledger','ai_cost_precision','clinical_copilot','clinical_patient_identity_field','clinical_treatment_objective_context','clinical_pes_objective_review','pes_longitudinal_context_and_required_etiology','pes_evidence_and_measurement_context']) setup += '\n' + migration(name).replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
if (process.argv.includes('--fixture')) { process.stdout.write(setup + '\ncommit;'); process.exit(0); }
const result = spawnSync('psql', ['-X','-q','-h','/tmp','-d',process.env.PES_REVIEW_TEST_DATABASE || 'postgres','-v','ON_ERROR_STOP=1'], { input: setup + '\n' + read('./test-pes-review.sql') + '\nrollback;', encoding: 'utf8' });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 1);
