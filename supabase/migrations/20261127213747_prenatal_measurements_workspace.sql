alter table public.consultation_templates
  add column prenatal_optional_measurements text[],
  add constraint consultation_templates_prenatal_fields_check check (
    prenatal_optional_measurements is null or (
      not is_system
      and cardinality(prenatal_optional_measurements) <= 4
      and array_position(prenatal_optional_measurements, null) is null
      and prenatal_optional_measurements <@ array['arm', 'blood_pressure', 'edema', 'previous_weight']::text[]
    )
  );

update public.consultation_templates
set prenatal_optional_measurements = array['arm', 'blood_pressure', 'edema', 'previous_weight']::text[]
where id = 'a521000e-8839-4ad7-b071-649324c647fd'
  and template_key = 'personal-initial-prenatal-10-56a02bbb' and not is_system;

create function private.validate_prenatal_workspace_template()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.prenatal_optional_measurements is not null and not exists (
    select 1 from public.consultation_templates
    where id = 'a521000e-8839-4ad7-b071-649324c647fd'
      and template_key = 'personal-initial-prenatal-10-56a02bbb'
      and professional_id = new.professional_id
  ) then
    raise insufficient_privilege using message = 'Prenatal workspace unavailable';
  end if;
  return new;
end;
$$;

create trigger consultation_templates_prenatal_workspace
before insert or update of prenatal_optional_measurements on public.consultation_templates
for each row execute function private.validate_prenatal_workspace_template();

create or replace function public.save_consultation_template_details(
  target_template uuid, expected_updated_at timestamptz, template_data jsonb,
  section_data jsonb, question_data jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  prenatal_fields text[];
  change_prenatal_fields boolean := template_data ? 'prenatal_optional_measurements';
begin
  if jsonb_typeof(template_data) <> 'object' then
    raise exception 'Invalid template metadata';
  end if;
  if change_prenatal_fields then
    if template_data->'prenatal_optional_measurements' <> 'null'::jsonb then
      select array(
        select jsonb_array_elements_text(template_data->'prenatal_optional_measurements')
      ) into prenatal_fields;
    end if;
  end if;

  perform public.save_consultation_template(
    target_template, expected_updated_at, section_data, question_data
  );
  update public.consultation_templates
  set name = template_data->>'name',
      description = nullif(btrim(template_data->>'description'), ''),
      estimated_duration_minutes = nullif(template_data->>'estimated_duration_minutes', '')::integer,
      display_order = (template_data->>'display_order')::integer,
      prenatal_optional_measurements = case when change_prenatal_fields
        then prenatal_fields else prenatal_optional_measurements end
  where id = target_template and professional_id = (select auth.uid()) and not is_system;
  if not found then raise insufficient_privilege using message = 'Template unavailable'; end if;
end;
$$;

create table public.consultation_prenatal_measurements (
  consultation_id uuid primary key,
  professional_id uuid not null default auth.uid(),
  patient_id uuid not null,
  pregnancy_id uuid not null,
  gestation_days smallint check (gestation_days between 7 and 307),
  pregnancy_type text check (pregnancy_type in ('single', 'multiple')),
  pre_pregnancy_weight numeric(6,2) check (pre_pregnancy_weight between 0.1 and 1000),
  weight_source text check (weight_source in ('documented', 'reported', 'estimated', 'unspecified')),
  activity text check (activity in ('inactive', 'low_active', 'active', 'very_active')),
  edema boolean,
  previous_weight numeric(6,2) check (previous_weight between 0.1 and 1000),
  previous_date date,
  updated_at timestamptz not null default now(),
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id) on delete cascade,
  check ((previous_weight is null) = (previous_date is null)),
  check ((pre_pregnancy_weight is null) = (weight_source is null))
);

create index consultation_prenatal_measurements_patient_idx
  on public.consultation_prenatal_measurements (professional_id, patient_id, pregnancy_id);
