-- AI-1. All monetary writes are service-only, short, row-locked transactions.
-- No clinical content, credentials, prompts or output are persisted here.
grant usage on schema private to service_role,authenticated;
create table private.ai_feature_config (
  feature text primary key check(feature ~ '^[a-z][a-z0-9_]{1,63}$'),
  enabled boolean not null default false,
  provider text not null default 'openai',
  model text,
  prompt_version text not null,
  max_input_tokens integer not null default 8192 check(max_input_tokens between 2048 and 100000),
  max_output_tokens integer not null default 1024 check(max_output_tokens between 16 and 32000),
  reasoning_level text check(reasoning_level in ('none','minimal','low','medium','high','xhigh')),
  temperature numeric check(temperature between 0 and 2),
  timeout_ms integer not null default 30000 check(timeout_ms between 1000 and 90000),
  credit_multiplier numeric(12,6) not null default 1 check(credit_multiplier > 0),
  credits_per_usd numeric(12,6) not null default 100 check(credits_per_usd > 0),
  input_usd_per_million numeric(12,6) check(input_usd_per_million >= 0),
  cached_usd_per_million numeric(12,6) check(cached_usd_per_million >= 0),
  output_usd_per_million numeric(12,6) check(output_usd_per_million >= 0),
  pricing_version text,
  updated_at timestamptz not null default now(),
  check(not enabled or (model is not null and pricing_version is not null and
    input_usd_per_million is not null and cached_usd_per_million is not null and output_usd_per_million is not null)),
  check(cached_usd_per_million <= input_usd_per_million)
);
insert into private.ai_feature_config(feature,prompt_version) values
 ('core_check','core_check@1'),('pes_diagnosis','not_implemented'),('recall_24h','not_implemented'),
 ('diet_workshop','not_implemented'),('consultation_summary','not_implemented');

create table private.ai_accounts (
  professional_id uuid primary key references public.professional_profiles(id) on delete restrict,
  included_credits numeric(18,3) not null default 0 check(included_credits >= 0),
  purchased_credits numeric(18,3) not null default 0 check(purchased_credits >= 0),
  reserved_included numeric(18,3) not null default 0 check(reserved_included >= 0 and reserved_included <= included_credits),
  reserved_purchased numeric(18,3) not null default 0 check(reserved_purchased >= 0 and reserved_purchased <= purchased_credits),
  credits_included_per_period numeric(18,3) not null default 0 check(credits_included_per_period >= 0),
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  enabled boolean not null default true,
  check((billing_period_start is null and billing_period_end is null) or
    (billing_period_start is not null and billing_period_end is not null and billing_period_end > billing_period_start))
);
create table private.ai_generations (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references private.ai_accounts(professional_id) on delete restrict,
  idempotency_key uuid not null,
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  patient_id uuid,
  consultation_id uuid,
  feature text not null references private.ai_feature_config(feature),
  provider text not null,
  model text not null,
  prompt_version text not null,
  config_snapshot jsonb not null,
  status text not null check(status in ('reserved','running','succeeded','failed','invalid_output','uncertain')),
  reserved_included numeric(18,3) not null,
  reserved_purchased numeric(18,3) not null,
  estimated_cost numeric(18,9) not null,
  actual_cost numeric(18,9),
  charged_credits numeric(18,3) not null default 0,
  input_tokens bigint,
  output_tokens bigint,
  cached_tokens bigint,
  total_tokens bigint,
  provider_response_id text,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(professional_id,idempotency_key),
  unique(professional_id,id),
  check(reserved_included >= 0 and reserved_purchased >= 0),
  check(charged_credits >= 0 and charged_credits <= reserved_included + reserved_purchased),
  check(input_tokens >= 0 and output_tokens >= 0 and cached_tokens between 0 and input_tokens and total_tokens = input_tokens + output_tokens)
);
create index ai_generations_owner_started on private.ai_generations(professional_id,started_at desc);
create index ai_generations_unfinished on private.ai_generations(started_at) where status in ('reserved','running','uncertain');
create table private.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references private.ai_accounts(professional_id) on delete restrict,
  type text not null check(type in ('PLAN_ALLOCATION','PURCHASE','USAGE','REFUND','ADMIN_ADJUSTMENT','RESERVE','RELEASE')),
  included_delta numeric(18,3) not null default 0,
  purchased_delta numeric(18,3) not null default 0,
  reserved_included_delta numeric(18,3) not null default 0,
  reserved_purchased_delta numeric(18,3) not null default 0,
  feature text,
  generation_id uuid,
  operation_key uuid not null,
  created_at timestamptz not null default now(),
  foreign key(professional_id,generation_id) references private.ai_generations(professional_id,id) on delete restrict,
  unique(professional_id,operation_key,type)
);
create index ai_ledger_generation on private.ai_credit_ledger(professional_id,generation_id);
alter table private.ai_feature_config enable row level security;
alter table private.ai_accounts enable row level security;
alter table private.ai_generations enable row level security;
alter table private.ai_credit_ledger enable row level security;
revoke all on private.ai_feature_config,private.ai_accounts,private.ai_generations,private.ai_credit_ledger from public,anon,authenticated;
grant select,insert,update on private.ai_feature_config,private.ai_accounts,private.ai_generations to service_role;
grant select,insert on private.ai_credit_ledger to service_role;

