begin;
create table public.consultation_interventions (
 id uuid primary key default gen_random_uuid(),
 snapshot_id uuid not null references public.consultation_snapshots(id) on delete cascade,
 professional_id uuid not null references public.professional_profiles(id) on delete cascade,
 draft jsonb, approved jsonb, version integer not null default 0 check(version>=0),
 state text not null default 'draft' check(state in ('draft','approved','executing','completed','withdrawn')),
 execution jsonb not null default '{}', created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check(draft is null or (jsonb_typeof(draft)='object' and octet_length(draft::text)<=90000)),
 check(approved is null or (jsonb_typeof(approved)='object' and octet_length(approved::text)<=120000))
);
create index consultation_interventions_snapshot on public.consultation_interventions(snapshot_id);
create index consultation_interventions_owner on public.consultation_interventions(professional_id);
create table public.consultation_intervention_history (
 id uuid primary key default gen_random_uuid(),
 intervention_id uuid not null references public.consultation_interventions(id) on delete cascade,
 professional_id uuid not null references public.professional_profiles(id) on delete cascade,
 version integer not null, action text not null check(action in ('approve','start','communicate','complete','withdraw','revert')),
 payload jsonb not null, recorded_at timestamptz not null default clock_timestamp()
);
create index consultation_intervention_history_item on public.consultation_intervention_history(intervention_id,recorded_at);
create index consultation_intervention_history_owner on public.consultation_intervention_history(professional_id);
create unique index consultation_intervention_history_version on public.consultation_intervention_history(intervention_id,version) where action='approve';
alter table public.consultation_interventions enable row level security;
alter table public.consultation_intervention_history enable row level security;
create policy interventions_owner_read on public.consultation_interventions for select to authenticated using(professional_id=(select auth.uid()));
create policy intervention_history_owner_read on public.consultation_intervention_history for select to authenticated using(professional_id=(select auth.uid()));
revoke all on public.consultation_interventions,public.consultation_intervention_history from public,anon,authenticated;
grant select on public.consultation_interventions,public.consultation_intervention_history to authenticated;
grant all on public.consultation_interventions,public.consultation_intervention_history to service_role;
create function private.intervention_history_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'immutable_history'; end $$;
revoke all on function private.intervention_history_immutable() from public,anon,authenticated,service_role;
create trigger intervention_history_immutable before update on public.consultation_intervention_history for each row execute function private.intervention_history_immutable();

-- Existing approvals are kept as history; validity is evaluated against the
-- current approved PES and objective, never inferred from old text.
create function private.approved_interventions(p_owner uuid,p_consultation uuid,p_revision integer) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(i.approved || jsonb_build_object('id',i.id,'state',i.state) order by (i.approved->'document'->'strategy'->>'priority')::integer,i.created_at),'[]')
 from public.consultation_interventions i join public.consultation_snapshots s on s.id=i.snapshot_id and s.professional_id=i.professional_id
 join public.consultations c on c.id=s.consultation_id and c.professional_id=s.professional_id
 where s.professional_id=p_owner and s.consultation_id=p_consultation and s.revision=p_revision and c.deleted_at is null
 and i.state in ('approved','executing') and i.draft is null
 and s.clinical_records->'pes'->>'approved_at' is not null and s.clinical_records->'objective'->'smart_plan' is not null
 and i.approved->'document'->>'pesApprovedAt'=s.clinical_records->'pes'->>'approved_at'
 and i.approved->'document'->>'objectiveApprovedAt'=s.clinical_records->'objective'->>'approved_at'
 and s.clinical_records->'objective'->>'pes_approved_at'=s.clinical_records->'pes'->>'approved_at'
