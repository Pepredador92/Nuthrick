import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const migration = readFileSync(new URL('../supabase/migrations/20260916004238_agenda_booking_core.sql', import.meta.url), 'utf8').replace(/^begin;\s*/m, '').replace(/commit;\s*$/, '');
const [setup, assertions] = readFileSync(new URL('./test-agenda-db.sql', import.meta.url), 'utf8').split('-- MIGRATION INSERTION POINT --');
const result = spawnSync('psql', ['-X','-h','/tmp','-d',process.env.AGENDA_TEST_DATABASE || 'postgres','-v','ON_ERROR_STOP=1'], { input: `begin;\n${setup}\n${migration}\n${assertions}\nrollback;`, encoding:'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
