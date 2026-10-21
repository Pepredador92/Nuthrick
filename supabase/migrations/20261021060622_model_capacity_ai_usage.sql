-- Use the model's documented capacity instead of per-feature token ceilings.
-- Preserve prepaid credit escrow, idempotency, immutable pricing snapshots,
-- entitlement checks and actual provider usage. Never truncate clinical history.
alter table private.ai_feature_config
 add column token_policy text not null default 'fixed' check(token_policy in ('fixed','model_capacity')),
 add column pricing_policy jsonb not null default '{}'::jsonb check(jsonb_typeof(pricing_policy)='object');
alter table private.ai_feature_config drop constraint ai_feature_config_max_input_tokens_check;
alter table private.ai_feature_config add constraint ai_feature_config_max_input_tokens_check check(max_input_tokens between 2048 and 1050000);
alter table private.ai_feature_config drop constraint ai_feature_config_max_output_tokens_check;
alter table private.ai_feature_config add constraint ai_feature_config_max_output_tokens_check check(max_output_tokens between 16 and 128000);
alter table private.ai_feature_config drop constraint ai_feature_config_timeout_ms_check;
alter table private.ai_feature_config add constraint ai_feature_config_timeout_ms_check check(timeout_ms between 1000 and 120000);

-- NULL on historical records means cache writes were not captured then. Do not
-- retroactively change previous charges or invent historical token counts.
alter table private.ai_generations
 add column cache_write_tokens bigint,
 add column cache_write_12h_tokens bigint,
 add constraint ai_cache_write_usage_valid check(cache_write_tokens>=0 and cache_write_12h_tokens between 0 and cache_write_tokens and cached_tokens+cache_write_tokens<=input_tokens);

