-- Reuse the existing calculation_definitions table as the single master
-- catalogue. Legacy definitions stay stored but are not exposed by the new UI.
alter table public.calculation_definitions
  add column if not exists is_catalog_visible boolean not null default false,
  add column if not exists display_order integer not null default 1000;

update public.calculation_definitions set is_catalog_visible = false;

insert into public.calculation_definitions
  (code, name, category, method_version, status, definition, is_catalog_visible, display_order)
values
  ('bmi', 'Índice de masa corporal', 'index', '1.0.0', 'implemented',
   '{"catalogVersion":1,"resultKey":"bmi","resultName":"Índice de masa corporal","methodName":"IMC","summary":"Relaciona el peso actual con la estatura del expediente.","unit":"kg/m²","decimalPlaces":1,"inputs":[{"key":"weight","label":"Peso","source":"consultation_measurement","measurementCode":"weight"},{"key":"height","label":"Estatura","source":"patient_record","patientField":"height_cm"}],"dependencies":[],"references":[],"limitations":"Es un índice descriptivo; en este objetivo no se aplica ninguna clasificación clínica."}'::jsonb,
   true, 10),
  ('waist_hip_ratio', 'Índice cintura/cadera', 'index', '1.0.0', 'implemented',
   '{"catalogVersion":1,"resultKey":"waist_hip_ratio","resultName":"Índice cintura/cadera","methodName":"Relación cintura/cadera","summary":"Relaciona dos circunferencias capturadas en la consulta.","unit":"razón","decimalPlaces":2,"inputs":[{"key":"waist","label":"Cintura","source":"consultation_measurement","measurementCode":"waist_circumference"},{"key":"hip","label":"Cadera","source":"consultation_measurement","measurementCode":"hip_circumference"}],"dependencies":[],"references":[],"limitations":"No se aplican puntos de corte ni interpretación clínica en este objetivo."}'::jsonb,
   true, 20),
  ('waist_height_ratio', 'Índice cintura/talla', 'index', '1.0.0', 'implemented',
   '{"catalogVersion":1,"resultKey":"waist_height_ratio","resultName":"Índice cintura/talla","methodName":"Relación cintura/talla","summary":"Relaciona la cintura actual con la estatura del expediente.","unit":"razón","decimalPlaces":2,"inputs":[{"key":"waist","label":"Cintura","source":"consultation_measurement","measurementCode":"waist_circumference"},{"key":"height","label":"Estatura","source":"patient_record","patientField":"height_cm"}],"dependencies":[],"references":[],"limitations":"No se aplican puntos de corte ni interpretación clínica en este objetivo."}'::jsonb,
   true, 30),
  ('density_jackson_pollock_3', 'Densidad corporal', 'density', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"body_density","resultName":"Densidad corporal","methodName":"Jackson & Pollock 3","summary":"Método de tres pliegues con selección dependiente de sexo.","unit":"g/cm³","decimalPlaces":5,"inputs":[],"dependencies":[],"references":[],"limitations":"Ecuación, sitios y aplicabilidad pendientes de validación bibliográfica."}'::jsonb,
   true, 110),
  ('density_jackson_pollock_7', 'Densidad corporal', 'density', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"body_density","resultName":"Densidad corporal","methodName":"Jackson & Pollock 7","summary":"Método de siete pliegues dependiente de sexo y edad.","unit":"g/cm³","decimalPlaces":5,"inputs":[{"key":"chest","label":"Pectoral","source":"consultation_measurement","measurementCode":"chest_skinfold"},{"key":"midaxillary","label":"Axilar media","source":"consultation_measurement","measurementCode":"midaxillary_skinfold"},{"key":"triceps","label":"Tríceps","source":"consultation_measurement","measurementCode":"triceps_skinfold"},{"key":"subscapular","label":"Subescapular","source":"consultation_measurement","measurementCode":"subscapular_skinfold"},{"key":"suprailiac","label":"Suprailíaco","source":"consultation_measurement","measurementCode":"suprailiac_skinfold"},{"key":"abdominal","label":"Abdominal","source":"consultation_measurement","measurementCode":"abdominal_skinfold"},{"key":"thigh","label":"Muslo anterior","source":"consultation_measurement","measurementCode":"thigh_skinfold"},{"key":"sex","label":"Sexo para ecuaciones","source":"patient_record","patientField":"equation_sex"},{"key":"age","label":"Edad en esta consulta","source":"patient_derived","derivation":"age_at_consultation"}],"dependencies":[],"references":[],"limitations":"La implementación matemática y su aplicabilidad se validarán en el Objetivo 5."}'::jsonb,
   true, 120),
  ('density_durnin_womersley', 'Densidad corporal', 'density', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"body_density","resultName":"Densidad corporal","methodName":"Durnin & Womersley","summary":"Método de densidad corporal basado en pliegues.","unit":"g/cm³","decimalPlaces":5,"inputs":[],"dependencies":[],"references":[],"limitations":"Coeficientes, grupos de edad y aplicabilidad pendientes de validación bibliográfica."}'::jsonb,
   true, 130),
  ('body_fat_jp3_siri', 'Porcentaje de grasa corporal', 'body_fat', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"body_fat_percentage","resultName":"Porcentaje de grasa corporal","methodName":"Jackson & Pollock 3 + Siri","summary":"Convierte a porcentaje de grasa la densidad estimada por Jackson & Pollock 3.","unit":"%","decimalPlaces":1,"inputs":[],"dependencies":["density_jackson_pollock_3"],"references":[],"limitations":"Pendiente de validación e implementación matemática."}'::jsonb,
   true, 210),
  ('body_fat_jp7_siri', 'Porcentaje de grasa corporal', 'body_fat', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"body_fat_percentage","resultName":"Porcentaje de grasa corporal","methodName":"Jackson & Pollock 7 + Siri","summary":"Convierte a porcentaje de grasa la densidad estimada por Jackson & Pollock 7.","unit":"%","decimalPlaces":1,"inputs":[],"dependencies":["density_jackson_pollock_7"],"references":[],"limitations":"Pendiente de validación e implementación matemática."}'::jsonb,
   true, 220),
  ('body_fat_jp7_brozek', 'Porcentaje de grasa corporal', 'body_fat', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"body_fat_percentage","resultName":"Porcentaje de grasa corporal","methodName":"Jackson & Pollock 7 + Brozek","summary":"Convierte mediante Brozek la densidad estimada por Jackson & Pollock 7.","unit":"%","decimalPlaces":1,"inputs":[],"dependencies":["density_jackson_pollock_7"],"references":[],"limitations":"Pendiente de validación e implementación matemática."}'::jsonb,
   true, 230),
  ('body_fat_durnin_siri', 'Porcentaje de grasa corporal', 'body_fat', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"body_fat_percentage","resultName":"Porcentaje de grasa corporal","methodName":"Durnin & Womersley + Siri","summary":"Convierte a porcentaje de grasa una densidad obtenida con Durnin & Womersley.","unit":"%","decimalPlaces":1,"inputs":[],"dependencies":["density_durnin_womersley"],"references":[],"limitations":"Pendiente de validación e implementación matemática."}'::jsonb,
   true, 240),
  ('body_fat_faulkner', 'Porcentaje de grasa corporal', 'body_fat', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"body_fat_percentage","resultName":"Porcentaje de grasa corporal","methodName":"Faulkner","summary":"Método antropométrico de estimación de grasa corporal.","unit":"%","decimalPlaces":1,"inputs":[],"dependencies":[],"references":[],"limitations":"Ecuación y población de aplicación pendientes de validación bibliográfica."}'::jsonb,
   true, 250),
  ('body_fat_yuhasz', 'Porcentaje de grasa corporal', 'body_fat', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"body_fat_percentage","resultName":"Porcentaje de grasa corporal","methodName":"Yuhasz","summary":"Método antropométrico de estimación de grasa corporal.","unit":"%","decimalPlaces":1,"inputs":[],"dependencies":[],"references":[],"limitations":"Ecuación, variante y población pendientes de validación bibliográfica."}'::jsonb,
   true, 260),
  ('fat_mass_jp7_siri', 'Masa grasa', 'compartments', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"fat_mass","resultName":"Masa grasa","methodName":"Derivada de Jackson & Pollock 7 + Siri","summary":"Compartimento derivado del peso y del porcentaje de grasa del método identificado.","unit":"kg","decimalPlaces":1,"inputs":[{"key":"weight","label":"Peso","source":"consultation_measurement","measurementCode":"weight"}],"dependencies":["body_fat_jp7_siri"],"references":[],"limitations":"Se habilitará después de validar la metodología de porcentaje de grasa."}'::jsonb,
   true, 310),
  ('fat_free_mass_jp7_siri', 'Masa libre de grasa', 'compartments', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"fat_free_mass","resultName":"Masa libre de grasa","methodName":"Derivada de Jackson & Pollock 7 + Siri","summary":"Compartimento derivado del peso y la masa grasa del mismo método.","unit":"kg","decimalPlaces":1,"inputs":[{"key":"weight","label":"Peso","source":"consultation_measurement","measurementCode":"weight"}],"dependencies":["fat_mass_jp7_siri"],"references":[],"limitations":"Se habilitará después de validar la cadena metodológica completa."}'::jsonb,
   true, 320),
  ('muscle_mass_lee', 'Masa muscular', 'muscle_mass', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"muscle_mass","resultName":"Masa muscular","methodName":"Lee","summary":"Método antropométrico para estimar masa muscular.","unit":"kg","decimalPlaces":1,"inputs":[],"dependencies":[],"references":[],"limitations":"Ecuación, variables y aplicabilidad pendientes de validación bibliográfica."}'::jsonb,
   true, 410),
  ('somatotype_endomorphy', 'Endomorfia', 'somatotype', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"endomorphy","resultName":"Endomorfia","methodName":"Heath-Carter","summary":"Componente endomórfico del somatotipo.","unit":"componente","decimalPlaces":1,"inputs":[],"dependencies":[],"references":[],"limitations":"Pendiente de validación e implementación en el Objetivo 5."}'::jsonb,
   true, 510),
  ('somatotype_mesomorphy', 'Mesomorfia', 'somatotype', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"mesomorphy","resultName":"Mesomorfia","methodName":"Heath-Carter","summary":"Componente mesomórfico del somatotipo.","unit":"componente","decimalPlaces":1,"inputs":[],"dependencies":[],"references":[],"limitations":"Pendiente de validación e implementación en el Objetivo 5."}'::jsonb,
   true, 520),
  ('somatotype_ectomorphy', 'Ectomorfia', 'somatotype', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"ectomorphy","resultName":"Ectomorfia","methodName":"Heath-Carter","summary":"Componente ectomórfico del somatotipo.","unit":"componente","decimalPlaces":1,"inputs":[],"dependencies":[],"references":[],"limitations":"Pendiente de validación e implementación en el Objetivo 5."}'::jsonb,
   true, 530),
  ('somatochart_coordinates', 'Coordenadas de somatocarta', 'somatotype', 'pending', 'not_implemented',
   '{"catalogVersion":1,"resultKey":"somatochart_coordinates","resultName":"Coordenadas de somatocarta","methodName":"Heath-Carter","summary":"Coordenadas derivadas de los tres componentes del somatotipo.","unit":"coordenadas","decimalPlaces":1,"inputs":[],"dependencies":["somatotype_endomorphy","somatotype_mesomorphy","somatotype_ectomorphy"],"references":[],"limitations":"Pendiente de validar la cadena completa de somatotipo."}'::jsonb,
   true, 540)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  method_version = excluded.method_version,
  status = excluded.status,
  definition = excluded.definition,
  is_catalog_visible = excluded.is_catalog_visible,
  display_order = excluded.display_order,
  updated_at = now();

