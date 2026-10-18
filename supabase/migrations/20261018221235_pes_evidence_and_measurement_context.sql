begin;
-- Preserve the established ownership, dated interview selection and revision rules.
alter function public.ai_clinical_source(uuid,uuid,uuid,integer) rename to ai_clinical_source_v4;
alter function public.ai_clinical_source_v4(uuid,uuid,uuid,integer) set schema private;
revoke all on function private.ai_clinical_source_v4(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.ai_clinical_source_v4(uuid,uuid,uuid,integer) to service_role;

create function public.ai_clinical_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; patient public.patients; visit public.consultations; metric_facts jsonb; baseline jsonb;
begin
 result:=private.ai_clinical_source_v4(p_owner,p_patient,p_consultation,p_revision);
 select * into patient from public.patients where id=p_patient and professional_id=p_owner and deleted_at is null;
 select * into visit from public.consultations where id=p_consultation and professional_id=p_owner and patient_id=p_patient;
 with eligible as (
   select c.id,c.consultation_type,c.consultation_date,c.sequence_number,
     row_number() over(order by c.consultation_date desc,c.sequence_number desc,c.id desc) recency
   from public.consultations c where c.professional_id=p_owner and c.patient_id=p_patient
     and c.status='completed' and c.deleted_at is null
     and (c.consultation_date,c.sequence_number,c.id)<(visit.consultation_date,visit.sequence_number,visit.id)
 ), selected as (
   select id from eligible where recency<=3 or id=(select id from eligible where consultation_type='initial' order by consultation_date,sequence_number,id limit 1)
 ), readings as (
   select c.id=visit.id current_reading,c.consultation_date,m.measured_at recorded_at,
     coalesce(t.code,m.measurement_type_id) metric_code,coalesce(t.display_name,t.name,m.measurement_type_id) label,
     case when m.data_type in ('number','percentage','ratio') and jsonb_typeof(m.value)='number' then (m.value#>>'{}')::numeric end numeric_value,
     m.value#>>'{}' displayed_value,m.unit,'measurement'::text origin,
     case when m.device_session_id is null then 'Captura directa'
       else coalesce(nullif(concat_ws(' ',ds.device_snapshot->>'manufacturer',ds.device_snapshot->>'model'),''),'Equipo registrado') end method
   from public.consultation_measurements m join public.consultations c on c.id=m.consultation_id and c.professional_id=m.professional_id and c.patient_id=m.patient_id
     left join public.measurement_types t on t.id=m.measurement_type_id and (t.created_by is null or t.created_by=p_owner)
     left join public.consultation_device_sessions ds on ds.id=m.device_session_id and ds.professional_id=p_owner
   where m.professional_id=p_owner and m.patient_id=p_patient and (c.id=visit.id or c.id in(select id from selected))
   union all
   select c.id=visit.id,c.consultation_date,r.calculated_at,r.result_key,r.result_key,
     case when r.displayed_result ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(r.displayed_result,',','.')::numeric end,
     r.displayed_result,r.unit,'calculation',r.method_name || ' · ' || r.method_version
   from public.consultation_calculation_results r join public.consultations c on c.id=r.consultation_id and c.professional_id=r.professional_id and c.patient_id=r.patient_id
   where r.professional_id=p_owner and r.patient_id=p_patient and (c.id=visit.id or c.id in(select id from selected))
     and not exists(select 1 from public.consultation_measurements newer where newer.professional_id=p_owner and newer.consultation_id=c.id and newer.updated_at>r.calculated_at)
 ) select coalesce(jsonb_agg(jsonb_build_object(
   'source',case when current_reading then case when origin='calculation' then 'Cálculo registrado · ' else 'Antropometría · ' end
     else case when origin='calculation' then 'Historial calculado · ' else 'Historial · ' end end || label || ' · ' || method,
   'finding',displayed_value || ' ' || coalesce(unit,'[unidad sin registrar]') || ' · ' || method || ' · consulta ' || consultation_date::date::text,
   'metric_code',metric_code,'origin',origin,'numeric_value',numeric_value,'unit',unit,
   'recorded_at',recorded_at,'consultation_date',consultation_date::date,'method',method
 ) order by current_reading desc,metric_code,consultation_date,recorded_at),'[]') into metric_facts from readings where displayed_value is not null;

 select coalesce(jsonb_agg(jsonb_build_object('source','Dato de ficha · ' || label,'finding',finding,'metric_code',code,'origin','baseline','unit',unit,'numeric_value',value,'recorded_at',null)),'[]')
 into baseline from (values
   ('weight','Peso inicial',case when patient.weight_kg is not null then patient.weight_kg::text || ' kg · dato de ficha; fecha de medición no registrada' end,'kg',patient.weight_kg::numeric),
   ('height','Estatura',case when patient.height_cm is not null then patient.height_cm::text || ' cm · dato de ficha; fecha de medición no registrada' end,'cm',patient.height_cm::numeric),
   ('age','Edad en esta consulta',case when patient.birth_date is not null then extract(year from age(visit.consultation_date::date,patient.birth_date))::text || ' años · calculada para la fecha de consulta' end,'años',extract(year from age(visit.consultation_date::date,patient.birth_date))),
   ('equation_sex','Sexo registrado para ecuaciones',case when patient.equation_sex is not null then patient.equation_sex || ' · dato de ficha' end,null,null)
 ) v(code,label,finding,unit,value) where finding is not null;
 result:=jsonb_set(result,'{facts}',coalesce((select jsonb_agg(f) from jsonb_array_elements(result->'facts') f
   where f->>'source' !~ '^(Antropometría|Cálculo registrado|Historial( calculado)?) · '),'[]') || baseline || metric_facts);
 return jsonb_set(result,'{stamp}',to_jsonb(md5((result->>'stamp') || coalesce(patient.updated_at::text,''))));
end $$;
revoke all on function public.ai_clinical_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_clinical_source(uuid,uuid,uuid,integer) to service_role;

create function private.compose_pes_statement(p_problem text,p_etiology text,p_signs jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select regexp_replace(btrim(p_problem),'[.;[:space:]]+$','','g') || ' relacionado con ' ||
   regexp_replace(btrim(p_etiology),'[.;[:space:]]+$','','g') || ', evidenciado por ' ||
   (select string_agg(regexp_replace(btrim(sign),'[.;[:space:]]+$','','g'),'; ' order by position)
     from jsonb_array_elements_text(p_signs) with ordinality s(sign,position)) || '.'
$$;
revoke all on function private.compose_pes_statement(text,text,jsonb) from public,anon,authenticated,service_role;

alter function private.clinical_workspace(uuid,integer,text,jsonb,uuid) rename to clinical_workspace_v4;
revoke all on function private.clinical_workspace_v4(uuid,integer,text,jsonb,uuid) from public,anon,authenticated,service_role;
create function private.clinical_workspace(p_consultation uuid,p_revision integer,p_kind text default null,p_payload jsonb default null,p_generation uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved jsonb;
begin
 if (select auth.uid()) is null then raise exception 'context_unavailable' using errcode='42501'; end if;
 if p_kind='pes' then
   if jsonb_typeof(p_payload->'signsSymptoms') is distinct from 'array' then raise exception 'invalid_request'; end if;
   if p_payload->>'pesStatement' is distinct from private.compose_pes_statement(p_payload->>'problem',p_payload->>'etiology',p_payload->'signsSymptoms') then
     raise exception 'pes_statement_mismatch';
   end if;
   if p_payload->'evidenceReviewed' is distinct from 'true'::jsonb then raise exception 'pes_evidence_review_required'; end if;
 end if;
 saved:=private.clinical_workspace_v4(p_consultation,p_revision,p_kind,p_payload,p_generation);
 if p_kind='pes' then
   saved:=saved || jsonb_build_object('evidence_reviewed',true,'statement_format','pes@1');
   update public.consultation_snapshots set clinical_records=jsonb_set(clinical_records,'{pes}',saved)
     where consultation_id=p_consultation and professional_id=(select auth.uid()) and revision=p_revision;
 end if;
 return saved;
end $$;
revoke all on function private.clinical_workspace(uuid,integer,text,jsonb,uuid) from public,anon,service_role;
grant execute on function private.clinical_workspace(uuid,integer,text,jsonb,uuid) to authenticated;
create or replace function public.clinical_workspace(p_consultation uuid,p_revision integer,p_kind text default null,p_payload jsonb default null,p_generation uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.clinical_workspace(p_consultation,p_revision,p_kind,p_payload,p_generation)$$;
revoke all on function public.clinical_workspace(uuid,integer,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.clinical_workspace(uuid,integer,text,jsonb,uuid) to authenticated;

create function private.invalidate_pes_baseline_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if row(new.weight_kg,new.height_cm,new.birth_date,new.equation_sex) is not distinct from row(old.weight_kg,old.height_cm,old.birth_date,old.equation_sex) then return new; end if;
 update public.consultation_snapshots s set clinical_records=clinical_records-'pes'-'objective'
 where s.patient_id=new.id and s.professional_id=new.professional_id
   and s.revision=(select max(latest.revision) from public.consultation_snapshots latest where latest.consultation_id=s.consultation_id and latest.professional_id=s.professional_id)
   and exists(select 1 from public.consultations c where c.id=s.consultation_id and c.professional_id=new.professional_id and c.status='draft' and c.deleted_at is null);
 return new;
end $$;
revoke all on function private.invalidate_pes_baseline_approval() from public,anon,authenticated,service_role;
create trigger invalidate_pes_baseline_approval after update of weight_kg,height_cm,birth_date,equation_sex on public.patients
 for each row execute function private.invalidate_pes_baseline_approval();

-- Activate only after deploying the Edge adapter that supports @5.
update private.ai_feature_config set prompt_version='pes_diagnosis@5',updated_at=now() where feature='pes_diagnosis' and prompt_version in ('pes_diagnosis@1','pes_diagnosis@2','pes_diagnosis@3','pes_diagnosis@4');
commit;
