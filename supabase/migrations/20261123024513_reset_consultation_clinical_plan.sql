begin;
set local lock_timeout = '5s';

alter table public.consultation_interventions add column planning_reset_at timestamptz;
alter table public.consultation_snapshots
  add column clinical_plan_reset_at timestamptz,
  add column clinical_plan_reset_answers_version bigint,
  add column clinical_plan_reset_drafts_version bigint;

create function private.reset_consultation_clinical_plan(
  p_consultation uuid, p_revision integer, p_answers_version bigint, p_drafts_version bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  visit public.consultations;
  snapshot public.consultation_snapshots;
  reset_at timestamptz;
  draft_keys text[];
  answers jsonb;
begin
  if owner_id is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  perform private.require_my_entitlement('consultations');
  select * into visit from public.consultations
    where id = p_consultation and professional_id = owner_id and deleted_at is null for update;
  if not found or visit.status <> 'draft' then raise exception 'consultation_not_editable' using errcode = '42501'; end if;
  perform private.require_retention_patient(owner_id, visit.patient_id);
  select * into snapshot from public.consultation_snapshots
    where consultation_id = visit.id and professional_id = owner_id and patient_id = visit.patient_id
    order by revision desc limit 1 for update;
  if not found or snapshot.revision is distinct from p_revision then raise exception 'consultation_revision_changed'; end if;
  if snapshot.answers_version is distinct from p_answers_version or snapshot.working_drafts_version is distinct from p_drafts_version
    then raise exception 'context_changed'; end if;

  reset_at := clock_timestamp();
  select coalesce(array_agg(key), '{}') into draft_keys from jsonb_object_keys(snapshot.working_drafts) key
    where key in ('clinical-batch', 'pes', 'strategies')
      or key ~ '^(pes-|objective[-:]|strategy-|instructions-|followup-|suggestions:(objectives|instructions):)'
      or key ~ '^(proposal:(batch:|batch-revision:)?|batch-reviewed:|batch-revision-request:|request:|handled:|handled-history:|generation:|destination:)(pes_diagnosis|consultation_support|intervention_strategy|patient_instructions)$';

  delete from public.consultation_answers a where a.professional_id = owner_id and a.consultation_id = visit.id
    and a.patient_id = visit.patient_id and a.revision = snapshot.revision
    and (left(a.question_key, 4) = 'pes_' or a.question_key in (
      'objectives', 'treatment_objective', 'next_objectives', 'nutrition_assessment',
      'first_actions', 'adjustments', 'recommendations', 'patient_instructions',
      'next_appointment', 'followup_indicators', 'followup_plan'
    ));

  -- Keep the audit trail of approved strategies, including recorded execution.
  insert into public.consultation_intervention_history(intervention_id, professional_id, version, action, payload, recorded_at)
  select i.id, owner_id, i.version, 'withdraw',
    jsonb_build_object('reason', 'Revisión clínica reiniciada por el profesional', 'previousState', i.state, 'recordedAt', reset_at),
    reset_at
  from public.consultation_interventions i
  where i.snapshot_id = snapshot.id and i.professional_id = owner_id and i.planning_reset_at is null
    and i.approved is not null and i.state <> 'withdrawn';
  update public.consultation_interventions i
    set state = 'withdrawn', draft = null, planning_reset_at = reset_at, updated_at = reset_at
    where i.snapshot_id = snapshot.id and i.professional_id = owner_id and i.planning_reset_at is null
      and i.approved is not null;
  delete from public.consultation_interventions i
    where i.snapshot_id = snapshot.id and i.professional_id = owner_id and i.approved is null and i.version = 0;

  update public.consultation_snapshots s set
    clinical_records = (s.clinical_records - array['pes','objective','objective_plans'])
      || jsonb_build_object('updated_at', reset_at),
    working_drafts = (s.working_drafts - draft_keys)
      || jsonb_build_object('navigation', jsonb_build_object('module','clinical','active',0,'clinicalStage',0)),
    working_drafts_version = s.working_drafts_version + 1,
    working_drafts_receipt = null,
    answers_version = s.answers_version + 1,
    answer_save_receipt = '{}',
    clinical_plan_reset_at = reset_at,
    clinical_plan_reset_answers_version = s.answers_version + 1,
    clinical_plan_reset_drafts_version = s.working_drafts_version + 1
  where s.id = snapshot.id returning * into snapshot;

  select coalesce(jsonb_object_agg(a.question_key, a.value), '{}') into answers
    from public.consultation_answers a where a.consultation_id = visit.id and a.professional_id = owner_id
      and a.patient_id = visit.patient_id and a.revision = snapshot.revision;
  return jsonb_build_object('version', snapshot.answers_version, 'answers', answers,
    'clinicalPlanResetVersion', snapshot.clinical_plan_reset_answers_version);
end $$;

revoke all on function private.reset_consultation_clinical_plan(uuid,integer,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function private.reset_consultation_clinical_plan(uuid,integer,bigint,bigint) to authenticated;

create function public.reset_consultation_clinical_plan(
  p_consultation uuid, p_revision integer, p_answers_version bigint, p_drafts_version bigint
) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.reset_consultation_clinical_plan(p_consultation,p_revision,p_answers_version,p_drafts_version)
$$;
revoke all on function public.reset_consultation_clinical_plan(uuid,integer,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.reset_consultation_clinical_plan(uuid,integer,bigint,bigint) to authenticated;

-- Older browser backups may still contain a plan. Give the existing optimistic
-- writers a reset version so only unrelated edits can be reconciled afterwards.
do $patch$
declare
  original text;
  amended text;
begin
  original := pg_get_functiondef('private.sync_consultation_answers(uuid,integer,bigint,jsonb,uuid)'::regprocedure);
  amended := replace(original, 'jsonb_build_object(''version'',snapshot.answers_version,''answers'',',
    'jsonb_build_object(''version'',snapshot.answers_version,''clinicalPlanResetVersion'',snapshot.clinical_plan_reset_answers_version,''answers'',');
  amended := replace(amended, 'jsonb_build_object(''version'',s.answers_version,''answers'',',
    'jsonb_build_object(''version'',s.answers_version,''clinicalPlanResetVersion'',s.clinical_plan_reset_answers_version,''answers'',');
  if position('snapshot.clinical_plan_reset_answers_version' in amended)=0 or position('s.clinical_plan_reset_answers_version' in amended)=0
    then raise exception 'planning_reset_answers_version_patch_failed'; end if;
  execute amended;

  original := pg_get_functiondef('private.sync_consultation_drafts(uuid,integer,bigint,jsonb,uuid)'::regprocedure);
  amended := replace(original, 'jsonb_build_object(''version'',s.working_drafts_version,''answers'',',
    'jsonb_build_object(''version'',s.working_drafts_version,''clinicalPlanResetVersion'',s.clinical_plan_reset_drafts_version,''answers'',');
  if amended = original then raise exception 'planning_reset_drafts_version_patch_failed'; end if;
  execute amended;
end $patch$;

-- Archived strategies are available in the history of a completed visit and
-- do not occupy the editable plan's capacity or block new indications.
do $patch$
declare
  original text;
  amended text;
  target regprocedure;
  strategy_scope constant text := 'from public.consultation_interventions where snapshot_id=snapshot and professional_id=p_owner';
begin
  original := pg_get_functiondef('private.clinical_interventions(uuid,integer,text,jsonb)'::regprocedure);
  amended := replace(original, 'where id=ident and snapshot_id=s.id and professional_id=owner for update',
    'where id=ident and snapshot_id=s.id and professional_id=owner and planning_reset_at is null for update');
  amended := replace(amended, 'where snapshot_id=s.id)>=30', 'where snapshot_id=s.id and planning_reset_at is null)>=30');
  amended := replace(amended, 'if generation.id is null then raise exception ''generation_unavailable'';',
    'if generation.id is null or generation.started_at <= s.clinical_plan_reset_at then raise exception ''generation_unavailable'';');
  amended := replace(amended, 'into rows from public.consultation_interventions i where snapshot_id=s.id and professional_id=owner;',
    'into rows from public.consultation_interventions i where snapshot_id=s.id and professional_id=owner and (c.status=''completed'' or s.revision<>latest_revision or i.planning_reset_at is null);');
  if position('and planning_reset_at is null for update' in amended)=0
    or position('and planning_reset_at is null)>=30' in amended)=0
    or position('or i.planning_reset_at is null' in amended)=0
    or position('or generation.started_at <= s.clinical_plan_reset_at' in amended)=0
    then raise exception 'planning_reset_strategy_patch_failed'; end if;
  execute amended;

  foreach target in array array[
    'private.ai_clinical_source_v5(uuid,uuid,uuid,integer)'::regprocedure,
    'public.ai_patient_instructions_source(uuid,uuid,uuid,integer)'::regprocedure
  ] loop
    original := pg_get_functiondef(target);
    amended := replace(original, strategy_scope, strategy_scope||' and planning_reset_at is null');
    if amended = original then raise exception 'planning_reset_source_patch_failed'; end if;
    execute amended;
  end loop;
end $patch$;

-- A response started before reset cannot repopulate a working draft later.
do $patch$
declare
  original text;
  amended text;
begin
  original := pg_get_functiondef('public.ai_store_consultation_proposal(uuid,uuid,jsonb)'::regprocedure);
  amended := replace(original, 'slot:=''proposal:''||g.feature;',
    'if g.feature<>''recall_24h'' and g.started_at <= s.clinical_plan_reset_at then raise exception ''context_changed''; end if; slot:=''proposal:''||g.feature;');
  if amended = original then raise exception 'planning_reset_proposal_patch_failed'; end if;
  execute amended;

  original := pg_get_functiondef('private.ai_store_clinical_batch_stage(uuid,uuid,uuid,jsonb)'::regprocedure);
  amended := replace(original, 'current_slot := ''proposal:batch:''||g.feature;',
    $body$if s.clinical_plan_reset_at is not null and (g.started_at <= s.clinical_plan_reset_at
      or s.working_drafts#>>'{clinical-batch,id}' is distinct from p_batch::text) then raise exception 'context_changed'; end if;
  current_slot := 'proposal:batch:'||g.feature;$body$);
  if amended = original then raise exception 'planning_reset_batch_patch_failed'; end if;
  execute amended;
end $patch$;

commit;
