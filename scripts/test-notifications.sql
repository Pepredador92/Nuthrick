create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',label; end if; end $$;

insert into auth.users(id,email,email_confirmed_at) values
('ab250000-0000-4000-8000-000000000001','notification-owner@example.invalid',now()),
('ab250000-0000-4000-8000-000000000002','notification-other@example.invalid',now());
insert into public.professional_profiles(id,full_name) values
('ab250000-0000-4000-8000-000000000001','Profesional sintético'),
('ab250000-0000-4000-8000-000000000002','Otro profesional sintético')
on conflict(id) do nothing;
insert into public.patients(id,professional_id,full_name) values
('ab250000-0000-4000-8000-000000000010','ab250000-0000-4000-8000-000000000001','Paciente sintético');
insert into private.patient_portals(patient_id) values ('ab250000-0000-4000-8000-000000000010');
insert into private.portal_messages(id,patient_id,sender,client_id,body) values
('ab250000-0000-4000-8000-000000000011','ab250000-0000-4000-8000-000000000010','patient',gen_random_uuid(),'Mensaje privado de prueba');
select pg_temp.assert((select count(*)=1 from public.professional_notifications where type='portal_message'),'patient message must produce a notification');
select pg_temp.assert(not exists(select 1 from public.professional_notifications where metadata::text like '%Mensaje privado%'),'notification must exclude message body');
insert into private.portal_messages(patient_id,sender,client_id,body) values
('ab250000-0000-4000-8000-000000000010','professional',gen_random_uuid(),'Respuesta de prueba');
select pg_temp.assert((select count(*)=1 from public.professional_notifications),'professional reply must not notify its sender');
insert into public.agenda_requests(professional_id,contact_name,contact_email,email_verified_at,starts_at,ends_at,timezone,modality,expires_at)
values('ab250000-0000-4000-8000-000000000001','Solicitud sintética','test@example.invalid',now(),now()+interval '2 days',now()+interval '2 days 1 hour','America/Mexico_City','online',now()+interval '1 day');
insert into public.agenda_entries(professional_id,kind,starts_at,ends_at,timezone,modality,contact_name,contact_email,email_verified_at,source)
values('ab250000-0000-4000-8000-000000000001','appointment',now()+interval '3 days',now()+interval '3 days 1 hour','America/Mexico_City','online','Cita sintética','test@example.invalid',now(),'professional');
select pg_temp.assert((select count(*)=3 from public.professional_notifications),'agenda request and appointment must each notify once');
insert into public.professional_notifications(professional_id,type,actor_name,resource_id,resource_type,title,dedupe_key)
select professional_id,type,actor_name,resource_id,resource_type,title,dedupe_key from public.professional_notifications
on conflict(dedupe_key) do nothing;
select pg_temp.assert((select count(*)=3 from public.professional_notifications),'duplicate events must not duplicate notifications');

select pg_temp.assert(not has_table_privilege('anon','public.professional_notifications','SELECT'),'anonymous must not read notifications');
select pg_temp.assert(not has_table_privilege('authenticated','public.professional_notifications','INSERT'),'browser must not create notifications');
select pg_temp.assert(not has_column_privilege('authenticated','public.professional_notifications','title','UPDATE'),'browser must not rewrite notification content');
select pg_temp.assert(has_column_privilege('authenticated','public.professional_notifications','read_at','UPDATE'),'browser can mark notifications read');

set role authenticated;
select set_config('request.jwt.claim.sub','ab250000-0000-4000-8000-000000000001',false);
select pg_temp.assert((select count(*)=3 from public.professional_notifications),'owner can read own notifications');
update public.professional_notifications set read_at=now();
select pg_temp.assert((select count(*)=3 from public.professional_notifications where read_at is not null),'owner can mark own notifications read');
select set_config('request.jwt.claim.sub','ab250000-0000-4000-8000-000000000002',false);
select pg_temp.assert((select count(*)=0 from public.professional_notifications),'other professional cannot read notifications');
update public.professional_notifications set read_at=null;
reset role;
select pg_temp.assert((select count(*)=3 from public.professional_notifications where read_at is not null),'other professional cannot update notifications');
