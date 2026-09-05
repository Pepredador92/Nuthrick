alter table public.consultation_measurements
  add column source_metadata jsonb
  check (source_metadata is null or jsonb_typeof(source_metadata)='object');

create function private.snapshot_device_variable_metadata()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.consultation_device_sessions; pd public.professional_devices; variable_name text; original_unit text; mapping text;
begin
  if new.device_session_id is null then new.source_metadata:=null; return new; end if;
  if tg_op='UPDATE' and new.device_session_id=old.device_session_id and new.measurement_type_id=old.measurement_type_id then
    new.source_metadata:=old.source_metadata; return new;
  end if;
  select * into s from public.consultation_device_sessions where id=new.device_session_id;
  select * into pd from public.professional_devices where id=s.professional_device_id;
  if pd.catalog_device_id is not null then
    select c.manufacturer_variable_name,c.manufacturer_unit,c.mapping_status
      into variable_name,original_unit,mapping
    from public.measurement_device_capabilities c
    where c.device_id=pd.catalog_device_id and c.measurement_type_id=new.measurement_type_id;
  else
    select c.manufacturer_variable_name,c.manufacturer_unit,'custom'
      into variable_name,original_unit,mapping
    from public.professional_device_capabilities c
    where c.professional_device_id=pd.id and c.measurement_type_id=new.measurement_type_id;
  end if;
  if variable_name is null then raise exception 'Device variable metadata is unavailable' using errcode='23514'; end if;
  new.source_metadata:=jsonb_build_object(
    'manufacturer_variable_name',variable_name,
    'manufacturer_unit',original_unit,
    'mapping_status',mapping,
    'captured_at',now()
  );
  return new;
end $$;
revoke all on function private.snapshot_device_variable_metadata() from public,anon;
grant execute on function private.snapshot_device_variable_metadata() to authenticated;
create trigger consultation_measurements_source_metadata
  before insert or update on public.consultation_measurements
  for each row execute function private.snapshot_device_variable_metadata();
