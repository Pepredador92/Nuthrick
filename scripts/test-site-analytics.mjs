import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const migration=p=>read(p).replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'');
const sql=`begin;
create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema private;create schema auth;
grant usage on schema private,auth,public to service_role,authenticated;
create function private.is_platform_admin() returns boolean language sql as $$ select current_setting('test.admin',true)='yes' $$;
${migration('../supabase/migrations/20260929223000_site_visit_analytics.sql')}
${migration('../supabase/migrations/20260929225706_private_visit_analytics.sql')}
${read('./test-site-analytics.sql')}
rollback;`;
const result=spawnSync('psql',['-X','-q','-h','/tmp','-d',process.env.AGENDA_TEST_DATABASE||'postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
