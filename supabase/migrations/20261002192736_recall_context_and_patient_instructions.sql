-- Reuse the validated catalog record for all clinical AI context, without
-- accepting nutrient totals or clinical facts from the browser.
do $$
declare definition text; amended text;
begin
  definition:=pg_get_functiondef('public.ai_clinical_source(uuid,uuid,uuid,integer)'::regprocedure);
  amended:=replace(definition,
    '''measurement_notes'',''indicator_progress'',''first_actions''])',
    '''measurement_notes'',''indicator_progress'',''first_actions'',''recall_date'',''recall_day_type''])');
  if amended=definition then raise exception 'recall_answer_keys_patch_failed'; end if;
  definition:=amended;
  amended:=replace(definition,
    '''identifiers'',jsonb_build_array(p.full_name,p.email,p.phone)',
    '''identifiers'',jsonb_build_array(p.full_name,p.email,p.phone),''recall'',case when s.clinical_records->''recall''->>''approved_at'' is not null then s.clinical_records->''recall'' else null end');
  if amended=definition then raise exception 'recall_context_patch_failed'; end if;
  execute amended;
end $$;

-- Portal guidance reads finalized consultations only. This independent, service
-- only reader leaves the draft requirement of PES/R24h/objectives intact.
create function public.ai_patient_instructions_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.consultation_snapshots; p public.patients; facts jsonb; stamp text;
begin
  if p_revision is null or p_revision<1 or not exists(select 1 from public.consultations c
    where c.id=p_consultation and c.patient_id=p_patient and c.professional_id=p_owner
      and c.status='completed' and c.deleted_at is null) then raise exception 'context_unavailable'; end if;
  select * into p from public.patients where id=p_patient and professional_id=p_owner and deleted_at is null;
  if not found then raise exception 'context_unavailable'; end if;
  select * into s from public.consultation_snapshots where consultation_id=p_consultation
    and patient_id=p_patient and professional_id=p_owner order by revision desc limit 1;
  if s.id is null or s.revision<>p_revision then raise exception 'context_unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('source','Entrevista · ' || replace(a.question_key,'_',' '),
    'finding',a.value::text) order by a.question_key),'[]') into facts
  from public.consultation_answers a where a.professional_id=p_owner and a.patient_id=p_patient
    and a.consultation_id=p_consultation and a.revision=p_revision
    and a.question_key=any(array['main_reason','expectations','objectives','treatment_objective','next_objectives',
      'first_actions','adjustments','interview_priorities','access_barriers','barriers','eating_drivers',
      'medical_history_status','medical_diagnoses_v2','medical_changes','medication_status','medication_list_v2',
      'food_reactions_status','food_reactions_v2','recall_24h_v2','recall_date','recall_day_type'])
    and a.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb);
  select md5(concat_ws('|',s.id,s.revision,s.clinical_records->>'updated_at',
    (select string_agg(a.id::text || a.updated_at::text,',' order by a.id) from public.consultation_answers a
      where a.professional_id=p_owner and a.patient_id=p_patient and a.consultation_id=p_consultation and a.revision=p_revision))) into stamp;
  return jsonb_build_object('facts',facts,'stamp',stamp,
    'identifiers',jsonb_build_array(p.full_name,p.email,p.phone),
    'recall',case when s.clinical_records->'recall'->>'approved_at' is not null then s.clinical_records->'recall' else null end);
end $$;
revoke all on function public.ai_patient_instructions_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_patient_instructions_source(uuid,uuid,uuid,integer) to service_role;

insert into private.entitlement_catalog(key,label,category,value_type,display_order)
values('ai.patient_instructions','Apoyo IA para indicaciones del paciente','IA','boolean',126)
on conflict(key) do nothing;
insert into private.plan_entitlements(plan_id,entitlement_key,value)
select id,'ai.patient_instructions',to_jsonb(code in ('profesional','full_access')) from private.plans
on conflict(plan_id,entitlement_key) do nothing;
insert into private.ai_feature_config(feature,enabled,provider,model,prompt_version,max_input_tokens,max_output_tokens,
  reasoning_level,temperature,timeout_ms,max_provider_attempts,credit_multiplier,credits_per_usd,
  input_usd_per_million,cached_usd_per_million,output_usd_per_million,pricing_version,execution_mode)
select 'patient_instructions',enabled,provider,model,'patient_instructions@1',max_input_tokens,768,
  reasoning_level,temperature,timeout_ms,1,credit_multiplier,credits_per_usd,
  input_usd_per_million,cached_usd_per_million,output_usd_per_million,pricing_version,execution_mode
from private.ai_feature_config where feature='consultation_support'
on conflict(feature) do nothing;
update private.ai_feature_config set prompt_version='consultation_support@2',updated_at=now()
where feature='consultation_support';

-- Same credit reservations, consent, live limits, and administrator controls.
do $$
declare signature text; definition text; amended text;
begin
  foreach signature in array array['public.ai_server(text,uuid,jsonb)','private.ai_feature_allowed(uuid,text)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    amended:=replace(definition,
      'when ''consultation_support'' then ''ai.consultation_support''',
      'when ''consultation_support'' then ''ai.consultation_support'' when ''patient_instructions'' then ''ai.patient_instructions''');
    if amended=definition then raise exception 'instructions_gate_patch_failed: %',signature; end if;
    execute amended;
  end loop;
  definition:=pg_get_functiondef('private.ai_live_pilot_eligible(uuid)'::regprocedure);
  amended:=replace(definition,
    'or coalesce((private.resolve_effective_entitlements(p_owner)->''values''->>''ai.consultation_support'')::boolean,false)',
    'or coalesce((private.resolve_effective_entitlements(p_owner)->''values''->>''ai.consultation_support'')::boolean,false) or coalesce((private.resolve_effective_entitlements(p_owner)->''values''->>''ai.patient_instructions'')::boolean,false)');
  if amended=definition then raise exception 'instructions_eligibility_patch_failed'; end if;
  execute amended;
  foreach signature in array array['private.ai_live_pilot_policy_valid()','private.admin_commercial_costs()'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    amended:=replace(definition,'''consultation_support''','''consultation_support'',''patient_instructions''');
    if amended=definition then raise exception 'instructions_policy_patch_failed: %',signature; end if;
    execute amended;
  end loop;
  definition:=pg_get_functiondef('private.pre_live_evidence()'::regprocedure);
  amended:=replace(definition,'R24h, PES, Taller y objetivos de consulta según los permisos contratados.',
    'R24h, PES, Taller, objetivos e indicaciones según los permisos contratados.');
  if amended=definition then raise exception 'instructions_readiness_patch_failed'; end if;
  execute amended;
end $$;
