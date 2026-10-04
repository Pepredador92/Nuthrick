-- Deploy diet_draft@3 Edge support before applying. No existing patient plans are modified.
CREATE OR REPLACE FUNCTION public.ai_diet_source(p_owner uuid, p_plan uuid, p_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare p public.nutrition_plans; patient public.patients; s public.consultation_snapshots;
 answers jsonb; catalog jsonb; consultation jsonb; source jsonb; statement text; history_ids uuid[]; selected_visit public.consultations; dated jsonb;
 keys text[] := array['main_reason','expectations','objectives','treatment_objective','next_objectives','food_reactions_status','food_reactions_v2','food_preferences','eating_preferences','usual_pattern','daily_schedule','cooking_time','food_equipment','budget_constraint','access_barriers','barriers','adjustments','adherence','medical_diagnoses_v2','medication_list_v2','digestive_screen','exercise_status','first_actions','changes_since_last','professional_notes'];
begin
 select * into p from public.nutrition_plans where id=p_plan and professional_id=p_owner and status='draft';
 if p.id is null or p.draft_revision<>p_revision or p.patient_id is null or p.consultation_id is null then raise exception 'context_unavailable'; end if;
 select * into patient from public.patients where id=p.patient_id and professional_id=p_owner and deleted_at is null and status<>'archived';
 if patient.id is null or not exists(select 1 from public.consultations where id=p.consultation_id and patient_id=p.patient_id and professional_id=p_owner and deleted_at is null and status in ('draft','completed')) then raise exception 'context_unavailable'; end if;
 select * into s from public.consultation_snapshots where consultation_id=p.consultation_id and patient_id=p.patient_id and professional_id=p_owner order by revision desc limit 1;
 select value#>>'{}' into statement from public.consultation_answers where consultation_id=p.consultation_id and professional_id=p_owner and revision=s.revision and question_key='pes_statement';
 select coalesce(jsonb_object_agg(question_key,jsonb_build_object('value',value,'response_area',response_area)),'{}') into answers
 from public.consultation_answers where consultation_id=p.consultation_id and patient_id=p.patient_id and professional_id=p_owner and revision=s.revision
 and question_key in ('food_reactions_status','food_reactions_v2','food_preferences','eating_preferences','usual_pattern','daily_schedule','cooking_time','food_equipment');
 consultation:=jsonb_build_object('id',p.consultation_id,'patient_id',p.patient_id,'professional_id',p_owner,'revision',s.revision,
  'pes',case when s.clinical_records->'pes'->>'approved_at' is not null then jsonb_build_object('approved_at',s.clinical_records->'pes'->>'approved_at','statement',statement) else null end,
  'objective',s.clinical_records->'objective');
 -- Full authorized catalog is server-only. Bounded selector builds model pool.
 select jsonb_build_object('foods',(select coalesce(jsonb_agg(to_jsonb(f) order by id),'[]') from public.food_items f where active and (owner_id is null or owner_id=p_owner)),
  'recipes',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by display_order,id),'[]') from public.recipe_items i where i.recipe_id=r.id)) order by r.id),'[]') from public.recipes r where active and (owner_id is null or owner_id=p_owner))) into catalog;
 source:=jsonb_build_object('plan',to_jsonb(p),'consultation',consultation,'answers',answers,'catalog',catalog);
 
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
  select * into selected_visit from public.consultations where id=p.consultation_id and professional_id=p_owner;
  with eligible as (
    select c.*,row_number() over(order by c.consultation_date desc,c.sequence_number desc,c.id desc) as recency
    from public.consultations c where c.professional_id=p_owner and c.patient_id=p.patient_id
      and c.status='completed' and c.deleted_at is null
      and (c.consultation_date,c.sequence_number,c.id)<(selected_visit.consultation_date,selected_visit.sequence_number,selected_visit.id)
  ) select coalesce(array_agg(id),'{}'::uuid[]) into history_ids from eligible
    where recency<=3 or id=(select id from eligible where consultation_type='initial' order by consultation_date,sequence_number,id limit 1);
  -- Select the latest revision of each eligible visit, with explicit ownership.
  with visits as (
    select c.id,c.consultation_date,c.id=p.consultation_id as is_current,h.revision,h.clinical_records
    from public.consultations c cross join lateral (
      select revision,clinical_records from public.consultation_snapshots
      where consultation_id=c.id and professional_id=p_owner and patient_id=p.patient_id order by revision desc limit 1
    ) h where c.professional_id=p_owner and c.patient_id=p.patient_id and (c.id=any(history_ids) or c.id=p.consultation_id)
  ) select coalesce(jsonb_agg(jsonb_build_object('date',v.consultation_date::date,'current',v.is_current,'facts',(
    select coalesce(jsonb_agg(jsonb_build_object('key',x.key,'value',x.value) order by x.key),'[]') from (
      select a.question_key as key,a.value from public.consultation_answers a
      where a.consultation_id=v.id and a.professional_id=p_owner and a.patient_id=p.patient_id and a.revision=v.revision
        and (a.question_key=any(keys) or (a.question_key='pes_statement' and v.clinical_records->'pes'->>'approved_at' is not null))
        and a.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
      union all
      select 'Medición: '||m.measurement_type_id,to_jsonb((m.value#>>'{}')||' '||coalesce(m.unit,''))
      from public.consultation_measurements m where m.consultation_id=v.id and m.professional_id=p_owner and m.patient_id=p.patient_id
        and m.measurement_type_id in ('weight','height','waist_circumference','body_fat_percentage_device')
    ) x
  )) order by v.is_current desc,v.consultation_date desc),'[]') into dated from visits v;
  source:=source||jsonb_build_object('datedContext',dated,
    'historyRequiresReview',exists(select 1 from jsonb_array_elements(dated) d cross join lateral jsonb_array_elements(d->'facts') f
      where (f->>'key'='food_reactions_status' and f->>'value'='Sí') or (f->>'key'='food_reactions_v2' and f->'value' not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb))
        or (f->>'key'='eating_preferences' and (f->'value') ?| array['Vegetariano','Vegano','Pescetariano','Restricción religiosa'])
        or (f->>'key'='food_preferences' and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'value')='array' then f->'value' else '[]' end) pref where pref->>'category' in ('No consume','Preferencia cultural / religiosa')))),
    'objectiveSuggestion',(select a.value#>>'{}' from public.consultation_answers a where a.consultation_id=p.consultation_id
      and a.professional_id=p_owner and a.patient_id=p.patient_id and a.revision=s.revision
      and a.question_key in ('treatment_objective','objectives','next_objectives') and jsonb_typeof(a.value)='string'
      order by case a.question_key when 'treatment_objective' then 0 when 'objectives' then 1 else 2 end limit 1));
  return jsonb_build_object('source',source||jsonb_build_object('stamp',md5(source::text)),
    
  'identifiers',jsonb_build_array(patient.full_name,patient.email,patient.phone));
