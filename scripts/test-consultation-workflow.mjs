// Disposable local PostgreSQL only. Uses synthetic fixtures, no AI provider calls.
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = suffix => read('../supabase/migrations/' + readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(name => name.endsWith(suffix + '.sql')));
let sql = read('./test-clinical-copilot.sql').split('-- AI CORE --')[0];
sql += `
alter table consultation_answers add column section_key text, add column response_area text;
create function private.require_entitlement(uuid,text) returns void language plpgsql as $$
begin if current_setting('test.block_write',true)='true' then raise exception 'feature_denied' using errcode='42501'; end if; end $$;
`;
for (const name of ['ai_core_credit_ledger','ai_cost_precision','clinical_copilot','clinical_patient_identity_field','clinical_treatment_objective_context','clinical_pes_objective_review','consultation_workflow_steps']) sql += '\n' + migration(name);
// Exercise the production answer-saving implementation, not the minimal clinical test stub.
const source = migration('interview_revision_workflow');
sql += '\ncreate or replace ' + source.slice(source.indexOf('function public.save_consultation_responses'), source.indexOf('create function public.copy_consultation_template'));
sql += '\n' + read('./test-consultation-workflow.sql');
const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exit(result.status ?? 1);
