// Isolated local database; synthetic fixtures only, no provider calls.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const database = `nuthrick_recall_${process.pid}`;
const psql = (db, input) => execFileSync('docker', ['exec', '-i', 'supabase_db_Nuthrick', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
const predecessor = read('../supabase/migrations/20261002181116_consultation_objective_assistance.sql');
const contextUpgrade = predecessor.slice(predecessor.indexOf('do $$', predecessor.indexOf('-- Keep server supplied context')), predecessor.indexOf('-- Include this feature'));
const migration = read('../supabase/migrations/20261002192736_recall_context_and_patient_instructions.sql');
let sql = read('./test-clinical-copilot.sql')
  .replace(/^create role .*;\n/gm, '')
  .replace('-- AI CORE --', () => read('../supabase/migrations/20260922005406_ai_core_credit_ledger.sql') + '\n' + read('../supabase/migrations/20260922010129_ai_cost_precision.sql'))
  .replace('-- CLINICAL MIGRATION --', () => ['20260922013348_clinical_copilot', '20260922013719_clinical_patient_identity_field', '20260922022644_clinical_treatment_objective_context', '20260922035457_clinical_pes_objective_review'].map(name => read(`../supabase/migrations/${name}.sql`)).join('\n'));
sql = sql.replace(/rollback;\s*$/, () => `
alter table consultations add consultation_date timestamptz default now();
alter table consultation_measurements add data_type text default 'number';
${contextUpgrade}
${migration.split('insert into private.entitlement_catalog')[0]}
${read('./test-recall-guidance.sql')}
rollback;
`);
try {
  psql('postgres', `create database ${database}`);
  psql(database, sql);
  console.log('Recall and guidance SQL checks passed: catalog persistence, completed/draft separation, owner/patient/revision checks, RPC grants.');
} finally { psql('postgres', `drop database if exists ${database}`); }
