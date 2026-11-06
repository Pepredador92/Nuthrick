-- Manual integration check with nuthrick.test_professional set to an existing
-- professional with agenda access. A deliberate exception rolls back the whole
-- block, including jobs and audit rows, even outside a caller's BEGIN/ROLLBACK.
-- This never calls the delivery worker or an external calendar.
do $test$
declare
 owner_id uuid := current_setting('nuthrick.test_professional')::uuid;
 settings public.availability_settings;
 choice record;
 slot jsonb;
 payload jsonb;
 result jsonb;
 entry public.agenda_entries;
 connection private.agenda_google_connections;
 check_id uuid;
 patient_count bigint;
 existing_patient uuid;
 day_offset integer;
 invalid_name text;
begin
 select * into settings from public.availability_settings where professional_id=owner_id;
 select * into choice from private.agenda_choices(owner_id) order by modality limit 1;
 for day_offset in 7..least(20,settings.booking_horizon_days) loop
  slot := public.agenda_appointment_availability(owner_id,(now() at time zone settings.timezone)::date+day_offset,choice.modality,choice.location_id)->'slots'->0;
  exit when slot is not null;
 end loop;
 if slot is null then raise exception 'test_requires_free_slot'; end if;
 select * into connection from private.agenda_google_connections where professional_id=owner_id and active;
 if found then
  insert into private.agenda_busy_checks(professional_id,connection_revision,starts_at,ends_at)
   values(owner_id,connection.revision,(slot->>'start')::timestamptz,(slot->>'end')::timestamptz+interval '1 day') returning id into check_id;
 end if;
 payload := jsonb_build_object('owner',owner_id,'contactName','Paciente de prueba transaccional',
  'start',slot->>'start','modality',choice.modality,'locationId',choice.location_id,
  'allowOutsideSchedule',false,'operationKey',gen_random_uuid());
 select count(*) into patient_count from public.patients where professional_id=owner_id;
 result := public.agenda_appointment_action('create',payload||jsonb_build_object('busyCheck',check_id));
 select * into entry from public.agenda_entries where id=(result->>'id')::uuid;
 if entry.id is null or entry.patient_id is not null or entry.contact_name is distinct from 'Paciente de prueba transaccional'
  or entry.source <> 'professional' or entry.requires_confirmation or entry.outside_schedule_authorized
  or entry.status <> 'confirmed' or entry.contact_email is not null then raise exception 'new_contact_projection_failed'; end if;
 if patient_count <> (select count(*) from public.patients where professional_id=owner_id) then raise exception 'unexpected_chart_creation'; end if;
 if public.agenda_appointment_action('replay_create',payload)->>'id' is distinct from result->>'id' then raise exception 'new_contact_replay_failed'; end if;
 if public.agenda_appointment_action('create',payload||jsonb_build_object('busyCheck',check_id))->>'id' is distinct from result->>'id' then raise exception 'new_contact_retry_failed'; end if;
 begin
  perform public.agenda_appointment_action('replay_create',payload||jsonb_build_object('contactName','Otro nombre'));
  raise exception 'expected_idempotency_mismatch';
 exception when others then if sqlerrm <> 'idempotency_mismatch' then raise; end if; end;
 begin
  perform public.agenda_appointment_action('create',payload||jsonb_build_object('operationKey',gen_random_uuid(),'busyCheck',check_id));
  raise exception 'expected_slot_taken';
 exception when others then if sqlerrm <> 'slot_taken' then raise; end if; end;
 foreach invalid_name in array array['', 'A', repeat('A',161), E'Nombre\ncontrol'] loop
  begin
   perform public.agenda_appointment_action('create',payload||jsonb_build_object('operationKey',gen_random_uuid(),'contactName',invalid_name));
   raise exception 'expected_invalid_contact_name';
  exception when others then if sqlerrm <> 'invalid_contact_name' then raise; end if; end;
 end loop;
 begin
  perform public.agenda_appointment_action('create',(payload-'contactName')||jsonb_build_object('operationKey',gen_random_uuid(),'patientId',gen_random_uuid()));
  raise exception 'expected_invalid_patient';
 exception when others then if sqlerrm <> 'invalid_patient' then raise; end if; end;
 select id into existing_patient from public.patients where professional_id=owner_id and deleted_at is null and status='active' limit 1;
 if existing_patient is null then raise exception 'test_requires_existing_patient'; end if;
 -- The new contact is already occupying the first slot; find the next free one.
 slot := public.agenda_appointment_availability(owner_id,((payload->>'start')::timestamptz at time zone settings.timezone)::date,choice.modality,choice.location_id)->'slots'->0;
 if slot is null then raise exception 'test_requires_second_free_slot'; end if;
 result := public.agenda_appointment_action('create',(payload-'contactName')||jsonb_build_object('patientId',existing_patient,'start',slot->>'start','busyCheck',check_id,'operationKey',gen_random_uuid()));
 select * into entry from public.agenda_entries where id=(result->>'id')::uuid;
 if entry.patient_id is distinct from existing_patient then raise exception 'existing_patient_link_failed'; end if;
 -- An EXCEPTION block is a subtransaction. Catch only our success marker so
 -- assertion failures still propagate while successful writes are rolled back.
 raise sqlstate 'P9090' using message='agenda_integration_verified';
exception when sqlstate 'P9090' then null;
end
$test$;
