-- Dated clinical history for PES. No patient records or past approvals are rewritten.
CREATE OR REPLACE FUNCTION public.ai_clinical_source(p_owner uuid, p_patient uuid, p_consultation uuid, p_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.consultation_snapshots; p public.patients; facts jsonb; stamp text; current_visit public.consultations;
  history_ids uuid[]; history_stamp text;
  interview_keys text[] := array['main_reason','expectations','consult_now','medical_history_status','medical_diagnoses_v2',
    'medication_status','medication_list_v2','appetite','digestive_screen','sleep_hours','exercise_status','recall_24h_v2',
    'usual_pattern','daily_schedule','food_reactions_status','food_reactions_v2','access_barriers','eating_drivers',
    'interview_priorities','objectives','treatment_objective','next_objectives','changes_since_last','progress_perception',
    'symptoms_changes','medical_changes','indicators_reviewed','barriers','adjustments','professional_notes',
    'measurement_notes','indicator_progress','first_actions','recall_date','recall_day_type','adherence','symptom_detail','diagnosis_status',
    'problem_onset','trigger_events','treatment_changes','general_symptoms','symptom_action','eating_preferences',
    'eating_behaviors','eating_speed','hunger_recognition','satiety_recognition','food_relationship','behavior_support',
    'stress_level','schedule_constraints','cooking_time','budget_constraint','food_shortage','food_equipment',
    'sleep_continuity','sleep_impact','sleep_rested','sleep_signals','night_shifts','daily_activity','sitting_time',
    'exercise_sessions','strength_training','activity_limitations','support_network'];
begin
  select * into current_visit from public.consultations c where c.id=p_consultation and c.patient_id=p_patient
    and c.professional_id=p_owner and c.status='draft' and c.deleted_at is null;
  if not found then raise exception 'context_unavailable'; end if;
  select * into p from public.patients where id=p_patient and professional_id=p_owner and deleted_at is null;
  if not found then raise exception 'context_unavailable'; end if;
  select * into s from public.consultation_snapshots where consultation_id=p_consultation and professional_id=p_owner
    order by revision desc limit 1;
  if s.id is null or s.revision<>p_revision then raise exception 'context_unavailable'; end if;
  -- Bound history by consultations, not arbitrary answer/measurement counts.
  -- Include the first initial assessment and the three most recent completed visits.
  with eligible as (
    select c.*, row_number() over(order by c.consultation_date desc,c.sequence_number desc,c.id desc) as recency
    from public.consultations c where c.professional_id=p_owner and c.patient_id=p_patient
      and c.status='completed' and c.deleted_at is null
      and (c.consultation_date,c.sequence_number,c.id) <
          (current_visit.consultation_date,current_visit.sequence_number,current_visit.id)
  )
  select coalesce(array_agg(id order by consultation_date,sequence_number,id),'{}'::uuid[]) into history_ids
  from eligible where recency<=3 or id=(select id from eligible where consultation_type='initial'
    order by consultation_date,sequence_number,id limit 1);

  with history_snapshots as (
    select distinct on (h.consultation_id) h.*, c.consultation_date
    from public.consultation_snapshots h join public.consultations c on c.id=h.consultation_id
      and c.professional_id=h.professional_id and c.patient_id=h.patient_id
    where h.professional_id=p_owner and h.patient_id=p_patient and h.consultation_id=any(history_ids)
    order by h.consultation_id,h.revision desc
  ), source as (
    select 'Entrevista · ' || replace(a.question_key,'_',' ') || coalesce((select ' · ' || (q->>'label') from jsonb_array_elements(s.structure->'sections') sec cross join lateral jsonb_array_elements(sec->'questions') q where q->>'question_key'=a.question_key limit 1),'') as source, a.value::text as finding
    from public.consultation_answers a where a.professional_id=p_owner and a.consultation_id=p_consultation and a.revision=p_revision
      and a.question_key = any(interview_keys)
      and a.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
    union all
    select 'Antecedente de entrevista · ' || h.consultation_date::date::text || ' · ' || replace(a.question_key,'_',' ')
      || coalesce((select ' · ' || (q->>'label') from jsonb_array_elements(h.structure->'sections') sec
        cross join lateral jsonb_array_elements(sec->'questions') q where q->>'question_key'=a.question_key limit 1),''),
      a.value::text
    from history_snapshots h join public.consultation_answers a on a.consultation_id=h.consultation_id
      and a.professional_id=h.professional_id and a.patient_id=h.patient_id and a.revision=h.revision
    where a.question_key=any(interview_keys) and a.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
    union all
    select 'PES previo aprobado · ' || h.consultation_date::date::text || ' · ' || replace(a.question_key,'_',' '),
      a.value::text
    from history_snapshots h join public.consultation_answers a on a.consultation_id=h.consultation_id
      and a.professional_id=h.professional_id and a.patient_id=h.patient_id and a.revision=h.revision
    where h.clinical_records->'pes'->>'approved_at' is not null
      and a.question_key=any(array['pes_problem','pes_etiology','pes_evidence','pes_statement'])
      and a.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
    union all
    select 'Antropometría · ' || coalesce((select coalesce(t.display_name,t.name) from public.measurement_types t where t.id=m.measurement_type_id and (t.created_by is null or t.created_by=p_owner)),m.measurement_type_id),
      (m.value#>>'{}') || ' ' || coalesce(m.unit,'[unidad sin registrar]') || ' · medición ' || m.measured_at::text
      from public.consultation_measurements m where m.professional_id=p_owner and m.consultation_id=p_consultation and m.patient_id=p_patient
    union all
    select 'Historial · ' || coalesce((select coalesce(t.display_name,t.name) from public.measurement_types t
      where t.id=h.measurement_type_id and (t.created_by is null or t.created_by=p_owner)),h.measurement_type_id),
      (h.value#>>'{}') || ' ' || coalesce(h.unit,'[unidad sin registrar]') || ' · consulta ' || h.consultation_date::date::text
      from (select m.measurement_type_id,m.value,m.unit,c.consultation_date
        from public.consultation_measurements m join public.consultations c
          on c.id=m.consultation_id and c.professional_id=m.professional_id and c.patient_id=m.patient_id
        where m.professional_id=p_owner and m.patient_id=p_patient and c.status='completed'
          and c.id=any(history_ids) and m.data_type in ('number','percentage','ratio')
        order by c.consultation_date desc,m.measured_at desc,m.id) h
    union all
    select 'Historial calculado · ' || h.result_key || ' · ' || h.method_name,
      h.displayed_result || ' ' || h.unit || ' · consulta ' || h.consultation_date::date::text
      from (select r.result_key,r.method_name,r.displayed_result,r.unit,c.consultation_date
        from public.consultation_calculation_results r join public.consultations c
          on c.id=r.consultation_id and c.professional_id=r.professional_id and c.patient_id=r.patient_id
        where r.professional_id=p_owner and r.patient_id=p_patient and c.status='completed'
          and c.id=any(history_ids)
          and not exists(select 1 from public.consultation_measurements newer
            where newer.professional_id=p_owner and newer.consultation_id=c.id and newer.updated_at>r.calculated_at)
        order by c.consultation_date desc,r.calculated_at desc,r.id) h
    union all
    select 'Cálculo registrado · ' || m.result_key || ' · ' || m.method_name || ' · ' || m.method_version,
      m.displayed_result || ' ' || m.unit || ' · calculado ' || m.calculated_at::text
      from public.consultation_calculation_results m where m.professional_id=p_owner and m.consultation_id=p_consultation and m.patient_id=p_patient
      and not exists(select 1 from public.consultation_measurements newer where newer.professional_id=p_owner and newer.consultation_id=p_consultation and newer.updated_at>m.calculated_at)
    union all
    select 'Laboratorio · ' || l.analyte_name_snapshot, coalesce(l.numeric_comparator,'') || coalesce(l.numeric_value::text,nullif(btrim(l.text_value),'')) || ' ' || coalesce(l.unit,'')
      from public.laboratory_results l where l.professional_id=p_owner and l.consultation_id=p_consultation and l.patient_id=p_patient
    union all
    select 'Recordatorio confirmado', (select jsonb_agg(jsonb_build_object('tiempo',i->>'mealLabel','alimento',i->'food'->>'name','cantidad',i->'quantity','unidad',i->>'unit'))::text
      from jsonb_array_elements(s.clinical_records->'recall'->'items') i) where s.clinical_records ? 'recall'
  ) select coalesce(jsonb_agg(jsonb_build_object('source',source,'finding',finding) order by source,finding) filter(where nullif(btrim(finding),'') is not null),'[]') into facts from source;
  -- Historical edits, reopen/archive, newer revisions and changed selection invalidate pending proposals.
  select concat_ws('|',array_to_string(history_ids,','),
    (select string_agg(c.id::text || c.consultation_date::text || c.updated_at::text,',' order by c.id)
      from public.consultations c where c.id=any(history_ids) and c.professional_id=p_owner),
    (select string_agg(h.id::text || h.revision::text || coalesce(h.clinical_records->>'updated_at',''),',' order by h.id)
      from public.consultation_snapshots h where h.consultation_id=any(history_ids) and h.professional_id=p_owner),
    (select string_agg(a.id::text || a.updated_at::text,',' order by a.id) from public.consultation_answers a
      where a.professional_id=p_owner and a.patient_id=p_patient and a.consultation_id=any(history_ids)),
    (select string_agg(m.id::text || m.updated_at::text,',' order by m.id) from public.consultation_measurements m
      where m.professional_id=p_owner and m.patient_id=p_patient and m.consultation_id=any(history_ids)),
    (select string_agg(r.id::text || r.updated_at::text,',' order by r.id) from public.consultation_calculation_results r
      where r.professional_id=p_owner and r.patient_id=p_patient and r.consultation_id=any(history_ids)))
    into history_stamp;
  -- Optimistic concurrency token contains revision/timestamps, never a clinical text hash.
  select md5(concat_ws('|',s.id,s.revision,s.clinical_records->>'updated_at',current_visit.consultation_date,history_stamp,
    (select string_agg(a.id::text || a.updated_at::text,',' order by a.id) from public.consultation_answers a where a.professional_id=p_owner and a.consultation_id=p_consultation and a.revision=p_revision),
    (select string_agg(m.id::text || m.updated_at::text,',' order by m.id) from public.consultation_measurements m where m.professional_id=p_owner and m.consultation_id=p_consultation),
    (select string_agg(l.id::text || l.updated_at::text,',' order by l.id) from public.laboratory_results l where l.professional_id=p_owner and l.consultation_id=p_consultation),
    (select string_agg(a.id::text || a.updated_at::text,',' order by a.id) from public.consultation_calculation_results a where a.professional_id=p_owner and a.consultation_id=p_consultation))) into stamp;
  return jsonb_build_object('facts',facts,'stamp',stamp,'identifiers',jsonb_build_array(p.full_name,p.email,p.phone),'recall',case when s.clinical_records->'recall'->>'approved_at' is not null then s.clinical_records->'recall' else null end);
end; $function$
;
revoke all on function public.ai_clinical_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_clinical_source(uuid,uuid,uuid,integer) to service_role;

-- Preserve all existing authorization, entitlements and approval provenance.
do $$
declare definition text; amended text;
begin
  definition:=pg_get_functiondef('private.clinical_workspace(uuid,integer,text,jsonb,uuid)'::regprocedure);
  amended:=replace(definition,'length(p_payload->>''etiology'')>1500',
    'length(p_payload->>''etiology'')>1500 or (p_payload->>''etiology'') !~ ''[^[:space:]]''');
  if amended=definition then raise exception 'Unexpected PES validation definition'; end if;
  execute amended;
end $$;
-- Deploy the Edge adapter supporting @3 before applying this migration.
-- Preserve administrator-defined model, limits, credit price and enabled state.
update private.ai_feature_config set prompt_version='pes_diagnosis@3',updated_at=now()
where feature='pes_diagnosis' and prompt_version in ('pes_diagnosis@1','pes_diagnosis@2');
