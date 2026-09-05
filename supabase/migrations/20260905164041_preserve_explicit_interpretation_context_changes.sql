-- Preserve historical interpretations when a later catalogue adds context
-- fields, while still allowing an explicit change to existing clinical
-- context (for example gestation) to refresh a draft interpretation.

create or replace function private.snapshot_result_interpretation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.patients;
  c public.consultations;
  ctx jsonb;
  refs jsonb;
  stage text;
  pregnant boolean;
  w numeric;
  bmi numeric;
  age_years integer;
begin
  select * into c from public.consultations where id = new.consultation_id;
  select * into p from public.patients where id = new.patient_id;
  if c.professional_id is distinct from auth.uid() or c.status <> 'draft' then
    raise exception 'Interpretations require an owned draft' using errcode='42501';
  end if;
  select a.value #>> '{}' into stage
  from public.consultation_answers a
  join public.consultation_snapshots s
    on s.consultation_id=a.consultation_id and s.revision=a.revision
  where a.consultation_id=c.id and a.question_key='life_stage';
  pregnant := case
    when stage='Embarazo' then true
    when stage='Ninguna particular' then false
    else c.interpretation_pregnancy end;
  age_years := case when p.birth_date is null then null else
    extract(year from age((c.consultation_date at time zone p.timezone)::date,p.birth_date))::integer end;
  if age_years < 0 then age_years := null; end if;
  select (m.value #>> '{}')::numeric into w
  from public.consultation_measurements m
  join public.measurement_types t on t.id=m.measurement_type_id
  where m.consultation_id=c.id and t.code='weight';
  if w > 0 and p.height_cm > 0 then bmi := w / power(p.height_cm/100,2); end if;
  ctx := jsonb_build_object(
    'age',age_years,'sex',p.equation_sex,'birthDate',p.birth_date,
    'consultationDate',c.consultation_date,'timezone',p.timezone,
    'pregnant',pregnant,'bmi',bmi,
    'somatotypeEndomorphy',new.dependency_snapshot->'somatotype_endomorphy',
    'somatotypeMesomorphy',new.dependency_snapshot->'somatotype_mesomorphy',
    'somatotypeEctomorphy',new.dependency_snapshot->'somatotype_ectomorphy',
    'somatotypeCategory',private.heath_carter_somatotype_category(new.dependency_snapshot)
  );
  if tg_op='UPDATE'
    and new.raw_result=old.raw_result
    and new.input_snapshot=old.input_snapshot
    and new.dependency_snapshot=old.dependency_snapshot
    and new.result_values=old.result_values
    and (
      old.interpretation_snapshot is null
      or ctx @> coalesce(old.interpretation_snapshot->'context','{}'::jsonb)
    )
  then
    new.interpretation_snapshot := old.interpretation_snapshot;
    return new;
  end if;
  select coalesce(jsonb_agg(definition order by id,version),'[]') into refs
  from public.interpretation_references where active;
  new.interpretation_snapshot := private.interpret_result(
    new.calculation_code,new.raw_result,new.unit,ctx,refs,new.consultation_id
  );
  return new;
end;
$$;
