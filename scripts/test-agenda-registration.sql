-- Synthetic fixtures only; all changes, including patients, are rolled back.
do $$
#variable_conflict use_variable
declare owner_id uuid:='00000000-0000-0000-0000-000000000001'; foreign_owner uuid:='00000000-0000-0000-0000-000000000002';
 stamp timestamptz:=((now() at time zone 'America/Mexico_City')::date+20+time '10:00') at time zone 'America/Mexico_City';
 payload jsonb; answer jsonb; op uuid:=gen_random_uuid(); entry uuid; patient uuid; second_entry uuid;
 reg jsonb:='{"birthDate":"1990-03-12","countryCode":"+52","phone":"+524920000001","consent":true}';
 permit uuid; confirmation_op uuid:=gen_random_uuid(); confirmation jsonb; first_job jsonb; final_job jsonb; request uuid;
begin
 update private.agenda_google_connections set active=false where professional_id=owner_id;
 update public.professional_profiles set is_public=true where id=owner_id;
 update public.availability_settings set timezone='America/Mexico_City' where professional_id=owner_id;
 update public.availability_slots set start_time='08:00',end_time='20:00',booking_modality='online' where professional_id=owner_id;
 if has_function_privilege('anon','public.agenda_book_registered(text,text,uuid,jsonb,uuid)','execute') or
 has_function_privilege('authenticated','public.agenda_confirm_reservation(uuid,uuid,jsonb,uuid)','execute') then raise exception 'Registration RPC exposed'; end if;
 insert into private.agenda_verifications(id,professional_id,email,code_hash,proof_hash,verified_at,expires_at)
 values(gen_random_uuid(),owner_id,'new-fixture@example.invalid','unused','registration-proof',now(),now()+interval '10 minutes');
 payload:=jsonb_build_object('kind','appointment','name','Paciente sintético nuevo','start',stamp,'modality','online','registration',reg);
 perform pg_temp.expect_error(format('select public.agenda_book_registered(%L,%L,%L,%L)', 'agenda-test','registration-proof',op,payload-'registration'), 'registration_required');
 perform pg_temp.expect_error(format('select public.agenda_book_registered(%L,%L,%L,%L)', 'agenda-test','registration-proof',op,jsonb_set(payload,'{registration,birthDate}','"2999-01-01"')), 'invalid_birth_date');
 perform pg_temp.expect_error(format('select public.agenda_book_registered(%L,%L,%L,%L)', 'agenda-test','registration-proof',op,jsonb_set(payload,'{registration,phone}','"123"')), 'invalid_phone');
 answer:=public.agenda_book_registered('agenda-test','registration-proof',op,payload);
 entry:=(answer->>'id')::uuid;
 select patient_id into patient from public.agenda_entries where id=entry;
 if answer->>'status'<>'pending_confirmation' or answer ? 'patientId' or patient is null then raise exception 'Incorrect registration response'; end if;
 if not exists(select 1 from public.patients where id=patient and full_name='Paciente sintético nuevo' and email='new-fixture@example.invalid' and phone='+524920000001' and birth_date='1990-03-12' and timezone='America/Mexico_City' and not portal_access_enabled) then raise exception 'Patient basics missing'; end if;
 if not exists(select 1 from public.agenda_entries where id=entry and requires_confirmation and registration_status='created') then raise exception 'Reservation not pending'; end if;
 if exists(select 1 from private.agenda_outbox where subject_id=entry and kind='calendar_insert') then raise exception 'Premature Google invitation'; end if;
 if public.agenda_book_registered('agenda-test','registration-proof',op,payload)<>answer then raise exception 'Registration replay differs'; end if;
 if (select count(*) from public.patients where email='new-fixture@example.invalid')<>1 then raise exception 'Replay duplicated patient'; end if;
 perform pg_temp.expect_error(format('select public.agenda_book_registered(%L,%L,%L,%L)', 'agenda-test','registration-proof',gen_random_uuid(),payload), 'verification_required');
 if exists(select 1 from jsonb_array_elements(public.agenda_context('agenda-test',(stamp at time zone 'America/Mexico_City')::date,1)->'slots') s where (s->>'start')::timestamptz=stamp) then raise exception 'Pending time not occupied'; end if;
 -- Same verified email is NOT sufficient authority to attach an existing file.
 insert into private.agenda_verifications(id,professional_id,email,code_hash,proof_hash,verified_at,expires_at)
 values(gen_random_uuid(),owner_id,'new-fixture@example.invalid','unused','shared-proof',now(),now()+interval '10 minutes');
 answer:=public.agenda_book_registered('agenda-test','shared-proof',gen_random_uuid(),payload||jsonb_build_object('start',stamp+interval '1 hour','name','Otra persona'));
 second_entry:=(answer->>'id')::uuid;
 if not exists(select 1 from public.agenda_entries where id=second_entry and patient_id is null and registration_status='review') then raise exception 'Shared email linked automatically'; end if;
 if (select count(*) from public.patients where email='new-fixture@example.invalid')<>1 then raise exception 'Duplicate created'; end if;
 -- Confirmation is owner-only, fresh Google availability is mandatory.
 confirmation:=jsonb_build_object('action','confirm_reservation','id',entry);
 perform pg_temp.expect_error(format('select public.agenda_confirm_reservation(%L,%L,%L)', foreign_owner,confirmation_op,confirmation), 'not_found');
 update private.agenda_google_connections set active=true where professional_id=owner_id;
 perform pg_temp.expect_error(format('select public.agenda_confirm_reservation(%L,%L,%L)', owner_id,confirmation_op,confirmation), 'google_unavailable');
 insert into private.agenda_busy_checks(professional_id,connection_revision,starts_at,ends_at)
 select owner_id,revision,stamp,stamp+interval '1 hour' from private.agenda_google_connections where professional_id=owner_id returning id into permit;
 first_job:=public.agenda_server('claim_job',jsonb_build_object('owner',owner_id,'subject',entry));
 answer:=public.agenda_confirm_reservation(owner_id,confirmation_op,confirmation,permit);
 if answer->>'status'<>'confirmed' or (select requires_confirmation from public.agenda_entries where id=entry) then raise exception 'Confirmation failed'; end if;
 if public.agenda_confirm_reservation(owner_id,confirmation_op,confirmation,null)<>answer then raise exception 'Confirmation retry failed'; end if;
 if (select count(*) from private.agenda_outbox where subject_id=entry and kind='calendar_insert')<>1 then raise exception 'Final Google job missing or duplicated'; end if;
 update private.agenda_outbox set status='failed' where subject_id=entry and kind='calendar_insert';
 if public.agenda_server('claim_job',jsonb_build_object('owner',owner_id,'subject',entry))<>'null'::jsonb then raise exception 'Final email raced initial receipt'; end if;
 perform public.agenda_server('complete_job',jsonb_build_object('id',first_job->>'id','attempt',first_job->>'attempts','status','sent'));
 if (select notification_status from public.agenda_entries where id=entry)<>'pending' then raise exception 'Initial receipt marked final mail delivered'; end if;
 final_job:=public.agenda_server('claim_job',jsonb_build_object('owner',owner_id,'subject',entry));
 perform public.agenda_server('complete_job',jsonb_build_object('id',final_job->>'id','attempt',final_job->>'attempts','status','sent'));
 perform public.agenda_server('complete_job',jsonb_build_object('id',first_job->>'id','attempt',first_job->>'attempts','status','failed'));
 if (select notification_status from public.agenda_entries where id=entry)<>'sent' then raise exception 'Stale receipt overwrote final confirmation'; end if;
 perform public.agenda_manage(owner_id,gen_random_uuid(),jsonb_build_object('action','cancel','id',second_entry));
 if exists(select 1 from private.agenda_outbox where subject_id=second_entry and kind like 'calendar_%') then raise exception 'Pending cancellation created Google event'; end if;
 -- Alternative requests carry basic registration to an accepted appointment.
 update private.agenda_google_connections set active=false where professional_id=owner_id;
 insert into private.agenda_verifications(id,professional_id,email,code_hash,proof_hash,verified_at,expires_at)
 values(gen_random_uuid(),owner_id,'request-fixture@example.invalid','unused','registration-request',now(),now()+interval '10 minutes');
 payload:=payload||jsonb_build_object('kind','request','start',stamp+interval '1 day','name','Paciente solicitud','registration',reg||'{"phone":"+524920000002"}');
 answer:=public.agenda_book_registered('agenda-test','registration-request',gen_random_uuid(),payload);
 request:=(answer->>'id')::uuid;
 select patient_id into patient from public.agenda_requests where id=request;
 if patient is null then raise exception 'Request registration missing'; end if;
 answer:=public.agenda_manage(owner_id,gen_random_uuid(),jsonb_build_object('action','accept','id',request));
 if not exists(select 1 from public.agenda_entries where id=(select entry_id from public.agenda_requests where id=request) and patient_id=patient and not requires_confirmation and registration_consented_at is not null) then raise exception 'Accepted request lost registration'; end if;
end $$;
