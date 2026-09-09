-- Objective 1: turn the existing nutrition_plans record into the persistent
-- shell for the Diet Workshop. Clinical inputs continue to live in their
-- original patient/consultation tables.

alter table public.nutrition_plans
  add column if not exists title text;

update public.nutrition_plans
set title = coalesce(nullif(btrim(plan_type), ''), 'Plan nutricional')
where title is null or btrim(title) = '';

alter table public.nutrition_plans
  alter column title set default 'Plan nutricional',
  alter column title set not null,
  alter column patient_id drop not null,
  alter column status drop default,
  drop constraint if exists nutrition_plans_status_check;

alter table public.nutrition_plans
  add constraint nutrition_plans_title_check
    check (char_length(btrim(title)) between 1 and 120),
  add constraint nutrition_plans_status_check
    check (status in ('draft', 'active', 'archived')),
  add constraint nutrition_plans_consultation_requires_patient_check
    check (consultation_id is null or patient_id is not null),
  alter column status set default 'draft';

create index if not exists nutrition_plans_owner_updated_idx
  on public.nutrition_plans (professional_id, updated_at desc);

comment on column public.nutrition_plans.title is
  'Editable workshop title. It never stores or replaces clinical source data.';
comment on column public.nutrition_plans.patient_id is
  'Optional patient context. Null supports free plans and future templates.';
comment on column public.nutrition_plans.consultation_id is
  'Optional source consultation. The existing composite foreign key guarantees it belongs to patient_id and professional_id.';

-- The table is already RLS-enabled. Keep explicit Data API access because this
-- project disables automatic exposure for newly created database objects.
grant select, insert, update, delete on public.nutrition_plans to authenticated;
