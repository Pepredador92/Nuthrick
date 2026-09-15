-- Objective 8: immutable clinical publications for the Diet Workshop.
-- `nutrition_plans` remains the editable draft. Published content lives in its
-- own restricted table and can only be created by the guarded RPC below.

alter table public.nutrition_plans
  add column if not exists draft_revision bigint not null default 1 check (draft_revision > 0),
  add column if not exists current_version_id uuid;

create table if not exists public.nutrition_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  professional_id uuid not null references public.professional_profiles(id) on delete restrict,
  patient_id uuid not null,
  consultation_id uuid,
  version_number integer not null check (version_number > 0),
  draft_revision bigint not null check (draft_revision > 0),
  snapshot_schema_version integer not null check (snapshot_schema_version > 0),
  validation_rules_version text not null check (char_length(btrim(validation_rules_version)) between 1 and 80),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  published_at timestamptz not null default now(),
  published_by uuid not null references public.professional_profiles(id) on delete restrict,
  unique (professional_id, id),
  unique (plan_id, id),
  unique (plan_id, version_number),
  unique (plan_id, idempotency_key),
  foreign key (professional_id, plan_id)
    references public.nutrition_plans(professional_id, id) on delete restrict,
  foreign key (professional_id, patient_id)
    references public.patients(professional_id, id) on delete restrict,
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations(professional_id, id, patient_id) on delete restrict,
  check (published_by = professional_id)
);

alter table public.nutrition_plans
  drop constraint if exists nutrition_plans_current_version_same_plan_fkey;

alter table public.nutrition_plans
  add constraint nutrition_plans_current_version_same_plan_fkey
  foreign key (id, current_version_id)
  references public.nutrition_plan_versions(plan_id, id)
  deferrable initially deferred;

create index if not exists nutrition_plan_versions_plan_published_idx
  on public.nutrition_plan_versions (professional_id, plan_id, published_at desc);

create or replace function private.bump_nutrition_plan_draft_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if (to_jsonb(new) - array['updated_at', 'draft_revision', 'current_version_id'])
      is distinct from
     (to_jsonb(old) - array['updated_at', 'draft_revision', 'current_version_id']) then
    new.draft_revision := old.draft_revision + 1;
  else
    new.draft_revision := old.draft_revision;
  end if;
  return new;
end;
$$;

create or replace function private.prevent_published_plan_patient_reassignment()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if old.current_version_id is not null
      and new.patient_id is distinct from old.patient_id then
    raise exception 'A published plan cannot be reassigned to another patient'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists nutrition_plans_draft_revision on public.nutrition_plans;
create trigger nutrition_plans_draft_revision
before update on public.nutrition_plans
for each row execute function private.bump_nutrition_plan_draft_revision();

drop trigger if exists nutrition_plans_published_patient_guard on public.nutrition_plans;
create trigger nutrition_plans_published_patient_guard
before update on public.nutrition_plans
for each row execute function private.prevent_published_plan_patient_reassignment();

create or replace function private.nutrition_plan_publication_errors(p_plan public.nutrition_plans)
returns jsonb
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  errors jsonb := '[]'::jsonb;
  day_row jsonb;
  assignment jsonb;
  entry jsonb;
  required_meal jsonb;
  day_code text;
  days jsonb;
  assignments jsonb;