end $function$
;
CREATE OR REPLACE FUNCTION public.ai_diet_draft(p_owner uuid, p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare g private.ai_generations; p public.nutrition_plans; s private.ai_diet_snapshots; current_source jsonb;
begin
 if p_action in ('apply','bind') then perform private.require_entitlement(p_owner,'ai.diet_draft'); end if;
 -- Same lock order for bind/result/apply. No provider call inside transactions.
 select * into g from private.ai_generations where id=(p_data->>'generationId')::uuid and professional_id=p_owner and feature='diet_draft' for update;
 if g.id is null then raise exception 'context_unavailable'; end if;
 if p_action='bind' then
  select * into p from public.nutrition_plans where id=(p_data->>'planId')::uuid and professional_id=p_owner for update;
  if g.status<>'reserved' or p.id is null or g.patient_id is distinct from p.patient_id or g.consultation_id is distinct from p.consultation_id then raise exception 'context_unavailable'; end if;
  current_source:=public.ai_diet_source(p_owner,p.id,(p_data->>'revision')::integer);
  if current_source->'source'->>'stamp' is distinct from p_data->>'stamp' then raise exception 'context_changed'; end if;
  insert into private.ai_diet_snapshots(generation_id,plan_id,revision,source_stamp,snapshot)
   values(g.id,p.id,p.draft_revision,p_data->>'stamp',p_data->'snapshot');
  update private.ai_generations set workshop_plan_id=p.id,workshop_revision=p.draft_revision where id=g.id;
  return jsonb_build_object('ok',true);
 end if;
 select * into s from private.ai_diet_snapshots where generation_id=g.id;
 if s.generation_id is null then raise exception 'context_unavailable'; end if;
 if p_action='result' then
  if g.status<>'running' or s.result is not null then raise exception 'invalid_request'; end if;
  update private.ai_diet_snapshots set result=p_data->'result' where generation_id=g.id;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='get' then return jsonb_build_object('snapshot',s.snapshot,'result',s.result,'stamp',s.source_stamp,'revision',s.revision,'planId',s.plan_id,'status',g.status,'decision',g.workshop_decision); end if;
 if p_action not in ('apply','discard') or g.status<>'succeeded' then raise exception 'invalid_request'; end if;
 select * into p from public.nutrition_plans where id=s.plan_id and professional_id=p_owner for update;
 if p.id is null then raise exception 'context_unavailable'; end if;
 if g.workshop_decision=(case when p_action='apply' then 'accepted' else 'discarded' end) then return jsonb_build_object('ok',true,'replay',true,'plan',to_jsonb(p)); end if;
 if g.workshop_decision is not null then raise exception 'invalid_request'; end if;
 if p_action='apply' then
  if p.status<>'draft' or p.draft_revision<>s.revision then raise exception 'context_changed'; end if;
  current_source:=public.ai_diet_source(p_owner,p.id,s.revision);
  if current_source->'source'->>'stamp' is distinct from s.source_stamp then raise exception 'context_changed'; end if;
  if s.result->'validation'->>'status' not in ('valid','needs_adjustment') or jsonb_typeof(s.result->'validation'->'draft') is distinct from 'object' then raise exception 'invalid_output'; end if;
  if (s.snapshot->>'hasManualMenu')::boolean and coalesce((p_data->>'replaceExisting')::boolean,false) is not true then raise exception 'replacement_confirmation_required'; end if;
  if (s.result->'validation'->>'status'='needs_adjustment' or (s.result->'validation'->>'requiresTargetReview')::boolean)
    and coalesce((p_data->>'acceptDifferences')::boolean,false) is not true then raise exception 'difference_confirmation_required'; end if;
  -- Guided proposals replace the three dependent steps atomically. Energy, macros, supplements and published versions are preserved.
  if s.snapshot->>'guided'='true' and (jsonb_typeof(s.snapshot->'plan'->'exchange_prescription') is distinct from 'object'
    or jsonb_typeof(s.snapshot->'plan'->'meal_distribution') is distinct from 'object') then raise exception 'invalid_output'; end if;
  update public.nutrition_plans set diet_menu=s.result->'validation'->'draft',status='draft',
    exchange_prescription=case when s.snapshot->>'guided'='true' then s.snapshot->'plan'->'exchange_prescription' else exchange_prescription end,
    meal_distribution=case when s.snapshot->>'guided'='true' then s.snapshot->'plan'->'meal_distribution' else meal_distribution end
    where id=p.id returning * into p;
 end if;
 update private.ai_generations set workshop_decision=case when p_action='apply' then 'accepted' else 'discarded' end,workshop_decided_at=now() where id=g.id;
 return jsonb_build_object('ok',true,'plan',to_jsonb(p));
end $function$
;
revoke all on function public.ai_diet_source(uuid,uuid,integer),public.ai_diet_draft(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ai_diet_source(uuid,uuid,integer),public.ai_diet_draft(uuid,text,jsonb) to service_role;
update private.ai_feature_config set prompt_version='diet_draft@3' where feature='diet_draft';
