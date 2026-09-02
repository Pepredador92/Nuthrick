-- Nuthrick v1: private patient records and clinical follow-up.
-- Every row carries the professional owner so RLS remains explicit on all
-- relations (including join tables and Storage metadata).

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  email text check (email is null or (char_length(email) <= 320 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  country_code text check (country_code is null or country_code ~ '^\+[1-9][0-9]{0,2}$'),
  timezone text not null default 'America/Mexico_City' check (timezone ~ '^[A-Za-z_]+/[A-Za-z0-9_+\-/]+$'),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg between 0.1 and 1000),
  height_cm numeric(6,2) check (height_cm is null or height_cm between 20 and 300),
  gender text check (gender is null or gender in ('female','male','non_binary','prefer_not_to_say','other')),
  birth_date date,
  portal_access_enabled boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (professional_id, id)
);

create table public.patient_tags (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null default '#7A9D8D' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (professional_id, id),
  unique (professional_id, name)
);

create table public.patient_tag_assignments (
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (patient_id, tag_id),
  foreign key (professional_id, patient_id) references public.patients(professional_id, id) on delete cascade,
  foreign key (professional_id, tag_id) references public.patient_tags(professional_id, id) on delete cascade
);

create table public.patient_measurements (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  measured_at timestamptz not null default now(),
  weight_kg numeric(6,2) not null check (weight_kg between 0.1 and 1000),
  height_cm numeric(6,2) not null check (height_cm between 20 and 300),
  bmi numeric(6,2) generated always as (round((weight_kg / power(height_cm / 100, 2))::numeric, 2)) stored,
  ideal_weight_kg numeric(6,2) check (ideal_weight_kg is null or ideal_weight_kg between 0.1 and 1000),
  ideal_weight_method text check (ideal_weight_method is null or char_length(ideal_weight_method) <= 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (professional_id, id),
  foreign key (professional_id, patient_id) references public.patients(professional_id, id) on delete cascade
);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  consultation_date timestamptz not null default now(),
  status text not null default 'completed' check (status in ('planned','completed','cancelled')),
  summary text check (summary is null or char_length(summary) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, id),
  foreign key (professional_id, patient_id) references public.patients(professional_id, id) on delete cascade
);

create table public.consultation_notes (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  consultation_id uuid not null,
  patient_id uuid not null,
  note text not null check (char_length(btrim(note)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, consultation_id),
  foreign key (professional_id, consultation_id) references public.consultations(professional_id, id) on delete cascade,
  foreign key (professional_id, patient_id) references public.patients(professional_id, id) on delete cascade
);

create table public.patient_progress_photos (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  storage_path text not null unique,
  captured_at date not null default current_date,
  caption text check (caption is null or char_length(caption) <= 200),
  created_at timestamptz not null default now(),
  foreign key (professional_id, patient_id) references public.patients(professional_id, id) on delete cascade,
  check (storage_path ~ '^[0-9a-f-]{36}/patients/[0-9a-f-]{36}/[A-Za-z0-9._-]+$')
);

create index patients_owner_created_idx on public.patients (professional_id, created_at desc, id desc);
create index patients_owner_activity_idx on public.patients (professional_id, last_activity_at desc nulls last);
create index patients_owner_status_idx on public.patients (professional_id, status, created_at desc);
create index patients_name_search_idx on public.patients using gin (to_tsvector('simple', full_name));
create index patients_email_search_idx on public.patients (professional_id, lower(email)) where email is not null;
create index patient_tags_owner_name_idx on public.patient_tags (professional_id, lower(name));
create index patient_tag_assignments_tag_idx on public.patient_tag_assignments (professional_id, tag_id, patient_id);
create index patient_measurements_patient_date_idx on public.patient_measurements (professional_id, patient_id, measured_at desc);
create index consultations_patient_date_idx on public.consultations (professional_id, patient_id, consultation_date desc);
create index consultation_notes_patient_idx on public.consultation_notes (professional_id, patient_id, updated_at desc);
create index patient_progress_photos_patient_date_idx on public.patient_progress_photos (professional_id, patient_id, captured_at desc);

create or replace function private.validate_patient_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.full_name := btrim(new.full_name);
  if new.birth_date is not null and new.birth_date > current_date then
    raise exception 'La fecha de nacimiento no puede estar en el futuro' using errcode = '23514';
  end if;
  if new.portal_access_enabled and nullif(btrim(new.email), '') is null then
    raise exception 'El acceso al portal requiere un correo electrónico' using errcode = '23514';
  end if;
  if new.phone is not null and new.country_code is null then
    raise exception 'El teléfono requiere lada de país' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger patients_updated_at before update on public.patients for each row execute function private.set_updated_at();
create trigger consultations_updated_at before update on public.consultations for each row execute function private.set_updated_at();
create trigger consultation_notes_updated_at before update on public.consultation_notes for each row execute function private.set_updated_at();
create trigger patients_validate_fields before insert or update on public.patients for each row execute function private.validate_patient_fields();

alter table public.patients enable row level security;
alter table public.patient_tags enable row level security;
alter table public.patient_tag_assignments enable row level security;
alter table public.patient_measurements enable row level security;
alter table public.consultations enable row level security;
alter table public.consultation_notes enable row level security;
alter table public.patient_progress_photos enable row level security;

create policy patients_owner_all on public.patients for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy patient_tags_owner_all on public.patient_tags for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy patient_tag_assignments_owner_all on public.patient_tag_assignments for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy patient_measurements_owner_all on public.patient_measurements for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy consultations_owner_all on public.consultations for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy consultation_notes_owner_all on public.consultation_notes for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy patient_progress_photos_owner_all on public.patient_progress_photos for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.patient_tags to authenticated;
grant select, insert, update, delete on public.patient_tag_assignments to authenticated;
grant select, insert, update, delete on public.patient_measurements to authenticated;
grant select, insert, update, delete on public.consultations to authenticated;
grant select, insert, update, delete on public.consultation_notes to authenticated;
grant select, insert, update, delete on public.patient_progress_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-progress', 'patient-progress', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy patient_progress_owner_select on storage.objects for select to authenticated
using (
  bucket_id = 'patient-progress'
  and name ~ '^[0-9a-f-]{36}/patients/[0-9a-f-]{36}/[^/]+$'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (select 1 from public.patients p where p.id = (storage.foldername(name))[3]::uuid and p.professional_id = (select auth.uid()))
);
create policy patient_progress_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'patient-progress'
  and name ~ '^[0-9a-f-]{36}/patients/[0-9a-f-]{36}/[^/]+$'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
  and exists (select 1 from public.patients p where p.id = (storage.foldername(name))[3]::uuid and p.professional_id = (select auth.uid()))
);
create policy patient_progress_owner_update on storage.objects for update to authenticated
using (bucket_id = 'patient-progress' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (
  bucket_id = 'patient-progress'
  and name ~ '^[0-9a-f-]{36}/patients/[0-9a-f-]{36}/[^/]+$'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
  and exists (select 1 from public.patients p where p.id = (storage.foldername(name))[3]::uuid and p.professional_id = (select auth.uid()))
);
create policy patient_progress_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'patient-progress'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
