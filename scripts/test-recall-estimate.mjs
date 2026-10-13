// Disposable PostgreSQL transaction and synthetic fixtures only.
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = suffix => read('../supabase/migrations/' + readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(name => name.endsWith(suffix + '.sql')));
let sql = read('./test-clinical-copilot.sql').split('-- AI CORE --')[0];
sql += `create function private.require_entitlement(uuid,text) returns void language plpgsql as $$begin
  if current_setting('test.block_write',true)='true' then raise exception 'feature_denied'; end if; end $$;`;
for (const name of ['ai_core_credit_ledger','ai_cost_precision','clinical_copilot','clinical_patient_identity_field','clinical_treatment_objective_context','clinical_pes_objective_review']) sql += '\n' + migration(name);
// Projection stubs use the existing loader shape. Full context is exercised by domain tests.
for (const name of ['ai_diet_source', 'ai_text_diet_source']) sql += `
create function public.${name}(p_owner uuid,p_plan uuid,p_revision integer) returns jsonb language plpgsql set search_path='' as $$
declare s public.consultation_snapshots; source jsonb; begin
 select * into s from public.consultation_snapshots where consultation_id=p_plan and professional_id=p_owner order by revision desc limit 1;
 source:=jsonb_build_object('confirmedRecall',jsonb_build_object('approved_at',s.clinical_records->'recall'->>'approved_at','items',s.clinical_records->'recall'->'items'));
 return jsonb_build_object('source',source||jsonb_build_object('stamp',md5(source::text)),'identifiers','[]'::jsonb); end $$;`;
sql += '\n' + migration('recall_ai_nutrient_estimate') + '\n' + migration('recall_manual_context_compatibility') + '\n' + migration('recall_context_expression_fix') + '\n' + read('./test-recall-estimate.sql');
const result = spawnSync('psql', ['-X', '-h', '/tmp', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exit(result.status ?? 1);
