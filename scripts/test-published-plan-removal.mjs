import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const setup = read('./test-patient-portal.sql').split('-- MIGRATION INSERTION POINT --')[0];
const baseMigrations = [
  '20260921194454_patient_superlink.sql',
  '20260921202541_patient_portal_plan_and_manual_code.sql',
  '20260921212058_portal_objectives_and_plan_exports.sql',
  '20261005062119_remove_published_diet_plan_safely.sql',
].map(name => read(`../supabase/migrations/${name}`)
  .replace(/^begin;\s*/m, '').replace(/commit;\s*$/, '')).join('\n');
const sql = read('./test-published-plan-removal.sql')
  .replace('-- SETUP --', () => setup)
  .replace('-- BASE MIGRATIONS --', () => baseMigrations)
  .replace('-- SYNCHRONIZATION MIGRATION --', () => read('../supabase/migrations/20261012175400_synchronize_published_plan_removal.sql'));
const result = spawnSync('psql', ['-X', '-h', '/tmp', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
  input: sql, encoding: 'utf8',
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
