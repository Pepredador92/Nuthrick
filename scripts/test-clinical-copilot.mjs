import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sql=read('./test-clinical-copilot.sql').replace('-- AI CORE --',()=>read('../supabase/migrations/20260922005406_ai_core_credit_ledger.sql')+'\n'+read('../supabase/migrations/20260922010129_ai_cost_precision.sql'))
  .replace('-- CLINICAL MIGRATION --',()=>read('../supabase/migrations/20260922013348_clinical_copilot.sql')+'\n'+read('../supabase/migrations/20260922013719_clinical_patient_identity_field.sql')+'\n'+read('../supabase/migrations/20260922022644_clinical_treatment_objective_context.sql')+'\n'+read('../supabase/migrations/20260922035457_clinical_pes_objective_review.sql'))
  .replace('-- REAL PES CALIBRATION --', () => {
    const recorded = JSON.parse(read('../supabase/functions/ai/fixtures/pes-real-calibration-20260922.json'));
    return "savepoint real_calibration;\nselect set_config('test.real_pes', '" + JSON.stringify(recorded.A).replaceAll("'", "''") + "', true);\n" + read('./test-pes-real-integration.sql') + '\nrollback to savepoint real_calibration;';
  });
const result=spawnSync('psql',['-X','-h','/tmp','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exit(result.status??1);
