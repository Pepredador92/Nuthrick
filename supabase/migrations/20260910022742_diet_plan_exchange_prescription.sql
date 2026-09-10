alter table public.nutrition_plans
  add column if not exists exchange_prescription jsonb;

alter table public.nutrition_plans
  drop constraint if exists nutrition_plans_exchange_prescription_object_check;

alter table public.nutrition_plans
  add constraint nutrition_plans_exchange_prescription_object_check
  check (
    exchange_prescription is null
    or (
      jsonb_typeof(exchange_prescription) = 'object'
      and exchange_prescription ? 'schema_version'
      and exchange_prescription ? 'exchange_system_code'
      and exchange_prescription ? 'catalog_version'
      and exchange_prescription ? 'groups'
    )
  );

comment on column public.nutrition_plans.exchange_prescription is
  'Versioned daily exchange prescription with SMAE catalog version, target snapshot, portions, totals, differences and confirmation state.';
