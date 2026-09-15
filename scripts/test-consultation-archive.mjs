import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const migration=readFileSync(new URL('../supabase/migrations/20260915225419_archive_consultations_safely.sql',import.meta.url),'utf8').replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'');
const fixture=readFileSync(new URL('./test-consultation-archive.sql',import.meta.url),'utf8');
const [setup,checks]=fixture.split('-- MIGRATION INSERTION POINT --');
const result=spawnSync('psql',['-X','-h','/tmp','-d',process.env.CONSULTATION_TEST_DATABASE || 'postgres','-v','ON_ERROR_STOP=1'],{input:`begin;\n${setup}\n${migration}\n${checks}\nrollback;`,encoding:'utf8'});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
