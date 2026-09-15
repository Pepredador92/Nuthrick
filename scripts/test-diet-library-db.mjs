// Transaction-only database integration test. Requires a LOCAL empty PostgreSQL database.
// All fixture tables, test roles and migration changes are rolled back, even on failure.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const migration = readFileSync(new URL('../supabase/migrations/20260915212701_reusable_diet_library.sql', import.meta.url), 'utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
const fixture = readFileSync(new URL('./test-diet-library-db.sql', import.meta.url), 'utf8');
const [setup, checks] = fixture.split('-- MIGRATION INSERTION POINT --');
const run = spawnSync('psql', ['-X', '-h', '/tmp', '-d', process.env.LIBRARY_TEST_DATABASE || 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: `begin;\n${setup}\n${migration}\n${checks}\nrollback;`, encoding:'utf8' });
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
process.exit(run.status ?? 1);
