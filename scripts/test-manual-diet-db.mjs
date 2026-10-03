// Isolated local Postgres only; everything is rolled back. No remote credentials.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const initial = read('../supabase/migrations/20260915194821_nutrition_plan_versions.sql');
const snapshot = initial.slice(initial.indexOf('create or replace function private.nutrition_plan_version_snapshot'), initial.indexOf('create or replace function public.publish_nutrition_plan_version'));
const fixture = read('./test-manual-diet-db.sql').split('-- MIGRATIONS --');
const migration = read('../supabase/migrations/20261003225025_allow_manual_diet_confirmation.sql');
const result = spawnSync('psql', ['-X','-h','/tmp/nuthrick-supplements-pg','-p','55439','-U',process.env.USER,'-d','postgres','-v','ON_ERROR_STOP=1'], {input: fixture[0]+snapshot+migration+fixture[1],encoding:'utf8'});
process.stdout.write(result.stdout ?? '');process.stderr.write(result.stderr ?? '');process.exit(result.status ?? 1);
