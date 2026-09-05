-- Objective 8: laboratory reports are deliberately separate from measurements.
-- A reported result always belongs to one report and retains a documentary
-- snapshot of the analyte and the laboratory-provided reference interval.

create table public.laboratory_reports (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  consultation_id uuid not null,
  report_name text check (report_name is null or char_length(btrim(report_name)) between 1 and 180),
  laboratory_name text check (laboratory_name is null or char_length(btrim(laboratory_name)) between 1 and 180),
  sample_date date,
  sample_time time,
  report_date date,
  fasting_status text not null default 'unknown'
    check (fasting_status in ('fasting', 'not_fasting', 'unknown')),
  fasting_hours numeric(5,2) check (fasting_hours is null or fasting_hours between 0 and 72),
  sample_type text check (sample_type is null or char_length(btrim(sample_type)) between 1 and 120),
  analytical_method text check (analytical_method is null or char_length(btrim(analytical_method)) between 1 and 280),
  notes text check (notes is null or char_length(notes) <= 4000),
  external_identifier text check (external_identifier is null or char_length(btrim(external_identifier)) between 1 and 180),
  capture_origin text not null default 'manual'
    check (capture_origin in ('manual', 'imported', 'integration', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, id),
  foreign key (professional_id, patient_id)
    references public.patients(professional_id, id) on delete cascade,
  foreign key (professional_id, consultation_id)
    references public.consultations(professional_id, id) on delete cascade
);

create table public.laboratory_custom_analytes (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  first_report_id uuid references public.laboratory_reports(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 180),
  clinical_name text check (clinical_name is null or char_length(btrim(clinical_name)) between 1 and 220),
  result_kind text not null default 'text'
    check (result_kind in ('numeric', 'qualitative', 'ordinal', 'text')),
  default_unit text check (default_unit is null or char_length(btrim(default_unit)) between 1 and 64),
  synonyms text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, id)
);

create table public.laboratory_results (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid()
    references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  consultation_id uuid not null,
  report_id uuid not null,
  analyte_id text references public.measurement_types(id),
  custom_analyte_id uuid,
  analyte_code_snapshot text,
  analyte_name_snapshot text not null check (char_length(btrim(analyte_name_snapshot)) between 1 and 180),
  analyte_clinical_name_snapshot text,
  analyte_synonyms_snapshot text[] not null default '{}'::text[],
  result_kind text not null check (result_kind in ('numeric', 'qualitative', 'ordinal', 'text')),
  numeric_comparator text check (numeric_comparator is null or numeric_comparator in ('<', '>', '<=', '>=')),
  numeric_value numeric,
  text_value text,
  result_value_original text not null check (char_length(btrim(result_value_original)) between 1 and 500),
  unit text check (unit is null or char_length(btrim(unit)) between 1 and 64),
  reference_text text check (reference_text is null or char_length(reference_text) <= 500),
  reference_lower numeric,
  reference_upper numeric,
  reference_lower_inclusive boolean not null default true,
  reference_upper_inclusive boolean not null default true,
  reference_unit text check (reference_unit is null or char_length(btrim(reference_unit)) between 1 and 64),
  laboratory_flag text check (laboratory_flag is null or char_length(btrim(laboratory_flag)) between 1 and 80),
  range_comparison text not null default 'not_comparable'
    check (range_comparison in ('in_range', 'below', 'above', 'not_comparable')),
  result_source text not null default 'laboratory' check (result_source = 'laboratory'),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, id),
  foreign key (professional_id, patient_id)
    references public.patients(professional_id, id) on delete cascade,
  foreign key (professional_id, consultation_id)
    references public.consultations(professional_id, id) on delete cascade,
  foreign key (professional_id, report_id)
    references public.laboratory_reports(professional_id, id) on delete cascade,
  foreign key (professional_id, custom_analyte_id)
    references public.laboratory_custom_analytes(professional_id, id),
  check ((analyte_id is null) <> (custom_analyte_id is null)),
  check (
    (result_kind = 'numeric' and numeric_value is not null and text_value is null)
    or (result_kind in ('qualitative', 'ordinal', 'text') and numeric_value is null and char_length(btrim(coalesce(text_value, ''))) between 1 and 500)
  ),
  check (reference_lower is null or reference_upper is null or reference_lower <= reference_upper)
);