alter table public.consultation_prenatal_measurements enable row level security;
revoke all on public.consultation_prenatal_measurements from public, anon, authenticated;
grant select, insert, update on public.consultation_prenatal_measurements to authenticated;
create policy prenatal_measurements_select on public.consultation_prenatal_measurements
  for select to authenticated using (professional_id = (select auth.uid()));
create policy prenatal_measurements_insert on public.consultation_prenatal_measurements
  for insert to authenticated with check (
    professional_id = (select auth.uid()) and exists (
      select 1 from public.consultations c where c.id = consultation_id
        and c.professional_id = (select auth.uid()) and c.status = 'draft' and c.deleted_at is null
    )
  );
create policy prenatal_measurements_update on public.consultation_prenatal_measurements
  for update to authenticated using (
    professional_id = (select auth.uid()) and exists (
      select 1 from public.consultations c where c.id = consultation_id
        and c.professional_id = (select auth.uid()) and c.status = 'draft' and c.deleted_at is null
    )
  ) with check (
    professional_id = (select auth.uid()) and exists (
      select 1 from public.consultations c where c.id = consultation_id
        and c.professional_id = (select auth.uid()) and c.status = 'draft' and c.deleted_at is null
    )
  );

create function public.load_prenatal_measurements(p_consultation_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'records', coalesce((
      select jsonb_agg((to_jsonb(p) - 'professional_id' - 'patient_id' - 'updated_at') || jsonb_build_object(
        'date', (c.consultation_date at time zone patient.timezone)::date,
        'weight', weight.value,
        'height', height.value
      ) order by c.consultation_date desc, c.id)
      from public.consultation_prenatal_measurements p
      join public.consultations c on c.id = p.consultation_id
      left join public.consultation_measurements weight on weight.consultation_id = c.id
        and weight.professional_id = c.professional_id and weight.measurement_type_id = 'weight'
        and weight.device_session_id is null
      left join public.consultation_measurements height on height.consultation_id = c.id
        and height.professional_id = c.professional_id and height.measurement_type_id = 'height'
        and height.device_session_id is null
      where p.professional_id = target.professional_id and p.patient_id = target.patient_id
        and c.deleted_at is null and c.status in ('draft', 'completed')
    ), '[]'::jsonb),
    'measurements', coalesce((
      select jsonb_object_agg(m.measurement_type_id, m.value)
      from public.consultation_measurements m
      where m.consultation_id = target.id and m.professional_id = target.professional_id
        and m.device_session_id is null and m.measurement_type_id in (
          'weight', 'height', 'relaxed_arm_circumference', 'systolic_blood_pressure', 'diastolic_blood_pressure'
        )
    ), '{}'::jsonb)
  )
  from public.consultations target
  join public.patients patient on patient.id = target.patient_id and patient.professional_id = target.professional_id
  where target.id = p_consultation_id and target.professional_id = (select auth.uid()) and target.deleted_at is null;
$$;

