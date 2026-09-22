-- Distinct domain contract, same accounts/reservation/reconciliation ledger.
-- Disabled by default. Operator model/rates are inherited, never client-selected.
insert into private.ai_feature_config(feature,enabled,provider,model,prompt_version,max_input_tokens,max_output_tokens,
 timeout_ms,reasoning_level,temperature,credit_multiplier,credits_per_usd,input_usd_per_million,cached_usd_per_million,output_usd_per_million,pricing_version)
select 'diet_draft',false,provider,model,'diet_draft@1',max_input_tokens,4096,60000,reasoning_level,temperature,
 credit_multiplier,credits_per_usd,input_usd_per_million,cached_usd_per_million,output_usd_per_million,pricing_version
from private.ai_feature_config where feature='diet_workshop';

create table private.ai_diet_snapshots (
 generation_id uuid primary key references private.ai_generations(id) on delete restrict,
 plan_id uuid not null references public.nutrition_plans(id) on delete restrict,
 revision integer not null check(revision>0), source_stamp text not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 result jsonb, created_at timestamptz not null default now(),
 check(octet_length(snapshot::text)<=500000), check(octet_length(result::text)<=500000)
);
create index ai_diet_snapshots_plan on private.ai_diet_snapshots(plan_id);
alter table private.ai_diet_snapshots enable row level security;
revoke all on private.ai_diet_snapshots from public,anon,authenticated;
grant select,insert,update on private.ai_diet_snapshots to service_role;
create function private.ai_diet_snapshot_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-'result') is distinct from (to_jsonb(old)-'result') or old.result is not null then
  raise exception 'immutable_snapshot';
 end if;
 return new;
end $$;
revoke all on function private.ai_diet_snapshot_immutable() from public,anon,authenticated;
create trigger ai_diet_snapshot_immutable before update on private.ai_diet_snapshots
 for each row execute function private.ai_diet_snapshot_immutable();

-- One authoritative consultation, never the latest goal of another consultation.
create function public.ai_diet_source(p_owner uuid,p_plan uuid,p_revision integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare p public.nutrition_plans; patient public.patients; s public.consultation_snapshots;
 answers jsonb; catalog jsonb; consultation jsonb; source jsonb; statement text;
begin
 select * into p from public.nutrition_plans where id=p_plan and professional_id=p_owner and status='draft';
 if p.id is null or p.draft_revision<>p_revision or p.patient_id is null or p.consultation_id is null then raise exception 'context_unavailable'; end if;
 select * into patient from public.patients where id=p.patient_id and professional_id=p_owner and deleted_at is null and status<>'archived';
 if patient.id is null or not exists(select 1 from public.consultations where id=p.consultation_id and patient_id=p.patient_id and professional_id=p_owner and deleted_at is null and status in ('draft','completed')) then raise exception 'context_unavailable'; end if;
 select * into s from public.consultation_snapshots where consultation_id=p.consultation_id and patient_id=p.patient_id and professional_id=p_owner order by revision desc limit 1;
 select value#>>'{}' into statement from public.consultation_answers where consultation_id=p.consultation_id and professional_id=p_owner and revision=s.revision and question_key='pes_statement';
 select coalesce(jsonb_object_agg(question_key,jsonb_build_object('value',value,'response_area',response_area)),'{}') into answers
 from public.consultation_answers where consultation_id=p.consultation_id and patient_id=p.patient_id and professional_id=p_owner and revision=s.revision
 and question_key in ('food_reactions_status','food_reactions_v2','food_preferences','eating_preferences','usual_pattern','daily_schedule','cooking_time','food_equipment');
 consultation:=jsonb_build_object('id',p.consultation_id,'patient_id',p.patient_id,'professional_id',p_owner,'revision',s.revision,
  'pes',case when s.clinical_records->'pes'->>'approved_at' is not null then jsonb_build_object('approved_at',s.clinical_records->'pes'->>'approved_at','statement',statement) else null end,
  'objective',s.clinical_records->'objective');
 -- Full authorized catalog is server-only. Bounded selector builds model pool.
 select jsonb_build_object('foods',(select coalesce(jsonb_agg(to_jsonb(f) order by id),'[]') from public.food_items f where active and (owner_id is null or owner_id=p_owner)),
  'recipes',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by display_order,id),'[]') from public.recipe_items i where i.recipe_id=r.id)) order by r.id),'[]') from public.recipes r where active and (owner_id is null or owner_id=p_owner))) into catalog;
 source:=jsonb_build_object('plan',to_jsonb(p),'consultation',consultation,'answers',answers,'catalog',catalog);
 return jsonb_build_object('source',source||jsonb_build_object('stamp',md5(source::text)),
  'identifiers',jsonb_build_array(patient.full_name,patient.email,patient.phone));
