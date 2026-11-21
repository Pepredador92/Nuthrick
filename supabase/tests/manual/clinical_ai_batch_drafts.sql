-- Synthetic fixtures. Run after applying the clinical batch migration locally.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  patient_id uuid := gen_random_uuid();
  visit_id uuid := gen_random_uuid();
  generation_id uuid := gen_random_uuid();
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
end $$;
rollback;
