begin;
set local lock_timeout='5s';
-- Approval must work for the repeatable objective field used in follow-up
-- consultations. Keep approval identities when the actual plan is unchanged.
create or replace function private.clinical_objective(p_consultation uuid,p_revision integer,p_action text default 'read',p_stamp text default null,p_question_key text default null,p_plan jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(select auth.uid()); c public.consultations; s public.consultation_snapshots;
 w jsonb; context jsonb; answers jsonb; goal_value jsonb; goal_text text; approved jsonb; plan jsonb; goal jsonb; field text; objective_field text; composed text; approval_unchanged boolean:=false;
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
 if p_action<>'read' then
  perform private.require_my_entitlement('consultations');
  perform private.require_retention_patient(owner,c.patient_id);
 end if;
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
  approval_unchanged:=coalesce(
   s.clinical_records->'objective'->>'question_key'=p_question_key
   and s.clinical_records->'objective'->'value'=answers->p_question_key
   and ((s.clinical_records->'objective'->'smart_plan')-'saved_at')=(p_plan-'saved_at')
   and s.clinical_records->'objective'->>'pes_approved_at'=s.clinical_records->'pes'->>'approved_at',false);
  if p_action='approve' then
   if not(s.clinical_records ? 'pes') then raise exception 'pes_approval_required'; end if;
   if p_plan->>'pesApprovedAt' is distinct from s.clinical_records->'pes'->>'approved_at' then raise exception 'objective_pes_changed'; end if;
   if jsonb_array_length(p_plan->'goals')<1 then raise exception 'objective_smart_required'; end if;
   goal_value:=answers->p_question_key;
   if jsonb_typeof(goal_value)='string' then goal_text:=btrim(goal_value#>>'{}');
   elsif jsonb_typeof(goal_value)='array' and not exists(select 1 from jsonb_array_elements(goal_value) e where jsonb_typeof(e)<>'string') then
    select string_agg(v,E'\n\n' order by position) into goal_text from jsonb_array_elements_text(goal_value) with ordinality t(v,position);
   elsif jsonb_typeof(goal_value)='array' and not exists(select 1 from jsonb_array_elements(goal_value) e where jsonb_typeof(e)<>'object') then
    select f->>'key' into objective_field from jsonb_array_elements(s.structure->'sections') sec cross join lateral jsonb_array_elements(sec->'questions') q cross join lateral jsonb_array_elements(q->'configuration'->'fields') f where q->>'question_key'=p_question_key and ((f->>'key') || ' ' || (f->>'label')) ~* '(objetivo|objective|goal)' limit 1;
    if objective_field is null then raise exception 'invalid_request'; end if;
    select string_agg(v->>objective_field,E'\n\n' order by position) into goal_text from jsonb_array_elements(goal_value) with ordinality t(v,position);
   else raise exception 'invalid_request'; end if;
   select string_agg(private.compose_nutrition_objective(g),E'\n\n' order by position) into composed from jsonb_array_elements(p_plan->'goals') with ordinality t(g,position);
   if goal_text is distinct from composed then raise exception 'objective_text_mismatch'; end if;
   if length(goal_text) not between 1 and 12000 then raise exception 'invalid_request'; end if;
   if approval_unchanged then approved:=s.clinical_records->'objective';
   else approved:=jsonb_build_object('approved_at',clock_timestamp(),'question_key',p_question_key,'value',goal_value,
    'content',goal_text,'pes_approved_at',s.clinical_records->'pes'->>'approved_at','pes_statement',answers->>'pes_statement',
    'revision',p_revision,'smart_plan',p_plan-'saved_at','reviewed_by',owner);
   end if;
  end if;
  plan:=p_plan || jsonb_build_object('saved_at',clock_timestamp());
  update public.consultation_snapshots set clinical_records=jsonb_set(
    jsonb_set(case when approval_unchanged then clinical_records else clinical_records-'objective' end,'{objective_plans}',coalesce(clinical_records->'objective_plans','{}') || jsonb_build_object(p_question_key,plan)),
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

-- Replaying the same strategy approval keeps its version and execution state.
do $patch$
declare original text; amended text;
begin
 original:=pg_get_functiondef('private.clinical_interventions(uuid,integer,text,jsonb)'::regprocedure);
 amended:=replace(original,
  'if p_action=''save'' then update public.consultation_interventions set draft=doc,updated_at=clock_timestamp() where id=ident;',
  'if item.approved->''document''=doc and item.state in (''approved'',''executing'') then
    if item.draft is not null then update public.consultation_interventions set draft=null,updated_at=clock_timestamp() where id=ident; end if;
   elsif p_action=''save'' then
    if item.draft is distinct from doc then update public.consultation_interventions set draft=doc,updated_at=clock_timestamp() where id=ident; end if;');
 if amended=original then raise exception 'strategy_approval_patch_failed'; end if;
 execute amended;
end $patch$;

-- Re-confirming an identical PES preserves downstream approval identities.
do $patch$
declare original text; amended text; needle text;
begin
 original:=pg_get_functiondef('private.clinical_workspace(uuid,integer,text,jsonb,uuid)'::regprocedure);
 amended:=replace(original,'declare saved jsonb;','declare saved jsonb; reviewed jsonb; existing jsonb; answers jsonb;');
 needle:='if p_payload->''evidenceReviewed'' is distinct from ''true''::jsonb then raise exception ''pes_evidence_review_required''; end if;';
 amended:=replace(amended,needle,needle || $insert$
   perform private.require_my_entitlement('consultations');
   reviewed:=private.clinical_workspace_v4(p_consultation,p_revision);
   if p_payload->>'stamp' is distinct from reviewed->>'stamp' then raise exception 'context_changed'; end if;
   select clinical_records->'pes' into existing from public.consultation_snapshots
    where consultation_id=p_consultation and professional_id=(select auth.uid()) and revision=p_revision;
   select jsonb_object_agg(question_key,value) into answers from public.consultation_answers
    where consultation_id=p_consultation and professional_id=(select auth.uid()) and revision=p_revision;
   if existing->>'approved_at' is not null
    and answers->>'pes_problem'=p_payload->>'problem'
    and answers->>'pes_etiology'=p_payload->>'etiology'
    and answers->>'pes_statement'=p_payload->>'pesStatement'
    and answers->>'pes_evidence'=(select string_agg(v,E'\n') from jsonb_array_elements_text(p_payload->'signsSymptoms') v)
    and coalesce(existing->'evidence','[]')=coalesce(p_payload->'evidence','[]')
    and coalesce(existing->'missingContext','[]')=coalesce(p_payload->'missingContext','[]')
    and coalesce(existing->'uncertainties','[]')=coalesce(p_payload->'uncertainties','[]') then
     return existing;
   end if;
$insert$);
 if amended=original or position('reviewed:=private.clinical_workspace_v4' in amended)=0 then raise exception 'pes_approval_patch_failed'; end if;
 execute amended;
end $patch$;
commit;
