import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = path => read(path).replace(/^begin;\s*/m, '').replace(/commit;\s*$/, '');
const [setup, coreAssertions] = read('./test-agenda-db.sql').split('-- MIGRATION INSERTION POINT --');
const extendedPatients = `alter table public.patients alter column id set default gen_random_uuid(),
 add column full_name text, add column email text, add column country_code text,
 add column phone text, add column birth_date date, add column timezone text,
 add column portal_access_enabled boolean default false;`;
const sql = `begin;\n${setup}\n${migration('../supabase/migrations/20260916004238_agenda_booking_core.sql')}\n${extendedPatients}\n${migration('../supabase/migrations/20260916015845_agenda_patient_registration.sql')}\n${coreAssertions}\n${read('./test-agenda-registration.sql')}\nrollback;`;
const result = spawnSync('psql', ['-X', '-h', '/tmp', '-d', process.env.AGENDA_TEST_DATABASE || 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 1);
