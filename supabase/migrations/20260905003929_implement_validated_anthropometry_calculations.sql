-- Objective 5B: execute only the 5A-validated contracts, preserving each
-- method's inputs and dependency chain. The three unresolved methods remain
-- explicitly unavailable.

update public.calculation_definitions
set status = 'implemented',
    method_version = regexp_replace(method_version, '-spec$', ''),
    updated_at = now()
where code in (
  'bmi', 'waist_hip_ratio', 'waist_height_ratio',
  'density_jackson_pollock_3', 'density_jackson_pollock_7', 'density_durnin_womersley',
  'body_fat_jp3_siri', 'body_fat_jp7_siri', 'body_fat_jp7_brozek', 'body_fat_durnin_siri',
  'fat_mass_jp3_siri', 'fat_free_mass_jp3_siri',
  'fat_mass_jp7_siri', 'fat_free_mass_jp7_siri',
  'fat_mass_jp7_brozek', 'fat_free_mass_jp7_brozek',
  'fat_mass_durnin_siri', 'fat_free_mass_durnin_siri',
  'somatotype_endomorphy', 'somatotype_mesomorphy', 'somatotype_ectomorphy',
  'somatochart_coordinates'
);

alter table public.consultation_calculation_results
  add column if not exists result_values jsonb not null default '{}'::jsonb
  check (jsonb_typeof(result_values) = 'object');

create or replace function private.validate_consultation_calculation_result()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  consultation_record public.consultations;
  patient_record public.patients;
  calculation_record public.calculation_definitions;
  measurement_record public.consultation_measurements;
  input_entry record;
  expected_age integer;
  selected_variant jsonb;
  expected_inputs jsonb;
  expected_keys text[];
  provided_keys text[];
  expected numeric;
  expected_y numeric;
  weight_value numeric;
  height_value numeric;
  waist_value numeric;
  hip_value numeric;
  sex_value text;
  age_value numeric;
  sum3 numeric;
  sum4 numeric;
  sum7 numeric;
  density_value numeric;
  fat_value numeric;
  c numeric;
  m numeric;
  corrected_arm numeric;
  corrected_calf numeric;
  corrected_sum numeric;
  hwr numeric;