-- Service gateway. p_owner is supplied ONLY by Edge after auth.getUser(), never forwarded from a browser.
create function public.ai_server(p_action text,p_owner uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 a private.ai_accounts; g private.ai_generations; c private.ai_feature_config;
 gi uuid; k uuid; ri numeric; rp numeric; needed numeric; cost numeric; charge numeric;
 it bigint; ot bigint; ct bigint; final_status text;
begin
 if p_owner is null or not exists(select 1 from public.professional_profiles where id=p_owner) then
   raise exception 'unauthorized' using errcode='42501';
 end if;
 if p_action='config' then
   select * into c from private.ai_feature_config where feature=p_data->>'feature';
   if not found or not c.enabled then raise exception 'feature_disabled'; end if;
   return to_jsonb(c);
 end if;
 -- Lock account first for every mutation; network requests run outside these transactions.
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
   if p_data->>'patient_id' is not null and not exists(select 1 from public.patients where id=(p_data->>'patient_id')::uuid and professional_id=p_owner and deleted_at is null) then
     raise exception 'context_unavailable' using errcode='42501';
   end if;
   if p_data->>'consultation_id' is not null and not exists(select 1 from public.consultations where id=(p_data->>'consultation_id')::uuid and professional_id=p_owner and patient_id=(p_data->>'patient_id')::uuid and deleted_at is null) then
     raise exception 'context_unavailable' using errcode='42501';
   end if;
   select * into c from private.ai_feature_config where feature=p_data->>'feature';
   if not found or not c.enabled then raise exception 'feature_disabled'; end if;
   -- Optimistic configuration check: do not send a prompt priced using another config revision.
   if to_jsonb(c) <> p_data->'config' then raise exception 'config_changed'; end if;
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
   insert into private.ai_credit_ledger(professional_id,type,reserved_included_delta,reserved_purchased_delta,feature,generation_id,operation_key)
   values(p_owner,'RESERVE',ri,rp,g.feature,g.id,g.id);
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
   -- Only reservations never dispatched can be expired automatically, never running/uncertain.
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
   charge := ceil(cost*(g.config_snapshot->>'credits_per_usd')::numeric*(g.config_snapshot->>'credit_multiplier')::numeric*1000)/1000;
   -- Never debit beyond authorized reservation: anomalous extra cost belongs to Nuthrick.
   charge := least(charge,g.reserved_included+g.reserved_purchased);
   ri := least(charge,g.reserved_included); rp := charge-ri;
   update private.ai_accounts set included_credits=included_credits-ri,purchased_credits=purchased_credits-rp,
     reserved_included=reserved_included-g.reserved_included,reserved_purchased=reserved_purchased-g.reserved_purchased where professional_id=p_owner;
   insert into private.ai_credit_ledger(professional_id,type,included_delta,purchased_delta,feature,generation_id,operation_key)
   values(p_owner,'USAGE',-ri,-rp,g.feature,g.id,g.id);
   insert into private.ai_credit_ledger(professional_id,type,reserved_included_delta,reserved_purchased_delta,feature,generation_id,operation_key)
   values(p_owner,'RELEASE',-g.reserved_included,-g.reserved_purchased,g.feature,g.id,g.id);
   update private.ai_generations set status=final_status,actual_cost=cost,charged_credits=charge,input_tokens=it,output_tokens=ot,cached_tokens=ct,total_tokens=it+ot,
    completed_at=now(),provider_response_id=left(p_data->>'provider_response_id',200),
    error_code=case when final_status='succeeded' then null when final_status='invalid_output' then 'invalid_output' else 'provider_rejected' end where id=gi returning * into g;
   return to_jsonb(g);
 end if;
 raise exception 'invalid_action';
end;
$$;
revoke all on function public.ai_server(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ai_server(text,uuid,jsonb) to service_role;

-- Read-only owner-scoped facade. Definer required only to hide private tables from browsers.
create function private.ai_balance() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('available_credits',coalesce((select
   case when billing_period_end>now() then included_credits-reserved_included else 0 end+purchased_credits-reserved_purchased
   from private.ai_accounts where professional_id=(select auth.uid()) and enabled),0),
   'reserved_credits',coalesce((select reserved_included+reserved_purchased from private.ai_accounts where professional_id=(select auth.uid())),0));
$$;
revoke all on function private.ai_balance() from public,anon;
grant execute on function private.ai_balance() to authenticated;
create function public.ai_balance() returns jsonb language sql security invoker set search_path='' as $$select private.ai_balance()$$;
revoke all on function public.ai_balance() from public,anon;
grant execute on function public.ai_balance() to authenticated;

create function private.ai_generation_status(p_key uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('generationId',id,'status',status,'chargedCredits',charged_credits,'errorCode',error_code)
 from private.ai_generations where professional_id=(select auth.uid()) and idempotency_key=p_key;
$$;
revoke all on function private.ai_generation_status(uuid) from public,anon;
grant execute on function private.ai_generation_status(uuid) to authenticated;
create function public.ai_generation_status(p_key uuid) returns jsonb language sql security invoker set search_path='' as $$select private.ai_generation_status(p_key)$$;
revoke all on function public.ai_generation_status(uuid) from public,anon;
grant execute on function public.ai_generation_status(uuid) to authenticated;

-- Future billing integration: service-only, idempotent, explicit period; no checkout/admin UI.
create function public.ai_grant_credits(p_owner uuid,p_key uuid,p_type text,p_amount numeric,p_start timestamptz default null,p_end timestamptz default null)
returns void language plpgsql security invoker set search_path='' as $$
declare a private.ai_accounts; delta numeric;
begin
 if p_key is null or p_type not in ('PLAN_ALLOCATION','PURCHASE') or p_type is null or p_amount is null or p_amount<0 or p_amount<>round(p_amount,3) then raise exception 'invalid_allocation'; end if;
 insert into private.ai_accounts(professional_id) values(p_owner) on conflict do nothing;
 select * into a from private.ai_accounts where professional_id=p_owner for update;
 if exists(select 1 from private.ai_credit_ledger where professional_id=p_owner and operation_key=p_key) then return; end if;
 if p_type='PLAN_ALLOCATION' then
   if p_start is null or p_end is null or p_start>=p_end or p_end<=now() or p_start>now() or (a.billing_period_start is not null and p_start<=a.billing_period_start) then raise exception 'invalid_period'; end if;
   if a.reserved_included>0 then raise exception 'unsettled_period'; end if;
   delta := p_amount-a.included_credits;
   update private.ai_accounts set included_credits=p_amount,credits_included_per_period=p_amount,billing_period_start=p_start,billing_period_end=p_end where professional_id=p_owner;
   insert into private.ai_credit_ledger(professional_id,type,included_delta,operation_key) values(p_owner,p_type,delta,p_key);
 else
   update private.ai_accounts set purchased_credits=purchased_credits+p_amount where professional_id=p_owner;
   insert into private.ai_credit_ledger(professional_id,type,purchased_delta,operation_key) values(p_owner,p_type,p_amount,p_key);
 end if;
end;
$$;
revoke all on function public.ai_grant_credits(uuid,uuid,text,numeric,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.ai_grant_credits(uuid,uuid,text,numeric,timestamptz,timestamptz) to service_role;
