-- Keep the catalog capable of duplicating an archived/legacy template. The UI
-- presents inactive templates as archived, but their immutable content remains
-- a valid starting point for a new active personal copy.
create or replace function public.copy_consultation_template(source_id uuid, new_key text)
returns public.consultation_templates language plpgsql security invoker set search_path = '' as $$
declare source public.consultation_templates; result public.consultation_templates; next_order integer;
begin
  perform 1 from public.professional_profiles where id = (select auth.uid()) for update;
  if not found then raise insufficient_privilege using message = 'Profile unavailable'; end if;
  select * into source from public.consultation_templates where id = source_id
    and (is_system or professional_id = (select auth.uid()));
  if not found then raise insufficient_privilege using message = 'Template unavailable'; end if;
  select coalesce(max(display_order), -1) + 1 into next_order
  from public.consultation_templates
  where professional_id = (select auth.uid()) and consultation_type = source.consultation_type;
  insert into public.consultation_templates
    (professional_id, template_key, name, description, estimated_duration_minutes,
     display_order, consultation_type, version, source_template_id, is_default, is_active)
  values
    ((select auth.uid()), new_key, left(source.name, 100) || ' · copia',
     source.description, source.estimated_duration_minutes, next_order,
     source.consultation_type, 1, source.id, false, true)
  returning * into result;
  insert into public.consultation_template_sections
    (template_id, section_key, title, description, display_order, is_active)
  select result.id, section_key, title, description, display_order, is_active
  from public.consultation_template_sections where template_id = source.id;
  insert into public.consultation_template_questions
    (section_id, question_key, label, help_text, question_type, response_area,
     is_required, display_order, is_active, configuration, visibility_condition)
  select copied.id, q.question_key, q.label, q.help_text, q.question_type,
    q.response_area, q.is_required, q.display_order, q.is_active,
    q.configuration, q.visibility_condition
  from public.consultation_template_questions q
  join public.consultation_template_sections original on original.id = q.section_id
  join public.consultation_template_sections copied
    on copied.template_id = result.id and copied.section_key = original.section_key
  where original.template_id = source.id;
  return result;
end;
$$;

-- Preserve the earlier UPSERT guard while validating the new calculation list.
create or replace function private.validate_patient_measurement_template()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  config jsonb;
  item text;
begin
  config := new.configuration;
  if tg_op = 'INSERT'
     and not exists (
       select 1 from public.patient_measurement_templates
       where patient_id = new.patient_id
     )
     and new.revision <> 1 then
    raise exception 'Initial template revision must be 1';
  end if;
  if tg_op = 'UPDATE' then
    if new.revision <> old.revision + 1 then
      raise exception 'Template revision must advance exactly once';
    end if;
    if new.patient_id <> old.patient_id or new.professional_id <> old.professional_id then
      raise exception 'Template ownership is immutable';
    end if;
  end if;
  if config->>'version' <> '1'
     or coalesce(config->>'entry', '') not in ('indicators', 'measurements')
     or jsonb_typeof(config->'measurements') is distinct from 'array'
     or jsonb_typeof(config->'indicators') is distinct from 'array'
     or jsonb_typeof(config->'methods') is distinct from 'array'
     or (config ? 'calculations' and jsonb_typeof(config->'calculations') is distinct from 'array')
     or jsonb_array_length(config->'measurements') > 100
     or jsonb_array_length(config->'indicators') > 20
     or jsonb_array_length(config->'methods') > 20
     or coalesce(jsonb_array_length(config->'calculations'), 0) > 20 then
    raise exception 'Invalid habitual measurement configuration';
  end if;
  if nullif(config->>'deviceId', '')::uuid is distinct from new.device_id then
    raise exception 'Template device mismatch';
  end if;
  if new.device_id is not null and not exists (
    select 1 from public.measurement_devices where id = new.device_id
  ) then
    raise exception 'Template device unavailable';
  end if;
  for item in select jsonb_array_elements_text(config->'measurements') loop
    if not exists (
      select 1 from public.measurement_types where code = item and is_active
    ) then
      raise exception 'Template measurement unavailable';
    end if;
  end loop;
  for item in select jsonb_array_elements_text(config->'indicators') loop
    if item not in (
      'bmi', 'waist_hip_ratio', 'waist_height_ratio', 'body_density',
      'body_fat', 'fat_mass', 'fat_free_mass'
    ) then
      raise exception 'Template indicator unavailable';
    end if;
  end loop;
  for item in select jsonb_array_elements_text(config->'methods') loop
    if item not in (
      'jp7_siri', 'jp7_brozek', 'density_siri', 'density_brozek', 'device'
    ) then
      raise exception 'Template method unavailable';
    end if;
  end loop;
  if config ? 'calculations' then
    if (
      select count(*) <> count(distinct value)
      from jsonb_array_elements_text(config->'calculations')
    ) then
      raise exception 'Duplicate calculation selection';
    end if;
    for item in select jsonb_array_elements_text(config->'calculations') loop
      if item not in (
        'bmi', 'waist_hip_ratio', 'waist_height_ratio',
        'jackson_pollock_7', 'jp7_siri', 'jp7_brozek',
        'density_siri', 'density_brozek', 'lean_1996',
        'device_composition', 'heath_carter'
      ) then
        raise exception 'Calculation selection unavailable';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
