-- Synthetic, isolated local fixtures. The runner rolls back every object.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema private;
create schema extensions;
create extension btree_gist with schema extensions;
create extension citext with schema extensions;
set local search_path=public,extensions;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,service_role;
create table public.professional_profiles(id uuid primary key,public_slug extensions.citext,full_name text,is_public boolean default true,onboarding_completed boolean default true,care_modalities text[] default '{online}');
create table public.patients(id uuid primary key,professional_id uuid,deleted_at timestamptz,unique(professional_id,id));
create table public.professional_locations(id uuid primary key,professional_id uuid,name text,address text,is_active boolean default true);
create table public.availability_settings(professional_id uuid primary key,default_duration_minutes integer default 60,timezone text default 'America/Mexico_City',booking_horizon_days integer default 365);
create table public.availability_slots(id uuid primary key default gen_random_uuid(),professional_id uuid,weekday integer,start_time time,end_time time);
grant all on public.professional_profiles,public.patients,public.professional_locations,public.availability_settings,public.availability_slots to service_role;
insert into public.professional_profiles(id,public_slug,full_name) values
 ('00000000-0000-0000-0000-000000000001','agenda-test','Nutrióloga de prueba'),
 ('00000000-0000-0000-0000-000000000002','other-test','Profesional ajeno');
insert into public.availability_settings(professional_id) select id from public.professional_profiles;
insert into public.availability_slots(professional_id,weekday,start_time,end_time)
 select id,d,'08:00','20:00' from public.professional_profiles,generate_series(0,6) d;
insert into public.patients values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',null),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',null);
-- MIGRATION INSERTION POINT --
create function pg_temp.expect_error(q text,message text) returns void language plpgsql as $$ begin
  begin execute q; exception when others then
    if position(message in sqlerrm)>0 then return; end if; raise;
  end;
  raise exception 'Expected error % did not occur for %',message,q;
end $$;
create temp table test_context as select
 '00000000-0000-0000-0000-000000000001'::uuid owner_id,
 ((now() at time zone 'America/Mexico_City')::date+2+time '10:00') at time zone 'America/Mexico_City' stamp;
