-- Keep the last workshop section with the plan so it can be resumed on any device.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'nutrition_plans'
      and column_name = 'last_workshop_step'
  ) then
    alter table public.nutrition_plans
      add column last_workshop_step text not null default 'energy';

    -- Existing plans had no persisted step. Start them where their saved content leads.
    update public.nutrition_plans
    set last_workshop_step = case
      when current_version_id is not null or text_diet is not null then 'review'
      when diet_menu is not null and diet_menu->>'status' = 'ready' then 'review'
      when diet_menu is not null then 'menu'
      when meal_distribution is not null then 'meals'
      when exchange_prescription is not null then 'equivalents'
      when macro_distribution is not null then 'macros'
      else 'energy'
    end
    where deleted_at is null;
  end if;
end;
$$;

alter table public.nutrition_plans
  drop constraint if exists nutrition_plans_last_workshop_step_check;
alter table public.nutrition_plans
  add constraint nutrition_plans_last_workshop_step_check
  check (last_workshop_step in ('energy','macros','equivalents','meals','menu','review'));

grant update (last_workshop_step) on table public.nutrition_plans to authenticated;

comment on column public.nutrition_plans.last_workshop_step is
  'Most recent workshop section selected by the professional; used to resume the plan.';
