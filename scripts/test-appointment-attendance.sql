do $$ declare owner_id uuid:='00000000-0000-0000-0000-000000000001'; pid uuid:='20000000-0000-0000-0000-000000000001';
 stamp timestamptz:=((now() at time zone 'America/Mexico_City')::date+27+time '10:00') at time zone 'America/Mexico_City';
 data jsonb; result jsonb; eid uuid; delivery_count integer; jobs integer;
begin
 if has_function_privilege('anon','public.agenda_confirm_attendance(uuid,uuid)','execute')
 or has_function_privilege('authenticated','public.agenda_confirm_attendance(uuid,uuid)','execute') then raise exception 'Unsafe attendance grants'; end if;
 update private.agenda_google_connections set active=false;
 update public.patients set email='synthetic@example.test' where id=pid;
 data:=jsonb_build_object('owner',owner_id,'patientId',pid,'start',stamp,'modality','online','locationId',null,'allowOutsideSchedule',false,'operationKey',gen_random_uuid());
 result:=public.agenda_appointment_action('create',data);eid:=(result->>'id')::uuid;
 if result->>'requires_confirmation'<>'false' or result->>'patient_attendance_at' is not null or result->>'professional_attendance_at' is not null then raise exception 'Booking incorrectly confirmed attendance'; end if;
 if (select count(*) from private.agenda_outbox where subject_id=eid and kind='confirmation')<>1 then raise exception 'Missing booking email'; end if;
 if public.agenda_appointment_action('replay_create',data)<>result then raise exception 'Creation replay'; end if;
 -- Only new creation queues invitations, with a deterministic event id.
 update private.agenda_google_connections set active=true,write_calendar_id='primary' where professional_id=owner_id;
 perform private.agenda_queue_scheduled_entry(eid);perform private.agenda_queue_scheduled_entry(eid);
 if (select count(*) from private.agenda_outbox where subject_id=eid and kind='calendar_insert')<>1 then raise exception 'Calendar invitation duplicate'; end if;
 select count(*) into delivery_count from private.agenda_outbox where subject_id=eid;
 perform public.agenda_appointment_action('link',jsonb_build_object('owner',owner_id,'id',eid,'tokenHash','attendance-future','encryptedToken','synthetic'));
 update public.patients set phone='4920000011' where id=pid;
 if public.agenda_appointment_action('link',jsonb_build_object('owner',owner_id,'id',eid))->>'phone'<>'+524920000011' then raise exception 'WhatsApp uses outdated phone'; end if;
 if public.agenda_appointment_action('info','{"tokenHash":"attendance-future"}')->>'patient_attendance_at' is not null then raise exception 'Opening invitation confirmed attendance'; end if;
 perform pg_temp.expect_error('select public.agenda_appointment_action(''patient_confirm'',''{"tokenHash":"attendance-future"}'')','confirmation_too_early');
 perform pg_temp.expect_error(format('select public.agenda_confirm_attendance(%L,%L)',owner_id,eid),'confirmation_too_early');
 perform public.agenda_upcoming_notifications();
 if exists(select 1 from public.professional_notifications where resource_id=eid and metadata->>'upcoming'='true') then raise exception 'Premature reminder'; end if;
 -- Exactly 48h opens the same attendance operation in all surfaces.
 update public.agenda_entries set starts_at=now()+interval '48 hours',ends_at=now()+interval '49 hours' where id=eid;
 perform pg_temp.expect_error('select public.agenda_appointment_action(''info'',''{"tokenHash":"attendance-future"}'')','invalid_token');
 perform public.agenda_appointment_action('link',jsonb_build_object('owner',owner_id,'id',eid,'tokenHash','attendance-near','encryptedToken','synthetic'));
 perform public.agenda_upcoming_notifications();perform public.agenda_upcoming_notifications();
 if (select count(*) from public.professional_notifications where resource_id=eid and metadata->>'upcoming'='true')<>1 then raise exception 'Reminder duplication'; end if;
 perform pg_temp.expect_error(format('select public.agenda_confirm_attendance(%L,%L)','00000000-0000-0000-0000-000000000002',eid),'not_found');
 result:=public.agenda_appointment_action('patient_confirm','{"tokenHash":"attendance-near"}');
 if result->>'patient_attendance_at' is null or result->>'professional_attendance_at' is not null then raise exception 'Patient attendance isolation'; end if;
 if public.agenda_appointment_action('patient_confirm','{"tokenHash":"attendance-near"}')<>result then raise exception 'Patient attendance replay'; end if;
 result:=public.agenda_confirm_attendance(owner_id,eid);
 if result->>'professional_attendance_at' is null or result->>'patient_attendance_at' is null then raise exception 'Both attendance confirmations'; end if;
 if public.agenda_confirm_attendance(owner_id,eid)<>result then raise exception 'Professional attendance replay'; end if;
 if (select count(*) from private.agenda_outbox where subject_id=eid)<>delivery_count then raise exception 'Attendance queued duplicate invitation'; end if;
 if (select count(*) from public.professional_notifications where resource_id=eid and dedupe_key like 'attendance:%')<>1 then raise exception 'Patient notification duplication'; end if;
 update public.agenda_entries set starts_at=now()+interval '47 hours',ends_at=now()+interval '48 hours' where id=eid;
 if exists(select 1 from public.agenda_entries where id=eid and (patient_attendance_at is not null or professional_attendance_at is not null)) then raise exception 'Reschedule retained attendance'; end if;
 -- An authenticated portal session uses the same gate and patient binding.
 update public.patients set email=null where id=pid;
 perform public.agenda_confirm_attendance(owner_id,eid);
 result:=public.agenda_appointment_action('patient_confirm',jsonb_build_object('sessionHash','session-fixture','id',eid));
 if result->>'patient_attendance_at' is null then raise exception 'Portal attendance missing'; end if;
 update public.agenda_entries set requires_confirmation=true,patient_attendance_at=null,professional_attendance_at=null where id=eid;
 perform pg_temp.expect_error(format('select public.agenda_confirm_attendance(%L,%L)',owner_id,eid),'reservation_pending');
 update public.agenda_entries set requires_confirmation=false,status='cancelled' where id=eid;
 perform pg_temp.expect_error(format('select public.agenda_confirm_attendance(%L,%L)',owner_id,eid),'invalid_transition');
end $$;
select 'PASS booking vs attendance, scheduled delivery, 48h gate, token/portal/owner access, reminder deduplication, reschedule and cancellation';