create table public.consultation_calculation_results (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  consultation_id uuid not null,
  calculation_code text not null references public.calculation_definitions(code),
  result_key text not null,
  method_name text not null,
  method_version text not null,
  raw_result numeric not null check (raw_result <> 'NaN'::numeric),
  displayed_result text not null check (char_length(displayed_result) between 1 and 80),
  unit text not null,
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  dependency_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(dependency_snapshot) = 'object'),
  patient_context jsonb not null default '{}'::jsonb check (jsonb_typeof(patient_context) = 'object'),
  definition_snapshot jsonb not null check (jsonb_typeof(definition_snapshot) = 'object'),
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, consultation_id, calculation_code),
  foreign key (professional_id, patient_id)
    references public.patients(professional_id, id) on delete cascade,
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations(professional_id, id, patient_id) on delete cascade
);

create index consultation_calculation_results_patient_idx
  on public.consultation_calculation_results(professional_id, patient_id, calculated_at desc);

alter table public.consultation_calculation_results enable row level security;
revoke all on public.consultation_calculation_results from public, anon, authenticated;
grant select, insert, update, delete on public.consultation_calculation_results to authenticated;
create policy consultation_calculation_results_owner_all on public.consultation_calculation_results
  for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

create function private.validate_consultation_calculation_result()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  consultation_record public.consultations;
  patient_record public.patients;
  calculation_record public.calculation_definitions;
  input_entry record;
  measurement_record public.consultation_measurements;
  expected numeric;
  weight_value numeric;
  height_value numeric;
  waist_value numeric;
  hip_value numeric;
  expected_age integer;
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
  return new;
