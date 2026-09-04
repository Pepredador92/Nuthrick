-- Direct values captured in a consultation. This is deliberately separate from
-- the old anthropometry snapshots and from the legacy weight/height history.
create table public.consultation_measurements (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  consultation_id uuid not null,
  measurement_type_id text not null references public.measurement_types(id),
  value jsonb not null,
  unit text,
  data_type text not null,
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, consultation_id, measurement_type_id),
  foreign key (professional_id, patient_id)
    references public.patients(professional_id, id) on delete cascade,
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations(professional_id, id, patient_id) on delete cascade,
  check (jsonb_typeof(value) in ('number', 'string', 'boolean')),
  check (data_type in ('number', 'text', 'choice', 'boolean', 'percentage', 'ratio'))
);

create index consultation_measurements_consultation_idx
  on public.consultation_measurements(professional_id, consultation_id, measured_at);
create index consultation_measurements_patient_idx
  on public.consultation_measurements(professional_id, patient_id, measured_at desc);

alter table public.consultation_measurements enable row level security;
revoke all on public.consultation_measurements from public, anon, authenticated;
grant select, insert, update, delete on public.consultation_measurements to authenticated;
create policy consultation_measurements_owner_all on public.consultation_measurements
  for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

create function private.validate_consultation_measurement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  catalog public.measurement_types;
  consultation_record public.consultations;
begin
  select * into catalog from public.measurement_types where id = new.measurement_type_id;
  if not found or not catalog.is_active or catalog.category = 'laboratory' then
    raise exception 'Measurement type is unavailable in this workspace' using errcode = '23514';
  end if;
  select * into consultation_record from public.consultations where id = new.consultation_id;
  if not found
    or consultation_record.professional_id <> new.professional_id
    or consultation_record.patient_id <> new.patient_id
    or consultation_record.status <> 'draft' then
    raise exception 'Measurements can only be saved in an owned draft consultation' using errcode = '42501';
  end if;
  if new.data_type <> catalog.data_type or new.unit is distinct from catalog.unit then
    raise exception 'Measurement metadata does not match the catalog' using errcode = '23514';
  end if;
  if catalog.data_type in ('number', 'percentage', 'ratio') then
    if jsonb_typeof(new.value) <> 'number'
      or (new.value #>> '{}')::numeric < catalog.min_value
      or (new.value #>> '{}')::numeric > catalog.max_value then
      raise exception 'Measurement value is outside the allowed capture range' using errcode = '23514';
    end if;
  elsif catalog.data_type = 'boolean' then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'Measurement value has an invalid type' using errcode = '23514';
    end if;
  elsif catalog.data_type = 'choice' then
    if jsonb_typeof(new.value) <> 'string'
      or (jsonb_array_length(catalog.choice_options) > 0 and not catalog.choice_options ? (new.value #>> '{}')) then
      raise exception 'Measurement option is unavailable' using errcode = '23514';
    end if;
  elsif jsonb_typeof(new.value) <> 'string' then
    raise exception 'Measurement value has an invalid type' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.validate_consultation_measurement() from public, anon;
grant execute on function private.validate_consultation_measurement() to authenticated;
create trigger consultation_measurements_validate
  before insert or update on public.consultation_measurements
  for each row execute function private.validate_consultation_measurement();

-- A single atomic replace operation prevents duplicate measurements when a
-- professional corrects a value during the same consultation.
create function public.save_consultation_measurements(
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
  if jsonb_typeof(p_values) <> 'object' or (select count(*) from jsonb_object_keys(p_values)) > 200 then
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
