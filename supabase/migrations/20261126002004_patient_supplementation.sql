begin;

create table public.patient_supplementation (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid(),
  patient_id uuid not null,
  consultation_id uuid,
  items jsonb not null check (private.valid_diet_supplements(items) and jsonb_array_length(items) > 0),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(tags) <= 12 and array_position(tags, null) is null
    and char_length(array_to_string(tags, ',')) <= 731),
  foreign key (professional_id, patient_id) references public.patients (professional_id, id) on delete cascade,
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id) on delete set null (consultation_id)
);

create index patient_supplementation_history_idx
  on public.patient_supplementation (professional_id, patient_id, created_at desc, id desc);
create index patient_supplementation_consultation_idx
  on public.patient_supplementation (professional_id, consultation_id, patient_id)
  where consultation_id is not null;

create trigger patient_supplementation_updated_at before update on public.patient_supplementation
  for each row execute function private.set_updated_at();

alter table public.patient_supplementation enable row level security;
revoke all on public.patient_supplementation from public, anon, authenticated;
grant select on public.patient_supplementation to authenticated;
grant insert (id, patient_id, consultation_id, items, tags) on public.patient_supplementation to authenticated;
grant update (consultation_id, items, tags) on public.patient_supplementation to authenticated;

create policy patient_supplementation_read on public.patient_supplementation for select to authenticated
  using (professional_id = (select auth.uid()) and (select private.my_read_feature('consultations'))
    and exists (select 1 from public.patients p
      where p.id = patient_id and p.professional_id = (select auth.uid()) and p.deleted_at is null));
create policy patient_supplementation_insert on public.patient_supplementation for insert to authenticated
  with check (professional_id = (select auth.uid()) and (select private.my_feature('consultations'))
    and exists (select 1 from public.patients p
      where p.id = patient_id and p.professional_id = (select auth.uid()) and p.deleted_at is null));
create policy patient_supplementation_update on public.patient_supplementation for update to authenticated
  using (professional_id = (select auth.uid()) and (select private.my_feature('consultations'))
    and exists (select 1 from public.patients p
      where p.id = patient_id and p.professional_id = (select auth.uid()) and p.deleted_at is null))
  with check (professional_id = (select auth.uid()) and (select private.my_feature('consultations'))
    and exists (select 1 from public.patients p
      where p.id = patient_id and p.professional_id = (select auth.uid()) and p.deleted_at is null));

commit;
