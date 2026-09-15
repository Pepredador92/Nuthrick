-- Keep the protected publication path authoritative for the confirmation
-- state as well as structural snapshots. The client repeats these checks only
-- to make the review screen actionable before it calls the RPC.
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
  if p_plan.meal_distribution is null
      or coalesce(p_plan.meal_distribution->>'status', '') <> 'ready'
      or p_plan.meal_distribution->'confirmed_at' is null
      or coalesce(p_plan.diet_menu->>'status', '') <> 'ready'
      or p_plan.diet_menu->'confirmed_at' is null then
    raise exception 'The plan has unresolved publication errors'
      using errcode = '23514',
      detail = jsonb_build_array(jsonb_build_object(
        'code', 'CONFIRMATION_REQUIRED',
        'message', 'Confirma los tiempos de comida y el menú aplicado antes de publicar.'
      ))::text;
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
    p_plan.draft_revision, 1, 'diet-publication-v1', publication_hash,
    p_idempotency_key, publication_snapshot, auth.uid()
  ) returning id into new_id;
  update public.nutrition_plans set current_version_id = new_id where id = p_plan.id;
  return jsonb_build_object('version_id', new_id, 'version_number', next_number, 'published_at', now(), 'reused', false, 'already_current', false);
end;
$$;

revoke all on function public.publish_nutrition_plan_version(uuid, bigint, uuid) from public, anon;
grant execute on function public.publish_nutrition_plan_version(uuid, bigint, uuid) to authenticated;
