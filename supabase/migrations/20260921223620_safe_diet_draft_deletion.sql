-- Preserve the existing ownership RLS and immutable-version RESTRICT FK.
-- The trigger protects direct DELETE too; no extra CASCADE or clinical audit payload.
create or replace function private.guard_diet_draft_deletion()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and new.status = 'draft' then
      raise exception 'A finalized plan cannot become a deletable draft' using errcode = '23514';
    end if;
    return new;
  end if;
  if old.status <> 'draft' or old.current_version_id is not null
    or exists (select 1 from public.nutrition_plan_versions where plan_id = old.id) then
    raise exception 'Only never-published drafts can be deleted' using errcode = '23514';
  end if;
  return old;
end;
$$;
create trigger nutrition_plans_safe_delete before delete on public.nutrition_plans
for each row execute function private.guard_diet_draft_deletion();
create trigger nutrition_plans_no_draft_downgrade before update of status on public.nutrition_plans
for each row execute function private.guard_diet_draft_deletion();

create or replace function public.delete_nutrition_plan_draft(p_plan_id uuid, p_expected_revision bigint)
returns void language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare draft public.nutrition_plans;
begin
  select * into draft from public.nutrition_plans
  where id = p_plan_id and professional_id = (select auth.uid()) for update;
  if not found then raise exception 'Plan unavailable' using errcode = '42501'; end if;
  if p_expected_revision is null or draft.draft_revision <> p_expected_revision then
    raise exception 'Draft changed' using errcode = '40001';
  end if;
  -- Same row lock used by publication: publishing and deletion cannot race.
  delete from public.nutrition_plans where id = draft.id;
end;
$$;
revoke all on function public.delete_nutrition_plan_draft(uuid,bigint) from public, anon;
grant execute on function public.delete_nutrition_plan_draft(uuid,bigint) to authenticated;
