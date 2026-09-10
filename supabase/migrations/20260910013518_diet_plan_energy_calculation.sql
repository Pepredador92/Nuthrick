-- A plan owns its energy-calculation trace. Keeping it on the existing
-- nutrition_plans row preserves the professional ownership policy and avoids
-- creating another patient-data endpoint.
alter table public.nutrition_plans
  add column if not exists energy_calculation jsonb;

alter table public.nutrition_plans
  drop constraint if exists nutrition_plans_energy_calculation_object_check;

alter table public.nutrition_plans
  add constraint nutrition_plans_energy_calculation_object_check
  check (
    energy_calculation is null
    or jsonb_typeof(energy_calculation) = 'object'
  );

comment on column public.nutrition_plans.energy_calculation is
  'Auditable snapshot of the energy method, inputs and their provenance, component results, warnings, and prescribed target for this plan.';
