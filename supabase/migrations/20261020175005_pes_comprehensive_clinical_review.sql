begin;
-- Deploy the Edge function with PES@6 support before applying this migration.
-- Preserve the existing owner, interview-history, anthropometry and calculation context.
alter function public.ai_clinical_source(uuid,uuid,uuid,integer) rename to ai_clinical_source_v5;
alter function public.ai_clinical_source_v5(uuid,uuid,uuid,integer) set schema private;
revoke all on function private.ai_clinical_source_v5(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.ai_clinical_source_v5(uuid,uuid,uuid,integer) to service_role;

create function public.ai_clinical_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; visit public.consultations; laboratory_facts jsonb; laboratory_stamp text;
begin
 result:=private.ai_clinical_source_v5(p_owner,p_patient,p_consultation,p_revision);
 select * into visit from public.consultations c
  where c.id=p_consultation and c.professional_id=p_owner and c.patient_id=p_patient
    and c.status='draft' and c.deleted_at is null;
 if not found then raise exception 'context_unavailable'; end if;

 -- Include current and selected historical laboratory results. Retain the recorded
 -- comparison, flag, reference interval and collection date so the model need not
 -- infer whether a result is outside its stated range.
 with eligible as (
   select c.id,c.consultation_type,c.consultation_date,c.sequence_number,
     row_number() over(order by c.consultation_date desc,c.sequence_number desc,c.id desc) recency
   from public.consultations c where c.professional_id=p_owner and c.patient_id=p_patient
     and c.status='completed' and c.deleted_at is null
     and (c.consultation_date,c.sequence_number,c.id)<(visit.consultation_date,visit.sequence_number,visit.id)
 ), selected as (
   select id from eligible where recency<=3 or id=(select id from eligible where consultation_type='initial' order by consultation_date,sequence_number,id limit 1)
 ), relevant_visits as (
   select visit.id,true as is_current,visit.consultation_date
   union all
   select c.id,false,c.consultation_date from selected s join public.consultations c on c.id=s.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'source',case when v.is_current then 'Laboratorio · ' else 'Historial · Laboratorio · ' end || l.analyte_name_snapshot,
   'finding',concat_ws(' · ',
     nullif(btrim(coalesce(l.numeric_comparator || ' ','') || l.result_value_original || coalesce(' ' || nullif(btrim(l.unit),''),'')),''),
     case l.range_comparison
       when 'above' then 'Comparación registrada: sobre el intervalo de referencia'
       when 'below' then 'Comparación registrada: bajo el intervalo de referencia'
       when 'in_range' then 'Comparación registrada: dentro del intervalo de referencia'
       else 'Comparación con intervalo: no comparable' end,
     case when nullif(btrim(l.laboratory_flag),'') is not null then 'Bandera informada por el laboratorio: ' || btrim(l.laboratory_flag) end,
     case when nullif(btrim(l.reference_text),'') is not null then 'Referencia: ' || btrim(l.reference_text) || coalesce(' ' || nullif(btrim(l.reference_unit),''),'')
       when l.reference_lower is not null or l.reference_upper is not null then 'Intervalo de referencia: ' || coalesce(l.reference_lower::text,'sin límite inferior') || '–' || coalesce(l.reference_upper::text,'sin límite superior') || coalesce(' ' || nullif(btrim(coalesce(l.reference_unit,l.unit)),''),'') end,
     case when r.sample_date is not null then 'Fecha de muestra: ' || r.sample_date::text end,
     'Fecha de consulta: ' || v.consultation_date::date::text),
   'metric_code',coalesce(nullif(l.analyte_code_snapshot,''),l.analyte_name_snapshot),
   'origin','laboratory','numeric_value',l.numeric_value,'unit',l.unit,
   'recorded_at',coalesce((r.sample_date + r.sample_time)::timestamptz,r.report_date::timestamptz,l.created_at),
   'consultation_date',v.consultation_date::date,'method',r.analytical_method
 ) order by v.is_current desc,v.consultation_date desc,l.analyte_name_snapshot,r.sample_date desc,l.created_at desc),'[]'::jsonb),
 coalesce(string_agg(l.id::text || l.updated_at::text || r.updated_at::text,',' order by l.id),'')
 into laboratory_facts,laboratory_stamp
 from relevant_visits v
 join public.consultations c on c.id=v.id and c.professional_id=p_owner and c.patient_id=p_patient
 join public.laboratory_results l on l.professional_id=p_owner and l.patient_id=p_patient and l.consultation_id=c.id
 join public.laboratory_reports r on r.id=l.report_id and r.professional_id=l.professional_id
   and r.patient_id=l.patient_id and r.consultation_id=l.consultation_id;

 result:=jsonb_set(result,'{facts}',
   coalesce((select jsonb_agg(f) from jsonb_array_elements(result->'facts') f
     where f->>'source' !~ '^Laboratorio · '),'[]'::jsonb) || laboratory_facts);
 result:=jsonb_set(result,'{stamp}',to_jsonb(md5(coalesce(result->>'stamp','') || laboratory_stamp)));
 return result;
end $$;
revoke all on function public.ai_clinical_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_clinical_source(uuid,uuid,uuid,integer) to service_role;

update private.ai_feature_config set prompt_version='pes_diagnosis@6',updated_at=now()
 where feature='pes_diagnosis' and prompt_version='pes_diagnosis@5';
commit;