end $$;
revoke all on function public.ai_diet_source(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_diet_source(uuid,uuid,integer) to service_role;

create function public.ai_diet_draft(p_owner uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare g private.ai_generations; p public.nutrition_plans; s private.ai_diet_snapshots; current_source jsonb;
begin
 -- Same lock order for bind/result/apply. No provider call inside transactions.
 select * into g from private.ai_generations where id=(p_data->>'generationId')::uuid and professional_id=p_owner and feature='diet_draft' for update;
 if g.id is null then raise exception 'context_unavailable'; end if;
 if p_action='bind' then
  select * into p from public.nutrition_plans where id=(p_data->>'planId')::uuid and professional_id=p_owner for update;
  if g.status<>'reserved' or p.id is null or g.patient_id is distinct from p.patient_id or g.consultation_id is distinct from p.consultation_id then raise exception 'context_unavailable'; end if;
  current_source:=public.ai_diet_source(p_owner,p.id,(p_data->>'revision')::integer);
  if current_source->'source'->>'stamp' is distinct from p_data->>'stamp' then raise exception 'context_changed'; end if;
  insert into private.ai_diet_snapshots(generation_id,plan_id,revision,source_stamp,snapshot)
   values(g.id,p.id,p.draft_revision,p_data->>'stamp',p_data->'snapshot');
  update private.ai_generations set workshop_plan_id=p.id,workshop_revision=p.draft_revision where id=g.id;
  return jsonb_build_object('ok',true);
 end if;
 select * into s from private.ai_diet_snapshots where generation_id=g.id;
 if s.generation_id is null then raise exception 'context_unavailable'; end if;
 if p_action='result' then
  if g.status<>'running' or s.result is not null then raise exception 'invalid_request'; end if;
  update private.ai_diet_snapshots set result=p_data->'result' where generation_id=g.id;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='get' then return jsonb_build_object('snapshot',s.snapshot,'result',s.result,'stamp',s.source_stamp,'revision',s.revision,'planId',s.plan_id,'status',g.status,'decision',g.workshop_decision); end if;
 if p_action not in ('apply','discard') or g.status<>'succeeded' then raise exception 'invalid_request'; end if;
 select * into p from public.nutrition_plans where id=s.plan_id and professional_id=p_owner for update;
 if p.id is null then raise exception 'context_unavailable'; end if;
 if g.workshop_decision=(case when p_action='apply' then 'accepted' else 'discarded' end) then return jsonb_build_object('ok',true,'replay',true,'plan',to_jsonb(p)); end if;
 if g.workshop_decision is not null then raise exception 'invalid_request'; end if;
 if p_action='apply' then
  if p.status<>'draft' or p.draft_revision<>s.revision then raise exception 'context_changed'; end if;
  current_source:=public.ai_diet_source(p_owner,p.id,s.revision);
  if current_source->'source'->>'stamp' is distinct from s.source_stamp then raise exception 'context_changed'; end if;
  if s.result->'validation'->>'status' not in ('valid','needs_adjustment') or jsonb_typeof(s.result->'validation'->'draft') is distinct from 'object' then raise exception 'invalid_output'; end if;
  if (s.snapshot->>'hasManualMenu')::boolean and coalesce((p_data->>'replaceExisting')::boolean,false) is not true then raise exception 'replacement_confirmation_required'; end if;
  if (s.result->'validation'->>'status'='needs_adjustment' or (s.result->'validation'->>'requiresTargetReview')::boolean)
    and coalesce((p_data->>'acceptDifferences')::boolean,false) is not true then raise exception 'difference_confirmation_required'; end if;
  -- Only menu draft is mutable. Published version, prescription and approvals stay untouched.
  update public.nutrition_plans set diet_menu=s.result->'validation'->'draft',status='draft' where id=p.id returning * into p;
 end if;
 update private.ai_generations set workshop_decision=case when p_action='apply' then 'accepted' else 'discarded' end,workshop_decided_at=now() where id=g.id;
 return jsonb_build_object('ok',true,'plan',to_jsonb(p));
end $$;
revoke all on function public.ai_diet_draft(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ai_diet_draft(uuid,text,jsonb) to service_role;
