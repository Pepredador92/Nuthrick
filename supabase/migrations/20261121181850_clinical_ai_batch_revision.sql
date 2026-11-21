begin;
set local lock_timeout = '5s';

-- Revision proposals are separate until the professional selects one.
create or replace function private.ai_store_clinical_batch_stage(p_owner uuid,p_generation uuid,p_batch uuid,p_result jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  g private.ai_generations;
  s public.consultation_snapshots;
  slot text;
  current_slot text;
  revises text := p_result->>'revises';
begin
  select * into g from private.ai_generations
  where id=p_generation and professional_id=p_owner and status='running'
    and feature in ('pes_diagnosis','consultation_support','intervention_strategy','patient_instructions');
  if not found or p_batch is null or p_result->>'generationId' is distinct from g.id::text
    or jsonb_typeof(p_result->'output') is distinct from 'object' or octet_length(p_result::text)>1000000
    then raise exception 'generation_unavailable'; end if;
  perform 1 from public.consultations where id=g.consultation_id and professional_id=p_owner
    and patient_id=g.patient_id and deleted_at is null and status='draft' for update;
  if not found then raise exception 'context_unavailable'; end if;
  select * into s from public.consultation_snapshots
  where consultation_id=g.consultation_id and professional_id=p_owner and patient_id=g.patient_id
  order by revision desc limit 1 for update;
  if not found or s.revision is distinct from g.clinical_revision then raise exception 'context_unavailable'; end if;
  current_slot := 'proposal:batch:'||g.feature;
  slot := current_slot;
  if revises is not null then
    if s.working_drafts#>>'{clinical-batch,id}' is distinct from p_batch::text
      or s.working_drafts->current_slot->>'batchId' is distinct from p_batch::text
      or s.working_drafts->current_slot->>'generationId' is distinct from revises
      then raise exception 'context_changed'; end if;
    slot := 'proposal:batch-revision:'||g.feature;
  end if;
  p_result := p_result||jsonb_build_object('batchId',p_batch);
  if s.working_drafts->slot=p_result then return; end if;
  if exists(select 1 from private.ai_generations newer
    where newer.id::text=s.working_drafts->slot->>'generationId' and newer.professional_id=p_owner
      and newer.started_at>g.started_at) then raise exception 'context_changed'; end if;
  update public.consultation_snapshots
   set working_drafts=working_drafts||jsonb_build_object(slot,p_result),
       working_drafts_version=working_drafts_version+1 where id=s.id;
end $$;

create function private.review_clinical_ai_batch(p_consultation uuid,p_revision integer,p_batch uuid,p_action text,p_feature text,p_generation uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  owner uuid := (select auth.uid());
  c public.consultations;
  s public.consultation_snapshots;
  drafts jsonb;
  run jsonb;
  draft_proposal jsonb;
  new_proposal jsonb;
  phase text;
  slot text;
  candidate_slot text;
  draft_id text;
  previous_ids jsonb := '[]';
  batch_ids text[];
  phases constant text[] := array['pes_diagnosis','consultation_support','intervention_strategy','patient_instructions'];
begin
  perform private.require_my_entitlement('consultations');
  select * into c from public.consultations where id=p_consultation and professional_id=owner
    and deleted_at is null and status='draft' for update;
  if not found then raise exception 'context_unavailable'; end if;
  perform private.require_retention_patient(owner,c.patient_id);
  select * into s from public.consultation_snapshots where consultation_id=c.id and professional_id=owner
    order by revision desc limit 1 for update;
  if not found or s.revision is distinct from p_revision then raise exception 'context_unavailable'; end if;
  drafts := s.working_drafts;
  run := drafts->'clinical-batch';
  if p_batch is null or run->>'id' is distinct from p_batch::text then raise exception 'context_changed'; end if;

  if p_action='clear' then
    if exists(select 1 from private.ai_generations g where g.professional_id=owner and g.consultation_id=c.id
      and g.clinical_revision=p_revision and g.status in ('reserved','running','uncertain')
      and g.idempotency_key::text in (
        select value from jsonb_each_text(coalesce(run->'attempts','{}'::jsonb))
        union all select drafts->('batch-revision-request:'||name)->>'key' from unnest(phases) name
      )) then raise exception 'batch_generation_pending'; end if;
    select array_agg(distinct value) into batch_ids from (
      select drafts->('proposal:batch:'||name)->>'generationId' as value from unnest(phases) name
      union all select drafts->('batch-reviewed:'||name)#>>'{}' from unnest(phases) name
      union all select value from jsonb_each_text(coalesce(run->'completed','{}'::jsonb))
    ) ids where value is not null;
    if drafts->>'generation:pes_diagnosis'=any(batch_ids) then
      if drafts->'pes-replacement' <> 'null'::jsonb then
        drafts := drafts||jsonb_build_object('pes-replacement',null,'generation:pes_diagnosis',drafts->'pes-previous-generation');
      else
        drafts := drafts||jsonb_build_object('pes',null,'generation:pes_diagnosis',null);
      end if;
    end if;

    -- Pending suggestion cards are separate from actions already added to a clinical editor.
    for slot, draft_id in select key,value#>>'{}' from jsonb_each(drafts)
      where key like 'suggestions:%:batch' loop
      if draft_id=any(batch_ids) then
        slot := left(slot,-6);
        drafts := drafts||jsonb_build_object(slot,'[]'::jsonb,slot||':applied','[]'::jsonb,slot||':batch',null);
      end if;
    end loop;
    if jsonb_typeof(drafts->'strategy-proposals')='array' then
      drafts := jsonb_set(drafts,'{strategy-proposals}',(
        select coalesce(jsonb_agg(value order by position),'[]') from jsonb_array_elements(drafts->'strategy-proposals') with ordinality as item(value,position)
        where not coalesce((value->>'generationId')=any(batch_ids),false)
      ));
    end if;
    foreach phase in array phases loop
      drafts := drafts - ('proposal:batch:'||phase) - ('proposal:batch-revision:'||phase)
        - ('batch-reviewed:'||phase) - ('batch-revision-request:'||phase);
    end loop;
    drafts := drafts||jsonb_build_object('clinical-batch',null);
  elsif p_action in ('accept','discard') and p_feature=any(phases) and p_generation is not null then
    slot := 'proposal:batch:'||p_feature;
    candidate_slot := 'proposal:batch-revision:'||p_feature;
    draft_proposal := drafts->slot;
    new_proposal := drafts->candidate_slot;
    if new_proposal->>'batchId' is distinct from p_batch::text
      or new_proposal->>'generationId' is distinct from p_generation::text
      or new_proposal->>'revises' is distinct from draft_proposal->>'generationId'
      or not exists(select 1 from private.ai_generations where id=p_generation and professional_id=owner
        and consultation_id=c.id and patient_id=c.patient_id and clinical_revision=p_revision and feature=p_feature and status='succeeded')
      then raise exception 'context_changed'; end if;
    if p_action='accept' then
      foreach phase in array phases loop
        exit when phase=p_feature;
        previous_ids := previous_ids||jsonb_build_array(drafts->('proposal:batch:'||phase)->>'generationId');
      end loop;
      if new_proposal->'inputGenerations' is distinct from previous_ids then raise exception 'context_changed'; end if;
      run := jsonb_set(run,array['completed',p_feature],to_jsonb(p_generation));
      drafts := drafts||jsonb_build_object(slot,new_proposal-'revises','clinical-batch',run);
    end if;
    drafts := drafts - candidate_slot - ('batch-revision-request:'||p_feature);
  else
    raise exception 'invalid_request';
  end if;
  update public.consultation_snapshots set working_drafts=drafts,
    working_drafts_version=working_drafts_version+1 where id=s.id;
end $$;

revoke all on function private.review_clinical_ai_batch(uuid,integer,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.review_clinical_ai_batch(uuid,integer,uuid,text,text,uuid) to authenticated;

create function public.review_clinical_ai_batch(p_consultation uuid,p_revision integer,p_batch uuid,p_action text,p_feature text default null,p_generation uuid default null)
returns void language sql security invoker set search_path='' as $$
  select private.review_clinical_ai_batch(p_consultation,p_revision,p_batch,p_action,p_feature,p_generation)
$$;
revoke all on function public.review_clinical_ai_batch(uuid,integer,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.review_clinical_ai_batch(uuid,integer,uuid,text,text,uuid) to authenticated;

commit;
