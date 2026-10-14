// Disposable local PostgreSQL only. All fixtures and schema changes roll back.
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const foundation = read('../supabase/migrations/20260923222850_admin_foundation.sql');
const helpers = foundation.slice(foundation.indexOf('create function private.is_platform_admin()'), foundation.indexOf('-- Internal resolver:'));
const audit = foundation.slice(foundation.indexOf('create table private.admin_audit ('), foundation.indexOf('create index admin_audit_target'));
const filename = readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(name => name.endsWith('_academy_training_catalog.sql'));
const migration = read('../supabase/migrations/' + filename).replace(/^begin;\s*/, '').replace(/commit;\s*$/, '');
const setup = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema private;
grant usage on schema auth, private, public to authenticated, anon;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable set search_path = '' as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
create table public.professional_profiles(id uuid primary key references auth.users(id));
create table private.platform_admins(user_id uuid primary key references auth.users(id), enabled boolean default true);
${helpers}
${audit}
insert into auth.users values
 ('10000000-0000-0000-0000-000000000001', 'professional@example.test'),
 ('10000000-0000-0000-0000-000000000002', 'admin@example.test');
insert into public.professional_profiles select id from auth.users;
insert into private.platform_admins(user_id) values ('10000000-0000-0000-0000-000000000002');
${migration}`;
if (process.argv.includes('--fixture')) {
  process.stdout.write(`begin;\n${setup}\ncommit;`);
  process.exit(0);
}
const sql = `begin;\n${setup}\n${read('./test-training.sql')}\nrollback;`;
const result = spawnSync('psql', ['-X', '-q', '-h', '/tmp', '-d', process.env.TRAINING_TEST_DATABASE || 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
