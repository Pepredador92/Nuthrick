begin;
set local lock_timeout='5s';
-- Versioned working copies are separate from approved clinical records and are
-- never exported or published as an approved diagnosis, goal or intervention.
alter table public.consultation_snapshots
 add column working_drafts jsonb not null default '{}'::jsonb check(jsonb_typeof(working_drafts)='object' and octet_length(working_drafts::text)<=8000000),
 add column working_drafts_version bigint not null default 0,
 add column working_drafts_receipt jsonb;

create function private.sync_consultation_drafts(p_consultation uuid,p_revision integer,p_version bigint default null,p_changes jsonb default null,p_request uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(select auth.uid()); c public.consultations; s public.consultation_snapshots; receipt text; conflict boolean:=false;
begin
 if owner is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if not private.can_read_feature(owner,'consultations') then raise exception 'entitlement_required' using errcode='42501'; end if;
 if p_changes is null then
  select snapshot.* into s from public.consultations visit join public.consultation_snapshots snapshot on snapshot.consultation_id=visit.id and snapshot.professional_id=owner
   where visit.id=p_consultation and visit.professional_id=owner and visit.deleted_at is null and snapshot.revision=p_revision;
  if not found then raise exception 'consultation_revision_changed'; end if;
  return jsonb_build_object('version',s.working_drafts_version,'answers',s.working_drafts);
 end if;
 perform private.require_my_entitlement('consultations');
 select * into c from public.consultations where id=p_consultation and professional_id=owner and deleted_at is null for update;
 if not found or c.status<>'draft' then raise exception 'consultation_not_editable' using errcode='42501'; end if;
 perform private.require_retention_patient(owner,c.patient_id);
 select * into s from public.consultation_snapshots where consultation_id=c.id and professional_id=owner order by revision desc limit 1 for update;
 if s.id is null or s.revision<>p_revision then raise exception 'consultation_revision_changed'; end if;
 if p_version is null or p_version<0 or p_request is null or jsonb_typeof(p_changes) is distinct from 'object' or octet_length(p_changes::text)>8000000
  or exists(select 1 from jsonb_object_keys(p_changes) k where k!~'^[a-z][a-zA-Z0-9:_-]{0,199}$' or k like 'proposal:%') then raise exception 'invalid_request'; end if;
 receipt:=md5(p_version::text||':'||p_changes::text);
 if s.working_drafts_receipt->>'id'=p_request::text then
  if s.working_drafts_receipt->>'hash'<>receipt then raise exception 'save_request_reused'; end if;
  conflict:=(s.working_drafts_receipt->>'version')::bigint<>s.working_drafts_version;
 elsif p_version<>s.working_drafts_version then conflict:=true;
 else
  update public.consultation_snapshots set working_drafts=working_drafts||p_changes,working_drafts_version=working_drafts_version+1,
   working_drafts_receipt=jsonb_build_object('id',p_request,'hash',receipt,'version',working_drafts_version+1) where id=s.id returning * into s;
 end if;
 return jsonb_build_object('version',s.working_drafts_version,'answers',s.working_drafts,'conflict',conflict);
end $$;
revoke all on function private.sync_consultation_drafts(uuid,integer,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function private.sync_consultation_drafts(uuid,integer,bigint,jsonb,uuid) to authenticated;
create function public.sync_consultation_drafts(p_consultation uuid,p_revision integer,p_version bigint default null,p_changes jsonb default null,p_request uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.sync_consultation_drafts(p_consultation,p_revision,p_version,p_changes,p_request)$$;
revoke all on function public.sync_consultation_drafts(uuid,integer,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function public.sync_consultation_drafts(uuid,integer,bigint,jsonb,uuid) to authenticated;

-- A proposed strategy can refer to saved, unapproved goals. A draft binding is
-- explicitly marked; approving a strategy still requires actual approvals.
create function private.consultation_planning_objective(drafts jsonb,records jsonb,pes jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
 with candidates as (
  select key,value as plan,0 as rank from jsonb_each(drafts) where key like 'objective:%'
  union all select key,value,1 from jsonb_each(case when jsonb_typeof(records->'objective_plans')='object' then records->'objective_plans' else '{}'::jsonb end) where not drafts ? ('objective:'||key)
 ), chosen as (
  select * from candidates where jsonb_typeof(plan)='object' and plan->>'pesApprovedAt'=pes->>'approved_at'
   and jsonb_typeof(plan->'goals')='array' and jsonb_array_length(plan->'goals') between 1 and 3
   and exists(select 1 from jsonb_array_elements(plan->'goals') goal where btrim(coalesce(goal->>'outcome',''))<>'')
  order by rank,key limit 1
 ) select jsonb_build_object('approved_at','draft:'||md5(plan::text),'pes_approved_at',pes->>'approved_at','question_key',replace(key,'objective:',''),
   'smart_plan',plan,'pes_statement',pes->>'pesStatement') from chosen;
$$;
revoke all on function private.consultation_planning_objective(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.consultation_planning_objective(jsonb,jsonb,jsonb) to service_role;
alter function public.ai_clinical_source(uuid,uuid,uuid,integer) rename to ai_clinical_source_before_working_drafts;
alter function public.ai_clinical_source_before_working_drafts(uuid,uuid,uuid,integer) set schema private;
revoke all on function private.ai_clinical_source_before_working_drafts(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.ai_clinical_source_before_working_drafts(uuid,uuid,uuid,integer) to service_role;
create function public.ai_clinical_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; snapshot public.consultation_snapshots; planning jsonb;
begin
 result:=private.ai_clinical_source_before_working_drafts(p_owner,p_patient,p_consultation,p_revision);
 select * into snapshot from public.consultation_snapshots where professional_id=p_owner and consultation_id=p_consultation and patient_id=p_patient and revision=p_revision;
 planning:=private.consultation_planning_objective(snapshot.working_drafts,snapshot.clinical_records,result->'approvedPes');
 return result||jsonb_build_object('planningObjective',planning,'stamp',md5((result->>'stamp')||coalesce(planning::text,'')));
end $$;
revoke all on function public.ai_clinical_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_clinical_source(uuid,uuid,uuid,integer) to service_role;

-- Preserve a completed paid proposal even if its browser tab was closed while
-- waiting. Only the owning user's existing successful generation can write it.
create function public.ai_store_consultation_proposal(p_owner uuid,p_generation uuid,p_result jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare g private.ai_generations; s public.consultation_snapshots; slot text; previous_id uuid;
begin
 select * into g from private.ai_generations where id=p_generation and professional_id=p_owner and status='succeeded' and feature in ('pes_diagnosis','recall_24h','consultation_support','patient_instructions','intervention_strategy');
 if not found or p_result->>'generationId' is distinct from g.id::text or jsonb_typeof(p_result->'output') is distinct from 'object' or octet_length(p_result::text)>1000000 then raise exception 'generation_unavailable'; end if;
 -- Use the same lock order as consultation writers and closure.
 perform 1 from public.consultations where id=g.consultation_id and professional_id=p_owner and deleted_at is null for update;
 if not found then raise exception 'context_unavailable'; end if;
 select * into s from public.consultation_snapshots where consultation_id=g.consultation_id and professional_id=p_owner and revision=g.clinical_revision for update;
 if not found then raise exception 'context_unavailable'; end if;
 slot:='proposal:'||g.feature;
 if s.working_drafts->slot=p_result then return; end if;
 previous_id:=(s.working_drafts->slot->>'generationId')::uuid;
 if previous_id is not null and exists(select 1 from private.ai_generations where id=previous_id and professional_id=p_owner and started_at>g.started_at) then return; end if;
 update public.consultation_snapshots set working_drafts=working_drafts||jsonb_build_object(slot,p_result),working_drafts_version=working_drafts_version+1 where id=s.id;
end $$;
revoke all on function public.ai_store_consultation_proposal(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ai_store_consultation_proposal(uuid,uuid,jsonb) to service_role;

-- Return the planning reference to the existing owner-scoped strategy editor.
do $$
declare original text; updated text;
begin
 original:=pg_get_functiondef('private.clinical_interventions(uuid,integer,text,jsonb)'::regprocedure);
 updated:=replace(original,'''objective'',s.clinical_records->''objective''','''objective'',s.clinical_records->''objective'',''planningObjective'',context->''planningObjective''');
 if original=updated then raise exception 'planning_workspace_patch_failed'; end if;
 execute updated;
end $$;
commit;