begin
  select * into consultation_record from public.consultations where id = new.consultation_id;
  if not found or consultation_record.professional_id <> new.professional_id
    or consultation_record.patient_id <> new.patient_id or consultation_record.status <> 'draft' then
    raise exception 'Calculations can only be saved in an owned draft consultation' using errcode = '42501';
  end if;
  select * into patient_record from public.patients where id = new.patient_id and professional_id = new.professional_id;
  if not found then raise exception 'Patient is unavailable' using errcode = '42501'; end if;
  expected_age := case when patient_record.birth_date is null then null else
    extract(year from age((consultation_record.consultation_date at time zone patient_record.timezone)::date, patient_record.birth_date))::integer end;
  sex_value := patient_record.equation_sex;

  select * into calculation_record from public.calculation_definitions where code = new.calculation_code;
  if not found or not calculation_record.is_catalog_visible or calculation_record.status <> 'implemented' then
    raise exception 'Calculation is not implemented' using errcode = '23514';
  end if;

  select value into selected_variant
  from jsonb_array_elements(coalesce(calculation_record.definition->'variants', '[]'::jsonb))
  where coalesce(value->'appliesWhen'->>'equationSex', sex_value) = sex_value
    and (value->'appliesWhen'->>'ageMin' is null or expected_age >= (value->'appliesWhen'->>'ageMin')::integer)
    and (value->'appliesWhen'->>'ageMax' is null or expected_age <= (value->'appliesWhen'->>'ageMax')::integer)
  limit 1;
  if jsonb_array_length(coalesce(calculation_record.definition->'variants', '[]'::jsonb)) > 0 and selected_variant is null then
    raise exception 'Calculation is not applicable to this patient context' using errcode = '23514';
  end if;
  expected_inputs := coalesce(calculation_record.definition->'inputs', '[]'::jsonb)
    || coalesce(selected_variant->'inputs', '[]'::jsonb);
  select array_agg(value->>'key' order by value->>'key') into expected_keys from jsonb_array_elements(expected_inputs);
  select array_agg(key order by key) into provided_keys from jsonb_object_keys(new.input_snapshot) as key;
  if coalesce(expected_keys, '{}'::text[]) is distinct from coalesce(provided_keys, '{}'::text[]) then
    raise exception 'Calculation inputs do not match the active method contract' using errcode = '23514';
  end if;
  if (select count(*) from jsonb_object_keys(new.dependency_snapshot)) <> jsonb_array_length(coalesce(calculation_record.definition->'dependencies', '[]'::jsonb))
    or exists (select 1 from jsonb_array_elements_text(coalesce(calculation_record.definition->'dependencies', '[]'::jsonb)) d where not new.dependency_snapshot ? d) then
    raise exception 'Calculation dependencies do not match the active method contract' using errcode = '23514';
  end if;

  for input_entry in select key, value from jsonb_each(new.input_snapshot) loop
    if input_entry.value->>'source' = 'consultation_measurement' then
      select * into measurement_record from public.consultation_measurements
      where id = (input_entry.value->>'measurementId')::uuid and consultation_id = new.consultation_id
        and measurement_type_id = input_entry.value->>'measurementCode';
      if not found or (measurement_record.value #>> '{}')::numeric is distinct from (input_entry.value->>'value')::numeric then
        raise exception 'Calculation input does not match the saved measurement' using errcode = '23514';
      end if;
    elsif input_entry.value->>'source' = 'patient_record' and input_entry.value->>'patientField' = 'height_cm'
      and patient_record.height_cm is distinct from (input_entry.value->>'value')::numeric then
      raise exception 'Calculation input does not match the patient record' using errcode = '23514';
    elsif input_entry.value->>'source' = 'patient_record' and input_entry.value->>'patientField' = 'equation_sex'
      and coalesce(patient_record.equation_sex, '') is distinct from coalesce(input_entry.value->>'value', '') then
      raise exception 'Calculation input does not match the patient record' using errcode = '23514';
    elsif input_entry.value->>'source' = 'patient_derived' and input_entry.value->>'derivation' = 'age_at_consultation'
      and expected_age is distinct from (input_entry.value->>'value')::integer then
      raise exception 'Calculation input does not match age at consultation' using errcode = '23514';
    end if;
  end loop;

  new.result_key := calculation_record.definition->>'resultKey';
  new.method_name := calculation_record.definition->>'methodName';
  new.method_version := calculation_record.method_version;
  new.unit := calculation_record.definition->>'unit';
  new.definition_snapshot := calculation_record.definition;
  new.updated_at := now(); new.calculated_at := now();
  weight_value := nullif(new.input_snapshot->'weight'->>'value', '')::numeric;
  height_value := nullif(new.input_snapshot->'height'->>'value', '')::numeric;
  waist_value := nullif(new.input_snapshot->'waist'->>'value', '')::numeric;
  hip_value := nullif(new.input_snapshot->'hip'->>'value', '')::numeric;
  age_value := nullif(new.input_snapshot->'age'->>'value', '')::numeric;
  sum3 := coalesce((new.input_snapshot->'chest'->>'value')::numeric, (new.input_snapshot->'triceps'->>'value')::numeric)
    + coalesce((new.input_snapshot->'abdominal'->>'value')::numeric, (new.input_snapshot->'suprailiac'->>'value')::numeric)
    + (new.input_snapshot->'thigh'->>'value')::numeric;
  sum4 := coalesce((new.input_snapshot->'biceps'->>'value')::numeric, 0) + coalesce((new.input_snapshot->'triceps'->>'value')::numeric, 0)
    + coalesce((new.input_snapshot->'subscapular'->>'value')::numeric, 0) + coalesce((new.input_snapshot->'suprailiac'->>'value')::numeric, 0);
  sum7 := coalesce((new.input_snapshot->'chest'->>'value')::numeric, 0) + coalesce((new.input_snapshot->'midaxillary'->>'value')::numeric, 0)
    + coalesce((new.input_snapshot->'triceps'->>'value')::numeric, 0) + coalesce((new.input_snapshot->'subscapular'->>'value')::numeric, 0)
    + coalesce((new.input_snapshot->'suprailiac'->>'value')::numeric, 0) + coalesce((new.input_snapshot->'abdominal'->>'value')::numeric, 0) + coalesce((new.input_snapshot->'thigh'->>'value')::numeric, 0);
  density_value := coalesce((new.dependency_snapshot->'density_jackson_pollock_3')::numeric, (new.dependency_snapshot->'density_jackson_pollock_7')::numeric, (new.dependency_snapshot->'density_durnin_womersley')::numeric);
  fat_value := coalesce((new.dependency_snapshot->'body_fat_jp3_siri')::numeric, (new.dependency_snapshot->'body_fat_jp7_siri')::numeric, (new.dependency_snapshot->'body_fat_jp7_brozek')::numeric, (new.dependency_snapshot->'body_fat_durnin_siri')::numeric);

  case new.calculation_code
    when 'bmi' then expected := weight_value / power(height_value / 100, 2);
    when 'waist_hip_ratio' then expected := waist_value / hip_value;
    when 'waist_height_ratio' then expected := waist_value / height_value;
    when 'density_jackson_pollock_3' then expected := case sex_value when 'male' then 1.10938 - .0008267 * sum3 + .0000016 * sum3 * sum3 - .0002574 * age_value else 1.0994921 - .0009929 * sum3 + .0000023 * sum3 * sum3 - .0001392 * age_value end;
    when 'density_jackson_pollock_7' then expected := case sex_value when 'male' then 1.112 - .00043499 * sum7 + .00000055 * sum7 * sum7 - .00028826 * age_value else 1.097 - .00046971 * sum7 + .00000056 * sum7 * sum7 - .00012828 * age_value end;
    when 'density_durnin_womersley' then
      select (selected_variant->'equation'->'coefficients'->>'c')::numeric, (selected_variant->'equation'->'coefficients'->>'m')::numeric into c, m;
      expected := c - m * log(10::numeric, sum4);
    when 'body_fat_jp3_siri', 'body_fat_jp7_siri', 'body_fat_durnin_siri' then expected := (4.95 / density_value - 4.5) * 100;
    when 'body_fat_jp7_brozek' then expected := (4.57 / density_value - 4.142) * 100;
    when 'fat_mass_jp3_siri', 'fat_mass_jp7_siri', 'fat_mass_jp7_brozek', 'fat_mass_durnin_siri' then expected := weight_value * fat_value / 100;
    when 'fat_free_mass_jp3_siri', 'fat_free_mass_jp7_siri', 'fat_free_mass_jp7_brozek', 'fat_free_mass_durnin_siri' then expected := weight_value - (new.dependency_snapshot->>(calculation_record.definition->'dependencies'->>0))::numeric;
    when 'somatotype_endomorphy' then
      corrected_sum := ((new.input_snapshot->'triceps'->>'value')::numeric + (new.input_snapshot->'subscapular'->>'value')::numeric + (new.input_snapshot->'supraespinale'->>'value')::numeric) * 170.18 / height_value;
      expected := greatest(.1::numeric, -.7182 + .1451 * corrected_sum - .00068 * corrected_sum * corrected_sum + .0000014 * corrected_sum * corrected_sum * corrected_sum);
    when 'somatotype_mesomorphy' then
      corrected_arm := (new.input_snapshot->'flexed_arm'->>'value')::numeric - (new.input_snapshot->'triceps'->>'value')::numeric / 10;
      corrected_calf := (new.input_snapshot->'calf'->>'value')::numeric - (new.input_snapshot->'calf_skinfold'->>'value')::numeric / 10;
      expected := greatest(.1::numeric, .858 * (new.input_snapshot->'humerus_breadth'->>'value')::numeric + .601 * (new.input_snapshot->'femur_breadth'->>'value')::numeric + .188 * corrected_arm + .161 * corrected_calf - .131 * height_value + 4.5);
    when 'somatotype_ectomorphy' then
      hwr := height_value / power(weight_value, 1::numeric / 3);
      expected := case when hwr >= 40.75 then .732 * hwr - 28.58 when hwr > 38.25 then .463 * hwr - 17.63 else .1 end;
    when 'somatochart_coordinates' then
      expected := (new.dependency_snapshot->'somatotype_ectomorphy')::numeric - (new.dependency_snapshot->'somatotype_endomorphy')::numeric;
      expected_y := 2 * (new.dependency_snapshot->'somatotype_mesomorphy')::numeric - (new.dependency_snapshot->'somatotype_endomorphy')::numeric - (new.dependency_snapshot->'somatotype_ectomorphy')::numeric;
      if jsonb_typeof(new.result_values) <> 'object' or abs((new.result_values->>'x')::numeric - expected) > .00000001 or abs((new.result_values->>'y')::numeric - expected_y) > .00000001 then
        raise exception 'Somatochart coordinates do not match their components' using errcode = '23514';
      end if;
    else raise exception 'Calculation engine is unavailable' using errcode = '23514';
  end case;
  if expected is null or abs(new.raw_result - expected) > .00000001 then
    raise exception 'Calculation result does not match its inputs' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.save_consultation_calculation_results(p_consultation_id uuid, p_results jsonb)
returns setof public.consultation_calculation_results
language plpgsql security invoker set search_path = ''
as $$
declare consultation_record public.consultations; item record; saved_codes text[] := array[]::text[];
begin
  if jsonb_typeof(p_results) <> 'object' or (select count(*) from jsonb_object_keys(p_results)) > 100 then raise exception 'Invalid calculation payload' using errcode = '23514'; end if;
  select * into consultation_record from public.consultations where id = p_consultation_id for update;
  if not found or consultation_record.professional_id <> (select auth.uid()) or consultation_record.status <> 'draft' then raise exception 'Calculations can only be saved in an owned draft consultation' using errcode = '42501'; end if;
  for item in select key, value from jsonb_each(p_results) loop
    if jsonb_typeof(item.value) <> 'object' or jsonb_typeof(item.value->'rawResult') <> 'number' or jsonb_typeof(item.value->'inputs') <> 'object' or jsonb_typeof(item.value->'dependencies') <> 'object' or jsonb_typeof(item.value->'patientContext') <> 'object' or coalesce(jsonb_typeof(item.value->'resultValues'), 'object') <> 'object' then raise exception 'Invalid calculation result' using errcode = '23514'; end if;
    saved_codes := array_append(saved_codes, item.key);
    insert into public.consultation_calculation_results(professional_id, patient_id, consultation_id, calculation_code, result_key, method_name, method_version, raw_result, displayed_result, unit, input_snapshot, dependency_snapshot, patient_context, definition_snapshot, result_values)
    values (consultation_record.professional_id, consultation_record.patient_id, consultation_record.id, item.key, '', '', '', (item.value->>'rawResult')::numeric, item.value->>'displayedResult', '', item.value->'inputs', item.value->'dependencies', item.value->'patientContext', '{}'::jsonb, coalesce(item.value->'resultValues', '{}'::jsonb))
    on conflict (professional_id, consultation_id, calculation_code) do update set raw_result = excluded.raw_result, displayed_result = excluded.displayed_result, input_snapshot = excluded.input_snapshot, dependency_snapshot = excluded.dependency_snapshot, patient_context = excluded.patient_context, result_values = excluded.result_values, updated_at = now();
  end loop;
  delete from public.consultation_calculation_results where professional_id = consultation_record.professional_id and consultation_id = consultation_record.id and not (calculation_code = any(saved_codes));
  return query select * from public.consultation_calculation_results where professional_id = consultation_record.professional_id and consultation_id = consultation_record.id order by calculation_code;
end;
$$;

do $$
begin
  if (select count(*) from public.calculation_definitions where is_catalog_visible and status = 'implemented' and definition->>'validationStatus' = 'validated') <> 22 then
    raise exception 'Expected 22 implemented validated calculation contracts';
  end if;
end;
$$;
