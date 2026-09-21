import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migrationName = readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(name => name.endsWith('_patient_superlink.sql'));
if (!migrationName) throw new Error('Portal migration not found');
const migration = read(`../supabase/migrations/${migrationName}`).replace(/^begin;\s*/m, '').replace(/commit;\s*$/, '');
const [setup, assertions] = read('./test-patient-portal.sql').split('-- MIGRATION INSERTION POINT --');
const result = spawnSync('psql', ['-X', '-h', '/tmp', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: `begin;\n${setup}\n${migration}\n${assertions}\nrollback;`, encoding: 'utf8' });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 1);