create table public.laboratory_panel_templates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid references public.professional_profiles(id) on delete cascade,
  code text,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_system and professional_id is null) or (not is_system and professional_id is not null))
);

create unique index laboratory_panel_templates_system_code_key
  on public.laboratory_panel_templates(code) where is_system;

create table public.laboratory_panel_template_items (
  template_id uuid not null references public.laboratory_panel_templates(id) on delete cascade,
  analyte_id text not null references public.measurement_types(id),
  display_order integer not null default 0 check (display_order >= 0),
  primary key (template_id, analyte_id)
);

create index laboratory_reports_consultation_idx
  on public.laboratory_reports(professional_id, consultation_id, created_at);
create index laboratory_reports_patient_idx
  on public.laboratory_reports(professional_id, patient_id, sample_date desc nulls last, created_at desc);
create index laboratory_custom_analytes_owner_idx
  on public.laboratory_custom_analytes(professional_id, lower(display_name));
create index laboratory_results_report_idx
  on public.laboratory_results(professional_id, report_id, created_at);
create index laboratory_results_patient_analyte_idx
  on public.laboratory_results(professional_id, patient_id, analyte_id, created_at desc)
  where analyte_id is not null;
create index laboratory_results_patient_custom_analyte_idx
  on public.laboratory_results(professional_id, patient_id, custom_analyte_id, created_at desc)
  where custom_analyte_id is not null;
create index laboratory_panel_template_items_analyte_idx
  on public.laboratory_panel_template_items(analyte_id);

alter table public.laboratory_reports enable row level security;
alter table public.laboratory_custom_analytes enable row level security;
alter table public.laboratory_results enable row level security;
alter table public.laboratory_panel_templates enable row level security;
alter table public.laboratory_panel_template_items enable row level security;

revoke all on public.laboratory_reports, public.laboratory_custom_analytes,
  public.laboratory_results, public.laboratory_panel_templates,
  public.laboratory_panel_template_items from public, anon, authenticated;
grant select, insert, update, delete on public.laboratory_reports,
  public.laboratory_custom_analytes, public.laboratory_results,
  public.laboratory_panel_templates, public.laboratory_panel_template_items to authenticated;

create policy laboratory_reports_select on public.laboratory_reports for select to authenticated
  using ((select auth.uid()) = professional_id);
create policy laboratory_reports_insert on public.laboratory_reports for insert to authenticated
  with check (
    (select auth.uid()) = professional_id
    and exists (select 1 from public.consultations c where c.id = laboratory_reports.consultation_id and c.patient_id = laboratory_reports.patient_id and c.professional_id = (select auth.uid()) and c.status = 'draft')
  );
create policy laboratory_reports_update on public.laboratory_reports for update to authenticated
  using ((select auth.uid()) = professional_id and exists (select 1 from public.consultations c where c.id = laboratory_reports.consultation_id and c.professional_id = (select auth.uid()) and c.status = 'draft'))
  with check ((select auth.uid()) = professional_id and exists (select 1 from public.consultations c where c.id = laboratory_reports.consultation_id and c.patient_id = laboratory_reports.patient_id and c.professional_id = (select auth.uid()) and c.status = 'draft'));
create policy laboratory_reports_delete on public.laboratory_reports for delete to authenticated
  using ((select auth.uid()) = professional_id and exists (select 1 from public.consultations c where c.id = laboratory_reports.consultation_id and c.professional_id = (select auth.uid()) and c.status = 'draft'));

