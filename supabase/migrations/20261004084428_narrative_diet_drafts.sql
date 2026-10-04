-- Independent text drafts. Existing catalog drafts remain supported.
alter table public.nutrition_plans add column text_diet jsonb;
create or replace function private.valid_text_diet(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare d jsonb; m jsonb; ids text[]:='{}'; names text[]:='{}';
begin
 if value is null then return true; end if;
 if jsonb_typeof(value) is distinct from 'object' or value->>'schema_version' is distinct from '1'
  or coalesce(value->>'requested_count','') !~ '^[1-7]$'
  or jsonb_typeof(value->'diets') is distinct from 'array'
  or jsonb_typeof(value->'meals') is distinct from 'array'
  or jsonb_typeof(value->'prescription') is distinct from 'object'
  or jsonb_array_length(value->'diets')<>(value->>'requested_count')::integer
  or jsonb_array_length(value->'meals') not between 1 and 6
  or octet_length(value::text)>350000 then return false; end if;
 if not(value ? 'reviewed_at') or (jsonb_typeof(value->'reviewed_at')<>'null' and (jsonb_typeof(value->'reviewed_at')<>'string' or length(value->>'reviewed_at')>50)) then return false;end if;
 if value->>'reviewed_at' is not null then perform (value->>'reviewed_at')::timestamptz;end if;
 for d in select * from jsonb_array_elements(value->'diets') loop
  if jsonb_typeof(d->'id') is distinct from 'string' or length(trim(d->>'id')) not between 1 and 60 or d->>'id'=any(ids)
   or jsonb_typeof(d->'title') is distinct from 'string' or length(trim(d->>'title')) not between 1 and 120
   or jsonb_typeof(d->'text') is distinct from 'string' or length(trim(d->>'text')) not between 1 and 12000 then return false;end if;
  ids:=array_append(ids,d->>'id');
 end loop;
 for m in select * from jsonb_array_elements(value->'meals') loop
  if jsonb_typeof(m->'name') is distinct from 'string' or length(trim(m->>'name')) not between 1 and 60 or lower(trim(m->>'name'))=any(names)
   or not(m ? 'time') or (jsonb_typeof(m->'time')<>'null' and (m->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then return false;end if;
  names:=array_append(names,lower(trim(m->>'name')));
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function private.valid_text_diet(jsonb) from public,anon;
grant execute on function private.valid_text_diet(jsonb) to authenticated,service_role;
alter table public.nutrition_plans add constraint nutrition_plan_text_diet_valid check(private.valid_text_diet(text_diet));
-- Deploy diet_draft@4 Edge support before applying. No existing patient plans are modified.
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
 source:=jsonb_build_object('plan',(to_jsonb(p)-'text_diet'),'consultation',consultation,'answers',answers,'catalog',catalog);

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
-- Deploy diet_draft@4 Edge support before applying. No existing patient plans are modified.
CREATE OR REPLACE FUNCTION public.ai_text_diet_source(p_owner uuid, p_plan uuid, p_revision integer)
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
 source:=jsonb_build_object('plan',to_jsonb(p),'consultation',consultation,'answers',answers);

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
create or replace function public.ai_text_diet_draft(p_owner uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare g private.ai_generations; p public.nutrition_plans; s private.ai_diet_snapshots; current_source jsonb; draft jsonb;
begin
 if p_action in ('bind','apply') then perform private.require_entitlement(p_owner,'ai.diet_draft');end if;
 select * into g from private.ai_generations where id=(p_data->>'generationId')::uuid and professional_id=p_owner and feature='diet_draft' for update;
 if g.id is null then raise exception 'context_unavailable';end if;
 if p_action='bind' then
  select * into p from public.nutrition_plans where id=(p_data->>'planId')::uuid and professional_id=p_owner for update;
  if g.status<>'reserved' or p.id is null or g.patient_id is distinct from p.patient_id or g.consultation_id is distinct from p.consultation_id
   or p_data->'snapshot'->>'format' is distinct from 'text_diet' then raise exception 'context_unavailable';end if;
  current_source:=public.ai_text_diet_source(p_owner,p.id,(p_data->>'revision')::integer);
  if current_source->'source'->>'stamp' is distinct from p_data->>'stamp' then raise exception 'context_changed';end if;
  insert into private.ai_diet_snapshots(generation_id,plan_id,revision,source_stamp,snapshot) values(g.id,p.id,p.draft_revision,p_data->>'stamp',p_data->'snapshot');
  update private.ai_generations set workshop_plan_id=p.id,workshop_revision=p.draft_revision where id=g.id;
  return jsonb_build_object('ok',true);
 end if;
 select * into s from private.ai_diet_snapshots where generation_id=g.id;
 if s.generation_id is null or s.snapshot->>'format' is distinct from 'text_diet' then raise exception 'context_unavailable';end if;
 if p_action='get' then return jsonb_build_object('snapshot',s.snapshot,'result',s.result,'status',g.status,'decision',g.workshop_decision);end if;
 if p_action='result' then
  if g.status<>'running' or s.result is not null then raise exception 'invalid_request';end if;
  update private.ai_diet_snapshots set result=p_data->'result' where generation_id=g.id;
  return jsonb_build_object('ok',true);
 end if;
 if p_action not in ('apply','discard') or g.status<>'succeeded' then raise exception 'invalid_request';end if;
 select * into p from public.nutrition_plans where id=s.plan_id and professional_id=p_owner for update;
 if p.id is null then raise exception 'context_unavailable';end if;
 if g.workshop_decision=(case when p_action='apply' then 'accepted' else 'discarded' end) then return jsonb_build_object('ok',true,'replay',true,'plan',to_jsonb(p));end if;
 if g.workshop_decision is not null then raise exception 'invalid_request';end if;
 if p_action='apply' then
  if p.status<>'draft' or p.draft_revision<>s.revision then raise exception 'context_changed';end if;
  current_source:=public.ai_text_diet_source(p_owner,p.id,s.revision);
  if current_source->'source'->>'stamp' is distinct from s.source_stamp then raise exception 'context_changed';end if;
  if (p.text_diet is not null or p.diet_menu is not null) and coalesce((p_data->>'replaceExisting')::boolean,false) is not true then raise exception 'replacement_confirmation_required';end if;
  draft:=s.result->'textDraft';
  if draft is null or draft='null'::jsonb or not private.valid_text_diet(draft) or draft->>'reviewed_at' is not null
   or (draft->>'requested_count')::integer is distinct from (s.snapshot->'payload'->>'diet_count')::integer
   or draft->'prescription' is distinct from s.snapshot->'prescription' then raise exception 'invalid_output';end if;
  update public.nutrition_plans set text_diet=draft where id=p.id returning * into p;
 end if;
 update private.ai_generations set workshop_decision=case when p_action='apply' then 'accepted' else 'discarded' end,workshop_decided_at=now() where id=g.id;
 return jsonb_build_object('ok',true,'plan',to_jsonb(p));
end $$;
revoke all on function public.ai_text_diet_source(uuid,uuid,integer),public.ai_text_diet_draft(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ai_text_diet_source(uuid,uuid,integer),public.ai_text_diet_draft(uuid,text,jsonb) to service_role;

-- Preserve the existing ownership/revision/idempotency publication path.
do $$
declare original text; amended text;
begin
 original:=pg_get_functiondef('private.nutrition_plan_publication_errors(public.nutrition_plans)'::regprocedure);
 amended:=replace(original,'  if p_plan.meal_distribution is null',
 $insert$  if p_plan.text_diet is not null then
    if not private.valid_text_diet(p_plan.text_diet) or p_plan.text_diet->>'reviewed_at' is null then
      errors:=errors||jsonb_build_array(jsonb_build_object('code','TEXT_DIET_REVIEW_REQUIRED','message','Revisa y aprueba todas las dietas en texto antes de publicar.'));
    end if;
    if p_plan.text_diet->'prescription' is distinct from jsonb_build_object('target_calories',p_plan.target_calories,'macro_distribution',p_plan.macro_distribution) then
      errors:=errors||jsonb_build_array(jsonb_build_object('code','TEXT_DIET_PRESCRIPTION_CHANGED','message','La prescripción cambió. Revisa nuevamente las dietas en texto.'));
    end if;
    return errors;
  end if;
  if p_plan.meal_distribution is null$insert$);
 if amended=original then raise exception 'unexpected_publication_errors_definition';end if;execute amended;
 original:=pg_get_functiondef('private.nutrition_plan_version_snapshot(public.nutrition_plans)'::regprocedure);
 amended:=replace(original,'''calendar'', p_plan.diet_menu #> ''{week_plan,days}'',',
 '''calendar'', case when p_plan.text_diet is null then p_plan.diet_menu #> ''{week_plan,days}'' else ''[]''::jsonb end, ''text_diet'',p_plan.text_diet,');
 if amended=original then raise exception 'unexpected_publication_snapshot_definition';end if;execute amended;
end $$;
create or replace function private.text_diet_review_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.text_diet is not null and old.text_diet is not null and new.text_diet->>'reviewed_at' is not null then
  if (new.target_calories,new.macro_distribution,new.patient_id,new.consultation_id) is distinct from (old.target_calories,old.macro_distribution,old.patient_id,old.consultation_id)
   or (new.text_diet-'reviewed_at' is distinct from old.text_diet-'reviewed_at' and new.text_diet->'reviewed_at'=old.text_diet->'reviewed_at') then
   new.text_diet:=jsonb_set(new.text_diet,'{reviewed_at}','null');
  end if;
 end if;
 return new;
end $$;
revoke all on function private.text_diet_review_guard() from public,anon,authenticated;
create trigger nutrition_plans_aa_text_review before update on public.nutrition_plans for each row execute function private.text_diet_review_guard();
update private.ai_feature_config set prompt_version='diet_draft@4',max_output_tokens=16000,timeout_ms=90000 where feature='diet_draft';