-- Rates come from each generation's immutable configuration, including the
-- long-context tier and reported cache writes (subsets of input, never added twice).
create function private.ai_token_cost(c jsonb,it bigint,ot bigint,ct bigint,wt bigint,w12 bigint)
returns numeric language sql immutable set search_path='' as $$
 select (((it-ct-wt)*(c->>'input_usd_per_million')::numeric
   +ct*(c->>'cached_usd_per_million')::numeric
   +(wt-w12)*(c->>'input_usd_per_million')::numeric*coalesce((c#>>'{pricing_policy,cache_write_multiplier}')::numeric,1)
   +w12*(c->>'input_usd_per_million')::numeric*coalesce((c#>>'{pricing_policy,cache_write_12h_multiplier}')::numeric,1))
   *case when it>coalesce((c#>>'{pricing_policy,long_context_threshold}')::bigint,9223372036854775807) then coalesce((c#>>'{pricing_policy,long_context_input_multiplier}')::numeric,1) else 1 end
   +ot*(c->>'output_usd_per_million')::numeric
   *case when it>coalesce((c#>>'{pricing_policy,long_context_threshold}')::bigint,9223372036854775807) then coalesce((c#>>'{pricing_policy,long_context_output_multiplier}')::numeric,1) else 1 end)/1000000;
$$;
revoke all on function private.ai_token_cost(jsonb,bigint,bigint,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function private.ai_token_cost(jsonb,bigint,bigint,bigint,bigint,bigint) to service_role;

CREATE OR REPLACE FUNCTION public.ai_server(p_action text, p_owner uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 a private.ai_accounts; g private.ai_generations; c private.ai_feature_config; l private.ai_pilot_limits;
 gi uuid; k uuid; ri numeric; rp numeric; needed numeric; cost numeric; charge numeric; spent numeric;
 it bigint; ot bigint; ct bigint; wt bigint; w12 bigint; final_status text;
 reservation_time timestamptz; daily_start timestamptz;
 snapshot jsonb; counted_input bigint; reserved_input bigint; allocated_output integer;
 available numeric; input_cost numeric; output_rate numeric;
begin
 if p_action in ('config','reserve','claim') then
  perform private.require_entitlement(p_owner,case coalesce(p_data->>'feature',(select feature from private.ai_generations where id=(p_data->>'generation_id')::uuid and professional_id=p_owner))
    when 'recall_24h' then 'ai.recall_24h' when 'pes_diagnosis' then 'ai.pes' when 'diet_draft' then 'ai.diet_draft' when 'consultation_support' then 'ai.consultation_support' when 'intervention_strategy' then 'ai.consultation_support' when 'patient_instructions' then 'ai.patient_instructions' else 'ai.unsupported' end);
 end if;

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
   select * into l from private.ai_pilot_limits where professional_id=p_owner for share;
   -- Read the clock AFTER the account lock (a request may wait across midnight).
   reservation_time := clock_timestamp();
   daily_start := private.ai_utc_day_start(reservation_time);
   if not coalesce((select production_enabled from private.ai_live_pilot_configuration where id),false) and (select count(*) from private.ai_generations where professional_id=p_owner and feature=c.feature and (status in ('reserved','running','uncertain','succeeded') or coalesce(actual_cost,0)>0)) >= l.max_total_generations then raise exception 'pilot_limit_reached'; end if;
   if (select count(*) from private.ai_generations where professional_id=p_owner and feature=c.feature and started_at>=daily_start and started_at<daily_start+interval '24 hours' and (status in ('reserved','running','uncertain','succeeded') or coalesce(actual_cost,0)>0)) >= l.max_daily_generations then raise exception 'pilot_daily_limit'; end if;

   if (select count(*) from private.ai_generations where professional_id=p_owner and status in ('reserved','running','uncertain')) >= 3 then raise exception 'too_many_requests'; end if;
   if (select count(*) from private.ai_generations where professional_id=p_owner and started_at > now()-interval '1 minute') >= 10 then raise exception 'rate_limited'; end if;
   snapshot := to_jsonb(c);
   if c.token_policy='model_capacity' then
     -- Only the service role can supply this count, measured on the final owned
     -- prompt/schema. Browser requests cannot choose model, budget or pricing.
     counted_input := (p_data->>'counted_input_tokens')::bigint;
     if counted_input is null or counted_input<1 then raise exception 'invalid_request'; end if;
     if counted_input>c.max_input_tokens then raise exception 'input_too_large'; end if;
     -- Allow a small accounting margin for provider-added prompt framing. This
     -- is escrow only: it does not add clinical input, tokens or actual charges.
     reserved_input := least(c.max_input_tokens,counted_input+1024);
     available := greatest(0,(case when a.billing_period_end>now() then a.included_credits-a.reserved_included else 0 end)+a.purchased_credits-a.reserved_purchased);
     input_cost := private.ai_token_cost(snapshot,reserved_input,0,0,reserved_input,0);
     output_rate := private.ai_token_cost(snapshot,reserved_input,1000000,0,0,0)-private.ai_token_cost(snapshot,reserved_input,0,0,0,0);
     if output_rate<=0 then raise exception 'invalid_request'; end if;
     allocated_output := least(c.max_output_tokens,greatest(0,floor((available/(c.credits_per_usd*c.credit_multiplier)-input_cost)*1000000/output_rate)))::integer;
     if allocated_output<16 then raise exception 'insufficient_credits'; end if;
     snapshot := snapshot || jsonb_build_object('counted_input_tokens',counted_input,'reserved_input_tokens',reserved_input,'allocated_output_tokens',allocated_output);
     cost := private.ai_token_cost(snapshot,reserved_input,allocated_output,0,reserved_input,0);
   else
     cost := (c.max_input_tokens*c.input_usd_per_million+c.max_output_tokens*c.output_usd_per_million)/1000000;
   end if;
   needed := case when c.execution_mode='simulated' then 0 else greatest(0.001,ceil(cost*c.credits_per_usd*c.credit_multiplier*1000)/1000) end;

   if l.calibration_started_at is not null then
     if c.execution_mode<>'real' or c.max_provider_attempts<>1 or (p_data->>'patient_id')::uuid is distinct from l.calibration_patient_id then raise exception 'calibration_scope'; end if;
     if (select count(*) from private.ai_generations where professional_id=p_owner and started_at>=l.calibration_started_at)>=l.calibration_request_limit then raise exception 'calibration_request_limit'; end if;
     if (select count(*) from private.ai_generations where professional_id=p_owner and started_at>=l.calibration_started_at and feature=c.feature and model=c.model)>=least(9,greatest(0,coalesce((l.calibration_model_limits->>(c.feature||':'||c.model))::integer,0))) then raise exception 'calibration_model_limit'; end if;
     if cost + (select coalesce(sum(case when status in ('reserved','running','uncertain') then estimated_cost else coalesce(actual_cost,0) end),0) from private.ai_generations where professional_id=p_owner and started_at>=l.calibration_started_at)>l.calibration_usd_limit then raise exception 'calibration_budget'; end if;
   end if;
   spent := private.ai_daily_committed(p_owner,reservation_time);
   if spent + needed > l.max_daily_credits then raise exception 'pilot_daily_budget'; end if;
   ri := least(needed,case when a.billing_period_end > now() then a.included_credits-a.reserved_included else 0 end);
   rp := needed-ri;
   if rp > a.purchased_credits-a.reserved_purchased then raise exception 'insufficient_credits'; end if;
   insert into private.ai_generations(professional_id,idempotency_key,request_hash,patient_id,consultation_id,feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost,started_at)
   values(p_owner,k,p_data->>'request_hash',(p_data->>'patient_id')::uuid,(p_data->>'consultation_id')::uuid,c.feature,c.provider,c.model,c.prompt_version,snapshot,'reserved',ri,rp,cost,reservation_time) returning * into g;
   update private.ai_accounts set reserved_included=reserved_included+ri,reserved_purchased=reserved_purchased+rp where professional_id=p_owner;
   insert into private.ai_credit_ledger(professional_id,type,reserved_included_delta,reserved_purchased_delta,feature,generation_id,operation_key) values(p_owner,'RESERVE',ri,rp,g.feature,g.id,g.id);
   return jsonb_build_object('generation',to_jsonb(g),'created',true);
 end if;
 gi := (p_data->>'generation_id')::uuid;
 select * into g from private.ai_generations where id=gi and professional_id=p_owner for update;
 if not found then raise exception 'generation_unavailable' using errcode='42501'; end if;
 if p_action='claim' then
   if not private.ai_feature_allowed(p_owner,g.feature) then raise exception 'feature_disabled'; end if;
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
   wt := coalesce((p_data->>'cache_write_tokens')::bigint,0);
   w12 := coalesce((p_data->>'cache_write_12h_tokens')::bigint,0);
   if wt<0 or w12<0 or w12>wt or ct+wt>it then raise exception 'invalid_usage'; end if;
   if g.status='reserved' and (it+ot>0 or final_status<>'failed') then raise exception 'not_dispatched'; end if;
   cost := private.ai_token_cost(g.config_snapshot,it,ot,ct,wt,w12);
   charge := least(ceil(cost*(g.config_snapshot->>'credits_per_usd')::numeric*(g.config_snapshot->>'credit_multiplier')::numeric*1000)/1000,g.reserved_included+g.reserved_purchased);
   ri := least(charge,g.reserved_included); rp := charge-ri;
   update private.ai_accounts set included_credits=included_credits-ri,purchased_credits=purchased_credits-rp,reserved_included=reserved_included-g.reserved_included,reserved_purchased=reserved_purchased-g.reserved_purchased where professional_id=p_owner;
   insert into private.ai_credit_ledger(professional_id,type,included_delta,purchased_delta,feature,generation_id,operation_key) values(p_owner,'USAGE',-ri,-rp,g.feature,g.id,g.id);
   insert into private.ai_credit_ledger(professional_id,type,reserved_included_delta,reserved_purchased_delta,feature,generation_id,operation_key) values(p_owner,'RELEASE',-g.reserved_included,-g.reserved_purchased,g.feature,g.id,g.id);
   update private.ai_generations set status=final_status,actual_cost=cost,charged_credits=charge,input_tokens=it,output_tokens=ot,cached_tokens=ct,cache_write_tokens=wt,cache_write_12h_tokens=w12,total_tokens=it+ot,completed_at=now(),provider_response_id=left(p_data->>'provider_response_id',200),error_code=case when final_status='succeeded' then null when final_status='invalid_output' then 'invalid_output' else 'provider_rejected' end where id=gi returning * into g;
   return to_jsonb(g);
 end if;
 raise exception 'invalid_action';
end;
$function$
;

-- Official GPT-5.6 Luna specifications/pricing checked 2026-10-21:
-- https://developers.openai.com/api/docs/models/gpt-5.6-luna
-- https://developers.openai.com/api/docs/guides/prompt-caching
-- Keep the existing model, prompts and clinical validation unchanged.
update private.ai_feature_config set token_policy='model_capacity',
 max_input_tokens=922000,max_output_tokens=128000,timeout_ms=120000,
 pricing_policy='{"cache_write_multiplier":1.25,"cache_write_12h_multiplier":2.5,"long_context_threshold":272000,"long_context_input_multiplier":2,"long_context_output_multiplier":1.5}'::jsonb,
 pricing_version='openai-luna-2026-10-21-usage',updated_at=now()
where enabled and execution_mode='real' and model='gpt-5.6-luna'
 and feature in ('pes_diagnosis','recall_24h','consultation_support','intervention_strategy','patient_instructions','diet_draft');

-- Expose measured usage alongside the existing administrative credit/cost totals.
CREATE OR REPLACE FUNCTION private.admin_ai_operations(p_action text DEFAULT 'overview'::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=private.require_platform_admin(); settings private.ai_operating_reserve; result jsonb; counts jsonb; ids uuid[];
begin
 if p_action='save_settings' then
  select * into settings from private.ai_operating_reserve where singleton for update;
  if p_data ? 'balance_usd' then
   if jsonb_typeof(p_data->'balance_usd')<>'number' or (p_data->>'balance_usd')::numeric not between 0 and 100000000 then raise exception 'invalid_balance'; end if;
   settings.balance_usd:=(p_data->>'balance_usd')::numeric; settings.balance_at:=clock_timestamp();
  end if;
  update private.ai_operating_reserve set balance_usd=settings.balance_usd,balance_at=settings.balance_at,
   coverage_days=coalesce((p_data->>'coverage_days')::integer,coverage_days),
   buffer_percent=coalesce((p_data->>'buffer_percent')::integer,buffer_percent),
   extra_credits=coalesce((p_data->>'extra_credits')::numeric,extra_credits),updated_at=now() where singleton;
  insert into private.admin_audit(actor_admin,action,entity,reason,metadata)
   values(actor,'ai_reserve_settings','ai_operating_reserve','Conciliación y parámetros de reserva de IA',p_data);
  return jsonb_build_object('saved',true);
 elsif p_action='mark_read' then
  if jsonb_typeof(p_data->'ids') is distinct from 'array' or jsonb_array_length(p_data->'ids')>50 then raise exception 'invalid_alerts'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'ids');
  insert into private.ai_admin_alert_reads(admin_id,alert_id) select actor,id from private.ai_admin_alerts where id=any(ids) on conflict do nothing;
  return jsonb_build_object('saved',true);
 elsif p_action not in ('overview','alerts') then raise exception 'unknown_action'; end if;
 select jsonb_build_object('unread',count(*)) into counts from private.ai_admin_alerts a
 where not exists(select 1 from private.ai_admin_alert_reads r where r.admin_id=actor and r.alert_id=a.id);
 if p_action='alerts' then return counts; end if;
 select * into settings from private.ai_operating_reserve where singleton;
 with effective as materialized (
  select id,private.resolve_effective_entitlements(id) e from public.professional_profiles
 ), active as (
  select *,coalesce((e->'values'->>'ai.monthly_credits')::numeric,0) credits from effective
  where e->>'allowed'='true' and e->>'read_only' is distinct from 'true'
 ), groups as (
  select coalesce(e->>'plan_name','Sin plan') name,count(*) users,sum(credits) monthly_credits from active group by 1
 ) select jsonb_build_object('registered',(select count(*) from effective),'active',(select count(*) from active),
   'monthly_credits',coalesce((select sum(credits) from active),0),'plans',coalesce((select jsonb_agg(to_jsonb(g) order by users desc,name) from groups g),'[]')) into result;
 result:=result||jsonb_build_object('settings',to_jsonb(settings)-'singleton','checked_at',now(),
  'included',coalesce((select sum(greatest(0,included_credits)) from private.ai_accounts where billing_period_end>now()),0),
  'purchased',coalesce((select sum(greatest(0,purchased_credits)) from private.ai_accounts),0),
  'reserved',coalesce((select sum(reserved_included+reserved_purchased) from private.ai_accounts),0),
  'usd_per_credit',(select max(1/nullif(credits_per_usd*credit_multiplier,0)) from private.ai_feature_config where enabled and provider='openai'),
  'usage', (select jsonb_build_object('credits',coalesce(sum(charged_credits),0),'cost_usd',coalesce(sum(actual_cost),0),
    'input_tokens',coalesce(sum(input_tokens),0),'output_tokens',coalesce(sum(output_tokens),0),
    'cached_tokens',coalesce(sum(cached_tokens),0),'cache_write_tokens',coalesce(sum(cache_write_tokens),0),'total_tokens',coalesce(sum(total_tokens),0),
    'executions',count(*),'unsettled',count(*) filter(where status in ('running','uncertain')),
    'unsettled_usd',coalesce(sum(estimated_cost) filter(where status in ('running','uncertain')),0))
   from private.ai_generations where provider='openai' and started_at>=now()-interval '30 days'),
  'cost_since_balance',coalesce((select sum(actual_cost) from private.ai_generations where provider='openai' and completed_at>settings.balance_at),0),
  'unsettled_total', (select count(*) from private.ai_generations where provider='openai' and status in ('running','uncertain')),
  'unsettled_total_usd',coalesce((select sum(estimated_cost) from private.ai_generations where provider='openai' and status in ('running','uncertain')),0),
  'pending_payments',(select count(*) from private.ai_credit_purchases where mode='live' and status='pending' and expires_at>now()),
  'assignment_issues',(select count(*) from private.ai_credit_purchases where mode='live' and (status='paid' or paid_at is not null) and credited_at is null),
  'webhook_issues',(select count(*) from private.billing_webhook_events where mode='live' and processed_at is null and last_error is not null),
  'sales',(select jsonb_build_object('count',count(*),'credits',coalesce(sum(credits_purchased+bonus_credits-reversed_credits),0),
   'mxn',coalesce(sum(amount_paid-refunded_amount),0)/100.0) from private.ai_credit_purchases where mode='live' and credited_at>=now()-interval '30 days'),
  'daily', (select jsonb_agg(jsonb_build_object('day',d::date,'credits',coalesce(u.credits,0),'cost_usd',coalesce(u.cost,0),'purchases',coalesce(s.credits,0)) order by d)
    from generate_series((now() at time zone 'America/Mexico_City')::date-29,(now() at time zone 'America/Mexico_City')::date,interval '1 day') d
    left join (select (started_at at time zone 'America/Mexico_City')::date as bucket_day,sum(charged_credits) credits,sum(actual_cost) cost from private.ai_generations where provider='openai' and started_at>=now()-interval '31 days' group by 1) u on u.bucket_day=d::date
    left join (select (credited_at at time zone 'America/Mexico_City')::date as bucket_day,sum(credits_purchased+bonus_credits-reversed_credits) credits from private.ai_credit_purchases where mode='live' and credited_at>=now()-interval '31 days' group by 1) s on s.bucket_day=d::date),
  'alerts',counts||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by is_read,created_at desc,id) from (
    select a.id,a.purchase_id,a.status,a.credited,a.amount,a.credits,a.created_at,p.professional_id,pr.full_name professional_name,
     exists(select 1 from private.ai_admin_alert_reads r where r.admin_id=actor and r.alert_id=a.id) is_read
    from private.ai_admin_alerts a join private.ai_credit_purchases p on p.id=a.purchase_id join public.professional_profiles pr on pr.id=p.professional_id
    order by is_read,a.created_at desc,a.id limit 50) x),'[]'))
 );
 return result;
end $function$
;
