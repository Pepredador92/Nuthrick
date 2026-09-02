-- Patient history refactor: keep every consultation and longitudinal record
-- independent while preparing safe integration points for questionnaires/plans.

alter table public.patients
  add column if not exists archived_at timestamptz;

create index if not exists patients_owner_archived_idx
  on public.patients (professional_id, archived_at desc nulls last);

alter table public.consultations
  add column if not exists consultation_type text default 'follow_up',
  add column if not exists sequence_number integer default 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by professional_id, patient_id
      order by consultation_date, created_at, id
    ) - 1 as sequence_number
  from public.consultations
)
update public.consultations c
set
  sequence_number = ranked.sequence_number,
  consultation_type = case when ranked.sequence_number = 0 then 'initial' else 'follow_up' end
from ranked
where c.id = ranked.id;

alter table public.consultations
  alter column consultation_type set not null,
  alter column sequence_number set not null;

alter table public.consultations
  drop constraint if exists consultations_consultation_type_check,
  drop constraint if exists consultations_sequence_number_check;

alter table public.consultations
  add constraint consultations_consultation_type_check
    check (consultation_type in ('initial', 'follow_up')),
  add constraint consultations_sequence_number_check
    check (sequence_number >= 0),
  add constraint consultations_owner_sequence_unique
    unique (professional_id, patient_id, sequence_number);

alter table public.patient_measurements
  add column if not exists consultation_id uuid;

alter table public.patient_measurements
  drop constraint if exists patient_measurements_consultation_fkey;

alter table public.patient_measurements
  add constraint patient_measurements_consultation_fkey
    foreign key (professional_id, consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id);

create index if not exists patient_measurements_consultation_idx
  on public.patient_measurements (professional_id, consultation_id, measured_at desc);

create table if not exists public.patient_notes (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  consultation_id uuid,
  content text not null check (char_length(btrim(content)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (professional_id, id),
  foreign key (professional_id, patient_id)
    references public.patients (professional_id, id) on delete cascade,
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id)
);

create index if not exists patient_notes_patient_updated_idx
  on public.patient_notes (professional_id, patient_id, updated_at desc)
  where deleted_at is null;

create trigger patient_notes_updated_at
before update on public.patient_notes
for each row execute function private.set_updated_at();

create table if not exists public.questionnaire_submissions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  consultation_id uuid,
  questionnaire_type text not null default 'initial'
    check (questionnaire_type in ('initial', 'follow_up')),
  version integer not null default 1 check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'completed')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, id),
  foreign key (professional_id, patient_id)
    references public.patients (professional_id, id) on delete cascade,
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id)
);

create index if not exists questionnaire_submissions_consultation_idx
  on public.questionnaire_submissions (professional_id, consultation_id, created_at desc);

create trigger questionnaire_submissions_updated_at
before update on public.questionnaire_submissions
for each row execute function private.set_updated_at();

create table if not exists public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  submission_id uuid not null,
  section_key text not null check (char_length(btrim(section_key)) between 1 and 80),
  question_key text not null check (char_length(btrim(question_key)) between 1 and 120),
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, id),
  unique (professional_id, submission_id, question_key),
  foreign key (professional_id, submission_id)
    references public.questionnaire_submissions (professional_id, id) on delete cascade
);

create index if not exists questionnaire_responses_submission_idx
  on public.questionnaire_responses (professional_id, submission_id, section_key);

create trigger questionnaire_responses_updated_at
before update on public.questionnaire_responses
for each row execute function private.set_updated_at();

create table if not exists public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  consultation_id uuid,
  assigned_at date not null default current_date,
  review_date date,
  plan_type text,
  category text,
  target_calories integer check (target_calories is null or target_calories between 1 and 10000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, id),
  foreign key (professional_id, patient_id)
    references public.patients (professional_id, id) on delete cascade,
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id),
  check (review_date is null or review_date >= assigned_at)
);

create index if not exists nutrition_plans_patient_date_idx
  on public.nutrition_plans (professional_id, patient_id, assigned_at desc);

create trigger nutrition_plans_updated_at
before update on public.nutrition_plans
for each row execute function private.set_updated_at();

alter table public.patient_notes enable row level security;
alter table public.questionnaire_submissions enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.nutrition_plans enable row level security;

drop policy if exists patient_notes_owner_all on public.patient_notes;
create policy patient_notes_owner_all on public.patient_notes for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

drop policy if exists questionnaire_submissions_owner_all on public.questionnaire_submissions;
create policy questionnaire_submissions_owner_all on public.questionnaire_submissions for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

drop policy if exists questionnaire_responses_owner_all on public.questionnaire_responses;
create policy questionnaire_responses_owner_all on public.questionnaire_responses for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

drop policy if exists nutrition_plans_owner_all on public.nutrition_plans;
create policy nutrition_plans_owner_all on public.nutrition_plans for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

grant select, insert, update, delete on public.patient_notes to authenticated;
grant select, insert, update, delete on public.questionnaire_submissions to authenticated;
grant select, insert, update, delete on public.questionnaire_responses to authenticated;
grant select, insert, update, delete on public.nutrition_plans to authenticated;
