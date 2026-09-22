-- Extend the existing service-only, owner-scoped loader; preserve its auth,
-- revision and catalog rules. No new public endpoint or access grant.
do $$
declare old_definition text; new_definition text;
begin
  select pg_get_functiondef('public.ai_diet_source(uuid,uuid,integer)'::regprocedure) into old_definition;
  new_definition := replace(old_definition,
    'return jsonb_build_object(''source'',source||jsonb_build_object(''stamp'',md5(source::text)),',
    $replacement$
  -- Never load recall narrative/rawText or any temporary AI interpretation.
  if s.clinical_records->'recall'->>'approved_at' is not null then
    source := source || jsonb_build_object('confirmedRecall',jsonb_build_object(
      'approved_at',s.clinical_records->'recall'->>'approved_at',
      'items',(select coalesce(jsonb_agg(jsonb_build_object(
        'mealLabel',i->>'mealLabel','quantity',i->'quantity','unit',i->>'unit',
        'food',jsonb_build_object('name',i->'food'->>'name','group_code',i->'food'->>'group_code',
          'portion_amount',i->'food'->'portion_amount','portion_unit',i->'food'->>'portion_unit'))),'[]')
        from jsonb_array_elements(s.clinical_records->'recall'->'items') i)));
  end if;
  -- Persisted consultation measurements only, never the patient's entire history.
  -- Multiple composition methods without a designated choice are omitted rather
  -- than selecting an arbitrary result. Stale calculations are not sent.
  source := source || jsonb_build_object('anthropometry',coalesce((
    with direct_rows as (
      select case m.measurement_type_id when 'weight' then 'weightKg' when 'height' then 'heightCm'
        when 'waist_circumference' then 'waistCm' when 'body_fat_percentage_device' then 'bodyFatPct'
        when 'fat_free_mass_device' then 'leanMassKg' end as key,m.value
      from public.consultation_measurements m
      where m.professional_id=p_owner and m.patient_id=p.patient_id and m.consultation_id=p.consultation_id
        and jsonb_typeof(m.value)='number'
        and ((m.measurement_type_id in ('weight','fat_free_mass_device') and m.unit='kg')
          or (m.measurement_type_id in ('height','waist_circumference') and m.unit='cm')
          or (m.measurement_type_id='body_fat_percentage_device' and m.unit='%'))
    ), direct as (
      select key,jsonb_agg(value)->0 as value from direct_rows group by key having count(distinct value)=1
    ), derived as (
      select case m.result_key when 'bmi' then 'bmi' when 'body_fat_percentage' then 'bodyFatPct'
        when 'fat_free_mass' then 'leanMassKg' end as key,to_jsonb(min(m.raw_result)) as value
      from public.consultation_calculation_results m
      where m.professional_id=p_owner and m.patient_id=p.patient_id and m.consultation_id=p.consultation_id
        and ((m.result_key='bmi' and m.unit='kg/m²') or (m.result_key='body_fat_percentage' and m.unit='%')
          or (m.result_key='fat_free_mass' and m.unit='kg'))
        and not exists(select 1 from public.consultation_measurements newer
          where newer.professional_id=p_owner and newer.consultation_id=p.consultation_id and newer.updated_at>m.calculated_at)
      group by m.result_key having count(*)=1
    ) select jsonb_object_agg(key,value) from (select * from direct union all
      select * from derived d where not exists(select 1 from direct_rows r where r.key=d.key)) values_to_send
  ),'{}'));
  return jsonb_build_object('source',source||jsonb_build_object('stamp',md5(source::text)),
    $replacement$);
  if new_definition=old_definition then raise exception 'Unexpected ai_diet_source definition'; end if;
  execute new_definition;
end $$;

-- Version changes do not enable the feature or grant pilot access.
update private.ai_feature_config set prompt_version='diet_draft@2' where feature='diet_draft';
