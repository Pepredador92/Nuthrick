-- Synthetic context only. No provider calls, credit consumption or saved fixtures.
begin;
do $$
declare
  pro uuid; pat uuid; initial_visit uuid; current_visit uuid; visit uuid;
  report uuid; analyte uuid; context jsonb; stamp text; rejected boolean; i integer;
begin
  select id into pro from public.professional_profiles
    where private.can_use_feature(id,'consultations') and private.can_use_feature(id,'patients')
      and private.get_limit(id,'consultations.monthly_limit')='"unlimited"'::jsonb
      and private.get_limit(id,'patients.limit')='"unlimited"'::jsonb order by id limit 1;
  if pro is null then raise exception 'No eligible fixture owner'; end if;
  perform set_config('request.jwt.claim.sub',pro::text,true);
  insert into public.patients(professional_id,full_name,weight_kg,height_cm)
    values(pro,'SYNTHETIC comprehensive PES',92,170) returning id into pat;
  insert into public.laboratory_custom_analytes(professional_id,display_name,result_kind,default_unit)
    values(pro,'SYNTHETIC PES laboratory indicator','numeric','mg/dL') returning id into analyte;
  for i in 0..1 loop
    insert into public.consultations(professional_id,patient_id,consultation_date,sequence_number,consultation_type,status)
      values(pro,pat,'2026-09-01'::timestamptz+i*interval '1 month',i+1,
        case when i=0 then 'initial' else 'follow_up' end,'draft') returning id into visit;
    if i=0 then initial_visit:=visit; else current_visit:=visit; end if;
    insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,template_name,template_version,structure)
      values(pro,pat,visit,1,'Synthetic',1,
        '{"sections":[{"section_key":"synthetic","questions":[{"question_key":"barriers","question_type":"long_text","response_area":"professional_assessment"}]}]}');
    insert into public.consultation_answers(professional_id,patient_id,consultation_id,revision,section_key,response_area,question_key,value)
      values(pro,pat,visit,1,'synthetic','professional_assessment','barriers','"Barrera documentada de planificación"');
    insert into public.consultation_measurements(professional_id,patient_id,consultation_id,measurement_type_id,value,unit,data_type,measured_at)
      values(pro,pat,visit,'weight',to_jsonb(92+i),'kg','number','2026-09-01'::timestamptz+i*interval '1 month');
    insert into public.laboratory_reports(professional_id,patient_id,consultation_id,sample_date,report_date,analytical_method)
      values(pro,pat,visit,('2026-09-01'::date+i*interval '1 month')::date,
        ('2026-09-01'::date+i*interval '1 month')::date,'Método documentado') returning id into report;
    insert into public.laboratory_results(professional_id,patient_id,consultation_id,report_id,custom_analyte_id,
      analyte_name_snapshot,result_kind,numeric_value,result_value_original,unit,reference_lower,reference_upper,reference_unit,laboratory_flag)
      values(pro,pat,visit,report,analyte,'Snapshot','numeric',200+i*20,(200+i*20)::text,'mg/dL',70,100,'mg/dL','H');
    if i=0 then
      context:=public.ai_clinical_source(pro,pat,visit,1);
      if exists(select 1 from jsonb_array_elements(context->'facts') f where f->>'source' like 'Historial%')
        then raise exception 'Initial consultation invented history'; end if;
      if not exists(select 1 from jsonb_array_elements(context->'facts') f
        where f->>'origin'='laboratory' and f->>'source' like 'Laboratorio · %')
        then raise exception 'Initial laboratory result omitted'; end if;
      update public.consultations set status='completed' where id=visit;
    end if;
  end loop;
  context:=public.ai_clinical_source(pro,pat,current_visit,1);
  if not exists(select 1 from jsonb_array_elements(context->'facts') f where f->>'source' like 'Entrevista · %')
    then raise exception 'Current interview omitted'; end if;
  if not exists(select 1 from jsonb_array_elements(context->'facts') f
    where f->>'source' like 'Antropometría · %' and f->>'numeric_value'='93' and f->>'unit'='kg')
    then raise exception 'Current measurement omitted'; end if;
  if not exists(select 1 from jsonb_array_elements(context->'facts') f
    where f->>'origin'='laboratory' and f->>'source' like 'Laboratorio · %' and f->>'numeric_value'='220'
      and f->>'finding' like '%sobre el intervalo de referencia%' and f->>'finding' like '%70–100 mg/dL%'
      and f->>'finding' like '%Fecha de muestra: 2026-10-01%' and f->>'method'='Método documentado')
    then raise exception 'Current laboratory provenance or reference range missing'; end if;
  if not exists(select 1 from jsonb_array_elements(context->'facts') f
    where f->>'origin'='laboratory' and f->>'source' like 'Historial · Laboratorio · %' and f->>'numeric_value'='200'
      and f->>'consultation_date'='2026-09-01')
    then raise exception 'Dated historical laboratory result omitted'; end if;
  if (select count(*) from jsonb_array_elements(context->'facts') f where f->>'origin'='laboratory')<>2
    then raise exception 'Laboratory facts duplicated'; end if;
  stamp:=context->>'stamp';
  update public.consultations set status='draft' where id=initial_visit;
  context:=public.ai_clinical_source(pro,pat,current_visit,1);
  if stamp=context->>'stamp' or exists(select 1 from jsonb_array_elements(context->'facts') f
    where f->>'source' like 'Historial · Laboratorio · %')
    then raise exception 'Reopened consultation retained historical laboratory context'; end if;
  rejected:=false;
  begin perform public.ai_clinical_source(gen_random_uuid(),pat,current_visit,1);
    exception when others then if sqlerrm='context_unavailable' then rejected:=true; else raise; end if;
  end;
  if not rejected then raise exception 'Foreign owner accepted'; end if;
  if has_function_privilege('anon','public.ai_clinical_source(uuid,uuid,uuid,integer)','execute')
    or has_function_privilege('authenticated','private.ai_clinical_source_v5(uuid,uuid,uuid,integer)','execute')
    then raise exception 'Raw clinical context exposed'; end if;
end $$;
rollback;
select 'Passed: initial/follow-up context, measurements, laboratory ranges and dates, history, ownership; fixtures rolled back.' as result;
