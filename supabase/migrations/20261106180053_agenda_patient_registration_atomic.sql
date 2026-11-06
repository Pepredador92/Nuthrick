begin;
-- Extend the existing service-only, invoker appointment transaction. Patient
-- creation, baseline measurements, appointment and durable retry receipt commit
-- together; no chart remains if any later step fails.
do $migration$
declare
 definition text;
 previous text;
 replacement text;
begin
 definition := pg_get_functiondef('public.agenda_appointment_action(text,jsonb)'::regprocedure);
 previous := $old$  if p_data->>'patientId' is not null then$old$;
 replacement := $new$  if p_data->>'newPatient' is not null then
   if jsonb_typeof(p_data->'newPatient') <> 'object' or p_data->>'patientId' is not null or p_data->>'contactName' is not null then
    raise exception 'invalid_patient_registration';
   end if;
  elsif p_data->>'patientId' is not null then$new$;
 if strpos(definition,previous)=0 then raise exception 'registration_contact_patch_missing'; end if;
 definition := replace(definition,previous,replacement);

 previous := $old$  perform private.agenda_assert_time(owner_id,stamp,finish,mode,place,coalesce((p_data->>'allowOutsideSchedule')::boolean,false),(p_data->>'busyCheck')::uuid);$old$;
 replacement := previous || $new$
  if p_data->>'newPatient' is not null then
   if exists(select 1 from jsonb_each(p_data->'newPatient') f where f.key not in
     ('full_name','email','country_code','phone','timezone','weight_kg','height_cm','gender','equation_sex','birth_date','portal_access_enabled'))
    or jsonb_typeof(p_data->'newPatient'->'full_name') is distinct from 'string'
    or jsonb_typeof(p_data->'newPatient'->'timezone') is distinct from 'string'
    or jsonb_typeof(p_data->'newPatient'->'portal_access_enabled') is distinct from 'boolean'
    or exists(select 1 from jsonb_each(p_data->'newPatient') f where f.key in ('weight_kg','height_cm') and jsonb_typeof(f.value) not in ('number','null'))
    or exists(select 1 from jsonb_each(p_data->'newPatient') f where f.key in ('email','country_code','phone','gender','equation_sex','birth_date') and jsonb_typeof(f.value) not in ('string','null')) then
    raise exception 'invalid_patient_registration';
   end if;
   select * into p from jsonb_populate_record(null::public.patients,p_data->'newPatient');
   p.full_name := btrim(p.full_name);
   p.email := nullif(btrim(p.email),'');
   if char_length(p.full_name) not between 2 and 160 or p.full_name ~ '[[:cntrl:]]' then raise exception 'invalid_contact_name'; end if;
   if p.portal_access_enabled and p.email is null then raise exception 'patient_portal_requires_email'; end if;
   if p.email is not null and (char_length(p.email)>320 or p.email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$') then raise exception 'invalid_patient_email'; end if;
   if not exists(select 1 from pg_catalog.pg_timezone_names where name=p.timezone) then raise exception 'invalid_patient_timezone'; end if;
   if p.birth_date>current_date then raise exception 'invalid_patient_birth'; end if;
   if p.phone is not null and (p.phone !~ '^[+][1-9][0-9]{7,14}$' or p.country_code is null or p.country_code !~ '^[+][1-9][0-9]{0,2}$' or left(p.phone,length(p.country_code))<>p.country_code) then raise exception 'invalid_patient_phone'; end if;
   if (p.weight_kg is not null and p.weight_kg not between 0.1 and 1000) or (p.height_cm is not null and p.height_cm not between 20 and 300) then raise exception 'invalid_patient_measurements'; end if;
   -- The same owner lock used by patient quotas serializes duplicate checks.
   perform pg_advisory_xact_lock(hashtextextended(owner_id::text,8317));
   if exists(select 1 from public.patients existing where existing.professional_id=owner_id and existing.deleted_at is null and
     ((p.email is not null and lower(btrim(existing.email))=lower(p.email))
      or (p.phone is not null and existing.phone=p.phone)
      or (p.birth_date is not null and existing.birth_date=p.birth_date and lower(btrim(existing.full_name))=lower(p.full_name)))) then
    raise exception 'patient_duplicate';
   end if;
   insert into public.patients(professional_id,full_name,email,country_code,phone,timezone,weight_kg,height_cm,gender,equation_sex,birth_date,portal_access_enabled)
    values(owner_id,p.full_name,p.email,case when p.phone is not null then p.country_code end,p.phone,p.timezone,p.weight_kg,p.height_cm,p.gender,p.equation_sex,p.birth_date,p.portal_access_enabled)
    returning * into p;
   if p.weight_kg is not null and p.height_cm is not null then
    insert into public.patient_measurements(professional_id,patient_id,weight_kg,height_cm) values(owner_id,p.id,p.weight_kg,p.height_cm);
   end if;
  end if;$new$;
 if strpos(definition,previous)=0 then raise exception 'registration_transaction_patch_missing'; end if;
 definition := replace(definition,previous,replacement);
 previous := '  result:=private.appointment_projection(e);';
 replacement := '  result:=private.appointment_projection(e)||jsonb_build_object(''patient_id'',e.patient_id);';
 if strpos(definition,previous)=0 then raise exception 'registration_result_patch_missing'; end if;
 execute replace(definition,previous,replacement);
end
$migration$;
commit;