end;
$$;

revoke all on function private.validate_consultation_calculation_result() from public, anon;
grant execute on function private.validate_consultation_calculation_result() to authenticated;
create trigger consultation_calculation_results_validate
  before insert or update on public.consultation_calculation_results
  for each row execute function private.validate_consultation_calculation_result();

create function public.save_consultation_calculation_results(
  p_consultation_id uuid,
  p_results jsonb
)
returns setof public.consultation_calculation_results
language plpgsql
security invoker
set search_path = ''
as $$
declare
  consultation_record public.consultations;
  item record;
  saved_codes text[] := array[]::text[];
begin
  if jsonb_typeof(p_results) <> 'object' or (select count(*) from jsonb_object_keys(p_results)) > 100 then
    raise exception 'Invalid calculation payload' using errcode = '23514';
  end if;
  select * into consultation_record from public.consultations
  where id = p_consultation_id for update;
  if not found or consultation_record.professional_id <> (select auth.uid())
    or consultation_record.status <> 'draft' then
    raise exception 'Calculations can only be saved in an owned draft consultation' using errcode = '42501';
  end if;

  for item in select key, value from jsonb_each(p_results) loop
    if jsonb_typeof(item.value) <> 'object'
      or jsonb_typeof(item.value->'rawResult') <> 'number'
      or jsonb_typeof(item.value->'inputs') <> 'object'
      or jsonb_typeof(item.value->'dependencies') <> 'object'
      or jsonb_typeof(item.value->'patientContext') <> 'object' then
      raise exception 'Invalid calculation result' using errcode = '23514';
    end if;
    saved_codes := array_append(saved_codes, item.key);
    insert into public.consultation_calculation_results(
      professional_id, patient_id, consultation_id, calculation_code,
      result_key, method_name, method_version, raw_result, displayed_result,
      unit, input_snapshot, dependency_snapshot, patient_context, definition_snapshot
    ) values (
      consultation_record.professional_id, consultation_record.patient_id,
      consultation_record.id, item.key, '', '', '',
      (item.value->>'rawResult')::numeric, item.value->>'displayedResult', '',
      item.value->'inputs', item.value->'dependencies',
      item.value->'patientContext', '{}'::jsonb
    )
    on conflict (professional_id, consultation_id, calculation_code)
    do update set raw_result = excluded.raw_result,
      displayed_result = excluded.displayed_result,
      input_snapshot = excluded.input_snapshot,
      dependency_snapshot = excluded.dependency_snapshot,
      patient_context = excluded.patient_context,
      updated_at = now();
  end loop;

  delete from public.consultation_calculation_results
  where professional_id = consultation_record.professional_id
    and consultation_id = consultation_record.id
    and not (calculation_code = any(saved_codes));

  return query select * from public.consultation_calculation_results
  where professional_id = consultation_record.professional_id
    and consultation_id = consultation_record.id
  order by calculation_code;
end;
$$;

revoke all on function public.save_consultation_calculation_results(uuid, jsonb) from public, anon;
grant execute on function public.save_consultation_calculation_results(uuid, jsonb) to authenticated;
