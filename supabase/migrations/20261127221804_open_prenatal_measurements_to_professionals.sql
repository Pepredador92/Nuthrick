-- The prenatal workspace belongs to the consultation. Its template can opt in by default.
drop trigger consultation_templates_prenatal_workspace on public.consultation_templates;
drop function private.validate_prenatal_workspace_template();

create or replace function public.save_prenatal_measurements(
  p_consultation_id uuid, p_pregnancy_id uuid, p_context jsonb, p_measurements jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.consultations;
  pregnancy uuid;
  visit_date date;
begin
  select * into target from public.consultations c
  where c.id = p_consultation_id and c.professional_id = (select auth.uid())
    and c.status = 'draft' and c.deleted_at is null
  for update;
  if not found then
    raise insufficient_privilege using message = 'Prenatal workspace unavailable';
  end if;

  if p_pregnancy_id is not null then
    select p.pregnancy_id into pregnancy
    from public.consultation_prenatal_measurements p
    join public.consultations c on c.id = p.consultation_id
    where p.pregnancy_id = p_pregnancy_id and p.patient_id = target.patient_id
      and p.professional_id = target.professional_id and c.deleted_at is null
      and c.status in ('draft', 'completed')
    limit 1;
    if not found then raise check_violation using message = 'Pregnancy unavailable'; end if;
  else
    select p.pregnancy_id into pregnancy
    from public.consultation_prenatal_measurements p where p.consultation_id = target.id;
    pregnancy := coalesce(pregnancy, gen_random_uuid());
  end if;

  if jsonb_typeof(p_context) is distinct from 'object' or jsonb_typeof(p_measurements) is distinct from 'object'
    or exists (
      select 1 from jsonb_each(p_measurements) field
      where field.key not in ('weight', 'height', 'relaxed_arm_circumference', 'systolic_blood_pressure', 'diastolic_blood_pressure')
        or jsonb_typeof(field.value) not in ('number', 'null')
        or not exists (select 1 from public.measurement_types catalog where catalog.id = field.key and catalog.is_active)
    ) then
    raise check_violation using message = 'Invalid prenatal measurements';
  end if;
  select (target.consultation_date at time zone patient.timezone)::date into visit_date
  from public.patients patient where patient.id = target.patient_id and patient.professional_id = target.professional_id;
  if (p_context->>'previous_date')::date >= visit_date
    or visit_date - (p_context->>'previous_date')::date > (p_context->>'gestation_days')::smallint then
    raise check_violation using message = 'Previous weight must have an earlier date';
  end if;

  -- Patch only the prenatal fields. The consultation measurement trigger validates the catalog and units.
  delete from public.consultation_measurements m using jsonb_each(p_measurements) field
  where m.professional_id = target.professional_id and m.consultation_id = target.id
    and m.device_session_id is null and m.measurement_type_id = field.key and field.value = 'null'::jsonb;

  insert into public.consultation_measurements(
    professional_id, patient_id, consultation_id, measurement_type_id, value, unit, data_type, measured_at
  )
  select target.professional_id, target.patient_id, target.id, catalog.id, field.value,
    catalog.unit, catalog.data_type, target.consultation_date
  from jsonb_each(p_measurements) field
  join public.measurement_types catalog on catalog.id = field.key
  where field.value <> 'null'::jsonb
  on conflict (professional_id, consultation_id, measurement_type_id) where device_session_id is null
  do update set value = excluded.value, unit = excluded.unit, data_type = excluded.data_type,
    measured_at = excluded.measured_at, updated_at = now();

  insert into public.consultation_prenatal_measurements (
    consultation_id, professional_id, patient_id, pregnancy_id, gestation_days, pregnancy_type,
    pre_pregnancy_weight, weight_source, activity, edema, previous_weight, previous_date
  ) values (
    target.id, target.professional_id, target.patient_id, pregnancy, (p_context->>'gestation_days')::smallint,
    p_context->>'pregnancy_type', (p_context->>'pre_pregnancy_weight')::numeric, p_context->>'weight_source',
    p_context->>'activity', (p_context->>'edema')::boolean, (p_context->>'previous_weight')::numeric,
    (p_context->>'previous_date')::date
  ) on conflict (consultation_id) do update set
    pregnancy_id = excluded.pregnancy_id, gestation_days = excluded.gestation_days,
    pregnancy_type = excluded.pregnancy_type, pre_pregnancy_weight = excluded.pre_pregnancy_weight,
    weight_source = excluded.weight_source, activity = excluded.activity, edema = excluded.edema,
    previous_weight = excluded.previous_weight, previous_date = excluded.previous_date, updated_at = now();

  return public.load_prenatal_measurements(target.id);
end;
$$;
