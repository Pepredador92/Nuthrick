import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const migration=p=>read(p).replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'');
const [setup,assertions]=read('./test-agenda-db.sql').split('-- MIGRATION INSERTION POINT --');
const sql=`begin;
${setup}
${migration('../supabase/migrations/20260916004238_agenda_booking_core.sql')}
alter table public.patients alter column id set default gen_random_uuid(), add column full_name text, add column email text, add column country_code text, add column phone text, add column birth_date date, add column timezone text, add column portal_access_enabled boolean default false, add column status text default 'active';
${migration('../supabase/migrations/20260916015845_agenda_patient_registration.sql')}
${assertions}
${read('./test-agenda-registration.sql')}
create function private.require_entitlement(uuid,text) returns void language sql as 'select';
create function private.require_portal_capability(uuid,text,text) returns void language sql as 'select';
create table private.portal_sessions(token_hash text,patient_id uuid,expires_at timestamptz,link_hash text,email text);
create table private.patient_portals(patient_id uuid,link_hash text,link_expires_at timestamptz,recipient_email text,professional_read_at timestamptz);
create table private.portal_messages(id uuid,patient_id uuid,sender text);
create publication supabase_realtime;
${migration('../supabase/migrations/20260925070703_realtime_notifications.sql')}
${migration('../supabase/migrations/20260929223905_professional_appointments_confirmation.sql')}
${read('./test-professional-appointments.sql')}
rollback;`;
const result=spawnSync('psql',['-X','-q','-h','/tmp','-d',process.env.AGENDA_TEST_DATABASE||'postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
