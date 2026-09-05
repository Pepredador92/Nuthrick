-- Guard direct Data API writes as well as RPC writes. RLS establishes ownership;
-- these triggers establish catalog validity and immutable clinical provenance.
create function private.validate_professional_device()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.professional_id<>(select auth.uid()) then
    raise exception 'Professional device ownership mismatch' using errcode='42501';
  end if;
  if new.catalog_device_id is not null and not exists(
    select 1 from public.measurement_devices d
    where d.id=new.catalog_device_id and d.is_system_device and d.is_active and d.validation_status='verified'
  ) then
    raise exception 'Catalog device is unavailable' using errcode='23514';
  end if;
  if not new.is_active then new.is_default:=false; end if;
  new.alias:=btrim(new.alias);
  new.updated_at:=now();
  return new;
end $$;
revoke all on function private.validate_professional_device() from public,anon;
grant execute on function private.validate_professional_device() to authenticated;
create trigger professional_device_validate
  before insert or update on public.professional_devices
  for each row execute function private.validate_professional_device();

create function private.validate_consultation_device_session()
returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.consultations; pd public.professional_devices; md public.measurement_devices;
begin
  if tg_op='UPDATE' and (
    new.professional_id<>old.professional_id or new.patient_id<>old.patient_id
    or new.consultation_id<>old.consultation_id or new.professional_device_id<>old.professional_device_id
    or new.capture_source<>old.capture_source or new.device_snapshot<>old.device_snapshot
    or new.measured_at<>old.measured_at
  ) then raise exception 'Device session provenance is immutable' using errcode='23514'; end if;
  if tg_op='UPDATE' then new.updated_at:=now(); return new; end if;
  select * into c from public.consultations where id=new.consultation_id;
  if not found or c.professional_id<>(select auth.uid()) or c.professional_id<>new.professional_id
    or c.patient_id<>new.patient_id or c.status<>'draft' then
    raise exception 'Device sessions require an owned draft consultation' using errcode='42501';
  end if;
  select * into pd from public.professional_devices
    where id=new.professional_device_id and professional_id=new.professional_id and is_active;
  if not found then raise exception 'Professional device is unavailable' using errcode='23514'; end if;
  if pd.catalog_device_id is not null then select * into md from public.measurement_devices where id=pd.catalog_device_id; end if;
  new.measured_at:=c.consultation_date;
  new.device_snapshot:=jsonb_build_object(
    'professional_device_id',pd.id,'alias',pd.alias,'serial_number',pd.serial_number,
    'internal_id',pd.internal_id,'catalog_device_id',pd.catalog_device_id,
    'manufacturer',coalesce(md.manufacturer,pd.custom_manufacturer),
    'model',coalesce(md.model,pd.custom_model),
    'commercial_name',coalesce(md.commercial_name,pd.custom_name,pd.alias),
    'technology',coalesce(md.technology,'Equipo personalizado'),
    'is_standard',pd.catalog_device_id is not null,'captured_at',now()
  );
  new.updated_at:=now(); return new;
end $$;
revoke all on function private.validate_consultation_device_session() from public,anon;
grant execute on function private.validate_consultation_device_session() to authenticated;
create trigger consultation_device_session_validate
  before insert or update on public.consultation_device_sessions
  for each row execute function private.validate_consultation_device_session();
