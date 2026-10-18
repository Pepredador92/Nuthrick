begin;
-- Keep the existing answer format for exports, closure and the patient portal.
-- SMART details live with the consultation revision; historical text is untouched.
create function private.compose_nutrition_objective(goal jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select concat_ws('. ', nullif(regexp_replace(btrim(goal->>'outcome'),'[.;[:space:]]+$','','g'),''),
   case when btrim(goal->>'indicator')<>'' then 'Indicador: ' || regexp_replace(btrim(goal->>'indicator'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'baseline')<>'' then 'Situación inicial: ' || regexp_replace(btrim(goal->>'baseline'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'target')<>'' then 'Meta: ' || regexp_replace(btrim(goal->>'target'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'timeframe')<>'' then 'Reevaluación: ' || regexp_replace(btrim(goal->>'timeframe'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'monitoring')<>'' then 'Seguimiento: ' || regexp_replace(btrim(goal->>'monitoring'),'[.;[:space:]]+$','','g') end
 ) || case when coalesce(goal->>'outcome','') || coalesce(goal->>'indicator','') || coalesce(goal->>'baseline','') || coalesce(goal->>'target','') || coalesce(goal->>'timeframe','') || coalesce(goal->>'monitoring','') ~ '[^[:space:].;]' then '.' else '' end
$$;
revoke all on function private.compose_nutrition_objective(jsonb) from public,anon,authenticated,service_role;

drop function public.clinical_objective(uuid,integer,text,text,text);
drop function private.clinical_objective(uuid,integer,text,text,text);
create function private.clinical_objective(p_consultation uuid,p_revision integer,p_action text default 'read',p_stamp text default null,p_question_key text default null,p_plan jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(select auth.uid()); c public.consultations; s public.consultation_snapshots;
 w jsonb; context jsonb; answers jsonb; goal_value jsonb; goal_text text; approved jsonb; plan jsonb; goal jsonb; field text; objective_field text; composed text;
begin
 if owner is null then raise exception 'context_unavailable' using errcode='42501'; end if;
 select * into c from public.consultations where id=p_consultation and professional_id=owner and deleted_at is null for update;
 if not found or c.status<>'draft' then raise exception 'context_unavailable'; end if;
 select * into s from public.consultation_snapshots where consultation_id=c.id and professional_id=owner order by revision desc limit 1 for update;
 if s.id is null or s.revision<>p_revision then raise exception 'context_unavailable'; end if;
 -- Retain the established professional access / feature checks.
 w:=private.clinical_workspace(c.id,p_revision);
 context:=public.ai_clinical_source(owner,c.patient_id,c.id,p_revision);
 select coalesce(jsonb_object_agg(question_key,value),'{}') into answers from public.consultation_answers
  where consultation_id=c.id and professional_id=owner and revision=p_revision;
 if p_action in ('save','approve') then
  if p_stamp is distinct from context->>'stamp' then raise exception 'context_changed'; end if;
  if p_question_key is null or p_question_key not in ('objectives','treatment_objective','next_objectives') or not exists(
   select 1 from jsonb_array_elements(s.structure->'sections') sec cross join lateral jsonb_array_elements(sec->'questions') q where q->>'question_key'=p_question_key) then raise exception 'invalid_request'; end if;
  if jsonb_typeof(p_plan) is distinct from 'object' or p_plan->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_plan->'pesApprovedAt') is distinct from 'string' or jsonb_typeof(p_plan->'goals') is distinct from 'array' then raise exception 'objective_plan_required'; end if;
  if octet_length(p_plan::text)>60000 then raise exception 'invalid_request'; end if;
  if jsonb_array_length(p_plan->'goals')>3 then raise exception 'invalid_request'; end if;
  for goal in select value from jsonb_array_elements(p_plan->'goals') loop
   if jsonb_typeof(goal) is distinct from 'object' then raise exception 'invalid_request'; end if;
   foreach field in array array['outcome','etiology','sign','indicator','baseline','target','timeframe','monitoring','feasibility'] loop
    if jsonb_typeof(goal->field) is distinct from 'string' or length(goal->>field) > (case when field='sign' then 2000 when field='etiology' then 1500 else 400 end) then raise exception 'invalid_request'; end if;
    if p_action='approve' and btrim(goal->>field)='' then raise exception 'objective_smart_required'; end if;
   end loop;
   if goal->>'agreement' is null or goal->>'agreement' not in ('pending','patient','caregiver') then raise exception 'invalid_request'; end if;
   if p_action='approve' and goal->>'agreement'='pending' then raise exception 'objective_agreement_required'; end if;
   if p_action='approve' and not exists(select 1 from regexp_split_to_table(coalesce(answers->>'pes_evidence',''), E'\n') sign where btrim(sign)=btrim(goal->>'sign')) then raise exception 'objective_pes_changed'; end if;
  end loop;
  if p_action='approve' then
   if not(s.clinical_records ? 'pes') then raise exception 'pes_approval_required'; end if;
   if p_plan->>'pesApprovedAt' is distinct from s.clinical_records->'pes'->>'approved_at' then raise exception 'objective_pes_changed'; end if;
   if jsonb_array_length(p_plan->'goals')<1 then raise exception 'objective_smart_required'; end if;
   goal_value:=answers->p_question_key;
   if jsonb_typeof(goal_value)='string' then goal_text:=btrim(goal_value#>>'{}');
   elsif jsonb_typeof(goal_value)='array' and not exists(select 1 from jsonb_array_elements(goal_value) e where jsonb_typeof(e)<>'string') then
    select string_agg(v,E'\n\n' order by position) into goal_text from jsonb_array_elements_text(goal_value) with ordinality t(v,position);
   elsif jsonb_typeof(goal_value)='array' and not exists(select 1 from jsonb_array_elements(goal_value) e where jsonb_typeof(e)<>'object') then
    select f->>'key' into objective_field from jsonb_array_elements(s.structure->'sections') sec cross join lateral jsonb_array_elements(sec->'questions') q cross join lateral jsonb_array_elements(q->'configuration'->'fields') f where q->>'question_key'=p_question_key and (f->>'key' || ' ' || f->>'label') ~* '(objetivo|goal)' limit 1;
    if objective_field is null then raise exception 'invalid_request'; end if;
    select string_agg(v->>objective_field,E'\n\n' order by position) into goal_text from jsonb_array_elements(goal_value) with ordinality t(v,position);
   else raise exception 'invalid_request'; end if;
   select string_agg(private.compose_nutrition_objective(g),E'\n\n' order by position) into composed from jsonb_array_elements(p_plan->'goals') with ordinality t(g,position);
   if goal_text is distinct from composed then raise exception 'objective_text_mismatch'; end if;
   if length(goal_text) not between 1 and 12000 then raise exception 'invalid_request'; end if;
   approved:=jsonb_build_object('approved_at',clock_timestamp(),'question_key',p_question_key,'value',goal_value,
    'content',goal_text,'pes_approved_at',s.clinical_records->'pes'->>'approved_at','pes_statement',answers->>'pes_statement',
    'revision',p_revision,'smart_plan',p_plan,'reviewed_by',owner);
  end if;
  plan:=p_plan || jsonb_build_object('saved_at',clock_timestamp());
  update public.consultation_snapshots set clinical_records=jsonb_set(
    jsonb_set(clinical_records-'objective','{objective_plans}',coalesce(clinical_records->'objective_plans','{}') || jsonb_build_object(p_question_key,plan)),
    '{updated_at}',to_jsonb(clock_timestamp())) where id=s.id;
  if p_action='approve' then update public.consultation_snapshots set clinical_records=jsonb_set(clinical_records,'{objective}',approved) where id=s.id; end if;
 elsif p_action='revoke' then
  if p_stamp is distinct from context->>'stamp' then raise exception 'context_changed'; end if;
  update public.consultation_snapshots set clinical_records=(clinical_records-'objective') || jsonb_build_object('updated_at',clock_timestamp()) where id=s.id;
 elsif p_action<>'read' or p_action is null then raise exception 'invalid_request'; end if;
 select * into s from public.consultation_snapshots where id=s.id;
 context:=public.ai_clinical_source(owner,c.patient_id,c.id,p_revision);
 return jsonb_build_object('stamp',context->>'stamp','facts',context->'facts','target',w->'target',
  'pes',case when s.clinical_records ? 'pes' then jsonb_build_object('approved_at',s.clinical_records->'pes'->>'approved_at',
    'problem',answers->>'pes_problem','etiology',answers->>'pes_etiology','signsSymptoms',answers->>'pes_evidence','pesStatement',answers->>'pes_statement') else null end,
  'plans',coalesce(s.clinical_records->'objective_plans','{}'),'objective',s.clinical_records->'objective');
end $$;
revoke all on function private.clinical_objective(uuid,integer,text,text,text,jsonb) from public,anon,service_role;
grant execute on function private.clinical_objective(uuid,integer,text,text,text,jsonb) to authenticated;
create function public.clinical_objective(p_consultation uuid,p_revision integer,p_action text default 'read',p_stamp text default null,p_question_key text default null,p_plan jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$select private.clinical_objective(p_consultation,p_revision,p_action,p_stamp,p_question_key,p_plan)$$;
revoke all on function public.clinical_objective(uuid,integer,text,text,text,jsonb) from public,anon,service_role;
grant execute on function public.clinical_objective(uuid,integer,text,text,text,jsonb) to authenticated;

-- Add the approved current PES separately from unreviewed interview answers.
alter function public.ai_clinical_source(uuid,uuid,uuid,integer) rename to ai_clinical_source_before_objectives;
alter function public.ai_clinical_source_before_objectives(uuid,uuid,uuid,integer) set schema private;
revoke all on function private.ai_clinical_source_before_objectives(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.ai_clinical_source_before_objectives(uuid,uuid,uuid,integer) to service_role;
create function public.ai_clinical_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; records jsonb; answers jsonb; pes jsonb;
begin
 result:=private.ai_clinical_source_before_objectives(p_owner,p_patient,p_consultation,p_revision);
 select clinical_records into records from public.consultation_snapshots where professional_id=p_owner and consultation_id=p_consultation and patient_id=p_patient and revision=p_revision;
 if records->'pes'->>'approved_at' is not null then
  select jsonb_object_agg(question_key,value) into answers from public.consultation_answers where professional_id=p_owner and consultation_id=p_consultation and revision=p_revision and question_key in ('pes_problem','pes_etiology','pes_evidence','pes_statement');
  pes:=jsonb_build_object('approved_at',records->'pes'->>'approved_at','problem',answers->>'pes_problem','etiology',answers->>'pes_etiology','signsSymptoms',answers->>'pes_evidence','pesStatement',answers->>'pes_statement');
 end if;
 return result || jsonb_build_object('approvedPes',pes,'stamp',md5((result->>'stamp') || coalesce(records->'pes'->>'approved_at','')));
end $$;
revoke all on function public.ai_clinical_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_clinical_source(uuid,uuid,uuid,integer) to service_role;
-- Deploy the @4 Edge adapter first. Preserve model, pricing and entitlement settings.
update private.ai_feature_config set prompt_version='consultation_support@4',max_output_tokens=3000,updated_at=now() where feature='consultation_support' and prompt_version in ('consultation_support@1','consultation_support@2','consultation_support@3');
commit;