do $$
#variable_conflict use_variable
declare c record; data jsonb; answer jsonb; id uuid; second_id uuid; op uuid:=gen_random_uuid(); payload jsonb; code uuid:=gen_random_uuid(); begin
 select * into c from test_context;
 if has_function_privilege('anon','public.agenda_book(text,text,uuid,jsonb,uuid)','execute') or
    has_function_privilege('authenticated','public.agenda_manage(uuid,uuid,jsonb,uuid)','execute') then raise exception 'RPC exposed'; end if;
 if has_table_privilege('anon','public.agenda_entries','select') or has_table_privilege('authenticated','public.agenda_entries','insert') then raise exception 'Table exposed'; end if;
 data:=public.agenda_context('AGENDA-TEST',(c.stamp at time zone 'America/Mexico_City')::date,1);
 if jsonb_array_length(data->'slots')<>12 then raise exception 'Expected 12 hourly starts, got %',jsonb_array_length(data->'slots'); end if;
 if data::text like '%contact_email%' or data::text like '%patient_id%' then raise exception 'Public contact leak'; end if;
 if public.agenda_context('missing',current_date,1)->>'error'<>'profile_unavailable' then raise exception 'Missing profile'; end if;
 insert into private.agenda_verifications(id,professional_id,email,code_hash,expires_at)
 values(code,c.owner_id,'synthetic@example.invalid','correct-code',now()+interval '10 minutes');
 perform public.agenda_check_code(code,'wrong','proof-one');
 if (select attempts from private.agenda_verifications where agenda_verifications.id=code)<>1 then raise exception 'Failed attempts not durable'; end if;
 if public.agenda_check_code(code,'correct-code','proof-one')->>'verified'<>'true' then raise exception 'Verification'; end if;
 payload:=jsonb_build_object('kind','appointment','name','Contacto sintético','start',c.stamp,'modality','online');
 answer:=public.agenda_book('agenda-test','proof-one',op,payload);
 id:=(answer->>'id')::uuid;
 if answer->>'status'<>'confirmed' or (select patient_id from public.agenda_entries where agenda_entries.id=id) is not null then raise exception 'Booking created or linked patient'; end if;
 if public.agenda_book('agenda-test','proof-one',op,payload)<>answer then raise exception 'Retry not idempotent'; end if;
 perform pg_temp.expect_error(format('select public.agenda_book(%L,%L,%L,%L)', 'agenda-test','proof-one',op,payload||'{"name":"Other"}'), 'idempotency_mismatch');
 perform pg_temp.expect_error(format('select public.agenda_book(%L,%L,%L,%L)', 'agenda-test','proof-one',gen_random_uuid(),payload), 'verification_required');
 -- The exclusion constraint protects overlaps regardless of start or channel.
 perform pg_temp.expect_error(format('insert into public.agenda_entries(professional_id,kind,starts_at,ends_at,timezone,source) values(%L,%L,%L,%L,%L,%L)',c.owner_id,'block',c.stamp+interval '30 minutes',c.stamp+interval '2 hours','America/Mexico_City','block'),'exclusion constraint');
 answer:=public.agenda_manage(c.owner_id,gen_random_uuid(),jsonb_build_object('action','block','start',c.stamp+interval '1 hour','end',c.stamp+interval '2 hours'));
 second_id:=(answer->>'id')::uuid;
 if second_id is null then raise exception 'Consecutive interval denied'; end if;
 data:=public.agenda_context('agenda-test',(c.stamp at time zone 'America/Mexico_City')::date,1);
 if exists(select 1 from jsonb_array_elements(data->'slots') x where (x->>'start')::timestamptz<c.stamp+interval '2 hours' and (x->>'end')::timestamptz>c.stamp) then raise exception 'Busy slots leaked'; end if;
 perform pg_temp.expect_error(format('select public.agenda_manage(%L,%L,%L)', '00000000-0000-0000-0000-000000000002',gen_random_uuid(),jsonb_build_object('action','cancel','id',id)), 'not_found');
 perform pg_temp.expect_error(format('select public.agenda_manage(%L,%L,%L)',c.owner_id,gen_random_uuid(),jsonb_build_object('action','link','id',id,'patientId','20000000-0000-0000-0000-000000000002')), 'invalid_patient');
 perform public.agenda_manage(c.owner_id,gen_random_uuid(),jsonb_build_object('action','link','id',id,'patientId','20000000-0000-0000-0000-000000000001'));
 if (select contact_email from public.agenda_entries where agenda_entries.id=id)<>'synthetic@example.invalid' then raise exception 'Contact overwritten'; end if;
 update private.agenda_outbox set status='failed' where subject_id=id;
 if (select status from public.agenda_entries where agenda_entries.id=id)<>'confirmed' then raise exception 'Notification failure lost booking'; end if;
 insert into private.agenda_google_connections(professional_id,encrypted_refresh_token,active,busy_calendar_ids,write_calendar_id) values(c.owner_id,'encrypted-fixture',true,'{primary}','primary');
 perform pg_temp.expect_error(format('select private.agenda_assert_time(%L,%L,%L,%L,null,false,null)',c.owner_id,c.stamp+interval '3 hours',c.stamp+interval '4 hours','online'),'google_unavailable');
 update private.agenda_google_connections set active=false where professional_id=c.owner_id;
 update public.professional_profiles set is_public=false where professional_profiles.id=c.owner_id;
 if public.agenda_context('agenda-test',current_date,1)->>'error'<>'profile_unavailable' then raise exception 'Private profile reservable'; end if;
 if jsonb_array_length(public.agenda_server('resolve_local',jsonb_build_object('owner',c.owner_id,'localTime',to_char(c.stamp at time zone 'America/Mexico_City','YYYY-MM-DD"T"HH24:MI')))->'instants')<>1 then raise exception 'Private calendar cannot resolve own time'; end if;
 -- A lost-response retry still recovers an existing booking after unpublishing.
 if public.agenda_book('agenda-test','proof-one',op,payload)->>'id'<>id::text then raise exception 'Retry after unpublish failed'; end if;
 update public.professional_profiles set is_public=true where professional_profiles.id=c.owner_id;
 perform public.agenda_manage(c.owner_id,gen_random_uuid(),jsonb_build_object('action','cancel','id',id));
 if (select status from public.agenda_entries where agenda_entries.id=id)<>'cancelled' then raise exception 'Cancel failed'; end if;
end $$;

