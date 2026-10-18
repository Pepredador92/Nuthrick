// Exercises the migration and permissions in a disposable local transaction.
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const foundation = read('../supabase/migrations/20260923222850_admin_foundation.sql');
const helpers = foundation.slice(foundation.indexOf('create function private.is_platform_admin()'), foundation.indexOf('-- Internal resolver:'));
const audit = foundation.slice(foundation.indexOf('create table private.admin_audit ('), foundation.indexOf('create index admin_audit_target'));
const filename = readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(name => name.endsWith('_platform_announcements.sql'));
const migration = read('../supabase/migrations/' + filename).replace(/^begin;\s*/, '').replace(/commit;\s*$/, '');
const sql = `begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth; create schema private; create schema storage;
grant usage on schema auth, private, public, storage to authenticated, anon;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable set search_path = '' as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
create function auth.jwt() returns jsonb language sql stable set search_path = '' as $$select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
create table public.professional_profiles(id uuid primary key references auth.users(id));
create table private.platform_admins(user_id uuid primary key references auth.users(id), enabled boolean default true);
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, metadata jsonb, unique(bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
${helpers}
${audit}
insert into auth.users values
 ('10000000-0000-0000-0000-000000000001', 'professional@example.test'),
 ('10000000-0000-0000-0000-000000000002', 'admin@example.test'),
 ('10000000-0000-0000-0000-000000000003', 'other@example.test');
insert into public.professional_profiles select id from auth.users;
insert into private.platform_admins(user_id) values ('10000000-0000-0000-0000-000000000002');
${migration}
${read('./test-announcements.sql')}
rollback;`;
if (process.argv.includes('--fixture')) {
  process.stdout.write(sql.slice(0, sql.indexOf(read('./test-announcements.sql'))) + '\ncommit;');
  process.exit(0);
}
const result = spawnSync('psql', ['-X', '-q', '-h', '/tmp', '-d', process.env.ANNOUNCEMENTS_TEST_DATABASE || 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
