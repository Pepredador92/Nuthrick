-- A published plan may leave the working lists and the patient's Super Link
-- without destroying its immutable clinical publications.
alter table public.nutrition_plans
  add column if not exists deleted_at timestamptz;

comment on column public.nutrition_plans.deleted_at is
  'When set, the plan is removed from the workshop and patient sharing; immutable published versions remain for clinical audit.';

create or replace function private.guard_removed_nutrition_plan()
returns trigger language plpgsql security invoker
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'A removed plan cannot be changed' using errcode = '23514';
  end if;
  if new.deleted_at is not null and new.status <> 'archived' then
    raise exception 'A removed plan must be archived' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists nutrition_plans_removed_guard on public.nutrition_plans;
create trigger nutrition_plans_removed_guard
  before update on public.nutrition_plans
  for each row execute function private.guard_removed_nutrition_plan();

create or replace function public.remove_published_nutrition_plan(
  p_plan_id uuid,
  p_expected_revision bigint
)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  owned_plan public.nutrition_plans%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into owned_plan
  from public.nutrition_plans
  where id = p_plan_id and professional_id = (select auth.uid())
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Plan unavailable' using errcode = '42501';
  end if;
  if p_expected_revision is null or owned_plan.draft_revision <> p_expected_revision then
    raise exception 'Plan changed' using errcode = '40001';
  end if;
  if owned_plan.current_version_id is null or not exists (
    select 1 from public.nutrition_plan_versions
    where plan_id = owned_plan.id and professional_id = owned_plan.professional_id
  ) then
    raise exception 'Only published plans can be removed here' using errcode = '23514';
  end if;

  update public.nutrition_plans
  set status = 'archived', deleted_at = now()
  where id = owned_plan.id;

  update private.patient_portals
  set shared_plan_id = null
  where shared_plan_id = owned_plan.id;
end;
$$;

revoke all on function public.remove_published_nutrition_plan(uuid, bigint) from public, anon;
grant execute on function public.remove_published_nutrition_plan(uuid, bigint) to authenticated;
