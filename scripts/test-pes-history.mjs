// Run against an isolated, disposable local PostgreSQL instance only.
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = suffix => read('../supabase/migrations/' + readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(name => name.endsWith(suffix + '.sql')));
let sql = read('./test-clinical-copilot.sql').split('-- AI CORE --')[0];
sql += `
alter table patients alter column id set default gen_random_uuid();
alter table consultations alter column id set default gen_random_uuid();
alter table consultations add column consultation_date timestamptz default now(), add column sequence_number integer default 0,
  add column consultation_type text default 'follow_up', add column updated_at timestamptz default clock_timestamp();
alter table consultation_answers add column section_key text, add column response_area text;
alter table consultation_measurements add column data_type text default 'number';
create function private.can_use_feature(uuid,text) returns boolean language sql as $$ select true $$;
insert into professional_profiles values(gen_random_uuid());
`;
for (const name of ['ai_core_credit_ledger','ai_cost_precision','clinical_copilot','clinical_patient_identity_field','clinical_treatment_objective_context','clinical_pes_objective_review','pes_longitudinal_context_and_required_etiology']) sql += '\n' + migration(name);
// The fixture opens and rolls back its own transaction; remove its nested BEGIN.
sql += '\n' + read('./test-pes-history.sql').replace('begin;', '');
const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exit(result.status ?? 1);