create policy laboratory_custom_analytes_owner_all on public.laboratory_custom_analytes for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

create policy laboratory_results_select on public.laboratory_results for select to authenticated
  using ((select auth.uid()) = professional_id);
create policy laboratory_results_insert on public.laboratory_results for insert to authenticated
  with check (
    (select auth.uid()) = professional_id
    and exists (select 1 from public.laboratory_reports r join public.consultations c on c.id = r.consultation_id where r.id = laboratory_results.report_id and r.patient_id = laboratory_results.patient_id and r.consultation_id = laboratory_results.consultation_id and r.professional_id = (select auth.uid()) and c.status = 'draft')
  );
create policy laboratory_results_update on public.laboratory_results for update to authenticated
  using ((select auth.uid()) = professional_id and exists (select 1 from public.laboratory_reports r join public.consultations c on c.id = r.consultation_id where r.id = laboratory_results.report_id and r.professional_id = (select auth.uid()) and c.status = 'draft'))
  with check ((select auth.uid()) = professional_id and exists (select 1 from public.laboratory_reports r join public.consultations c on c.id = r.consultation_id where r.id = laboratory_results.report_id and r.patient_id = laboratory_results.patient_id and r.consultation_id = laboratory_results.consultation_id and r.professional_id = (select auth.uid()) and c.status = 'draft'));
create policy laboratory_results_delete on public.laboratory_results for delete to authenticated
  using ((select auth.uid()) = professional_id and exists (select 1 from public.laboratory_reports r join public.consultations c on c.id = r.consultation_id where r.id = laboratory_results.report_id and r.professional_id = (select auth.uid()) and c.status = 'draft'));

create policy laboratory_panel_templates_select on public.laboratory_panel_templates for select to authenticated
  using (is_system or professional_id = (select auth.uid()));
create policy laboratory_panel_templates_private_write on public.laboratory_panel_templates for all to authenticated
  using (professional_id = (select auth.uid()) and not is_system)
  with check (professional_id = (select auth.uid()) and not is_system);
create policy laboratory_panel_template_items_select on public.laboratory_panel_template_items for select to authenticated
  using (exists (select 1 from public.laboratory_panel_templates t where t.id = template_id and (t.is_system or t.professional_id = (select auth.uid()))));
create policy laboratory_panel_template_items_private_write on public.laboratory_panel_template_items for all to authenticated
  using (exists (select 1 from public.laboratory_panel_templates t where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system))
  with check (exists (select 1 from public.laboratory_panel_templates t join public.measurement_types m on m.id = analyte_id where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system and m.created_by is null and m.category = 'laboratory' and m.is_active));

create function private.validate_laboratory_report()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare report_record public.laboratory_reports := case when tg_op = 'DELETE' then old else new end;
begin
  if (select auth.uid()) is null or report_record.professional_id <> (select auth.uid()) then
    raise insufficient_privilege using message = 'Laboratory report is unavailable';
  end if;
  if not exists (
    select 1 from public.consultations c
    where c.id = report_record.consultation_id and c.patient_id = report_record.patient_id
      and c.professional_id = report_record.professional_id and c.status = 'draft'
  ) then
    raise exception 'Laboratory reports require an owned draft consultation' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function private.validate_laboratory_custom_analyte()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null or new.professional_id <> (select auth.uid()) then
    raise insufficient_privilege using message = 'Custom analyte is unavailable';
  end if;
  if new.first_report_id is not null and not exists (
    select 1 from public.laboratory_reports r
    where r.id = new.first_report_id and r.professional_id = new.professional_id
  ) then
    raise exception 'Custom analyte report is unavailable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end;
$$;

create function private.validate_laboratory_result()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  result_record public.laboratory_results := case when tg_op = 'DELETE' then old else new end;
  report_record public.laboratory_reports;
  catalog public.measurement_types;
  custom public.laboratory_custom_analytes;