$$;
revoke all on function private.approved_interventions(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.approved_interventions(uuid,uuid,integer) to service_role;

create function private.validate_intervention_document(doc jsonb,strict boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb:=doc->'strategy'; field text; needed text[]; entry jsonb;
begin
 if jsonb_typeof(doc) is distinct from 'object' or doc->'version' is distinct from '1'::jsonb or octet_length(doc::text)>90000
 or jsonb_typeof(doc->'pesApprovedAt') is distinct from 'string' or jsonb_typeof(doc->'objectiveApprovedAt') is distinct from 'string' or jsonb_typeof(item) is distinct from 'object' then raise exception 'invalid_strategy'; end if;
 foreach field in array array['title','action','etiologyLink','method','frequency','duration','startDate','responsible','executor','adaptations','monitoring','reviewAt','adjustmentCriteria','access','dose','composition','educationTopic','materials','comprehensionCheck','coordinationWith','coordinationReason','referenceTitle','referenceUrl','referenceVersion','referenceNotes'] loop
  if jsonb_typeof(item->field) is distinct from 'string' or length(item->>field)>1500 then raise exception 'invalid_strategy'; end if;
 end loop;
 if item->>'category' is null or item->>'category' not in ('food','education','counseling','supplementation','coordination')
 or item->>'route' is null or item->>'route' not in ('not_applicable','oral','enteral','parenteral')
 or item->>'agreement' is null or item->>'agreement' not in ('pending','patient','caregiver')
 or jsonb_typeof(item->'priority') is distinct from 'number' or (item->>'priority') !~ '^(10|[1-9])$'
 or jsonb_typeof(item->'goalIndexes') is distinct from 'array' or jsonb_array_length(item->'goalIndexes')>3 then raise exception 'invalid_strategy'; end if;
 if exists(select 1 from jsonb_array_elements(item->'goalIndexes') n where jsonb_typeof(n)<>'number' or (n#>>'{}') !~ '^[0-2]$')
 or (select count(*)<>count(distinct n) from jsonb_array_elements(item->'goalIndexes') n) then raise exception 'invalid_strategy'; end if;
 if jsonb_typeof(item->'evidence') is distinct from 'array' or jsonb_array_length(item->'evidence')>10
 or jsonb_typeof(item->'referenceIds') is distinct from 'array' or jsonb_array_length(item->'referenceIds')>5
 or jsonb_typeof(item->'missingContext') is distinct from 'array' or jsonb_array_length(item->'missingContext')>15 then raise exception 'invalid_strategy'; end if;
 for entry in select value from jsonb_array_elements(item->'evidence') loop
  if jsonb_typeof(entry->'source') is distinct from 'string' or jsonb_typeof(entry->'finding') is distinct from 'string' or length(entry->>'source')>2000 or length(entry->>'finding')>4000 then raise exception 'invalid_strategy'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(item->'referenceIds') e where jsonb_typeof(e)<>'string' or e#>>'{}' not in ('academy-intervention','academy-monitoring'))
 or exists(select 1 from jsonb_array_elements(item->'missingContext') e where jsonb_typeof(e)<>'string' or length(e#>>'{}')>400) then raise exception 'invalid_strategy'; end if;
 if btrim(item->>'referenceUrl')<>'' and item->>'referenceUrl' !~ '^https://[^[:space:]]+$' then raise exception 'invalid_strategy'; end if;
 if not strict then return; end if;
 needed:=array['title','action','etiologyLink','method','frequency','duration','startDate','responsible','executor','adaptations','monitoring','reviewAt','adjustmentCriteria'];
 if item->>'category' in ('food','supplementation') then
  needed:=needed || array['composition','dose'];
  if item->>'route'='not_applicable' then raise exception 'strategy_incomplete'; end if;
 elsif item->>'route'<>'not_applicable' then raise exception 'strategy_incomplete'; end if;
 if item->>'route' in ('enteral','parenteral') then needed:=needed || array['access','coordinationWith']; end if;
 if item->>'category' in ('education','counseling') then needed:=needed || array['educationTopic','materials','comprehensionCheck']; end if;
 if item->>'category'='coordination' then needed:=needed || array['coordinationWith','coordinationReason']; end if;
 foreach field in array needed loop if btrim(item->>field)='' then raise exception 'strategy_incomplete'; end if; end loop;
 if jsonb_array_length(item->'goalIndexes')=0 then raise exception 'strategy_incomplete'; end if;
 if item->>'agreement'='pending' then raise exception 'strategy_agreement_required'; end if;
end $$;
revoke all on function private.validate_intervention_document(jsonb,boolean) from public,anon,authenticated,service_role;

create function private.clinical_interventions(p_consultation uuid,p_revision integer,p_action text default 'read',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=(select auth.uid()); c public.consultations; s public.consultation_snapshots; item public.consultation_interventions;
 context jsonb; rows jsonb; doc jsonb; saved_approval jsonb; payload jsonb; goal jsonb; history jsonb; ident uuid; ordinal integer; latest_revision integer; pes_at text; objective_at text; generation private.ai_generations;
begin
 if owner is null then raise exception 'context_unavailable' using errcode='42501'; end if;
 if p_action='read' then
  if not private.can_read_feature(owner,'consultations') then raise exception 'entitlement_required' using errcode='42501'; end if;
 else perform private.require_my_entitlement('consultations'); end if;
 select * into c from public.consultations where id=p_consultation and professional_id=owner and deleted_at is null for update;
 if not found or c.status not in ('draft','completed') then raise exception 'context_unavailable'; end if;
 if c.status<>'draft' and p_action not in ('read','start','communicate','complete','withdraw') then raise exception 'context_unavailable'; end if;
 select max(revision) into latest_revision from public.consultation_snapshots where consultation_id=c.id and professional_id=owner;
 select * into s from public.consultation_snapshots where consultation_id=c.id and professional_id=owner and revision=p_revision for update;
 if s.id is null or (p_action<>'read' and s.revision<>latest_revision) then raise exception 'context_unavailable'; end if;
 if c.status='draft' and s.revision=latest_revision then
  perform private.clinical_workspace(c.id,p_revision); context:=public.ai_clinical_source(owner,c.patient_id,c.id,p_revision);
 else
  select jsonb_build_object('facts','[]'::jsonb,'stamp',md5(s.id::text||coalesce(s.clinical_records::text,'')),
   'approvedPes',case when s.clinical_records->'pes'->>'approved_at' is not null then jsonb_build_object('approved_at',s.clinical_records->'pes'->>'approved_at',
    'problem',max(value#>>'{}') filter(where question_key='pes_problem'),'etiology',max(value#>>'{}') filter(where question_key='pes_etiology'),
    'signsSymptoms',max(value#>>'{}') filter(where question_key='pes_evidence'),'pesStatement',max(value#>>'{}') filter(where question_key='pes_statement')) else null end)
   into context from public.consultation_answers where consultation_id=c.id and professional_id=owner and revision=p_revision;
 end if;
 pes_at:=s.clinical_records->'pes'->>'approved_at'; objective_at:=s.clinical_records->'objective'->>'approved_at';
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>100000 then raise exception 'invalid_request'; end if;
 if p_action<>'read' then
  if p_data->>'id' is null then raise exception 'invalid_request'; end if;
  ident:=(p_data->>'id')::uuid;
  select * into item from public.consultation_interventions where id=ident and snapshot_id=s.id and professional_id=owner for update;
  if item.id is null and p_action not in ('save','approve') then raise exception 'context_unavailable'; end if;
  if item.id is not null and (p_data->>'expectedUpdatedAt')::timestamptz is distinct from item.updated_at then raise exception 'strategy_changed'; end if;
  if item.id is null and exists(select 1 from public.consultation_interventions where id=ident) then raise exception 'context_unavailable'; end if;
  if p_action in ('save','approve') then
   doc:=p_data->'document'; perform private.validate_intervention_document(doc,p_action='approve');
   if p_action='approve' then
    if pes_at is null or objective_at is null or s.clinical_records->'objective'->'smart_plan' is null then raise exception 'strategy_approvals_required'; end if;
    if doc->>'pesApprovedAt' is distinct from pes_at or doc->>'objectiveApprovedAt' is distinct from objective_at
      or s.clinical_records->'objective'->>'pes_approved_at' is distinct from pes_at then raise exception 'strategy_context_changed'; end if;
    for goal in select value from jsonb_array_elements(doc->'strategy'->'goalIndexes') loop
     if (goal#>>'{}')::integer>=jsonb_array_length(s.clinical_records->'objective'->'smart_plan'->'goals') then raise exception 'strategy_context_changed'; end if;
    end loop;
   end if;
   if doc->>'generationId' is not null then
    select * into generation from private.ai_generations where id=(doc->>'generationId')::uuid and professional_id=owner and patient_id=c.patient_id and consultation_id=c.id and clinical_revision=p_revision and feature='intervention_strategy' and status='succeeded';
    if generation.id is null then raise exception 'generation_unavailable'; end if;
   end if;
   if item.id is null then
    if (select count(*) from public.consultation_interventions where snapshot_id=s.id)>=30 then raise exception 'strategy_limit'; end if;
    insert into public.consultation_interventions(id,snapshot_id,professional_id,draft) values(ident,s.id,owner,doc) returning * into item;
   end if;
   if p_action='save' then update public.consultation_interventions set draft=doc,updated_at=clock_timestamp() where id=ident;
   else
    saved_approval:=jsonb_build_object('document',doc,'version',item.version+1,'approvedAt',clock_timestamp(),'approvedBy',owner,
      'pesStatement',context->'approvedPes'->>'pesStatement','goals',(select jsonb_agg(g) from jsonb_array_elements(s.clinical_records->'objective'->'smart_plan'->'goals') with ordinality a(g,n) where doc->'strategy'->'goalIndexes' @> jsonb_build_array(n-1)));
    update public.consultation_interventions set approved=saved_approval,draft=null,version=item.version+1,state='approved',execution='{}',updated_at=clock_timestamp() where id=ident;
    insert into public.consultation_intervention_history(intervention_id,professional_id,version,action,payload) values(ident,owner,item.version+1,'approve',saved_approval);
   end if;
  elsif p_action='delete' then
   if item.approved is not null or item.version>0 then raise exception 'approved_strategy_retire_required'; end if;
   delete from public.consultation_interventions where id=ident;
  elsif p_action='revert' then
   update public.consultation_interventions set draft=null,updated_at=clock_timestamp() where id=ident;
   insert into public.consultation_intervention_history(intervention_id,professional_id,version,action,payload) values(ident,owner,item.version,'revert','{}');
  elsif p_action in ('start','communicate','complete','withdraw') then
   if item.approved is null then raise exception 'strategy_approval_required'; end if;
   if p_action<>'withdraw' and (item.draft is not null or item.approved->'document'->>'pesApprovedAt' is distinct from pes_at or item.approved->'document'->>'objectiveApprovedAt' is distinct from objective_at or pes_at is null or objective_at is null) then raise exception 'strategy_context_changed'; end if;
   if p_action='start' then
    if item.state<>'approved' or coalesce(btrim(p_data->>'executor'),'')='' or length(p_data->>'executor')>400 or coalesce(p_data->>'startDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'strategy_execution_required'; end if;
    perform (p_data->>'startDate')::date;
    payload:=jsonb_build_object('executor',p_data->>'executor','startDate',p_data->>'startDate','recordedAt',clock_timestamp());
    update public.consultation_interventions set state='executing',execution=execution||payload,updated_at=clock_timestamp() where id=ident;
   elsif p_action='communicate' then
    if item.state not in ('approved','executing') or coalesce(btrim(p_data->>'recipient'),'')='' or length(p_data->>'recipient')>400 then raise exception 'strategy_execution_required'; end if;
    payload:=jsonb_build_object('recipient',p_data->>'recipient','recordedAt',clock_timestamp());
    update public.consultation_interventions set execution=execution||jsonb_build_object('communication',payload),updated_at=clock_timestamp() where id=ident;
   else
    if item.state not in ('approved','executing') or coalesce(btrim(p_data->>'reason'),'')='' or length(p_data->>'reason')>1500 then raise exception 'strategy_execution_required'; end if;
    payload:=jsonb_build_object('reason',p_data->>'reason','recordedAt',clock_timestamp());
    update public.consultation_interventions set state=case when p_action='complete' then 'completed' else 'withdrawn' end,updated_at=clock_timestamp() where id=ident;
   end if;
   insert into public.consultation_intervention_history(intervention_id,professional_id,version,action,payload) values(ident,owner,item.version,p_action,payload);
  else raise exception 'invalid_request'; end if;
 end if;
 if c.status='draft' and s.revision=latest_revision then context:=public.ai_clinical_source(owner,c.patient_id,c.id,p_revision); end if;
 select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('requiresReview',i.state in ('approved','executing') and i.approved is not null and (i.draft is not null or pes_at is null or objective_at is null or i.approved->'document'->>'pesApprovedAt' is distinct from pes_at or i.approved->'document'->>'objectiveApprovedAt' is distinct from objective_at),
   'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.recorded_at desc),'[]') from public.consultation_intervention_history h where h.intervention_id=i.id)) order by coalesce((i.draft->'strategy'->>'priority')::integer,(i.approved->'document'->'strategy'->>'priority')::integer,1),i.created_at),'[]') into rows from public.consultation_interventions i where snapshot_id=s.id and professional_id=owner;
 return jsonb_build_object('archived',s.revision<>latest_revision,'stamp',context->>'stamp','pes',context->'approvedPes','objective',s.clinical_records->'objective','items',rows,'facts',context->'facts');
end $$;
revoke all on function private.clinical_interventions(uuid,integer,text,jsonb) from public,anon,service_role;
grant execute on function private.clinical_interventions(uuid,integer,text,jsonb) to authenticated;
create function public.clinical_interventions(p_consultation uuid,p_revision integer,p_action text default 'read',p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.clinical_interventions(p_consultation,p_revision,p_action,p_data)$$;
revoke all on function public.clinical_interventions(uuid,integer,text,jsonb) from public,anon,service_role;
grant execute on function public.clinical_interventions(uuid,integer,text,jsonb) to authenticated;

-- Instructions are downstream outputs. Editing them must not invalidate the
-- assessment that generated them; assessment answers retain existing rules.
do $$
declare definition text; amended text;
begin
 definition:=pg_get_functiondef('private.invalidate_clinical_approval()'::regprocedure);
 amended:=replace(definition,'-- Only the editable draft revision is affected.', E'if row_data.question_key in (''first_actions'',''patient_instructions'',''recommendations'',''next_appointment'') then\n    if TG_OP=''DELETE'' then return old; else return new; end if;\n  end if;\n  -- Only the editable draft revision is affected.');
 if amended=definition then raise exception 'intervention_invalidation_patch_failed'; end if;
 execute amended;
end $$;

alter function public.ai_clinical_source(uuid,uuid,uuid,integer) rename to ai_clinical_source_before_interventions;
alter function public.ai_clinical_source_before_interventions(uuid,uuid,uuid,integer) set schema private;
revoke all on function private.ai_clinical_source_before_interventions(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.ai_clinical_source_before_interventions(uuid,uuid,uuid,integer) to service_role;
create function public.ai_clinical_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; snapshot uuid; objective jsonb; strategy_stamp text;
begin
 result:=private.ai_clinical_source_before_interventions(p_owner,p_patient,p_consultation,p_revision);
 select id,clinical_records->'objective' into snapshot,objective from public.consultation_snapshots where professional_id=p_owner and consultation_id=p_consultation and patient_id=p_patient and revision=p_revision;
 select coalesce(string_agg(id::text||updated_at::text,',' order by id),'') into strategy_stamp from public.consultation_interventions where snapshot_id=snapshot and professional_id=p_owner;
 return result || jsonb_build_object('approvedObjective',objective,'approvedStrategies',private.approved_interventions(p_owner,p_consultation,p_revision),
  'strategyRequired',exists(select 1 from public.consultation_interventions where snapshot_id=snapshot and professional_id=p_owner),
  'stamp',md5((result->>'stamp')||strategy_stamp));
end $$;
revoke all on function public.ai_clinical_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_clinical_source(uuid,uuid,uuid,integer) to service_role;

-- Reuse the same owner-scoped source for draft consultation instructions and
-- keep the established completed-consultation reader for portal use.
alter function public.ai_patient_instructions_source(uuid,uuid,uuid,integer) rename to ai_patient_instructions_before_interventions;
alter function public.ai_patient_instructions_before_interventions(uuid,uuid,uuid,integer) set schema private;
revoke all on function private.ai_patient_instructions_before_interventions(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.ai_patient_instructions_before_interventions(uuid,uuid,uuid,integer) to service_role;
create function public.ai_patient_instructions_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; snapshot uuid; stamp text;
begin
 if exists(select 1 from public.consultations where id=p_consultation and patient_id=p_patient and professional_id=p_owner and status='draft' and deleted_at is null) then return public.ai_clinical_source(p_owner,p_patient,p_consultation,p_revision); end if;
 result:=private.ai_patient_instructions_before_interventions(p_owner,p_patient,p_consultation,p_revision);
 select id into snapshot from public.consultation_snapshots where consultation_id=p_consultation and professional_id=p_owner and revision=p_revision;
 select coalesce(string_agg(id::text||updated_at::text,',' order by id),'') into stamp from public.consultation_interventions where snapshot_id=snapshot and professional_id=p_owner;
 return result || jsonb_build_object('approvedStrategies',private.approved_interventions(p_owner,p_consultation,p_revision),
  'strategyRequired',exists(select 1 from public.consultation_interventions where snapshot_id=snapshot and professional_id=p_owner),'stamp',md5((result->>'stamp')||stamp));
end $$;
revoke all on function public.ai_patient_instructions_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_patient_instructions_source(uuid,uuid,uuid,integer) to service_role;

-- No new plan entitlement: strategies use the existing consultation support
-- capability and the same metered, consent-gated ledger.
insert into private.ai_feature_config(feature,enabled,provider,model,prompt_version,max_input_tokens,max_output_tokens,reasoning_level,temperature,timeout_ms,max_provider_attempts,credit_multiplier,credits_per_usd,input_usd_per_million,cached_usd_per_million,output_usd_per_million,pricing_version,execution_mode)
select 'intervention_strategy',enabled,provider,model,'intervention_strategy@1',max_input_tokens,4500,reasoning_level,temperature,timeout_ms,1,credit_multiplier,credits_per_usd,input_usd_per_million,cached_usd_per_million,output_usd_per_million,pricing_version,execution_mode from private.ai_feature_config where feature='consultation_support';
do $$
declare signature text; definition text; amended text;
begin
 foreach signature in array array['public.ai_server(text,uuid,jsonb)','private.ai_feature_allowed(uuid,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  amended:=replace(definition,'when ''consultation_support'' then ''ai.consultation_support''','when ''consultation_support'' then ''ai.consultation_support'' when ''intervention_strategy'' then ''ai.consultation_support''');
  if amended=definition then raise exception 'strategy_entitlement_patch_failed: %',signature; end if; execute amended;
 end loop;
 foreach signature in array array['private.ai_live_pilot_policy_valid()','private.admin_commercial_costs()'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  amended:=replace(definition,'''patient_instructions''','''patient_instructions'',''intervention_strategy''');
  if amended=definition then raise exception 'strategy_policy_patch_failed: %',signature; end if; execute amended;
 end loop;
end $$;
update private.ai_feature_config set prompt_version='patient_instructions@2',updated_at=now() where feature='patient_instructions' and prompt_version='patient_instructions@1';

-- Both menu engines consume the same approved oral-feeding projection. Their
-- existing prescription and immutable snapshot verification remain authoritative.
create function private.intervention_diet_source(p_source jsonb,p_owner uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare source jsonb:=p_source->'source'; visit uuid; rev integer; snapshot uuid; review_required boolean;
begin
 visit:=(source->'plan'->>'consultation_id')::uuid; rev:=(source->'consultation'->>'revision')::integer;
 select id into snapshot from public.consultation_snapshots where professional_id=p_owner and consultation_id=visit and revision=rev;
 select exists(select 1 from public.consultation_interventions i join public.consultation_snapshots s on s.id=i.snapshot_id
  where i.snapshot_id=snapshot and i.professional_id=p_owner and i.state in ('approved','executing') and i.approved->'document'->'strategy'->>'category'='food'
  and (i.draft is not null or i.approved->'document'->>'pesApprovedAt' is distinct from s.clinical_records->'pes'->>'approved_at'
   or i.approved->'document'->>'objectiveApprovedAt' is distinct from s.clinical_records->'objective'->>'approved_at')) into review_required;
 source:=source||jsonb_build_object('interventionStrategies',private.approved_interventions(p_owner,visit,rev),'interventionReviewRequired',review_required);
 source:=source||jsonb_build_object('stamp',md5(source::text));
 return jsonb_set(p_source,'{source}',source);
end $$;
revoke all on function private.intervention_diet_source(jsonb,uuid) from public,anon,authenticated;
grant execute on function private.intervention_diet_source(jsonb,uuid) to service_role;
alter function public.ai_diet_source(uuid,uuid,integer) rename to ai_diet_source_before_interventions;
alter function public.ai_diet_source_before_interventions(uuid,uuid,integer) set schema private;
revoke all on function private.ai_diet_source_before_interventions(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.ai_diet_source_before_interventions(uuid,uuid,integer) to service_role;
create function public.ai_diet_source(p_owner uuid,p_plan uuid,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$select private.intervention_diet_source(private.ai_diet_source_before_interventions(p_owner,p_plan,p_revision),p_owner)$$;
revoke all on function public.ai_diet_source(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_diet_source(uuid,uuid,integer) to service_role;
alter function public.ai_text_diet_source(uuid,uuid,integer) rename to ai_text_diet_source_before_interventions;
alter function public.ai_text_diet_source_before_interventions(uuid,uuid,integer) set schema private;
revoke all on function private.ai_text_diet_source_before_interventions(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.ai_text_diet_source_before_interventions(uuid,uuid,integer) to service_role;
create function public.ai_text_diet_source(p_owner uuid,p_plan uuid,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$select private.intervention_diet_source(private.ai_text_diet_source_before_interventions(p_owner,p_plan,p_revision),p_owner)$$;
revoke all on function public.ai_text_diet_source(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_text_diet_source(uuid,uuid,integer) to service_role;

commit;
