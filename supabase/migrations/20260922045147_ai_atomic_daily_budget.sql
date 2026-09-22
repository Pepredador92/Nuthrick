-- Preserve credit conversion and reconciliation. Only admission/counting changes.
-- UTC is the existing Supabase database day; pin it independently of session TZ.
create function private.ai_utc_day_start(p_at timestamptz)
returns timestamptz language sql immutable strict parallel safe set search_path='' as $$
  select date_trunc('day',p_at at time zone 'UTC') at time zone 'UTC';
$$;
revoke all on function private.ai_utc_day_start(timestamptz) from public,anon,authenticated;
grant execute on function private.ai_utc_day_start(timestamptz) to service_role;

-- Confirmed credits belong to their admission day. Every unresolved reservation,
-- including one from a prior day, still reduces today's headroom conservatively.
-- Terminal zero-cost failures contribute neither budget nor generation quota.
create function private.ai_daily_committed(p_owner uuid,p_at timestamptz)
returns numeric language sql stable strict set search_path='' as $$
  select coalesce(sum(case
    when status in ('reserved','running','uncertain') then reserved_included+reserved_purchased
    when started_at>=private.ai_utc_day_start(p_at)
      and started_at<private.ai_utc_day_start(p_at)+interval '24 hours'
      then coalesce(charged_credits,0)
    else 0 end),0)
  from private.ai_generations where professional_id=p_owner;
$$;
revoke all on function private.ai_daily_committed(uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.ai_daily_committed(uuid,timestamptz) to service_role;

-- Lock order remains account -> pilot limit -> generation.
-- No external provider request runs while these short RPC transactions hold locks.
create or replace function public.ai_server(p_action text,p_owner uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 a private.ai_accounts; g private.ai_generations; c private.ai_feature_config; l private.ai_pilot_limits;
 gi uuid; k uuid; ri numeric; rp numeric; needed numeric; cost numeric; charge numeric; spent numeric;
 it bigint; ot bigint; ct bigint; final_status text;
 reservation_time timestamptz; daily_start timestamptz;
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
   select * into l from private.ai_pilot_limits where professional_id=p_owner for share;
   -- Read the clock AFTER the account lock (a request may wait across midnight).
   reservation_time := clock_timestamp();
   daily_start := private.ai_utc_day_start(reservation_time);
   if (select count(*) from private.ai_generations where professional_id=p_owner and feature=c.feature and (status in ('reserved','running','uncertain','succeeded') or coalesce(actual_cost,0)>0)) >= l.max_total_generations then raise exception 'pilot_limit_reached'; end if;
   if (select count(*) from private.ai_generations where professional_id=p_owner and feature=c.feature and started_at>=daily_start and started_at<daily_start+interval '24 hours' and (status in ('reserved','running','uncertain','succeeded') or coalesce(actual_cost,0)>0)) >= l.max_daily_generations then raise exception 'pilot_daily_limit'; end if;

   if (select count(*) from private.ai_generations where professional_id=p_owner and status in ('reserved','running','uncertain')) >= 3 then raise exception 'too_many_requests'; end if;
   if (select count(*) from private.ai_generations where professional_id=p_owner and started_at > now()-interval '1 minute') >= 10 then raise exception 'rate_limited'; end if;
   cost := (c.max_input_tokens*c.input_usd_per_million+c.max_output_tokens*c.output_usd_per_million)/1000000;
   needed := greatest(0.001,ceil(cost*c.credits_per_usd*c.credit_multiplier*1000)/1000);
   spent := private.ai_daily_committed(p_owner,reservation_time);
   if spent + needed > l.max_daily_credits then raise exception 'pilot_daily_budget'; end if;
   ri := least(needed,case when a.billing_period_end > now() then a.included_credits-a.reserved_included else 0 end);
   rp := needed-ri;
   if rp > a.purchased_credits-a.reserved_purchased then raise exception 'insufficient_credits'; end if;
   insert into private.ai_generations(professional_id,idempotency_key,request_hash,patient_id,consultation_id,feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost,started_at)
   values(p_owner,k,p_data->>'request_hash',(p_data->>'patient_id')::uuid,(p_data->>'consultation_id')::uuid,c.feature,c.provider,c.model,c.prompt_version,to_jsonb(c),'reserved',ri,rp,cost,reservation_time) returning * into g;
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
