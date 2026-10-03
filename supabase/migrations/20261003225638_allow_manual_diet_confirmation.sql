-- Nutritional completeness is advisory for professional manual plans.
-- Ownership, revision, idempotency and structural validation remain authoritative.
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
  day_code text;
  days jsonb;
  assignments jsonb;
begin
  if p_plan.patient_id is null then
    errors := errors || jsonb_build_array(jsonb_build_object('code', 'PATIENT_REQUIRED', 'message', 'Asigna un paciente antes de publicar.'));
  end if;
  if p_plan.meal_distribution is null or jsonb_typeof(p_plan.meal_distribution->'meal_times') is distinct from 'array' then
    errors := errors || jsonb_build_array(jsonb_build_object('code','MEAL_TIMES_REQUIRED','message','Organiza los tiempos del menú.'));
    return errors;
  end if;
  if p_plan.diet_menu is null or jsonb_typeof(p_plan.diet_menu #> '{week_plan,days}') is distinct from 'array' then
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
    if jsonb_typeof(assignments) is distinct from 'array' then
      errors := errors || jsonb_build_array(jsonb_build_object('code', 'DAY_ASSIGNMENTS_INVALID', 'message', 'Hay un día sin tiempos organizados.', 'day', day_code));
      continue;
    end if;
    if exists (select 1 from jsonb_array_elements(assignments) value group by value->>'meal_time_id' having count(*) > 1) then
      errors := errors || jsonb_build_array(jsonb_build_object('code', 'DAY_ASSIGNMENTS_DUPLICATED', 'message', 'Un tiempo aparece más de una vez en el día.', 'day', day_code));
    end if;
    for assignment in select value from jsonb_array_elements(assignments) loop
      if not exists(select 1 from jsonb_array_elements(p_plan.meal_distribution->'meal_times') t where t->>'id'=assignment->>'meal_time_id') then
        errors := errors || jsonb_build_array(jsonb_build_object('code','MEAL_UNKNOWN','message','Revisa los tiempos del calendario.'));
      end if;
      if jsonb_typeof(assignment->'option_snapshot') is distinct from 'object'
          or assignment->'option_snapshot'->>'meal_time_id' is distinct from assignment->>'meal_time_id'
          or jsonb_typeof(assignment #> '{option_snapshot,entries}') is distinct from 'array' then
        errors := errors || jsonb_build_array(jsonb_build_object('code', 'APPLIED_OPTION_INVALID', 'message', 'Una opción aplicada no conserva un snapshot confirmado y completo.', 'day', day_code, 'meal_time_id', assignment->>'meal_time_id'));
        continue;
      end if;
      for entry in select value from jsonb_array_elements(assignment #> '{option_snapshot,entries}') loop
        if coalesce(entry->>'quantity', '') !~ '^[0-9]+(\.[0-9]+)?$'
            or (entry->>'quantity')::numeric <= 0
            or coalesce(entry->>'unit', '') = ''
            or (entry->>'type' = 'food' and jsonb_typeof(entry->'food_snapshot') is distinct from 'object')
            or (entry->>'type' = 'recipe' and (jsonb_typeof(entry->'recipe_snapshot') is distinct from 'object' or jsonb_typeof(entry #> '{recipe_snapshot,items}') is distinct from 'array')) then
          errors := errors || jsonb_build_array(jsonb_build_object('code', 'APPLIED_ENTRY_INVALID', 'message', 'Una comida aplicada tiene cantidades, unidades o snapshots incompletos.', 'day', day_code, 'meal_time_id', assignment->>'meal_time_id'));
          exit;
        end if;
      end loop;
    end loop;
  end loop;
  return errors;
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
  perform private.require_my_entitlement('diet_workshop');
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
  publication_hash := encode(extensions.digest(publication_snapshot::text, 'sha256'), 'hex');
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
    p_plan.draft_revision, 1, 'diet-publication-manual-v2', publication_hash,
    p_idempotency_key, publication_snapshot, auth.uid()
  ) returning id into new_id;
  update public.nutrition_plans set current_version_id = new_id where id = p_plan.id;
  return jsonb_build_object('version_id', new_id, 'version_number', next_number, 'published_at', now(), 'reused', false, 'already_current', false);
end;
$$;

revoke all on function public.publish_nutrition_plan_version(uuid, bigint, uuid) from public, anon;
grant execute on function public.publish_nutrition_plan_version(uuid, bigint, uuid) to authenticated;
