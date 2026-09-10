alter table public.nutrition_plans
  add column if not exists macro_distribution jsonb;

alter table public.nutrition_plans
  drop constraint if exists nutrition_plans_macro_distribution_object_check;

alter table public.nutrition_plans
  add constraint nutrition_plans_macro_distribution_object_check
  check (macro_distribution is null or jsonb_typeof(macro_distribution) = 'object');

comment on column public.nutrition_plans.macro_distribution is
  'Versioned macro distribution snapshot. Stores authoritative macro inputs, derived values, target energy and reference-weight provenance.';
