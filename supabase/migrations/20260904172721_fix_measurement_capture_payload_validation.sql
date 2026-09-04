create or replace function public.save_consultation_measurements(
  p_consultation_id uuid,
  p_values jsonb
)
returns setof public.consultation_measurements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  consultation_record public.consultations;
  item record;
  item_value jsonb;
  saved_ids text[] := array[]::text[];
begin
  if jsonb_typeof(p_values) <> 'object'
    or (select count(*) from jsonb_object_keys(p_values)) > 200 then
    raise exception 'Invalid measurement payload' using errcode = '23514';
  end if;
  select * into consultation_record
  from public.consultations
  where id = p_consultation_id
  for update;
  if not found or consultation_record.professional_id <> (select auth.uid()) or consultation_record.status <> 'draft' then
    raise exception 'Measurements can only be saved in an owned draft consultation' using errcode = '42501';
  end if;
  for item in select key, value from jsonb_each(p_values) loop
    item_value := item.value;
    if jsonb_typeof(item_value) not in ('number', 'string', 'boolean') then
      raise exception 'Invalid measurement value' using errcode = '23514';
    end if;
    saved_ids := array_append(saved_ids, item.key);
    insert into public.consultation_measurements(
      professional_id, patient_id, consultation_id, measurement_type_id,
      value, unit, data_type, measured_at
    )
    select consultation_record.professional_id, consultation_record.patient_id,
      consultation_record.id, catalog.id, item_value, catalog.unit,
      catalog.data_type, consultation_record.consultation_date
    from public.measurement_types catalog
    where catalog.id = item.key
    on conflict (professional_id, consultation_id, measurement_type_id)
    do update set value = excluded.value, unit = excluded.unit,
      data_type = excluded.data_type, measured_at = excluded.measured_at,
      updated_at = now();
    if not found then
      raise exception 'Measurement type is unavailable in this workspace' using errcode = '23514';
    end if;
  end loop;
  delete from public.consultation_measurements
  where professional_id = consultation_record.professional_id
    and consultation_id = consultation_record.id
    and not (measurement_type_id = any(saved_ids));
  return query
    select * from public.consultation_measurements
    where professional_id = consultation_record.professional_id
      and consultation_id = consultation_record.id
    order by created_at;
end;
$$;
revoke all on function public.save_consultation_measurements(uuid, jsonb) from public, anon;
grant execute on function public.save_consultation_measurements(uuid, jsonb) to authenticated;
