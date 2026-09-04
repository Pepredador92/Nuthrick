create or replace function private.validate_consultation_calculation_result()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  consultation_record public.consultations;
  patient_record public.patients;
  calculation_record public.calculation_definitions;
  definition_input jsonb;
  dependency_code text;
  input_entry record;
  measurement_record public.consultation_measurements;
  expected numeric;
  weight_value numeric;
  height_value numeric;
  waist_value numeric;
  hip_value numeric;
  expected_age integer;
  decimal_places integer;
begin
  select * into consultation_record from public.consultations where id = new.consultation_id;
  if not found or consultation_record.professional_id <> new.professional_id
    or consultation_record.patient_id <> new.patient_id
    or consultation_record.status <> 'draft' then
    raise exception 'Calculations can only be saved in an owned draft consultation' using errcode = '42501';
  end if;
  select * into patient_record from public.patients
  where id = new.patient_id and professional_id = new.professional_id;
  if not found then
    raise exception 'Patient is unavailable' using errcode = '42501';
  end if;
  expected_age := case when patient_record.birth_date is null then null else
    extract(year from age((consultation_record.consultation_date at time zone patient_record.timezone)::date, patient_record.birth_date))::integer end;

  select * into calculation_record from public.calculation_definitions where code = new.calculation_code;
  if not found or not calculation_record.is_catalog_visible or calculation_record.status <> 'implemented' then
    raise exception 'Calculation is not implemented' using errcode = '23514';
  end if;

  if (select count(*) from jsonb_object_keys(new.input_snapshot))
      <> jsonb_array_length(calculation_record.definition->'inputs') then
    raise exception 'Calculation inputs do not match the catalogue' using errcode = '23514';
  end if;
  for definition_input in select value from jsonb_array_elements(calculation_record.definition->'inputs') loop
    if not (new.input_snapshot ? (definition_input->>'key'))
      or new.input_snapshot->(definition_input->>'key')->>'source' is distinct from definition_input->>'source'
      or new.input_snapshot->(definition_input->>'key')->>'measurementCode' is distinct from definition_input->>'measurementCode'
      or new.input_snapshot->(definition_input->>'key')->>'patientField' is distinct from definition_input->>'patientField'
      or new.input_snapshot->(definition_input->>'key')->>'derivation' is distinct from definition_input->>'derivation' then
      raise exception 'Calculation inputs do not match the catalogue' using errcode = '23514';
    end if;
  end loop;

  if (select count(*) from jsonb_object_keys(new.dependency_snapshot))
      <> jsonb_array_length(calculation_record.definition->'dependencies') then
    raise exception 'Calculation dependencies do not match the catalogue' using errcode = '23514';
  end if;
  for dependency_code in select jsonb_array_elements_text(calculation_record.definition->'dependencies') loop
    if not (new.dependency_snapshot ? dependency_code)
      or jsonb_typeof(new.dependency_snapshot->dependency_code) <> 'number' then
      raise exception 'Calculation dependencies do not match the catalogue' using errcode = '23514';
    end if;
  end loop;

  new.result_key := calculation_record.definition->>'resultKey';
  new.method_name := calculation_record.definition->>'methodName';
  new.method_version := calculation_record.method_version;
  new.unit := calculation_record.definition->>'unit';
  new.definition_snapshot := calculation_record.definition;
  new.updated_at := now();
  new.calculated_at := now();

  for input_entry in select key, value from jsonb_each(new.input_snapshot) loop
    if input_entry.value->>'source' = 'consultation_measurement' then
      select * into measurement_record
      from public.consultation_measurements
      where id = (input_entry.value->>'measurementId')::uuid
        and consultation_id = new.consultation_id
        and measurement_type_id = input_entry.value->>'measurementCode';
      if not found or (measurement_record.value #>> '{}')::numeric is distinct from (input_entry.value->>'value')::numeric then
        raise exception 'Calculation input does not match the saved measurement' using errcode = '23514';
      end if;
    elsif input_entry.value->>'source' = 'patient_record'
      and input_entry.value->>'patientField' = 'height_cm'
      and patient_record.height_cm is distinct from (input_entry.value->>'value')::numeric then
      raise exception 'Calculation input does not match the patient record' using errcode = '23514';
    elsif input_entry.value->>'source' = 'patient_record'
      and input_entry.value->>'patientField' = 'equation_sex'
      and coalesce(patient_record.equation_sex, '') is distinct from coalesce(input_entry.value->>'value', '') then
      raise exception 'Calculation input does not match the patient record' using errcode = '23514';
    elsif input_entry.value->>'source' = 'patient_derived'
      and input_entry.value->>'derivation' = 'age_at_consultation'
      and expected_age is distinct from (input_entry.value->>'value')::integer then
      raise exception 'Calculation input does not match age at consultation' using errcode = '23514';
    end if;
  end loop;

  weight_value := nullif(new.input_snapshot->'weight'->>'value', '')::numeric;
  height_value := nullif(new.input_snapshot->'height'->>'value', '')::numeric;
  waist_value := nullif(new.input_snapshot->'waist'->>'value', '')::numeric;
  hip_value := nullif(new.input_snapshot->'hip'->>'value', '')::numeric;
  if new.calculation_code = 'bmi' then expected := weight_value / power(height_value / 100, 2);
  elsif new.calculation_code = 'waist_hip_ratio' then expected := waist_value / hip_value;
  elsif new.calculation_code = 'waist_height_ratio' then expected := waist_value / height_value;
  else raise exception 'Calculation engine is unavailable' using errcode = '23514';
  end if;
  if expected is null or abs(new.raw_result - expected) > 0.00000001 then
    raise exception 'Calculation result does not match its inputs' using errcode = '23514';
  end if;
  decimal_places := greatest(0, least(10, coalesce((calculation_record.definition->>'decimalPlaces')::integer, 2)));
  new.displayed_result := round(expected, decimal_places)::text;
  return new;
end;
$$;