-- Requests don't occupy time. Proposal tokens are revision-bound and retry-safe.
do $$ declare c record; request_id uuid; answer jsonb; begin
 select * into c from test_context;
 insert into private.agenda_verifications(id,professional_id,email,code_hash,proof_hash,verified_at,expires_at)
 values(gen_random_uuid(),c.owner_id,'synthetic@example.invalid','unused','proof-request',now(),now()+interval '10 minutes');
 answer:=public.agenda_book('agenda-test','proof-request',gen_random_uuid(),jsonb_build_object('kind','request','name','Familia sintética','start',c.stamp+interval '1 day','modality','online'));
 request_id:=(answer->>'id')::uuid;
 if exists(select 1 from public.agenda_entries where id=request_id) then raise exception 'Request occupied time'; end if;
 perform public.agenda_manage(c.owner_id,gen_random_uuid(),jsonb_build_object('action','propose','id',request_id,'start',c.stamp+interval '1 day 2 hours','tokenHash','token-old','encryptedToken','encrypted-old'));
 perform public.agenda_manage(c.owner_id,gen_random_uuid(),jsonb_build_object('action','propose','id',request_id,'start',c.stamp+interval '1 day 3 hours','tokenHash','token-current','encryptedToken','encrypted-current'));
 perform pg_temp.expect_error('select public.agenda_respond(''token-old'',''accept'')','request_expired');
 answer:=public.agenda_respond('token-current','accept');
 if answer->>'status'<>'confirmed' then raise exception 'Proposal accept failed'; end if;
 if public.agenda_respond('token-current','accept')<>answer then raise exception 'Token retry not idempotent'; end if;
 perform pg_temp.expect_error('select public.agenda_respond(''token-current'',''reject'')','token_used');
 if (select revision from public.agenda_requests where id=request_id)<>3 then raise exception 'Revision lost'; end if;
end $$;

-- Outbox recovery: a stale worker cannot finish a new lease. Cancelling
-- during an insert waits for that insert before removing the Google event.
do $$ declare c record; e uuid; j jsonb; next_job jsonb; begin
 select * into c from test_context;
 insert into public.agenda_entries(professional_id,kind,starts_at,ends_at,timezone,source,modality,contact_name,contact_email,email_verified_at,calendar_status)
 values(c.owner_id,'appointment',c.stamp+interval '4 days',c.stamp+interval '4 days 1 hour','America/Mexico_City','professional','online','Prueba worker','synthetic@example.invalid',now(),'pending') returning id into e;
 insert into private.agenda_outbox(professional_id,subject_id,kind,payload)
 values(c.owner_id,e,'calendar_insert','{"calendarId":"primary","eventId":"synthetic"}');
 j:=public.agenda_server('claim_job',jsonb_build_object('owner',c.owner_id,'subject',e));
 if (j->>'attempts')::integer<>1 then raise exception 'Lease does not return current attempt'; end if;
 perform public.agenda_manage(c.owner_id,gen_random_uuid(),jsonb_build_object('action','cancel','id',e));
 -- Ignore the cancellation email here; test Google ordering only.
 update private.agenda_outbox set status='failed' where subject_id=e and kind='cancellation';
 next_job:=public.agenda_server('claim_job',jsonb_build_object('owner',c.owner_id,'subject',e));
 if next_job<>'null'::jsonb then raise exception 'Cancel raced calendar insert'; end if;
 update private.agenda_outbox set claimed_at=now()-interval '6 minutes' where id=(j->>'id')::uuid;
 -- Keep the cancel job ineligible until the recovered insert finishes.
 update private.agenda_outbox set available_at=now()+interval '1 hour' where subject_id=e and kind='calendar_cancel';
 next_job:=public.agenda_server('claim_job',jsonb_build_object('owner',c.owner_id,'subject',e));
 if (next_job->>'attempts')::integer<>2 then raise exception 'Lease not recovered'; end if;
 if public.agenda_server('complete_job',jsonb_build_object('id',j->>'id','attempt',1,'status','sent'))->>'stale'<>'true' then raise exception 'Old worker completed new lease'; end if;
 perform public.agenda_server('complete_job',jsonb_build_object('id',next_job->>'id','attempt',2,'status','sent'));
 if (select calendar_status from public.agenda_entries where id=e)<>'pending' then raise exception 'Cancelled entry falsely marked synced'; end if;
 update private.agenda_outbox set available_at=now() where subject_id=e and kind='calendar_cancel';
 next_job:=public.agenda_server('claim_job',jsonb_build_object('owner',c.owner_id,'subject',e));
 if next_job->>'kind'<>'calendar_cancel' then raise exception 'Cancellation not recovered'; end if;
 perform public.agenda_server('complete_job',jsonb_build_object('id',next_job->>'id','attempt',1,'status','sent'));
