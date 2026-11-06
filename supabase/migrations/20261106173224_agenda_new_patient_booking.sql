begin;

-- Keep the existing appointment, availability, idempotency and notification
-- pipeline. A professional may reserve a first visit before creating a chart.
-- No patient row or consent is inferred from this contact-only appointment.
do $migration$
declare
 definition text;
 previous text := $previous$  select * into p from public.patients where id=(p_data->>'patientId')::uuid and professional_id=owner_id and deleted_at is null and status='active' for share;
  if not found then raise exception 'invalid_patient'; end if;$previous$;
 replacement text := $replacement$  if p_data->>'patientId' is not null then
   if p_data->>'contactName' is not null then raise exception 'invalid_input'; end if;
   select * into p from public.patients where id=(p_data->>'patientId')::uuid and professional_id=owner_id and deleted_at is null and status='active' for share;
   if not found then raise exception 'invalid_patient'; end if;
  else
   if jsonb_typeof(p_data->'contactName') is distinct from 'string'
     or char_length(btrim(p_data->>'contactName')) not between 2 and 160
     or p_data->>'contactName' ~ '[[:cntrl:]]' then
    raise exception 'invalid_contact_name';
   end if;
   p.full_name := btrim(p_data->>'contactName');
  end if;$replacement$;
begin
 definition := pg_get_functiondef('public.agenda_appointment_action(text,jsonb)'::regprocedure);
 if strpos(definition, previous) = 0 then
  raise exception 'agenda_new_patient_patch_missing';
 end if;
 execute replace(definition, previous, replacement);
end
$migration$;

commit;
