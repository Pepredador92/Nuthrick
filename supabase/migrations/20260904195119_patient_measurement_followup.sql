-- A follow-up is a patient-specific selection of the professional's workspace.
-- It carries no clinical values and deliberately has no patient-specific order.
create table public.patient_measurement_followups (
  patient_id uuid primary key,
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, patient_id),
  foreign key (professional_id, patient_id)
    references public.patients(professional_id, id) on delete cascade
);

create table public.patient_measurement_followup_items (
  professional_id uuid not null,
  patient_id uuid not null,
  measurement_type_id text not null references public.measurement_types(id),
  created_at timestamptz not null default now(),
  primary key (patient_id, measurement_type_id),
  foreign key (professional_id, patient_id)
    references public.patient_measurement_followups(professional_id, patient_id)
    on delete cascade
);

create index patient_measurement_followup_items_owner_idx
  on public.patient_measurement_followup_items(professional_id, patient_id);

alter table public.patient_measurement_followups enable row level security;
alter table public.patient_measurement_followup_items enable row level security;
revoke all on public.patient_measurement_followups, public.patient_measurement_followup_items from public, anon, authenticated;
grant select, insert, update, delete on public.patient_measurement_followups, public.patient_measurement_followup_items to authenticated;

create policy patient_measurement_followups_owner_all on public.patient_measurement_followups
  for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy patient_measurement_followup_items_owner_all on public.patient_measurement_followup_items
  for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

create function private.validate_patient_measurement_followup_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_workspace boolean;
begin
  if not exists (
    select 1 from public.measurement_types
    where id = new.measurement_type_id
      and is_active
      and category <> 'laboratory'
  ) then
    raise exception 'Measurement type is unavailable for patient follow-up' using errcode = '23514';
  end if;

  select exists(
    select 1 from public.professional_measurement_workspaces
    where professional_id = new.professional_id
  ) into has_workspace;

  if has_workspace then
    if not exists (
      select 1 from public.professional_measurement_workspace_items
      where professional_id = new.professional_id
        and measurement_type_id = new.measurement_type_id
    ) then
      raise exception 'Measurement type is not in the professional workspace' using errcode = '23514';
    end if;
  elsif new.measurement_type_id not in (
    'weight', 'height', 'waist_circumference', 'hip_circumference', 'abdominal_circumference'
  ) then
    raise exception 'Measurement type is not in the professional workspace' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_patient_measurement_followup_item() from public, anon;
grant execute on function private.validate_patient_measurement_followup_item() to authenticated;
create trigger patient_measurement_followup_items_validate
  before insert or update on public.patient_measurement_followup_items
  for each row execute function private.validate_patient_measurement_followup_item();

create function public.save_patient_measurement_followup(
  p_patient_id uuid,
  p_measurement_type_ids text[]
)
returns setof public.patient_measurement_followup_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  requested_type_id text;
  item_count integer;
  distinct_item_count integer;
begin
  if owner_id is null or p_patient_id is null or p_measurement_type_ids is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if not exists (
    select 1 from public.patients
    where id = p_patient_id and professional_id = owner_id
  ) then
    raise insufficient_privilege using message = 'Patient is unavailable';
  end if;

  item_count := coalesce(array_length(p_measurement_type_ids, 1), 0);
  select count(*) into distinct_item_count
  from (select distinct unnest(p_measurement_type_ids)) as unique_items;
  if item_count > 100 or distinct_item_count <> item_count then
    raise exception 'Invalid patient measurement follow-up' using errcode = '23514';
  end if;

  insert into public.patient_measurement_followups(patient_id, professional_id)
  values (p_patient_id, owner_id)
  on conflict (patient_id) do update set updated_at = now();

  delete from public.patient_measurement_followup_items
  where professional_id = owner_id and patient_id = p_patient_id;

  foreach requested_type_id in array p_measurement_type_ids loop
    insert into public.patient_measurement_followup_items(
      professional_id, patient_id, measurement_type_id
    ) values (owner_id, p_patient_id, requested_type_id);
  end loop;

  return query
  select * from public.patient_measurement_followup_items
  where professional_id = owner_id and patient_id = p_patient_id
  order by measurement_type_id;
end;
$$;

revoke all on function public.save_patient_measurement_followup(uuid, text[]) from public, anon;
grant execute on function public.save_patient_measurement_followup(uuid, text[]) to authenticated;