begin
  if (select auth.uid()) is null or result_record.professional_id <> (select auth.uid()) then
    raise insufficient_privilege using message = 'Laboratory result is unavailable';
  end if;
  select * into report_record from public.laboratory_reports
    where id = result_record.report_id and professional_id = result_record.professional_id;
  if report_record.id is null or report_record.patient_id <> result_record.patient_id
    or report_record.consultation_id <> result_record.consultation_id
    or not exists (select 1 from public.consultations c where c.id = report_record.consultation_id and c.professional_id = report_record.professional_id and c.status = 'draft') then
    raise exception 'Laboratory result requires an owned draft report' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.analyte_id is not null then
    select * into catalog from public.measurement_types
      where id = new.analyte_id and created_by is null and category = 'laboratory' and is_active;
    if catalog.id is null then raise exception 'Laboratory analyte is unavailable' using errcode = '23514'; end if;
    new.analyte_code_snapshot := catalog.code;
    new.analyte_name_snapshot := catalog.display_name;
    new.analyte_clinical_name_snapshot := catalog.clinical_name;
    new.analyte_synonyms_snapshot := coalesce(catalog.synonyms, '{}'::text[]);
  else
    select * into custom from public.laboratory_custom_analytes
      where id = new.custom_analyte_id and professional_id = new.professional_id;
    if custom.id is null then raise exception 'Custom laboratory analyte is unavailable' using errcode = '23514'; end if;
    new.analyte_code_snapshot := null;
    new.analyte_name_snapshot := custom.display_name;
    new.analyte_clinical_name_snapshot := custom.clinical_name;
    new.analyte_synonyms_snapshot := coalesce(custom.synonyms, '{}'::text[]);
  end if;

  new.result_source := 'laboratory';
  new.unit := nullif(btrim(new.unit), '');
  new.reference_unit := nullif(btrim(new.reference_unit), '');
  new.reference_text := nullif(btrim(new.reference_text), '');
  new.laboratory_flag := nullif(btrim(new.laboratory_flag), '');

  if new.result_kind = 'numeric' and new.numeric_comparator is null
    and new.unit is not null and new.reference_unit is not null
    and lower(new.unit) = lower(new.reference_unit)
    and (new.reference_lower is not null or new.reference_upper is not null) then
    if new.reference_lower is not null and (new.numeric_value < new.reference_lower or (new.numeric_value = new.reference_lower and not new.reference_lower_inclusive)) then
      new.range_comparison := 'below';
    elsif new.reference_upper is not null and (new.numeric_value > new.reference_upper or (new.numeric_value = new.reference_upper and not new.reference_upper_inclusive)) then
      new.range_comparison := 'above';
    else
      new.range_comparison := 'in_range';
    end if;
  else
    new.range_comparison := 'not_comparable';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end;
$$;

create trigger laboratory_reports_validate before insert or update or delete on public.laboratory_reports
  for each row execute function private.validate_laboratory_report();
create trigger laboratory_custom_analytes_validate before insert or update on public.laboratory_custom_analytes
  for each row execute function private.validate_laboratory_custom_analyte();
create trigger laboratory_results_validate before insert or update or delete on public.laboratory_results
  for each row execute function private.validate_laboratory_result();
create trigger laboratory_reports_updated_at before update on public.laboratory_reports
  for each row execute function private.set_updated_at();
create trigger laboratory_custom_analytes_updated_at before update on public.laboratory_custom_analytes
  for each row execute function private.set_updated_at();
create trigger laboratory_results_updated_at before update on public.laboratory_results
  for each row execute function private.set_updated_at();
create trigger laboratory_panel_templates_updated_at before update on public.laboratory_panel_templates
  for each row execute function private.set_updated_at();

revoke all on function private.validate_laboratory_report(),
  private.validate_laboratory_custom_analyte(), private.validate_laboratory_result() from public, anon;
grant execute on function private.validate_laboratory_report(),
  private.validate_laboratory_custom_analyte(), private.validate_laboratory_result() to authenticated;

