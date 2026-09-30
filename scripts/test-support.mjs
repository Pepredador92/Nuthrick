import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const migration=p=>read(p).replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'');
const adminSource=read('../supabase/migrations/20260923222850_admin_foundation.sql');
const isAdmin=adminSource.slice(adminSource.indexOf('create function private.is_platform_admin()'),adminSource.indexOf('create function private.require_platform_admin()'));
const sql=`begin;
create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;create schema private;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
grant usage on schema auth,private,public to authenticated;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.professional_profiles(id uuid primary key references auth.users(id),full_name text);
create table private.platform_admins(user_id uuid primary key references auth.users(id),enabled boolean default true);
${isAdmin}
create publication supabase_realtime;
insert into auth.users values('10000000-0000-0000-0000-000000000001','one@example.test'),('10000000-0000-0000-0000-000000000002','two@example.test'),('10000000-0000-0000-0000-000000000003','admin@example.test');
insert into public.professional_profiles select id,email from auth.users;
insert into private.platform_admins(user_id) values('10000000-0000-0000-0000-000000000003');
${migration('../supabase/migrations/20260930051234_professional_support_chat.sql')}
${migration('../supabase/migrations/20260930052755_support_answers_and_hours.sql')}
${migration('../supabase/migrations/20260930053329_support_screenshots_and_metrics.sql')}
${read('./test-support.sql')}
${read('./test-support-content.sql')}
${read('./test-support-assets.sql')}
rollback;`;
const result=spawnSync('psql',['-X','-q','-h','/tmp','-d',process.env.SUPPORT_TEST_DATABASE||'postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
