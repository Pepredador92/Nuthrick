alter table public.nutrition_plans
  add column if not exists meal_distribution jsonb;

alter table public.nutrition_plans
  drop constraint if exists nutrition_plans_meal_distribution_object_check;

alter table public.nutrition_plans
  add constraint nutrition_plans_meal_distribution_object_check
  check (
    meal_distribution is null
    or (
      jsonb_typeof(meal_distribution) = 'object'
      and meal_distribution ? 'schema_version'
      and meal_distribution ? 'source_exchange_snapshot'
      and meal_distribution ? 'meal_times'
      and meal_distribution ? 'distribution'
      and meal_distribution ? 'derived_meal_totals'
      and meal_distribution ? 'status'
    )
  );

comment on column public.nutrition_plans.meal_distribution is
  'Versioned meal-time allocation of the daily exchange inventory. The exchange prescription remains the source of truth.';