begin
  if p_plan.patient_id is null then
    errors := errors || jsonb_build_array(jsonb_build_object('code', 'PATIENT_REQUIRED', 'message', 'Asigna un paciente antes de publicar.'));
  end if;
  if p_plan.target_calories is null or p_plan.target_calories <= 0 then
    errors := errors || jsonb_build_array(jsonb_build_object('code', 'ENERGY_TARGET_REQUIRED', 'message', 'Define un objetivo energético válido.'));
  end if;
  if p_plan.macro_distribution is null or coalesce(p_plan.macro_distribution->>'complete', 'false') <> 'true' then
    errors := errors || jsonb_build_array(jsonb_build_object('code', 'MACROS_INCOMPLETE', 'message', 'Completa y confirma los macronutrientes.'));
  end if;
  if p_plan.exchange_prescription is null
      or coalesce(p_plan.exchange_prescription->>'status', '') <> 'ready'
      or p_plan.exchange_prescription->'confirmed_at' is null then
    errors := errors || jsonb_build_array(jsonb_build_object('code', 'EXCHANGES_UNCONFIRMED', 'message', 'Completa y confirma los equivalentes.'));
  end if;
  if p_plan.meal_distribution is null
      or coalesce(p_plan.meal_distribution->>'status', '') <> 'ready'
      or jsonb_typeof(p_plan.meal_distribution->'meal_times') <> 'array'
      or jsonb_array_length(coalesce(p_plan.meal_distribution->'meal_times', '[]'::jsonb)) = 0 then
    errors := errors || jsonb_build_array(jsonb_build_object('code', 'MEAL_DISTRIBUTION_INCOMPLETE', 'message', 'Completa los tiempos de comida antes de publicar.'));
  end if;
  if p_plan.diet_menu is null or jsonb_typeof(p_plan.diet_menu #> '{week_plan,days}') <> 'array' then
    errors := errors || jsonb_build_array(jsonb_build_object('code', 'CALENDAR_REQUIRED', 'message', 'Organiza y aplica al menos un día del calendario.'));
    return errors;
  end if;
  days := p_plan.diet_menu #> '{week_plan,days}';
  if jsonb_array_length(days) not between 1 and 7 then
    errors := errors || jsonb_build_array(jsonb_build_object('code', 'CALENDAR_DAY_COUNT_INVALID', 'message', 'El calendario debe tener entre uno y siete días.'));
  end if;
  if exists (
    select 1 from jsonb_array_elements(days) value
    group by value->>'day' having count(*) > 1 or min(value->>'day') not in ('mon','tue','wed','thu','fri','sat','sun')
  ) then
    errors := errors || jsonb_build_array(jsonb_build_object('code', 'CALENDAR_DAYS_INVALID', 'message', 'El calendario contiene días duplicados o inválidos.'));
  end if;

  for day_row in select value from jsonb_array_elements(days) loop
    day_code := day_row->>'day';
    assignments := day_row->'assignments';
    if jsonb_typeof(assignments) <> 'array' then
      errors := errors || jsonb_build_array(jsonb_build_object('code', 'DAY_ASSIGNMENTS_INVALID', 'message', 'Hay un día sin tiempos organizados.', 'day', day_code));
      continue;
    end if;
    if exists (select 1 from jsonb_array_elements(assignments) value group by value->>'meal_time_id' having count(*) > 1) then
      errors := errors || jsonb_build_array(jsonb_build_object('code', 'DAY_ASSIGNMENTS_DUPLICATED', 'message', 'Un tiempo aparece más de una vez en el día.', 'day', day_code));
    end if;
    if p_plan.meal_distribution is not null then
      for required_meal in
        select meal.value
        from jsonb_array_elements(p_plan.meal_distribution->'meal_times') meal(value)
        where exists (
          select 1 from jsonb_array_elements(coalesce(p_plan.meal_distribution->'distribution', '[]'::jsonb)) d(value)
          where d.value->>'meal_time_id' = meal.value->>'id'
            and coalesce(d.value->>'portions', '') ~ '^[0-9]+(\.[0-9]+)?$'
            and (d.value->>'portions')::numeric > 0
        )
      loop
        if not exists (select 1 from jsonb_array_elements(assignments) a(value) where a.value->>'meal_time_id' = required_meal->>'id') then
          errors := errors || jsonb_build_array(jsonb_build_object('code', 'DAY_MEAL_MISSING', 'message', 'Falta una opción aplicada en un tiempo requerido.', 'day', day_code, 'meal_time_id', required_meal->>'id'));
        end if;
      end loop;
    end if;
    for assignment in select value from jsonb_array_elements(assignments) loop
      if jsonb_typeof(assignment->'option_snapshot') <> 'object'
          or assignment->'option_snapshot'->>'meal_time_id' is distinct from assignment->>'meal_time_id'
          or assignment->'option_snapshot'->>'status' <> 'confirmed'
          or jsonb_typeof(assignment #> '{option_snapshot,entries}') <> 'array'
          or jsonb_array_length(assignment #> '{option_snapshot,entries}') = 0 then
        errors := errors || jsonb_build_array(jsonb_build_object('code', 'APPLIED_OPTION_INVALID', 'message', 'Una opción aplicada no conserva un snapshot confirmado y completo.', 'day', day_code, 'meal_time_id', assignment->>'meal_time_id'));
        continue;
      end if;
      for entry in select value from jsonb_array_elements(assignment #> '{option_snapshot,entries}') loop
        if coalesce(entry->>'quantity', '') !~ '^[0-9]+(\.[0-9]+)?$'
            or (entry->>'quantity')::numeric <= 0
            or coalesce(entry->>'unit', '') = ''
            or (entry->>'type' = 'food' and jsonb_typeof(entry->'food_snapshot') <> 'object')
            or (entry->>'type' = 'recipe' and (jsonb_typeof(entry->'recipe_snapshot') <> 'object' or jsonb_typeof(entry #> '{recipe_snapshot,items}') <> 'array')) then
          errors := errors || jsonb_build_array(jsonb_build_object('code', 'APPLIED_ENTRY_INVALID', 'message', 'Una comida aplicada tiene cantidades, unidades o snapshots incompletos.', 'day', day_code, 'meal_time_id', assignment->>'meal_time_id'));
          exit;
        end if;
      end loop;
    end loop;
  end loop;
  return errors;
end;
$$;

create or replace function private.nutrition_plan_version_snapshot(p_plan public.nutrition_plans)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  p_patient public.patients%rowtype;
  p_professional public.professional_profiles%rowtype;
  p_consultation public.consultations%rowtype;
begin
  select * into p_patient from public.patients where id = p_plan.patient_id and professional_id = p_plan.professional_id;
  select * into p_professional from public.professional_profiles where id = p_plan.professional_id;
  if p_plan.consultation_id is not null then
    select * into p_consultation from public.consultations where id = p_plan.consultation_id and professional_id = p_plan.professional_id and patient_id = p_plan.patient_id;
  end if;
  return jsonb_build_object(
    'snapshot_schema_version', 1,
    'plan', jsonb_build_object('id', p_plan.id, 'title', p_plan.title, 'assigned_at', p_plan.assigned_at, 'patient_id', p_plan.patient_id, 'consultation_id', p_plan.consultation_id),
    'patient', jsonb_build_object('id', p_patient.id, 'full_name', p_patient.full_name),
    'professional', jsonb_build_object('id', p_professional.id, 'full_name', p_professional.full_name, 'professional_title', p_professional.professional_title),
    'consultation', case when p_consultation.id is null then null else jsonb_build_object('id', p_consultation.id, 'date', p_consultation.consultation_date) end,
    'prescription', jsonb_build_object(
      'target_calories', p_plan.target_calories,
      'energy_calculation', p_plan.energy_calculation,
      'macro_distribution', p_plan.macro_distribution,
      'exchange_prescription', p_plan.exchange_prescription,
      'meal_distribution', p_plan.meal_distribution
    ),
    'calendar', p_plan.diet_menu #> '{week_plan,days}',
    'source_versions', jsonb_build_object('validation_rules_version', 'diet-publication-v1', 'diet_menu_schema_version', coalesce(p_plan.diet_menu->'schema_version', 'null'::jsonb))
  );
end;
$$;

create or replace function public.publish_nutrition_plan_version(
  p_plan_id uuid,
  p_expected_draft_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  p_plan public.nutrition_plans%rowtype;
  existing_version public.nutrition_plan_versions%rowtype;
  current_version public.nutrition_plan_versions%rowtype;
  publication_errors jsonb;
  publication_snapshot jsonb;
  publication_hash text;
  next_number integer;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select * into p_plan from public.nutrition_plans
    where id = p_plan_id and professional_id = auth.uid()
    for update;
  if not found then
    raise exception 'Plan not found or not authorized' using errcode = '42501';
  end if;
  select * into existing_version from public.nutrition_plan_versions
    where plan_id = p_plan.id and idempotency_key = p_idempotency_key;
  if found then
    if existing_version.draft_revision <> p_expected_draft_revision then
      raise exception 'This publication key belongs to another draft revision' using errcode = '23505';
    end if;
    return jsonb_build_object('version_id', existing_version.id, 'version_number', existing_version.version_number, 'published_at', existing_version.published_at, 'reused', true, 'already_current', false);
  end if;
  if p_plan.draft_revision <> p_expected_draft_revision then
    raise exception 'The draft changed in another tab. Review it again before publishing.' using errcode = '40001';
  end if;
  publication_errors := private.nutrition_plan_publication_errors(p_plan);
  if jsonb_array_length(publication_errors) > 0 then
    raise exception 'The plan has unresolved publication errors'
      using errcode = '23514', detail = publication_errors::text;
  end if;
  publication_snapshot := private.nutrition_plan_version_snapshot(p_plan);
  publication_hash := encode(digest(publication_snapshot::text, 'sha256'), 'hex');
  if p_plan.current_version_id is not null then
    select * into current_version from public.nutrition_plan_versions where id = p_plan.current_version_id;
    if found and current_version.content_hash = publication_hash then
      return jsonb_build_object('version_id', current_version.id, 'version_number', current_version.version_number, 'published_at', current_version.published_at, 'reused', false, 'already_current', true);
    end if;
  end if;
  select coalesce(max(version_number), 0) + 1 into next_number from public.nutrition_plan_versions where plan_id = p_plan.id;
  insert into public.nutrition_plan_versions (
    plan_id, professional_id, patient_id, consultation_id, version_number,
    draft_revision, snapshot_schema_version, validation_rules_version,
    content_hash, idempotency_key, snapshot, published_by
  ) values (
    p_plan.id, p_plan.professional_id, p_plan.patient_id, p_plan.consultation_id, next_number,
    p_plan.draft_revision, 1, 'diet-publication-v1', publication_hash,
    p_idempotency_key, publication_snapshot, auth.uid()
  ) returning id into new_id;
  update public.nutrition_plans set current_version_id = new_id where id = p_plan.id;
  return jsonb_build_object('version_id', new_id, 'version_number', next_number, 'published_at', now(), 'reused', false, 'already_current', false);
end;
$$;

alter table public.nutrition_plan_versions enable row level security;
revoke all on table public.nutrition_plan_versions from anon, authenticated;
grant select on table public.nutrition_plan_versions to authenticated;
create policy nutrition_plan_versions_owner_read on public.nutrition_plan_versions
  for select to authenticated
  using (professional_id = (select auth.uid()));

-- A browser can continue to edit drafts, but cannot point a plan at a version
-- or alter its revision. The protected RPC owns those two fields.
revoke update on table public.nutrition_plans from authenticated;
grant update (
  title, patient_id, consultation_id, review_date, plan_type, category,
  target_calories, status, energy_calculation, macro_distribution,
  exchange_prescription, meal_distribution, diet_menu
) on table public.nutrition_plans to authenticated;

revoke all on function public.publish_nutrition_plan_version(uuid, bigint, uuid) from public, anon;
grant execute on function public.publish_nutrition_plan_version(uuid, bigint, uuid) to authenticated;

comment on table public.nutrition_plan_versions is
  'Immutable, server-published clinical plan snapshots. Draft edits remain on nutrition_plans.';
comment on column public.nutrition_plans.current_version_id is
  'The current published version of this editable draft. It is only changed by the publication RPC.';
