begin;
set local lock_timeout = '5s';

-- Stage results stay in the versioned, server-owned proposal namespace.
-- Clinical approvals and canonical answers use their existing transactions.
create function private.ai_store_clinical_batch_stage(p_owner uuid,p_generation uuid,p_batch uuid,p_result jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare g private.ai_generations; s public.consultation_snapshots; slot text;
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
  slot := 'proposal:batch:'||g.feature;
  p_result := p_result||jsonb_build_object('batchId',p_batch);
  if s.working_drafts->slot=p_result then return; end if;
  if exists(select 1 from private.ai_generations newer
    where newer.id::text=s.working_drafts->slot->>'generationId' and newer.professional_id=p_owner
      and newer.started_at>g.started_at) then raise exception 'context_changed'; end if;
  update public.consultation_snapshots
   set working_drafts=working_drafts||jsonb_build_object(slot,p_result),
       working_drafts_version=working_drafts_version+1 where id=s.id;
end $$;
revoke all on function private.ai_store_clinical_batch_stage(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.ai_store_clinical_batch_stage(uuid,uuid,uuid,jsonb) to service_role;

create function public.ai_store_clinical_batch_stage(p_owner uuid,p_generation uuid,p_batch uuid,p_result jsonb)
returns void language sql security invoker set search_path='' as $$
  select private.ai_store_clinical_batch_stage(p_owner,p_generation,p_batch,p_result)
$$;
revoke all on function public.ai_store_clinical_batch_stage(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ai_store_clinical_batch_stage(uuid,uuid,uuid,jsonb) to service_role;

create function public.ai_clinical_batch_stages(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer,p_batch uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_object_agg(g.feature,result.value),'{}'::jsonb)
  from public.consultation_snapshots s
  join public.consultations c on c.id=s.consultation_id and c.professional_id=p_owner and c.patient_id=p_patient
  cross join lateral jsonb_each(s.working_drafts) result
  join private.ai_generations g on g.id::text=result.value->>'generationId'
    and g.professional_id=p_owner and g.consultation_id=c.id and g.patient_id=p_patient and g.clinical_revision=p_revision
    and result.key='proposal:batch:'||g.feature and g.status='succeeded'
  where s.consultation_id=p_consultation and s.professional_id=p_owner and s.patient_id=p_patient
    and s.revision=p_revision and c.status='draft' and c.deleted_at is null
    and result.value->>'batchId'=p_batch::text
$$;
revoke all on function public.ai_clinical_batch_stages(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.ai_clinical_batch_stages(uuid,uuid,uuid,integer,uuid) to service_role;

commit;
