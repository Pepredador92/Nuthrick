-- Snapshots are documentary history. Editing a saved value must never replace
-- the analyte label that was in force when the result was first captured.
alter table public.laboratory_results
  add constraint laboratory_results_numeric_comparator_kind_check
  check (result_kind = 'numeric' or numeric_comparator is null);

create or replace function private.validate_laboratory_result()
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

  if tg_op = 'UPDATE' and new.analyte_id is not distinct from old.analyte_id and new.custom_analyte_id is not distinct from old.custom_analyte_id then
    new.analyte_code_snapshot := old.analyte_code_snapshot;
    new.analyte_name_snapshot := old.analyte_name_snapshot;
    new.analyte_clinical_name_snapshot := old.analyte_clinical_name_snapshot;
    new.analyte_synonyms_snapshot := old.analyte_synonyms_snapshot;
  elsif new.analyte_id is not null then
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
    if new.reference_lower is not null and (new.numeric_value < new.reference_lower or (new.numeric_value = new.reference_lower and not new.reference_lower_inclusive)) then new.range_comparison := 'below';
    elsif new.reference_upper is not null and (new.numeric_value > new.reference_upper or (new.numeric_value = new.reference_upper and not new.reference_upper_inclusive)) then new.range_comparison := 'above';
    else new.range_comparison := 'in_range'; end if;
  else new.range_comparison := 'not_comparable'; end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end;
$$;