end $$;

-- Reconciliation flags external conflicts without modifying the appointment.
do $$ declare c record; e uuid; j jsonb; finish jsonb; begin
 select * into c from test_context;
 update private.agenda_google_connections set active=true where professional_id=c.owner_id;
 insert into public.agenda_entries(professional_id,kind,starts_at,ends_at,timezone,source,modality,contact_name,contact_email,email_verified_at,calendar_status)
 values(c.owner_id,'appointment',c.stamp+interval '5 days',c.stamp+interval '5 days 1 hour','America/Mexico_City','professional','online','Prueba revisión','synthetic@example.invalid',now(),'synced') returning id into e;
 insert into private.agenda_outbox(professional_id,subject_id,kind,status,payload)
 values(c.owner_id,e,'calendar_insert','sent','{"calendarId":"primary","eventId":"synthetic"}');
 j:=public.agenda_server('claim_calendar_check');
 if j->'entry'->>'id'<>e::text then raise exception 'Reconciliation did not claim eligible entry'; end if;
 finish:=jsonb_build_object('id',e,'checkedAt',j->'entry'->>'calendar_checked_at','revision',j->>'revision','conflict',true);
 perform public.agenda_server('complete_calendar_check',finish);
 if not exists(select 1 from public.agenda_entries where id=e and status='confirmed' and calendar_status='conflict') then raise exception 'Conflict changed or lost appointment'; end if;
 perform public.agenda_server('complete_calendar_check',finish||'{"error":"google_unavailable"}');
 if not exists(select 1 from public.agenda_entries where id=e and calendar_status='conflict' and calendar_check_error='google_unavailable') then raise exception 'Failed check erased conflict'; end if;
 update private.agenda_google_connections set revision=revision+1 where professional_id=c.owner_id;
 if public.agenda_server('complete_calendar_check',finish||'{"conflict":false}')->>'stale'<>'true' then raise exception 'Old connection check applied'; end if;
end $$;

-- DST gaps, repeated hours, duration bounds and two-location ambiguity.
do $$ declare c record; first_time timestamptz; second_time timestamptz; begin
 select * into c from test_context;
 update public.availability_settings set timezone='America/New_York' where professional_id=c.owner_id;
 update public.availability_slots set start_time='01:00',end_time='04:00' where professional_id=c.owner_id;
 first_time:='2027-11-07 01:00:00-04'; second_time:='2027-11-07 01:00:00-05';
 if first_time=second_time then raise exception 'Ambiguous time collapsed'; end if;
 if not private.agenda_fits(c.owner_id,first_time,first_time+interval '1 hour','online',null)
   or not private.agenda_fits(c.owner_id,second_time,second_time+interval '1 hour','online',null) then raise exception 'Repeated hour rejected'; end if;
 if not private.agenda_fits(c.owner_id,'2027-03-14 01:00:00-05','2027-03-14 03:00:00-04','online',null) then raise exception 'DST real duration'; end if;
 if private.agenda_fits(c.owner_id,'2027-03-14 03:30:00-04','2027-03-14 04:30:00-04','online',null) then raise exception 'End outside interval accepted'; end if;
 update public.professional_profiles set care_modalities='{hybrid}' where id=c.owner_id;
 insert into public.professional_locations values('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Ajeno','Dirección sintética',true);
 perform pg_temp.expect_error(format('update public.availability_slots set booking_modality=''in_person'',booking_location_id=''30000000-0000-0000-0000-000000000002'' where professional_id=%L',c.owner_id),'availability_booking_location_owner_fk');
 insert into public.professional_locations values(gen_random_uuid(),c.owner_id,'Consultorio A','Dirección de prueba',true);
 if exists(select 1 from private.agenda_options(c.owner_id)) then raise exception 'Ambiguous options auto enabled'; end if;
 update public.availability_slots set booking_modality='online' where professional_id=c.owner_id;
 if (select count(*) from private.agenda_options(c.owner_id))<>7 then raise exception 'Explicit option not enabled'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin
 if exists(select 1 from public.agenda_entries) or exists(select 1 from public.agenda_requests) then raise exception 'Other owner sees data'; end if;
end $$;
reset role;
select 'PASS: slots, privacy, code attempts, idempotency, overlap, adjacency, linking, notifications, Google fail-closed, requests, revisions, tokens, DST and RLS' as result;
