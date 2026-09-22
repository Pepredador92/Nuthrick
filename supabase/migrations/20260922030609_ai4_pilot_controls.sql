-- IA-4: explicit per-professional pilot access and bounded spend controls.
-- The global feature flag and server-side OPENAI_API_KEY are still required.
create table private.ai_feature_access (
  feature text not null references private.ai_feature_config(feature) on delete cascade,
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(feature,professional_id)
);
create table private.ai_pilot_limits (
  professional_id uuid primary key references public.professional_profiles(id) on delete cascade,
  enabled boolean not null default false,
  max_total_generations integer not null default 5 check(max_total_generations between 1 and 100),
  max_daily_generations integer not null default 3 check(max_daily_generations between 1 and 20),
  max_daily_credits numeric(18,3) not null default 5 check(max_daily_credits > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  check(ends_at is null or ends_at > starts_at)
);
alter table private.ai_feature_access enable row level security;
alter table private.ai_pilot_limits enable row level security;
revoke all on private.ai_feature_access,private.ai_pilot_limits from public,anon,authenticated;
grant select,insert,update,delete on private.ai_feature_access,private.ai_pilot_limits to service_role;

create or replace function private.ai_feature_allowed(p_owner uuid,p_feature text)
returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from private.ai_feature_config c where c.feature=p_feature and c.enabled)
    and exists(select 1 from private.ai_feature_access x where x.feature=p_feature and x.professional_id=p_owner and x.enabled)
    and exists(select 1 from private.ai_pilot_limits l where l.professional_id=p_owner and l.enabled
      and l.starts_at<=now() and (l.ends_at is null or l.ends_at>now()));
$$;
revoke all on function private.ai_feature_allowed(uuid,text) from public,anon,authenticated;
grant execute on function private.ai_feature_allowed(uuid,text) to service_role;

