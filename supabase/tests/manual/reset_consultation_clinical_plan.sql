-- Synthetic test for a local database after applying the clinical reset migration.
begin;

do $$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  patient_id uuid := gen_random_uuid();
  visit_id uuid := gen_random_uuid();
  old_visit_id uuid := gen_random_uuid();
  snapshot_id uuid := gen_random_uuid();
  strategy_id uuid := gen_random_uuid();
  unfinished_strategy_id uuid := gen_random_uuid();
  generation_id uuid := gen_random_uuid();
  batch_generation_id uuid := gen_random_uuid();
  generation_payload jsonb;
  current_answers jsonb;
  current_drafts jsonb;
  result jsonb;
  previous_answer_version bigint;
  previous_draft_version bigint;
begin
  if has_function_privilege('anon','public.reset_consultation_clinical_plan(uuid,integer,bigint,bigint)','execute')
    then raise exception 'anonymous reset permission'; end if;
  insert into auth.users (id,email) values
    (owner_id, 'reset-' || owner_id || '@example.invalid'), (other_id, 'reset-' || other_id || '@example.invalid');
  insert into private.professional_access (professional_id,plan_id,status,source)
    select member, id, 'active', 'manual' from private.plans
      cross join unnest(array[owner_id,other_id]) member where code = 'profesional';
  insert into private.ai_accounts (professional_id) values (owner_id) on conflict do nothing;
  insert into public.patients (id,professional_id,full_name)
    values (patient_id,owner_id,'Paciente sintético');
  insert into public.consultations (id,professional_id,patient_id,status,consultation_date,sequence_number,consultation_type)
    values (visit_id,owner_id,patient_id,'draft',now(),2,'follow_up'),
      (old_visit_id,owner_id,patient_id,'completed',now()-interval '1 day',1,'initial');
  insert into public.consultation_snapshots
    (id,professional_id,patient_id,consultation_id,revision,template_name,template_version,structure)
    values (snapshot_id,owner_id,patient_id,visit_id,1,'Plantilla sintética',1,'{"sections":[]}'),
      (gen_random_uuid(),owner_id,patient_id,old_visit_id,1,'Plantilla anterior',1,'{"sections":[]}');
  insert into public.consultation_answers (professional_id,consultation_id,patient_id,revision,section_key,response_area,question_key,value)
    select owner_id, visit_id, patient_id, 1, 'test', 'professional_assessment', key, to_jsonb(key)
    from unnest(array['main_reason','clinical_notes','measurement_notes','recall_narrative','pes_problem',
      'pes_etiology','pes_evidence','pes_statement','next_objectives','first_actions','patient_instructions',
      'recommendations','followup_plan','followup_indicators','nutrition_assessment']) key;
  insert into public.consultation_interventions (id,snapshot_id,professional_id,version,state,approved,draft,execution)
    values (strategy_id,snapshot_id,owner_id,1,'executing','{"document":{"strategy":{"title":"Estrategia aprobada"}}}','{}','{"recipient":"Registro previo"}'),
      (unfinished_strategy_id,snapshot_id,owner_id,0,'draft',null,'{}','{}');
  insert into public.consultation_intervention_history (intervention_id,professional_id,version,action,payload)
    values (strategy_id,owner_id,1,'approve','{"event":"approval"}');
  update public.consultation_snapshots set
    clinical_records = '{"pes":{"approved_at":"before"},"objective":{"approved_at":"before"},"objective_plans":{"next_objectives":{}},"recall":{"confirmed":true}}',
    working_drafts = '{"recall-rows":[{}],"clinical-reviewed-sources":{},"clinical-batch":{},"pes":{"problem":"antes"},
      "objective:next_objectives":{},"strategies":{},"strategy-alternatives":{},"instructions-approved":"antes",
      "suggestions:instructions:first_actions":[],"proposal:batch:pes_diagnosis":{},"followup-note":"antes"}',
    working_drafts_version = 7
    where id = snapshot_id;
  update public.consultation_snapshots set clinical_records = '{"pes":{"approved_at":"historical"}}'
    where consultation_id = old_visit_id;
  select answers_version, working_drafts_version into previous_answer_version, previous_draft_version
    from public.consultation_snapshots where id = snapshot_id;
  insert into private.ai_generations (id,professional_id,idempotency_key,request_hash,patient_id,consultation_id,
    feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost,clinical_revision)
    values (generation_id,owner_id,gen_random_uuid(),repeat('a',64),patient_id,visit_id,'consultation_support','openai','synthetic','consultation_support@6','{}','succeeded',0,0,0,1),
      (batch_generation_id,owner_id,gen_random_uuid(),repeat('b',64),patient_id,visit_id,'pes_diagnosis','openai','synthetic','pes_diagnosis@10','{}','running',0,0,0,1);

  perform set_config('request.jwt.claim.sub',other_id::text,true);
  set local role authenticated;
  begin
    perform public.reset_consultation_clinical_plan(visit_id,1,previous_answer_version,previous_draft_version);
    raise exception 'foreign consultation reset';
  exception when insufficient_privilege then
    if sqlerrm <> 'consultation_not_editable' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  begin
    perform public.reset_consultation_clinical_plan(visit_id,1,previous_answer_version,previous_draft_version - 1);
    raise exception 'stale reset succeeded';
  exception when raise_exception then
    if sqlerrm <> 'context_changed' then raise; end if;
  end;
  begin
    perform public.reset_consultation_clinical_plan(old_visit_id,1,0,0);
    raise exception 'completed consultation reset';
  exception when insufficient_privilege then
    if sqlerrm <> 'consultation_not_editable' then raise; end if;
  end;

  result := public.reset_consultation_clinical_plan(visit_id,1,previous_answer_version,previous_draft_version);
  current_answers := public.sync_consultation_answers(visit_id,1);
  current_drafts := public.sync_consultation_drafts(visit_id,1);
  if result is distinct from current_answers or current_answers->'clinicalPlanResetVersion' is distinct from current_answers->'version'
    or current_drafts->'clinicalPlanResetVersion' is distinct from current_drafts->'version'
    then raise exception 'missing reset versions'; end if;
  if current_answers->'answers' is distinct from '{"main_reason":"main_reason","clinical_notes":"clinical_notes","measurement_notes":"measurement_notes","recall_narrative":"recall_narrative"}'::jsonb
    then raise exception 'cleanup scope incorrect'; end if;
  if current_drafts->'answers' is distinct from '{"recall-rows":[{}],"clinical-reviewed-sources":{},"navigation":{"module":"clinical","active":0,"clinicalStage":0}}'::jsonb
    then raise exception 'checkpoint cleanup scope incorrect'; end if;
  if (public.sync_consultation_drafts(visit_id,1,previous_draft_version,'{"pes":{"problem":"stale"}}',gen_random_uuid())->>'conflict') is distinct from 'true'
    or (public.sync_consultation_drafts(visit_id,1)->'answers') ? 'pes'
    then raise exception 'stale draft restored'; end if;
  if public.clinical_interventions(visit_id,1)->'items' is distinct from '[]'::jsonb
    then raise exception 'archived strategies still visible in editor'; end if;
  reset role;

  if not exists(select 1 from public.consultation_interventions where id=strategy_id and state='withdrawn'
      and draft is null and planning_reset_at is not null and execution->>'recipient'='Registro previo')
    or (select count(*) from public.consultation_intervention_history where intervention_id=strategy_id) <> 2
    or exists(select 1 from public.consultation_interventions where id=unfinished_strategy_id)
    then raise exception 'strategy lifecycle incorrect'; end if;
  if exists(select 1 from public.consultation_snapshots where id=snapshot_id and (clinical_records ?| array['pes','objective','objective_plans'] or not clinical_records ? 'recall'))
    or not exists(select 1 from public.consultation_snapshots where consultation_id=old_visit_id and clinical_records ? 'pes')
    then raise exception 'clinical records cleanup scope incorrect'; end if;
  if public.ai_clinical_source(owner_id,patient_id,visit_id,1)->>'strategyRequired' is distinct from 'false'
    then raise exception 'archived strategies block new indications'; end if;

  generation_payload := jsonb_build_object('generationId',generation_id,'output','{}'::jsonb);
  begin
    perform public.ai_store_consultation_proposal(owner_id,generation_id,generation_payload);
    raise exception 'late individual proposal reappeared';
  exception when raise_exception then
    if sqlerrm <> 'context_changed' then raise; end if;
  end;
  begin
    perform public.ai_store_clinical_batch_stage(owner_id,batch_generation_id,gen_random_uuid(),
      jsonb_build_object('generationId',batch_generation_id,'output','{}'::jsonb));
    raise exception 'late batch proposal reappeared';
  exception when raise_exception then
    if sqlerrm <> 'context_changed' then raise; end if;
  end;
  update private.ai_generations set started_at=clock_timestamp()+interval '1 second' where id=generation_id;
  perform public.ai_store_consultation_proposal(owner_id,generation_id,generation_payload);
  if not exists(select 1 from public.consultation_snapshots where id=snapshot_id and working_drafts ? 'proposal:consultation_support')
    then raise exception 'fresh proposal rejected'; end if;
end $$;

rollback;
