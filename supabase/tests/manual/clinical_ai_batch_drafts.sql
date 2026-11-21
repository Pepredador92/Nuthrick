-- Synthetic fixtures. Run after applying the clinical batch migration locally.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  patient_id uuid := gen_random_uuid();
  visit_id uuid := gen_random_uuid();
  generation_id uuid := gen_random_uuid();
  candidate_id uuid := gen_random_uuid();
  candidate_request uuid := gen_random_uuid();
  batch_id uuid := gen_random_uuid();
  payload jsonb;
  drafts jsonb;
begin
  insert into auth.users(id,email) values(owner_id,'clinical-batch-'||owner_id||'@example.invalid');
  insert into private.ai_accounts(professional_id) values(owner_id) on conflict do nothing;
  insert into private.professional_access(professional_id,plan_id,status,source)
    select owner_id,id,'active','manual' from private.plans where code='profesional';
  insert into public.patients(id,professional_id,full_name)
    values(patient_id,owner_id,'Paciente sintético de prueba');
  insert into public.consultations(id,professional_id,patient_id,status,consultation_date,sequence_number,consultation_type)
    values(visit_id,owner_id,patient_id,'draft',now(),1,'initial');
  insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,template_name,template_version,structure)
    values(owner_id,patient_id,visit_id,1,'Plantilla sintética',1,'{"sections":[]}');
  insert into private.ai_generations(id,professional_id,idempotency_key,request_hash,patient_id,consultation_id,
    feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost,clinical_revision)
    values(generation_id,owner_id,gen_random_uuid(),repeat('a',64),patient_id,visit_id,'pes_diagnosis','openai','synthetic',
      'pes_diagnosis@10','{}','running',0,0,0,1);
  payload := jsonb_build_object('generationId',generation_id,'output',jsonb_build_object('problem','Propuesta sintética'),'inputGenerations','[]'::jsonb);

  set local role service_role;
  perform public.ai_store_clinical_batch_stage(owner_id,generation_id,batch_id,payload);
  perform public.ai_store_clinical_batch_stage(owner_id,generation_id,batch_id,payload);
  if public.ai_clinical_batch_stages(owner_id,patient_id,visit_id,1,batch_id)<>'{}' then raise exception 'unsettled_stage_visible'; end if;
  reset role;
  update private.ai_generations set status='succeeded' where id=generation_id;

  set local role service_role;
  drafts:=public.ai_clinical_batch_stages(owner_id,patient_id,visit_id,1,batch_id);
  if drafts#>>'{pes_diagnosis,output,problem}' is distinct from 'Propuesta sintética' then raise exception 'stage_not_readable'; end if;
  if public.ai_clinical_batch_stages(owner_id,patient_id,visit_id,1,gen_random_uuid())<>'{}'
    or public.ai_clinical_batch_stages(owner_id,gen_random_uuid(),visit_id,1,batch_id)<>'{}'
    or public.ai_clinical_batch_stages(owner_id,patient_id,visit_id,2,batch_id)<>'{}' then raise exception 'batch_not_scoped'; end if;
  reset role;

  if has_function_privilege('authenticated','public.ai_clinical_batch_stages(uuid,uuid,uuid,integer,uuid)','execute')
    or has_function_privilege('authenticated','public.ai_store_clinical_batch_stage(uuid,uuid,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','private.ai_store_clinical_batch_stage(uuid,uuid,uuid,jsonb)','execute')
    then raise exception 'unexpected_batch_service_access'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  drafts:=public.sync_consultation_drafts(visit_id,1);
  if drafts->>'version'<>'1' or drafts#>>'{answers,proposal:batch:pes_diagnosis,output,problem}' is distinct from 'Propuesta sintética'
    then raise exception 'checkpoint_missing_or_rewritten'; end if;
  begin
    perform public.sync_consultation_drafts(visit_id,1,1,'{"proposal:batch:pes_diagnosis":null}',gen_random_uuid());
    raise exception 'browser_overwrote_proposal';
  exception when raise_exception then if sqlerrm<>'invalid_request' then raise; end if; end;
  reset role;

  if exists(select 1 from public.consultation_snapshots where consultation_id=visit_id and clinical_records ? 'pes')
    then raise exception 'batch_approved_pes'; end if;

  set local role authenticated;
  drafts:=public.sync_consultation_drafts(visit_id,1,1,jsonb_build_object(
    'clinical-batch',jsonb_build_object('id',batch_id,'completed',jsonb_build_object('pes_diagnosis',generation_id),'attempts','{}'::jsonb),
    'pes-clinical-context','Aclaración aparte',
    'generation:pes_diagnosis',generation_id,'pes',jsonb_build_object('problem','Borrador en revisión'),
    'suggestions:objectives:main:batch',generation_id,'suggestions:objectives:main',jsonb_build_array('Propuesta pendiente'),
    'objective:main',jsonb_build_object('goals',jsonb_build_array('Objetivo que se incorporó al editor')),
    'batch-revision-request:pes_diagnosis',jsonb_build_object('key',candidate_request)
  ),gen_random_uuid());
  reset role;
  insert into private.ai_generations(id,professional_id,idempotency_key,request_hash,patient_id,consultation_id,
    feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost,clinical_revision)
    values(candidate_id,owner_id,candidate_request,repeat('b',64),patient_id,visit_id,'pes_diagnosis','openai','synthetic',
      'pes_diagnosis@10','{}','running',0,0,0,1);
  set local role service_role;
  perform public.ai_store_clinical_batch_stage(owner_id,candidate_id,batch_id,jsonb_build_object(
    'generationId',candidate_id,'output',jsonb_build_object('problem','Propuesta alternativa'),
    'inputGenerations','[]'::jsonb,'revises',generation_id));
  drafts:=public.ai_clinical_batch_stages(owner_id,patient_id,visit_id,1,batch_id);
  if drafts#>>'{pes_diagnosis,generationId}' is distinct from generation_id::text then raise exception 'candidate_replaced_original'; end if;
  reset role;
  set local role authenticated;
  begin
    perform public.review_clinical_ai_batch(visit_id,1,batch_id,'accept','pes_diagnosis',candidate_id);
    raise exception 'unsettled_candidate_accepted';
  exception when raise_exception then if sqlerrm<>'context_changed' then raise; end if; end;
  begin
    perform public.review_clinical_ai_batch(visit_id,1,batch_id,'clear');
    raise exception 'running_batch_cleared';
  exception when raise_exception then if sqlerrm<>'batch_generation_pending' then raise; end if; end;
  begin
    perform public.review_clinical_ai_batch(visit_id,1,gen_random_uuid(),'clear');
    raise exception 'unrelated_batch_cleared';
  exception when raise_exception then if sqlerrm<>'context_changed' then raise; end if; end;
  reset role;
  update private.ai_generations set status='succeeded' where id=candidate_id;
  set local role authenticated;
  perform public.review_clinical_ai_batch(visit_id,1,batch_id,'accept','pes_diagnosis',candidate_id);
  drafts:=public.sync_consultation_drafts(visit_id,1)->'answers';
  if drafts#>>'{clinical-batch,completed,pes_diagnosis}' is distinct from candidate_id::text
    or drafts ? 'proposal:batch-revision:pes_diagnosis' then raise exception 'candidate_not_promoted'; end if;
  -- Existing batch imports remain identifiable if the alternate version was
  -- selected before returning to the stage editor.
  perform public.sync_consultation_drafts(visit_id,1,(public.sync_consultation_drafts(visit_id,1)->>'version')::bigint,
    jsonb_build_object('batch-reviewed:pes_diagnosis',generation_id),gen_random_uuid());
  perform public.review_clinical_ai_batch(visit_id,1,batch_id,'clear');
  drafts:=public.sync_consultation_drafts(visit_id,1)->'answers';
  if drafts->'clinical-batch' is distinct from 'null'::jsonb or drafts ? 'proposal:batch:pes_diagnosis'
    or drafts->'pes' is distinct from 'null'::jsonb or drafts->'suggestions:objectives:main' is distinct from '[]'::jsonb
    or drafts->>'pes-clinical-context' is distinct from 'Aclaración aparte'
    or drafts#>>'{objective:main,goals,0}' is distinct from 'Objetivo que se incorporó al editor'
    then raise exception 'wrong_drafts_cleared'; end if;
end $$;
rollback;
