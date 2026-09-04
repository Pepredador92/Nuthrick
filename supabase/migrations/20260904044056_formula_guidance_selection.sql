-- Store the professional's calculation choices in habitual per-patient
-- configuration while retaining backwards compatibility with old snapshots.
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
  -- An UPSERT runs the INSERT trigger before conflict resolution. An existing
  -- patient row may therefore legitimately arrive with the next revision.
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

-- A result code identifies the method instance while definition.code identifies
-- the immutable equation. Validate that relationship instead of requiring both
-- strings to be identical (Siri, Brozek and derived masses have variants).
create or replace function private.calculation_code_matches_definition(
  p_result_code text,
  p_definition_code text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_definition_code
    when 'siri' then p_result_code in ('body_fat_jp7_siri', 'body_fat_density_siri')
    when 'brozek' then p_result_code in ('body_fat_jp7_brozek', 'body_fat_density_brozek')
    when 'fat_mass' then p_result_code ~ '^fat_mass_(jp7_siri|jp7_brozek|density_siri|density_brozek|lean_1996|device)$'
    when 'fat_free_mass' then p_result_code ~ '^fat_free_mass_(jp7_siri|jp7_brozek|density_siri|density_brozek|lean_1996|device)$'
    when 'lean_1996' then p_result_code = 'body_fat_lean_1996'
    else p_result_code = p_definition_code
  end;
$$;
revoke all on function private.calculation_code_matches_definition(text, text)
  from public, anon;
grant execute on function private.calculation_code_matches_definition(text, text)
  to authenticated;

create or replace function private.validate_calculation_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  w jsonb;
  r jsonb;
  d public.calculation_definitions;
  dep text;
  i jsonb;
  ids text[];
  c public.consultations;
  context_birth date;
  context_date timestamptz;
  context_timezone text;
  expected_age integer;
begin
  w := new.payload->'workflow';
  if w is null then return new; end if;
  select * into c from public.consultations where id = new.consultation_id;
  context_timezone := coalesce(nullif(w->'context'->>'timezone', ''), 'America/Mexico_City');
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = context_timezone
  ) then
    raise exception 'Invalid calculation timezone';
  end if;
  begin
    context_date := (w->'context'->>'consultationDate')::timestamptz;
    context_birth := nullif(w->'context'->>'birthDate', '')::date;
  exception when others then
    raise exception 'Invalid dated calculation context';
  end;
  if context_date is distinct from c.consultation_date then
    raise exception 'Calculation context does not match consultation date';
  end if;
  if coalesce(w->'context'->>'sex', '') not in ('', 'male', 'female')
     or jsonb_typeof(w->'context'->'fromPatient') is distinct from 'boolean' then
    raise exception 'Invalid calculation context';
  end if;
  if context_birth is null then
    expected_age := null;
  else
    expected_age := extract(
      year from age((context_date at time zone context_timezone)::date, context_birth)
    );
    if expected_age < 0 or expected_age > 120 then
      raise exception 'Invalid calculation age';
    end if;
  end if;
  if nullif(w->'context'->>'age', '')::integer is distinct from expected_age then
    raise exception 'Calculation age does not match its dated context';
  end if;
  select coalesce(array_agg(value->>'id'), array[]::text[])
    into ids from jsonb_each(w->'entries');
  ids := ids || (
    select coalesce(array_agg(value->>'calculation_id'), array[]::text[])
    from jsonb_array_elements(w->'calculations')
  );
  for r in select value from jsonb_array_elements(w->'calculations') loop
    if jsonb_typeof(r->'dependency_ids') is distinct from 'array'
       or jsonb_typeof(r->'inputs_json') is distinct from 'object'
       or jsonb_typeof(r->'formula_metadata') is distinct from 'object' then
      raise exception 'Invalid calculation metadata';
    end if;
    select * into d
    from public.calculation_definitions
    where code = r->'formula_metadata'->'definition'->>'code'
      and method_version = r->>'methodVersion';
    if not found
       or d.definition is distinct from r->'formula_metadata'->'definition'
       or not private.calculation_code_matches_definition(
         r->>'calculation_code', d.code
       )
       or r->'formula_metadata'->'context' is distinct from w->'context' then
      raise exception 'Calculation definition or context unavailable';
    end if;
    for dep in select jsonb_array_elements_text(r->'dependency_ids') loop
      if not (dep = any(ids)) then
        raise exception 'Calculation dependency missing';
      end if;
    end loop;
    for i in select value from jsonb_each(r->'inputs_json') loop
      if i->>'measurement_id' is not null
         and not ((i->>'measurement_id') = any(ids)) then
        raise exception 'Input measurement missing';
      end if;
      if i->>'calculation_id' is not null
         and not ((i->>'calculation_id') = any(ids)) then
        raise exception 'Input calculation missing';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