update public.measurement_types
set synonyms = array(select distinct unnest(synonyms || array['GOT']))
where id = 'ast' and created_by is null and category = 'laboratory';

insert into public.laboratory_panel_templates(code, name, description, is_system)
values
  ('lipid_profile', 'Perfil lipídico', 'Colesterol total, HDL, LDL y triglicéridos.', true),
  ('hepatic_function', 'Función hepática', 'Transaminasas, GGT, fosfatasa alcalina, bilirrubinas y proteínas.', true),
  ('renal_function', 'Función renal', 'Urea, BUN, creatinina, ácido úrico y albuminuria.', true),
  ('thyroid_profile', 'Perfil tiroideo', 'TSH y hormonas tiroideas reportadas.', true),
  ('complete_blood_count', 'Biometría hemática', 'Serie roja, leucocitos y plaquetas.', true),
  ('urinalysis', 'Examen general de orina', 'Analitos habituales de orina general.', true)
on conflict (code) where is_system do update set name = excluded.name, description = excluded.description;

with template_items(template_code, analyte_id, display_order) as (
  values
    ('lipid_profile', 'total_cholesterol', 10), ('lipid_profile', 'hdl_cholesterol', 20), ('lipid_profile', 'ldl_cholesterol', 30), ('lipid_profile', 'triglycerides', 40),
    ('hepatic_function', 'ast', 10), ('hepatic_function', 'alt', 20), ('hepatic_function', 'ggt', 30), ('hepatic_function', 'alkaline_phosphatase', 40), ('hepatic_function', 'total_bilirubin', 50), ('hepatic_function', 'direct_bilirubin', 60), ('hepatic_function', 'total_proteins', 70), ('hepatic_function', 'serum_albumin', 80),
    ('renal_function', 'urea', 10), ('renal_function', 'blood_urea_nitrogen', 20), ('renal_function', 'serum_creatinine', 30), ('renal_function', 'uric_acid', 40), ('renal_function', 'microalbuminuria', 50), ('renal_function', 'urine_albumin', 60),
    ('thyroid_profile', 'tsh', 10), ('thyroid_profile', 'total_t4', 20), ('thyroid_profile', 'free_t4', 30), ('thyroid_profile', 'total_t3', 40), ('thyroid_profile', 'free_t3', 50),
    ('complete_blood_count', 'erythrocytes', 10), ('complete_blood_count', 'hemoglobin', 20), ('complete_blood_count', 'hematocrit', 30), ('complete_blood_count', 'mcv', 40), ('complete_blood_count', 'mch', 50), ('complete_blood_count', 'mchc', 60), ('complete_blood_count', 'rdw', 70), ('complete_blood_count', 'leukocytes', 80), ('complete_blood_count', 'platelets', 90),
    ('urinalysis', 'urine_color', 10), ('urinalysis', 'urine_appearance', 20), ('urinalysis', 'urine_specific_gravity', 30), ('urinalysis', 'urine_ph', 40), ('urinalysis', 'urine_proteins', 50), ('urinalysis', 'urine_glucose', 60), ('urinalysis', 'urine_ketones', 70), ('urinalysis', 'urine_blood', 80), ('urinalysis', 'urine_nitrites', 90), ('urinalysis', 'urine_leukocyte_esterase', 100), ('urinalysis', 'urine_leukocytes', 110), ('urinalysis', 'urine_erythrocytes', 120), ('urinalysis', 'urine_bacteria', 130)
)
insert into public.laboratory_panel_template_items(template_id, analyte_id, display_order)
select t.id, item.analyte_id, item.display_order
from template_items item
join public.laboratory_panel_templates t on t.code = item.template_code and t.is_system
join public.measurement_types m on m.id = item.analyte_id and m.created_by is null and m.category = 'laboratory'
on conflict (template_id, analyte_id) do update set display_order = excluded.display_order;
