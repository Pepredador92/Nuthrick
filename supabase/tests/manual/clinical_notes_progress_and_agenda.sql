-- Synthetic data only. Run with both migrations applied to a local database.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  patient_id uuid := gen_random_uuid();
  other_patient_id uuid := gen_random_uuid();
  initial_id uuid := gen_random_uuid();
  visit_id uuid := gen_random_uuid();
  future_id uuid := gen_random_uuid();
  note_id uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  requested_day date := today + 45;
  appointment_slot jsonb;
  facts jsonb;
  result jsonb;
  previous_stamp text;
  review jsonb := '{"goals":[{"id":"goal","text":"Mantener el hábito de actividad física","assessment":{"status":"partial","result":"Hizo ejercicio con pesas cada tercer día durante dos semanas.","note":"Mejor organización de sus comidas."}},{"id":"unreviewed","text":"Dato no evaluado","assessment":{"status":"unreviewed","result":"","note":""}}],"strategies":[{"id":"strategy","text":"Preparar el registro de actividad","goalIds":["goal"],"assessment":{"status":"partial"}}],"instructions":""}';
begin
  insert into auth.users(id,email) values(owner_id,'notes-agenda-'||owner_id||'@example.invalid');
  insert into private.professional_access(professional_id,plan_id,status,source)
    select owner_id,id,'active','manual' from private.plans where code='profesional';
  update public.professional_profiles set is_public=true,onboarding_completed=true,care_modalities='{online}',
    public_slug='test-notes-agenda' where id=owner_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.patients(id,professional_id,full_name) values
    (patient_id,owner_id,'Paciente sintético de seguimiento'),(other_patient_id,owner_id,'Paciente ajeno a la consulta');
  insert into public.consultations(id,professional_id,patient_id,status,consultation_date,sequence_number,consultation_type) values
    (initial_id,owner_id,patient_id,'completed',(today-14)+time '10:00',1,'initial'),
    (visit_id,owner_id,patient_id,'draft',today+time '10:00',2,'follow_up'),
    (future_id,owner_id,patient_id,'completed',(today+2)+time '10:00',3,'follow_up');
  insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,template_name,template_version,structure) values
    (owner_id,patient_id,initial_id,1,'Plantilla sintética',1,'{"sections":[]}'),
    (owner_id,patient_id,visit_id,1,'Plantilla sintética',1,'{"sections":[]}');
  insert into public.patient_notes(professional_id,patient_id,consultation_id,content) values
    (owner_id,patient_id,initial_id,'Nota vinculada a visita anterior'),
    (owner_id,patient_id,future_id,'Nota posterior que debe omitirse'),
    (owner_id,other_patient_id,null,'Nota de otro paciente');
  set local role authenticated;
  insert into public.patient_notes(professional_id,patient_id,consultation_id,content)
    values(owner_id,patient_id,visit_id,'Registro de primera nota') returning id into note_id;
  perform public.save_patient_clinical_progress(patient_id,initial_id,1,visit_id,0,gen_random_uuid(),review);
  set local role service_role;
  result := public.ai_clinical_source(owner_id,patient_id,visit_id,1);
  reset role;
  facts := result->'facts';
  previous_stamp := result->>'stamp';
  if not exists(select 1 from jsonb_array_elements(facts) f where f->>'source' like 'Nota de la consulta · %' and f->>'finding'='Registro de primera nota')
    or not exists(select 1 from jsonb_array_elements(facts) f where f->>'source' like 'Nota previa · %' and f->>'finding'='Nota vinculada a visita anterior')
    or not exists(select 1 from jsonb_array_elements(facts) f where f->>'source' like 'Avance de objetivo · %'
      and f->>'finding' like '%Avance parcial%pesas cada tercer día%Mejor organización%')
    or not exists(select 1 from jsonb_array_elements(facts) f where f->>'source' like 'Avance de estrategia · %'
      and f->>'finding' like '%Aplicada en parte%')
    or facts::text ~ 'Nota posterior|otro paciente|Dato no evaluado'
    then raise exception 'wrong_follow_up_observations'; end if;

  set local role authenticated;
  update public.patient_notes set content='Nota editada desde el historial' where id=note_id;
  set local role service_role;
  result := public.ai_patient_instructions_source(owner_id,patient_id,visit_id,1);
  reset role;
  if result->>'stamp'=previous_stamp or (result->'facts')::text not like '%Nota editada desde el historial%'
    or (result->'facts')::text like '%Registro de primera nota%' then raise exception 'edited_note_not_reflected'; end if;
  set local role authenticated;
  update public.patient_notes set deleted_at=now() where id=note_id;
  perform public.save_patient_clinical_progress(patient_id,initial_id,1,visit_id,1,gen_random_uuid(),
    jsonb_set(review,'{goals,0,assessment,result}','"Resultado actualizado en el historial"'));
  set local role service_role;
  result := public.ai_clinical_source(owner_id,patient_id,visit_id,1);
  reset role;
  if (result->'facts')::text ~ 'Nota editada|pesas cada tercer día'
    or (result->'facts')::text not like '%Resultado actualizado en el historial%' then raise exception 'stale_observations_returned'; end if;
  if has_function_privilege('authenticated','private.ai_with_patient_observations(jsonb,uuid,uuid,uuid)','execute')
    then raise exception 'unexpected_observation_access'; end if;
  begin
    perform public.ai_clinical_source(owner_id,other_patient_id,visit_id,1);
    raise exception 'expected_wrong_patient_rejected';
  exception when raise_exception then if sqlerrm<>'context_unavailable' then raise; end if; end;

  insert into public.availability_settings(professional_id,public_booking_enabled,booking_horizon_days,minimum_notice_minutes)
    values(owner_id,true,30,0);
  insert into public.availability_slots(professional_id,weekday,start_time,end_time,booking_modality)
    values(owner_id,extract(dow from requested_day)::integer,'08:00','12:00','online');
  set local role service_role;
  result := public.agenda_appointment_availability(owner_id,requested_day,'online');
  appointment_slot := result#>'{slots,0}';
  if appointment_slot is null or (result->>'lastDay')::date<>today+365 then raise exception 'professional_horizon_wrong'; end if;
  if jsonb_array_length(public.agenda_context('test-notes-agenda',requested_day,1)->'slots')<>0
    then raise exception 'public_horizon_expanded'; end if;
  result := public.agenda_appointment_action('create',jsonb_build_object(
    'owner',owner_id,'patientId',patient_id,'operationKey',gen_random_uuid(),'start',appointment_slot->>'start','modality','online'));
  reset role;
  if not exists(select 1 from public.agenda_entries e where e.id=(result->>'id')::uuid
    and e.status='confirmed' and e.starts_at=(appointment_slot->>'start')::timestamptz)
    then raise exception 'future_appointment_not_saved'; end if;

  set local role service_role;
  result := public.agenda_appointment_action('create',jsonb_build_object(
    'owner',owner_id,'operationKey',gen_random_uuid(),'start',appointment_slot->>'end','modality','online',
    'newPatient','{"full_name":"Paciente primera cita","timezone":"America/Mexico_City","portal_access_enabled":false,"weight_kg":70,"height_cm":170}'::jsonb));
  reset role;
  if not exists(select 1 from public.agenda_entries e join public.patient_measurements m on m.patient_id=e.patient_id
    where e.id=(result->>'id')::uuid and m.weight_kg=70 and m.height_cm=170)
    then raise exception 'future_appointment_and_new_patient_not_saved'; end if;
end $$;
rollback;