create or replace function public.ai_server(p_action text,p_owner uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 a private.ai_accounts; g private.ai_generations; c private.ai_feature_config; l private.ai_pilot_limits;
 gi uuid; k uuid; ri numeric; rp numeric; needed numeric; cost numeric; charge numeric; spent numeric;
 it bigint; ot bigint; ct bigint; final_status text;
begin
 if p_owner is null or not exists(select 1 from public.professional_profiles where id=p_owner) then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_action='config' then
   select * into c from private.ai_feature_config where feature=p_data->>'feature';
   if not found or not private.ai_feature_allowed(p_owner,c.feature) then raise exception 'feature_disabled'; end if;
   return to_jsonb(c);
 end if;
 select * into a from private.ai_accounts where professional_id=p_owner for update;
 if not found then raise exception 'insufficient_credits'; end if;
 if p_action='reserve' then
   k := (p_data->>'idempotency_key')::uuid;
   if k is null then raise exception 'invalid_request'; end if;
   select * into g from private.ai_generations where professional_id=p_owner and idempotency_key=k;
   if found then
     if g.request_hash <> p_data->>'request_hash' then raise exception 'idempotency_conflict'; end if;
     return jsonb_build_object('generation',to_jsonb(g),'created',false);
   end if;
   if not a.enabled then raise exception 'account_disabled'; end if;
   if p_data->>'patient_id' is not null and not exists(select 1 from public.patients where id=(p_data->>'patient_id')::uuid and professional_id=p_owner and deleted_at is null) then raise exception 'context_unavailable' using errcode='42501'; end if;
   if p_data->>'consultation_id' is not null and not exists(select 1 from public.consultations where id=(p_data->>'consultation_id')::uuid and professional_id=p_owner and patient_id=(p_data->>'patient_id')::uuid and deleted_at is null) then raise exception 'context_unavailable' using errcode='42501'; end if;
   select * into c from private.ai_feature_config where feature=p_data->>'feature';
   if not found or not private.ai_feature_allowed(p_owner,c.feature) then raise exception 'feature_disabled'; end if;
   if to_jsonb(c) <> p_data->'config' then raise exception 'config_changed'; end if;
   select * into l from private.ai_pilot_limits where professional_id=p_owner;
   if (select count(*) from private.ai_generations where professional_id=p_owner and feature=c.feature) >= l.max_total_generations then raise exception 'pilot_limit_reached'; end if;
   if (select count(*) from private.ai_generations where professional_id=p_owner and feature=c.feature and started_at>=date_trunc('day',now())) >= l.max_daily_generations then raise exception 'pilot_daily_limit'; end if;
   spent := coalesce((select sum(coalesce(charged_credits,0)+case when status in ('reserved','running','uncertain') then reserved_included+reserved_purchased else 0 end) from private.ai_generations where professional_id=p_owner and started_at>=date_trunc('day',now())),0);
   if spent >= l.max_daily_credits then raise exception 'pilot_daily_budget'; end if;
   if (select count(*) from private.ai_generations where professional_id=p_owner and status in ('reserved','running','uncertain')) >= 3 then raise exception 'too_many_requests'; end if;
   if (select count(*) from private.ai_generations where professional_id=p_owner and started_at > now()-interval '1 minute') >= 10 then raise exception 'rate_limited'; end if;
   cost := (c.max_input_tokens*c.input_usd_per_million+c.max_output_tokens*c.output_usd_per_million)/1000000;
   needed := greatest(0.001,ceil(cost*c.credits_per_usd*c.credit_multiplier*1000)/1000);
   ri := least(needed,case when a.billing_period_end > now() then a.included_credits-a.reserved_included else 0 end);
   rp := needed-ri;
   if rp > a.purchased_credits-a.reserved_purchased then raise exception 'insufficient_credits'; end if;
   insert into private.ai_generations(professional_id,idempotency_key,request_hash,patient_id,consultation_id,feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost)
   values(p_owner,k,p_data->>'request_hash',(p_data->>'patient_id')::uuid,(p_data->>'consultation_id')::uuid,c.feature,c.provider,c.model,c.prompt_version,to_jsonb(c),'reserved',ri,rp,cost) returning * into g;
   update private.ai_accounts set reserved_included=reserved_included+ri,reserved_purchased=reserved_purchased+rp where professional_id=p_owner;
   insert into private.ai_credit_ledger(professional_id,type,reserved_included_delta,reserved_purchased_delta,feature,generation_id,operation_key) values(p_owner,'RESERVE',ri,rp,g.feature,g.id,g.id);
   return jsonb_build_object('generation',to_jsonb(g),'created',true);
 end if;
 gi := (p_data->>'generation_id')::uuid;
 select * into g from private.ai_generations where id=gi and professional_id=p_owner for update;
 if not found then raise exception 'generation_unavailable' using errcode='42501'; end if;
 if p_action='claim' then
   if g.status <> 'reserved' then return jsonb_build_object('claimed',false); end if;
   update private.ai_generations set status='running' where id=gi;
   return jsonb_build_object('claimed',true);
 elsif p_action='release_unclaimed' then
   if g.status<>'reserved' or g.started_at>now()-interval '10 minutes' then raise exception 'reservation_not_releasable'; end if;
   return public.ai_server('settle',p_owner,jsonb_build_object('generation_id',gi,'status','failed','input_tokens',0,'output_tokens',0,'cached_tokens',0));
 elsif p_action='uncertain' then
   if g.status='running' then update private.ai_generations set status='uncertain',error_code='provider_outcome_unknown' where id=gi; end if;
   return jsonb_build_object('status','uncertain');
 elsif p_action='settle' then
   if g.status not in ('reserved','running','uncertain') then return to_jsonb(g); end if;
   final_status := p_data->>'status';
   if final_status not in ('succeeded','failed','invalid_output') or final_status is null then raise exception 'invalid_status'; end if;
   it := (p_data->>'input_tokens')::bigint; ot := (p_data->>'output_tokens')::bigint; ct := (p_data->>'cached_tokens')::bigint;
   if it is null or ot is null or ct is null or it<0 or ot<0 or ct<0 or ct>it then raise exception 'invalid_usage'; end if;
   if g.status='reserved' and (it+ot>0 or final_status<>'failed') then raise exception 'not_dispatched'; end if;
   cost := ((it-ct)*(g.config_snapshot->>'input_usd_per_million')::numeric+ct*(g.config_snapshot->>'cached_usd_per_million')::numeric+ot*(g.config_snapshot->>'output_usd_per_million')::numeric)/1000000;
   charge := least(ceil(cost*(g.config_snapshot->>'credits_per_usd')::numeric*(g.config_snapshot->>'credit_multiplier')::numeric*1000)/1000,g.reserved_included+g.reserved_purchased);
   ri := least(charge,g.reserved_included); rp := charge-ri;
   update private.ai_accounts set included_credits=included_credits-ri,purchased_credits=purchased_credits-rp,reserved_included=reserved_included-g.reserved_included,reserved_purchased=reserved_purchased-g.reserved_purchased where professional_id=p_owner;
   insert into private.ai_credit_ledger(professional_id,type,included_delta,purchased_delta,feature,generation_id,operation_key) values(p_owner,'USAGE',-ri,-rp,g.feature,g.id,g.id);
   insert into private.ai_credit_ledger(professional_id,type,reserved_included_delta,reserved_purchased_delta,feature,generation_id,operation_key) values(p_owner,'RELEASE',-g.reserved_included,-g.reserved_purchased,g.feature,g.id,g.id);
   update private.ai_generations set status=final_status,actual_cost=cost,charged_credits=charge,input_tokens=it,output_tokens=ot,cached_tokens=ct,total_tokens=it+ot,completed_at=now(),provider_response_id=left(p_data->>'provider_response_id',200),error_code=case when final_status='succeeded' then null when final_status='invalid_output' then 'invalid_output' else 'provider_rejected' end where id=gi returning * into g;
   return to_jsonb(g);
 end if;
 raise exception 'invalid_action';
end;
$$;
revoke all on function public.ai_server(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ai_server(text,uuid,jsonb) to service_role;

-- Pilot configuration is intentionally explicit and reversible. Models/prices
-- follow the official OpenAI model pages; no feature is enabled globally here.
update private.ai_feature_config set model='gpt-5.6-luna',prompt_version='recall_24h@1',reasoning_level='low',max_input_tokens=8192,max_output_tokens=1024,input_usd_per_million=0.20,cached_usd_per_million=0.02,output_usd_per_million=1.20,pricing_version='openai-2026-07-30' where feature='recall_24h';
update private.ai_feature_config set model='gpt-5.6-terra',prompt_version='pes_diagnosis@1',reasoning_level='low',max_input_tokens=8192,max_output_tokens=1024,input_usd_per_million=2.00,cached_usd_per_million=0.20,output_usd_per_million=12.00,pricing_version='openai-2026-07-30' where feature='pes_diagnosis';
update private.ai_feature_config set model='gpt-5.6-terra',prompt_version='diet_workshop@1',reasoning_level='low',max_input_tokens=24000,max_output_tokens=1024,input_usd_per_million=2.00,cached_usd_per_million=0.20,output_usd_per_million=12.00,pricing_version='openai-2026-07-30' where feature='diet_workshop';
