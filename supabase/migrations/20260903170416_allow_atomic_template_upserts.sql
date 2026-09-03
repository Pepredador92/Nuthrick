-- An UPSERT fires the INSERT trigger before conflict resolution; existing rows may legitimately carry the next revision.
create or replace function private.validate_patient_measurement_template() returns trigger language plpgsql security invoker set search_path='' as $$
declare config jsonb; item text;
begin
 config:=new.configuration;
 if tg_op='INSERT'
    and not exists(select 1 from public.patient_measurement_templates where patient_id=new.patient_id)
    and new.revision<>1 then
  raise exception 'Initial template revision must be 1';
 end if;
 if tg_op='UPDATE' then
  if new.revision<>old.revision+1 then raise exception 'Template revision must advance exactly once'; end if;
  if new.patient_id<>old.patient_id or new.professional_id<>old.professional_id then raise exception 'Template ownership is immutable'; end if;
 end if;
 if config->>'version'<>'1' or coalesce(config->>'entry','') not in ('indicators','measurements')
    or jsonb_typeof(config->'measurements') is distinct from 'array'
    or jsonb_typeof(config->'indicators') is distinct from 'array'
    or jsonb_typeof(config->'methods') is distinct from 'array'
    or jsonb_array_length(config->'measurements')>100
    or jsonb_array_length(config->'indicators')>20
    or jsonb_array_length(config->'methods')>20 then
  raise exception 'Invalid habitual measurement configuration';
 end if;
 if nullif(config->>'deviceId','')::uuid is distinct from new.device_id then
  raise exception 'Template device mismatch';
 end if;
 if new.device_id is not null and not exists(select 1 from public.measurement_devices where id=new.device_id) then
  raise exception 'Template device unavailable';
 end if;
 for item in select jsonb_array_elements_text(config->'measurements') loop
  if not exists(select 1 from public.measurement_types where code=item and is_active) then raise exception 'Template measurement unavailable'; end if;
 end loop;
 for item in select jsonb_array_elements_text(config->'indicators') loop
  if item not in ('bmi','waist_hip_ratio','waist_height_ratio','body_density','body_fat','fat_mass','fat_free_mass') then
   raise exception 'Template indicator unavailable';
  end if;
 end loop;
 for item in select jsonb_array_elements_text(config->'methods') loop
  if item not in ('jp7_siri','jp7_brozek','density_siri','density_brozek','device') then
   raise exception 'Template method unavailable';
  end if;
 end loop;
 return new;
end;
$$;