create function public.save_prenatal_measurements(
  p_consultation_id uuid, p_pregnancy_id uuid, p_context jsonb, p_measurements jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.consultations;
  pregnancy uuid;
  visit_date date;
begin
  select * into target from public.consultations c
  where c.id = p_consultation_id and c.professional_id = (select auth.uid())
    and c.status = 'draft' and c.deleted_at is null
  for update;
  if not found or not exists (
    select 1 from public.consultation_snapshots snapshot
    join public.consultation_templates template on template.id = snapshot.template_id
    where snapshot.id = (
      select latest.id from public.consultation_snapshots latest
      where latest.consultation_id = target.id and latest.professional_id = target.professional_id
      order by latest.revision desc limit 1
    )
      and template.professional_id = target.professional_id and template.prenatal_optional_measurements is not null
  ) then
    raise insufficient_privilege using message = 'Prenatal workspace unavailable';
  end if;

  if p_pregnancy_id is not null then
    select p.pregnancy_id into pregnancy
    from public.consultation_prenatal_measurements p
    join public.consultations c on c.id = p.consultation_id
    where p.pregnancy_id = p_pregnancy_id and p.patient_id = target.patient_id
      and p.professional_id = target.professional_id and c.deleted_at is null
      and c.status in ('draft', 'completed')
    limit 1;
    if not found then raise check_violation using message = 'Pregnancy unavailable'; end if;
  else
    select p.pregnancy_id into pregnancy
    from public.consultation_prenatal_measurements p where p.consultation_id = target.id;
    pregnancy := coalesce(pregnancy, gen_random_uuid());
  end if;

  if jsonb_typeof(p_context) is distinct from 'object' or jsonb_typeof(p_measurements) is distinct from 'object'
    or exists (
      select 1 from jsonb_each(p_measurements) field
      where field.key not in ('weight', 'height', 'relaxed_arm_circumference', 'systolic_blood_pressure', 'diastolic_blood_pressure')
        or jsonb_typeof(field.value) not in ('number', 'null')
        or not exists (select 1 from public.measurement_types catalog where catalog.id = field.key and catalog.is_active)
    ) then
    raise check_violation using message = 'Invalid prenatal measurements';
  end if;
  select (target.consultation_date at time zone patient.timezone)::date into visit_date
  from public.patients patient where patient.id = target.patient_id and patient.professional_id = target.professional_id;
  if (p_context->>'previous_date')::date >= visit_date
    or visit_date - (p_context->>'previous_date')::date > (p_context->>'gestation_days')::smallint then
    raise check_violation using message = 'Previous weight must have an earlier date';
  end if;

  -- Patch only the prenatal fields. The consultation measurement trigger validates the catalog and units.
  delete from public.consultation_measurements m using jsonb_each(p_measurements) field
  where m.professional_id = target.professional_id and m.consultation_id = target.id
    and m.device_session_id is null and m.measurement_type_id = field.key and field.value = 'null'::jsonb;

  insert into public.consultation_measurements(
    professional_id, patient_id, consultation_id, measurement_type_id, value, unit, data_type, measured_at
  )
  select target.professional_id, target.patient_id, target.id, catalog.id, field.value,
    catalog.unit, catalog.data_type, target.consultation_date
  from jsonb_each(p_measurements) field
  join public.measurement_types catalog on catalog.id = field.key
  where field.value <> 'null'::jsonb
  on conflict (professional_id, consultation_id, measurement_type_id) where device_session_id is null
  do update set value = excluded.value, unit = excluded.unit, data_type = excluded.data_type,
    measured_at = excluded.measured_at, updated_at = now();

  insert into public.consultation_prenatal_measurements (
    consultation_id, professional_id, patient_id, pregnancy_id, gestation_days, pregnancy_type,
    pre_pregnancy_weight, weight_source, activity, edema, previous_weight, previous_date
  ) values (
    target.id, target.professional_id, target.patient_id, pregnancy, (p_context->>'gestation_days')::smallint,
    p_context->>'pregnancy_type', (p_context->>'pre_pregnancy_weight')::numeric, p_context->>'weight_source',
    p_context->>'activity', (p_context->>'edema')::boolean, (p_context->>'previous_weight')::numeric,
    (p_context->>'previous_date')::date
  ) on conflict (consultation_id) do update set
    pregnancy_id = excluded.pregnancy_id, gestation_days = excluded.gestation_days,
    pregnancy_type = excluded.pregnancy_type, pre_pregnancy_weight = excluded.pre_pregnancy_weight,
    weight_source = excluded.weight_source, activity = excluded.activity, edema = excluded.edema,
    previous_weight = excluded.previous_weight, previous_date = excluded.previous_date, updated_at = now();

  return public.load_prenatal_measurements(target.id);
end;
$$;

revoke all on function public.load_prenatal_measurements(uuid) from public, anon;
revoke all on function public.save_prenatal_measurements(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.load_prenatal_measurements(uuid) to authenticated;
grant execute on function public.save_prenatal_measurements(uuid, uuid, jsonb, jsonb) to authenticated;
