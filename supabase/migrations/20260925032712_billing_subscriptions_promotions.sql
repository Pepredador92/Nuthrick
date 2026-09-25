-- ADMIN-2: Stripe TEST only. No existing access or clinical records are reassigned.
alter table private.plans add column billing_rank integer not null default 0 check(billing_rank>=0);
update private.plans set billing_rank=case code when 'esencial' then 10 when 'profesional' then 20 else 0 end;
create table private.billing_settings (
 id boolean primary key default true check(id), provider text not null default 'stripe', mode text not null default 'test' check(mode='test'),
 enabled boolean not null default false, grace_days integer not null default 7 check(grace_days between 0 and 30),
 updated_at timestamptz not null default now()
);
insert into private.billing_settings default values;
create table private.billing_test_accounts (professional_id uuid primary key references public.professional_profiles(id), created_at timestamptz not null default now());
create table private.billing_customers (
 professional_id uuid primary key references public.professional_profiles(id), provider text not null default 'stripe', mode text not null default 'test' check(mode='test'),
 provider_customer_id text unique, lease_key uuid, lease_until timestamptz, created_at timestamptz not null default now()
);
create table private.billing_price_mappings (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references private.plans(id), interval text not null check(interval in ('monthly','annual')),
 provider text not null default 'stripe', mode text not null default 'test' check(mode='test'), amount bigint not null check(amount>0), currency text not null check(currency='MXN'),
 fingerprint text not null unique, provider_price_id text unique, created_at timestamptz not null default now()
);
create index billing_prices_plan on private.billing_price_mappings(plan_id);
create table private.promotion_campaigns (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^[A-Z0-9_-]{3,40}$'), name text not null check(length(name) between 1 and 120),
 audience text not null check(audience in ('student','university','clinic','influencer','partner','campaign','custom')), audience_note text not null default '' check(length(audience_note)<=500),
 visibility text not null default 'private' check(visibility in ('private','public')), active boolean not null default true,
 starts_at timestamptz not null default now(), ends_at timestamptz, eligible_plan_ids uuid[] not null, intervals text[] not null default array['monthly','annual'],
 benefits jsonb not null, fallback text not null default 'normal_plan' check(fallback='normal_plan'),
 max_redemptions integer check(max_redemptions>0), max_per_professional integer not null default 1 check(max_per_professional between 1 and 100), new_customers_only boolean not null default false,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at is null or ends_at>starts_at)
);
create table private.billing_promotion_mappings (
 campaign_id uuid not null references private.promotion_campaigns(id), version integer not null, price_mapping_id uuid not null references private.billing_price_mappings(id),
 provider_coupon_id text, end_at timestamptz, created_at timestamptz not null default now(), primary key(campaign_id,version,price_mapping_id)
);
create index billing_promotion_price on private.billing_promotion_mappings(price_mapping_id);
create table private.billing_checkout_intents (
 id uuid primary key, professional_id uuid not null references public.professional_profiles(id), price_mapping_id uuid not null references private.billing_price_mappings(id),
 campaign_id uuid references private.promotion_campaigns(id), campaign_snapshot jsonb, access_revision timestamptz,
 state text not null default 'reserved' check(state in ('reserved','open','completed','expired')), provider_session_id text unique, provider_subscription_id text,
 url text check(url is null or url ~ '^https://checkout\.stripe\.com/'), expires_at timestamptz not null, created_at timestamptz not null default now()
);
create unique index billing_one_pending_checkout on private.billing_checkout_intents(professional_id) where state in ('reserved','open');
create index billing_checkout_campaign on private.billing_checkout_intents(campaign_id);
create index billing_checkout_price on private.billing_checkout_intents(price_mapping_id);
create table private.billing_subscriptions (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.professional_profiles(id), provider text not null default 'stripe', mode text not null default 'test' check(mode='test'),
 provider_subscription_id text not null unique, provider_customer_id text not null, price_mapping_id uuid not null references private.billing_price_mappings(id),
 state text not null check(state in ('trial','active','grace','suspended','cancelled')), provider_status text not null,
 period_start timestamptz not null, period_end timestamptz not null, credit_anchor_at timestamptz not null,
 paid_through timestamptz, grace_until timestamptz, cancel_at_period_end boolean not null default false, provider_schedule_id text,
 pending_plan_id uuid references private.plans(id), pending_interval text, manual_hold boolean not null default false,
 campaign_id uuid references private.promotion_campaigns(id), campaign_snapshot jsonb, latest_invoice_id text,
 last_provider_event_at timestamptz, updated_at timestamptz not null default now(), created_at timestamptz not null default now(), check(period_end>period_start)
);
create unique index billing_one_current_subscription on private.billing_subscriptions(professional_id,provider,mode) where state<>'cancelled';
create index billing_subscriptions_price on private.billing_subscriptions(price_mapping_id);
create index billing_subscriptions_campaign on private.billing_subscriptions(campaign_id);
create index billing_subscriptions_pending_plan on private.billing_subscriptions(pending_plan_id);
create table private.billing_payments (
 provider_invoice_id text primary key, professional_id uuid not null references public.professional_profiles(id), subscription_id uuid not null references private.billing_subscriptions(id), price_mapping_id uuid not null references private.billing_price_mappings(id),
 provider text not null default 'stripe', mode text not null default 'test' check(mode='test'), amount_due bigint not null check(amount_due>=0), amount_paid bigint not null check(amount_paid>=0),
 currency text not null check(currency='MXN'), status text not null, issued_at timestamptz not null, paid_at timestamptz,
 hosted_url text check(hosted_url is null or hosted_url ~ '^https://invoice\.stripe\.com/'), updated_at timestamptz not null default now()
);
create index billing_payments_owner_date on private.billing_payments(professional_id,issued_at desc);
create index billing_payments_price on private.billing_payments(price_mapping_id);
create index billing_payments_subscription on private.billing_payments(subscription_id);
create table private.billing_webhook_events (
 provider_event_id text primary key, provider text not null default 'stripe', mode text not null default 'test' check(mode='test'),
 event_type text not null, provider_created_at timestamptz not null, professional_id uuid references public.professional_profiles(id),
 processed_at timestamptz, attempts integer not null default 0, last_error text, created_at timestamptz not null default now()
);
create index billing_events_owner on private.billing_webhook_events(professional_id);
create table private.promotion_redemptions (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references private.promotion_campaigns(id), professional_id uuid not null references public.professional_profiles(id),
 checkout_id uuid not null unique references private.billing_checkout_intents(id), subscription_id uuid not null references private.billing_subscriptions(id),
 benefits jsonb not null, audience text not null, redeemed_at timestamptz not null default now()
);
create index promotion_redemptions_campaign on private.promotion_redemptions(campaign_id,professional_id);
create index promotion_redemptions_owner on private.promotion_redemptions(professional_id);
create index promotion_redemptions_subscription on private.promotion_redemptions(subscription_id);
create table private.billing_operations (
 operation_key uuid primary key, professional_id uuid not null references public.professional_profiles(id), action text not null, request jsonb not null,
 result jsonb, created_at timestamptz not null default now()
);
create index billing_operations_owner on private.billing_operations(professional_id,created_at desc);
-- Deny direct data access. Narrow invoker RPCs call private helpers with explicit authorization.
do $$ declare t text; begin
 foreach t in array array['billing_settings','billing_test_accounts','billing_customers','billing_price_mappings','promotion_campaigns','billing_promotion_mappings','billing_checkout_intents','billing_subscriptions','billing_payments','billing_webhook_events','promotion_redemptions','billing_operations'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('create policy deny_direct on private.%I for all to anon,authenticated using (false) with check (false)',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function private.validate_promotion() returns trigger language plpgsql set search_path='' as $$
declare b jsonb; d jsonb; k text; n integer:=0; fin integer:=0; seen text[]:='{}'; begin
 if cardinality(new.eligible_plan_ids)=0 or exists(select 1 from unnest(new.eligible_plan_ids) x where not exists(select 1 from private.plans p where p.id=x and not p.internal_only and p.active)) then raise exception 'invalid_promotion_plans'; end if;
 if cardinality(new.intervals)=0 or not new.intervals<@array['monthly','annual']::text[] then raise exception 'invalid_promotion_interval'; end if;
 if jsonb_typeof(new.benefits)<>'array' or jsonb_array_length(new.benefits) not between 1 and 8 then raise exception 'invalid_benefit'; end if;
 for b in select value from jsonb_array_elements(new.benefits) loop
  k:=b->>'type'; d:=b->'duration'; n:=n+1;
  if k is null or k not in ('percentage_discount','fixed_discount','free_period','custom_price','initial_ai_credits','temporary_entitlement','plan_upgrade') then raise exception 'invalid_benefit'; end if;
  if d->>'kind' is null or d->>'kind' not in ('invoice','months','until','forever') then raise exception 'invalid_duration'; end if;
  if d->>'kind'='months' and (jsonb_typeof(d->'months') is distinct from 'number' or (d->>'months')::numeric<>trunc((d->>'months')::numeric) or coalesce((d->>'months')::integer,0) not between 1 and 120) then raise exception 'invalid_duration'; end if;
  if d->>'kind'='until' and (d->>'until' is null or (d->>'until')::timestamptz<=new.starts_at) then raise exception 'invalid_duration'; end if;
  if k in ('percentage_discount','fixed_discount','custom_price','initial_ai_credits') and jsonb_typeof(b->'amount') is distinct from 'number' then raise exception 'invalid_benefit'; end if;
  if k in ('fixed_discount','custom_price') and (b->>'amount')::numeric*100<>trunc((b->>'amount')::numeric*100) then raise exception 'invalid_benefit'; end if;
  if k in ('initial_ai_credits','fixed_discount') and (b->>'amount')::numeric<=0 then raise exception 'invalid_benefit'; end if;
  if k='initial_ai_credits' and d->>'kind'<>'invoice' then raise exception 'invalid_duration'; end if;
  if k='free_period' and d->>'kind' in ('months','until') and 'annual'=any(new.intervals) then raise exception 'free_period_requires_monthly'; end if;
  if k in ('percentage_discount','fixed_discount','free_period','custom_price') then fin:=fin+1; end if;
  if fin>1 then raise exception 'one_financial_benefit'; end if;
  if k='initial_ai_credits' and (b->>'amount')::numeric<>round((b->>'amount')::numeric,3) then raise exception 'invalid_benefit'; end if;
  if k in ('percentage_discount','fixed_discount','custom_price','initial_ai_credits') and (coalesce((b->>'amount')::numeric,-1)<0 or (b->>'amount')::numeric>1000000) then raise exception 'invalid_benefit'; end if;
  if k='percentage_discount' and ((b->>'amount')::numeric<=0 or (b->>'amount')::numeric>100) then raise exception 'invalid_benefit'; end if;
  if k='temporary_entitlement' then
   if b->>'entitlement' = any(seen) then raise exception 'duplicate_benefit'; end if; seen:=array_append(seen,b->>'entitlement');
   if not exists(select 1 from private.entitlement_catalog where key=b->>'entitlement' and ((value_type='boolean' and jsonb_typeof(b->'value')='boolean') or (value_type='limit' and (b->'value'='"unlimited"' or (jsonb_typeof(b->'value')='number' and (b->>'value')::numeric between 0 and 1000000 and (b->>'value')::numeric=trunc((b->>'value')::numeric)))))) then raise exception 'invalid_entitlement_value'; end if;
   if b->>'entitlement'='ai.monthly_credits' and b->'value'='"unlimited"' then raise exception 'finite_monthly_credits_required'; end if;
  elsif k='plan_upgrade' then
   if not exists(select 1 from private.plans where id=(b->>'plan_id')::uuid and active and not internal_only) then raise exception 'invalid_promotion_plans'; end if;
  end if;
 end loop;
 if (select count(*) from jsonb_array_elements(new.benefits) x where x->>'type'='initial_ai_credits')>1 or (select count(*) from jsonb_array_elements(new.benefits) x where x->>'type'='plan_upgrade')>1 then raise exception 'duplicate_benefit'; end if;
 return new;
end $$;
create trigger validate_promotion before insert or update on private.promotion_campaigns for each row execute function private.validate_promotion();
revoke all on function private.validate_promotion() from public,anon,authenticated,service_role;

create function private.billing_price(p_plan uuid,p_interval text) returns private.billing_price_mappings language plpgsql security definer set search_path='' as $$
declare p private.plans; m private.billing_price_mappings; amount_value bigint; fp text; begin
 select * into p from private.plans where id=p_plan and active and not internal_only;
 if p.id is null or p_interval not in ('monthly','annual') or p.currency<>'MXN' then raise exception 'plan_unavailable'; end if;
 amount_value:=round(100*case p_interval when 'monthly' then p.monthly_price else p.annual_price end);
 if amount_value is null or amount_value<=0 then raise exception 'price_not_configured'; end if;
 fp:=md5(p.id::text||':'||p_interval||':'||amount_value::text||':'||p.currency||':stripe:test');
 insert into private.billing_price_mappings(plan_id,interval,amount,currency,fingerprint) values(p.id,p_interval,amount_value,p.currency,fp) on conflict(fingerprint) do nothing;
 select * into m from private.billing_price_mappings where fingerprint=fp; return m;
end $$;
revoke all on function private.billing_price(uuid,text) from public,anon,authenticated,service_role;

create function private.billing_audit(p_action text,p_owner uuid,p_entity uuid,p_metadata jsonb,p_actor uuid default null,p_reason text default null) returns void language sql security definer set search_path='' as $$
 insert into private.admin_audit(action,entity,entity_id,actor_admin,actor_user,target_professional,reason,metadata)
 values(p_action,'billing',p_entity::text,p_actor,case when p_actor is null then p_owner else null end,p_owner,p_reason,p_metadata)
$$;
revoke all on function private.billing_audit(text,uuid,uuid,jsonb,uuid,text) from public,anon,authenticated,service_role;

create function private.billing_summary(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode','test','enabled',(select enabled from private.billing_settings),'test_eligible',exists(select 1 from private.billing_test_accounts where professional_id=p_owner),
 'access',private.resolve_effective_entitlements(p_owner),'subscription',(select to_jsonb(s)||jsonb_build_object('plan_name',p.name,'plan_id',p.id,'interval',m.interval,'amount',m.amount,'currency',m.currency,'pending_plan_name',pp.name) from private.billing_subscriptions s join private.billing_price_mappings m on m.id=s.price_mapping_id join private.plans p on p.id=m.plan_id left join private.plans pp on pp.id=s.pending_plan_id where s.professional_id=p_owner order by s.created_at desc limit 1),
 'payments',coalesce((select jsonb_agg(to_jsonb(t)) from (select provider_invoice_id,amount_due,amount_paid,currency,status,issued_at,paid_at,hosted_url from private.billing_payments where professional_id=p_owner order by issued_at desc limit 50)t),'[]'),
 'credits',coalesce((select jsonb_build_object('included',case when billing_period_end>now() then included_credits-reserved_included else 0 end,'additional',purchased_credits-reserved_purchased,'period_end',billing_period_end) from private.ai_accounts where professional_id=p_owner),'{"included":0,"additional":0}'))
$$;
create function private.my_billing() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return private.billing_summary(auth.uid()); end $$;
create function public.my_billing() returns jsonb language sql security invoker set search_path='' as $$ select private.my_billing() $$;
revoke all on function private.billing_summary(uuid),private.my_billing(),public.my_billing() from public,anon,authenticated,service_role;
grant execute on function private.my_billing(),public.my_billing() to authenticated;

create function private.promotion_eligible(p_owner uuid,p_campaign private.promotion_campaigns,p_plan uuid,p_interval text,p_ignore_intent uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare used integer; begin
 if p_campaign.id is null or not p_campaign.active then raise exception 'promotion_unavailable'; end if;
 if p_campaign.starts_at>now() or p_campaign.ends_at<=now() or exists(select 1 from jsonb_array_elements(p_campaign.benefits) b where b->'duration'->>'kind'='until' and (b->'duration'->>'until')::timestamptz<=now()) then raise exception 'promotion_expired'; end if;
 if not p_plan=any(p_campaign.eligible_plan_ids) then raise exception 'promotion_plan_ineligible'; end if;
 if not p_interval=any(p_campaign.intervals) then raise exception 'promotion_interval_ineligible'; end if;
 if p_campaign.new_customers_only and exists(select 1 from private.billing_subscriptions where professional_id=p_owner and paid_through is not null) then raise exception 'promotion_new_customers_only'; end if;
 select count(*) into used from private.billing_checkout_intents where campaign_id=p_campaign.id and state<>'expired' and id is distinct from p_ignore_intent;
 if p_campaign.max_redemptions is not null and used>=p_campaign.max_redemptions then raise exception 'promotion_limit_reached'; end if;
 select count(*) into used from private.billing_checkout_intents where campaign_id=p_campaign.id and professional_id=p_owner and state<>'expired' and id is distinct from p_ignore_intent;
 if used>=p_campaign.max_per_professional then raise exception 'promotion_already_used'; end if;
end $$;
revoke all on function private.promotion_eligible(uuid,private.promotion_campaigns,uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.billing_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin(); c private.promotion_campaigns; cid uuid; result jsonb; before_data jsonb; begin
 if p_action='overview' then return jsonb_build_object('settings',(select to_jsonb(s) from private.billing_settings s),'professionals',(select private.admin_api('professionals','{}')->'items'),'test_accounts',coalesce((select jsonb_agg(jsonb_build_object('id',t.professional_id,'name',p.full_name)) from private.billing_test_accounts t join public.professional_profiles p on p.id=t.professional_id),'[]'),'plans',(select private.admin_api('catalog','{}')->'plans'),'mappings',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('plan_name',p.name)) from private.billing_price_mappings m join private.plans p on p.id=m.plan_id),'[]')); end if;
 if p_action='campaigns' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select campaign_list.*,array(select p.name from private.plans p where p.id=any(campaign_list.eligible_plan_ids) order by p.display_order) plan_names,(select count(*) from private.promotion_redemptions r where r.campaign_id=campaign_list.id) redeemed,(select count(*) from private.billing_checkout_intents i where i.campaign_id=campaign_list.id and i.state in ('reserved','open')) reserved from private.promotion_campaigns campaign_list order by campaign_list.created_at desc limit 200)x),'[]'); end if;
 if p_action='campaign' then
  cid:=(p_data->>'id')::uuid; select * into c from private.promotion_campaigns where id=cid; if c.id is null then raise exception 'not_found'; end if;
  return to_jsonb(c)||jsonb_build_object('redemptions',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('professional_name',p.full_name)) from private.promotion_redemptions r join public.professional_profiles p on p.id=r.professional_id where campaign_id=cid),'[]'),'mappings',coalesce((select jsonb_agg(to_jsonb(m)) from private.billing_promotion_mappings m where campaign_id=cid),'[]'));
 end if;
 if p_action='subscriptions' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select s.*,p.full_name professional_name,pl.name plan_name,m.interval,m.amount,m.currency,(select paid_at from private.billing_payments b where b.subscription_id=s.id and status='paid' order by issued_at desc limit 1) last_payment from private.billing_subscriptions s join public.professional_profiles p on p.id=s.professional_id join private.billing_price_mappings m on m.id=s.price_mapping_id join private.plans pl on pl.id=m.plan_id order by s.created_at desc limit 200)x),'[]'); end if;
 if p_action='payments' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select b.*,p.full_name professional_name,pl.name plan_name from private.billing_payments b join public.professional_profiles p on p.id=b.professional_id join private.billing_subscriptions s on s.id=b.subscription_id join private.billing_price_mappings m on m.id=b.price_mapping_id join private.plans pl on pl.id=m.plan_id order by b.issued_at desc limit 200)x),'[]'); end if;
 if p_action='save_campaign' then
  cid:=coalesce((p_data->>'id')::uuid,gen_random_uuid()); select * into c from private.promotion_campaigns where id=cid for update;
  if c.id is not null and c.version is distinct from (p_data->>'version')::integer then raise exception 'stale_revision'; end if;
  before_data:=to_jsonb(c);
  insert into private.promotion_campaigns(id,code,name,audience,audience_note,visibility,active,starts_at,ends_at,eligible_plan_ids,intervals,benefits,max_redemptions,max_per_professional,new_customers_only)
  values(cid,upper(btrim(p_data->>'code')),btrim(p_data->>'name'),p_data->>'audience',coalesce(p_data->>'audience_note',''),coalesce(p_data->>'visibility','private'),coalesce((p_data->>'active')::boolean,true),(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,array(select jsonb_array_elements_text(p_data->'eligible_plan_ids')::uuid),array(select jsonb_array_elements_text(p_data->'intervals')),p_data->'benefits',(p_data->>'max_redemptions')::integer,coalesce((p_data->>'max_per_professional')::integer,1),coalesce((p_data->>'new_customers_only')::boolean,false))
  on conflict(id) do update set name=excluded.name,audience=excluded.audience,audience_note=excluded.audience_note,visibility=excluded.visibility,active=excluded.active,starts_at=excluded.starts_at,ends_at=excluded.ends_at,eligible_plan_ids=excluded.eligible_plan_ids,intervals=excluded.intervals,benefits=excluded.benefits,max_redemptions=excluded.max_redemptions,max_per_professional=excluded.max_per_professional,new_customers_only=excluded.new_customers_only,version=private.promotion_campaigns.version+1,updated_at=now();
  if c.id is not null and c.code<>upper(btrim(p_data->>'code')) then raise exception 'code_immutable'; end if;
  select to_jsonb(x) into result from private.promotion_campaigns x where id=cid;
  perform private.billing_audit(case when c.id is null then 'promotion_created' else 'promotion_updated' end,null,cid,jsonb_build_object('before',before_data,'after',result),actor);
 elsif p_action='disable_campaign' then
  cid:=(p_data->>'id')::uuid; update private.promotion_campaigns set active=false,version=version+1,updated_at=now() where id=cid and active; if found then perform private.billing_audit('promotion_disabled',null,cid,'{}',actor); end if; result:='{"saved":true}';
 elsif p_action='settings' then
  update private.billing_settings set grace_days=(p_data->>'grace_days')::integer,enabled=coalesce((p_data->>'enabled')::boolean,false),updated_at=now();
  perform private.billing_audit('billing_settings_updated',null,null,jsonb_build_object('enabled',(p_data->>'enabled')::boolean,'grace_days',(p_data->>'grace_days')::integer),actor); result:='{"saved":true}';
 elsif p_action='test_account' then
  cid:=(p_data->>'professional_id')::uuid;
  if (p_data->>'enabled')::boolean then insert into private.billing_test_accounts values(cid,now()) on conflict do nothing; else delete from private.billing_test_accounts where professional_id=cid; end if;
  perform private.billing_audit('billing_test_account_updated',cid,cid,jsonb_build_object('enabled',(p_data->>'enabled')::boolean),actor); result:='{"saved":true}';
 else raise exception 'invalid_action'; end if;
 return result;
end $$;
create function public.billing_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.billing_admin_api(p_action,p_data)$$;
revoke all on function private.billing_admin_api(text,jsonb),public.billing_admin_api(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.billing_admin_api(text,jsonb),public.billing_admin_api(text,jsonb) to authenticated;

-- A lease covers each provider mutation/read+commit. It serializes different event IDs too.
create function private.billing_lock(p_owner uuid,p_key uuid) returns void language plpgsql security definer set search_path='' as $$ declare c private.billing_customers; begin
 if p_key is null then raise exception 'invalid_input'; end if;
 insert into private.billing_customers(professional_id) values(p_owner) on conflict do nothing;
 select * into c from private.billing_customers where professional_id=p_owner for update;
 if c.lease_until>clock_timestamp() and c.lease_key is distinct from p_key then raise exception 'billing_busy'; end if;
 update private.billing_customers set lease_key=p_key,lease_until=clock_timestamp()+interval '120 seconds' where professional_id=p_owner;
end $$;
create function private.billing_require_lock(p_owner uuid,p_key uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform 1 from private.billing_customers where professional_id=p_owner and lease_key=p_key and lease_until>clock_timestamp() for update;
 if not found then raise exception 'billing_lease_expired'; end if;
 update private.billing_customers set lease_until=clock_timestamp()+interval '120 seconds' where professional_id=p_owner and lease_key=p_key;
end $$;
revoke all on function private.billing_lock(uuid,uuid),private.billing_require_lock(uuid,uuid) from public,anon,authenticated,service_role;

alter table private.access_grants drop constraint access_grants_grant_kind_check;
alter table private.access_grants add constraint access_grants_grant_kind_check check(grant_kind in ('courtesy','founder','promotion'));
alter table private.access_grants drop constraint access_grant_window;
alter table private.access_grants add constraint access_grant_window check((grant_kind='founder' and ends_at is null) or (grant_kind='courtesy' and ends_at is not null) or grant_kind='promotion');
alter table private.access_grants add column promotion_redemption_id uuid references private.promotion_redemptions(id);
alter table private.professional_overrides add column promotion_redemption_id uuid references private.promotion_redemptions(id);
create index access_grants_redemption on private.access_grants(promotion_redemption_id);
create index professional_overrides_redemption on private.professional_overrides(promotion_redemption_id);

create function private.billing_manual_hold() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if current_setting('nuthrick.billing_apply',true) is distinct from 'true' then
  update private.billing_subscriptions set manual_hold=true where professional_id=new.professional_id and state<>'cancelled';
 end if; return new;
end $$;
create trigger billing_manual_hold after update on private.professional_access for each row execute function private.billing_manual_hold();
revoke all on function private.billing_manual_hold() from public,anon,authenticated,service_role;

-- Promotion grants use the same resolver and ledger, and never turn into Founder.
do $$ declare original text; amended text; begin
 original:=pg_get_functiondef('private.resolve_effective_entitlements(uuid)'::regprocedure);
 amended:=replace(original,'select * into a from private.professional_access where professional_id=p_owner;',E'select * into a from private.professional_access where professional_id=p_owner;\n if a.source=''billing'' and a.status=''grace'' and exists(select 1 from private.billing_subscriptions where professional_id=p_owner and state=''grace'' and grace_until<=now() and not manual_hold) then a.status:=''suspended''; end if;');
 amended:=replace(amended,'g.grant_kind=''founder'' then ''active''','g.grant_kind in (''founder'',''promotion'') then ''active''');
 if amended=original then raise exception 'unexpected_resolver'; end if; execute amended;
 original:=pg_get_functiondef('private.allocate_plan_month(uuid,timestamptz)'::regprocedure);
 amended:=replace(original,'where professional_id=p_owner and revoked_at is null and starts_at<=p_at and (ends_at is null or ends_at>p_at)) then return','where professional_id=p_owner and grant_kind<>''promotion'' and revoked_at is null and starts_at<=p_at and (ends_at is null or ends_at>p_at)) then return');
 amended:=replace(amended,'where plan_id=a.plan_id and entitlement_key=''ai.monthly_credits''','where plan_id=coalesce((select plan_id from private.access_grants where professional_id=p_owner and grant_kind=''promotion'' and revoked_at is null and starts_at<=p_at and (ends_at is null or ends_at>p_at) order by starts_at desc,created_at desc,id desc limit 1),a.plan_id) and entitlement_key=''ai.monthly_credits''');
 amended:=replace(amended,' anchor:=coalesce(a.credit_anchor_at,a.starts_at)',E' if a.source=''billing'' and not exists(select 1 from private.billing_subscriptions where professional_id=p_owner and not manual_hold and ((state=''active'' and paid_through>p_at) or (state=''trial'' and period_end>p_at))) then return ''{"allocated":false,"reason":"no_paid_period"}''; end if;\n anchor:=coalesce(a.credit_anchor_at,a.starts_at)');
 if amended=original then raise exception 'unexpected_allocator'; end if; execute amended;
end $$;

create function private.billing_redeem(p_intent private.billing_checkout_intents,p_sub private.billing_subscriptions,p_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare rid uuid; b jsonb; until_value timestamptz; existing_id uuid; begin
 if p_intent.campaign_id is null then return; end if;
 insert into private.promotion_redemptions(campaign_id,professional_id,checkout_id,subscription_id,benefits,audience,redeemed_at)
 values(p_intent.campaign_id,p_intent.professional_id,p_intent.id,p_sub.id,p_intent.campaign_snapshot->'benefits',p_intent.campaign_snapshot->>'audience',p_at)
 on conflict(checkout_id) do nothing returning id into rid;
 if rid is null then return; end if;
 for b in select value from jsonb_array_elements(p_intent.campaign_snapshot->'benefits') loop
  until_value:=case b->'duration'->>'kind' when 'forever' then null when 'invoice' then p_sub.period_end when 'months' then p_at+make_interval(months=>(b->'duration'->>'months')::integer) when 'until' then (b->'duration'->>'until')::timestamptz end;
  if b->>'type'='initial_ai_credits' then
   perform private.adjust_ai_credits(p_sub.professional_id,md5('promotion:'||rid::text||':credits')::uuid,(b->>'amount')::numeric);
  elsif b->>'type'='temporary_entitlement' and (until_value is null or until_value>p_at) then
   insert into private.professional_overrides(professional_id,entitlement_key,value,starts_at,ends_at,promotion_redemption_id) values(p_sub.professional_id,b->>'entitlement',b->'value',p_at,until_value,rid);
  elsif b->>'type'='plan_upgrade' and (until_value is null or until_value>p_at) then
   insert into private.access_grants(professional_id,plan_id,starts_at,ends_at,grant_kind,promotion_redemption_id) values(p_sub.professional_id,(b->>'plan_id')::uuid,p_at,until_value,'promotion',rid);
  end if;
 end loop;
 perform private.billing_audit('promotion_redeemed',p_sub.professional_id,rid,jsonb_build_object('campaign_id',p_intent.campaign_id,'code',p_intent.campaign_snapshot->>'code','audience',p_intent.campaign_snapshot->>'audience','subscription_id',p_sub.id));
end $$;
revoke all on function private.billing_redeem(private.billing_checkout_intents,private.billing_subscriptions,timestamptz) from public,anon,authenticated,service_role;

create function private.billing_apply(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(p_data->>'owner')::uuid; lock_key uuid:=(p_data->>'lock_key')::uuid; snap jsonb:=p_data->'subscription'; inv jsonb:=p_data->'invoice'; latest jsonb:=snap->'latest_invoice';
 s private.billing_subscriptions; old_s private.billing_subscriptions; m private.billing_price_mappings; intent private.billing_checkout_intents; a private.professional_access;
 state_value text; paid boolean; paid_end timestamptz; grace_end timestamptz; period_start timestamptz; period_end timestamptz; event_id text:=p_data->>'event_id'; result jsonb; allow_write boolean; begin
 perform private.billing_require_lock(owner,lock_key);
 perform 1 from public.professional_profiles where id=owner for update;
 if (select processed_at is not null from private.billing_webhook_events where provider_event_id=event_id) then return '{"replay":true}'; end if;
 if not exists(select 1 from private.billing_webhook_events where provider_event_id=event_id and professional_id=owner) then raise exception 'unclaimed_event'; end if;
 if snap->>'livemode' is distinct from 'false' or snap->>'customer_id' is distinct from (select provider_customer_id from private.billing_customers where professional_id=owner) then raise exception 'invalid_provider_identity'; end if;
 select * into m from private.billing_price_mappings where provider_price_id=snap->>'price_id' and mode='test';
 if m.id is null then raise exception 'unknown_provider_price'; end if;
 select * into s from private.billing_subscriptions where provider_subscription_id=snap->>'id' for update; old_s:=s;
 if s.id is not null and s.professional_id<>owner then raise exception 'invalid_provider_identity'; end if;
 select * into intent from private.billing_checkout_intents where professional_id=owner and (provider_subscription_id=snap->>'id' or (id::text=snap->>'intent_id' and state in ('open','reserved') and price_mapping_id=m.id)) order by created_at desc limit 1 for update;
 if s.id is null and intent.id is null then raise exception 'unknown_checkout'; end if;
 period_start:=(snap->>'period_start')::timestamptz; period_end:=(snap->>'period_end')::timestamptz;
 if period_end<=period_start then raise exception 'invalid_period'; end if;
 paid:=latest->>'status'='paid' and latest->>'customer_id'=snap->>'customer_id' and latest->>'subscription_id'=snap->>'id' and (latest->>'period_end')::timestamptz>=period_end and latest->>'price_id'=snap->>'price_id' and not coalesce((snap->>'pending_update')::boolean,false);
 paid:=coalesce(paid,false); paid_end:=case when paid then greatest(s.paid_through,period_end) else s.paid_through end;
 if snap->>'status'='ended' then state_value:='cancelled';
 elsif snap->>'status'='trial' then state_value:='trial';
 elsif paid and snap->>'status'='active' then state_value:='active';
 elsif s.paid_through>now() and snap->>'status' in ('payment_due','unpaid','active') then state_value:='active';
 elsif s.paid_through is not null and snap->>'status' in ('payment_due','unpaid','active') then
  grace_end:=coalesce(s.grace_until,s.paid_through+make_interval(days=>(select grace_days from private.billing_settings)));
  state_value:=case when grace_end>now() then 'grace' else 'suspended' end;
 else state_value:='suspended'; end if;
 -- An unpaid upgrade cannot silently replace the previously paid plan.
 if not paid and s.id is not null then select * into m from private.billing_price_mappings where id=s.price_mapping_id; end if;
 select * into a from private.professional_access where professional_id=owner for update;
 allow_write:=coalesce(not coalesce(s.manual_hold,false) and (a.source='billing' or ((s.id is null or s.paid_through is null) and intent.id is not null and (a.professional_id is null or a.updated_at is not distinct from intent.access_revision))),false);
 if exists(select 1 from private.billing_subscriptions other where other.professional_id=owner and other.provider_subscription_id<>snap->>'id' and (other.state<>'cancelled' or other.created_at>coalesce(s.created_at,now()))) then allow_write:=false; end if;
 if exists(select 1 from private.platform_admins where user_id=owner and enabled) or exists(select 1 from private.access_grants where professional_id=owner and grant_kind='founder' and revoked_at is null and starts_at<=now()) then allow_write:=false; end if;
 insert into private.billing_subscriptions(professional_id,provider_subscription_id,provider_customer_id,price_mapping_id,state,provider_status,period_start,period_end,credit_anchor_at,paid_through,grace_until,cancel_at_period_end,provider_schedule_id,campaign_id,campaign_snapshot,latest_invoice_id,last_provider_event_at,manual_hold)
 values(owner,snap->>'id',snap->>'customer_id',m.id,state_value,snap->>'provider_status',period_start,period_end,coalesce(s.credit_anchor_at,(snap->>'anchor')::timestamptz),paid_end,grace_end,coalesce((snap->>'cancel_at_period_end')::boolean,false),snap->>'schedule_id',intent.campaign_id,intent.campaign_snapshot,latest->>'id',(select provider_created_at from private.billing_webhook_events where provider_event_id=event_id),not allow_write)
 on conflict(provider_subscription_id) do update set price_mapping_id=excluded.price_mapping_id,state=excluded.state,provider_status=excluded.provider_status,period_start=excluded.period_start,period_end=excluded.period_end,paid_through=excluded.paid_through,grace_until=excluded.grace_until,cancel_at_period_end=excluded.cancel_at_period_end,provider_schedule_id=excluded.provider_schedule_id,latest_invoice_id=excluded.latest_invoice_id,last_provider_event_at=greatest(private.billing_subscriptions.last_provider_event_at,excluded.last_provider_event_at),updated_at=now(),pending_plan_id=case when excluded.price_mapping_id<>private.billing_subscriptions.price_mapping_id then null else private.billing_subscriptions.pending_plan_id end,pending_interval=case when excluded.price_mapping_id<>private.billing_subscriptions.price_mapping_id then null else private.billing_subscriptions.pending_interval end
 returning * into s;
 update private.billing_checkout_intents set provider_subscription_id=s.provider_subscription_id,state=case when paid or s.paid_through is not null or state_value='trial' then 'completed' when state_value='cancelled' then 'expired' else state end where id=intent.id;
 if state_value='cancelled' then
  update private.access_grants set revoked_at=now() where promotion_redemption_id in (select id from private.promotion_redemptions where subscription_id=s.id) and revoked_at is null;
  update private.professional_overrides set revoked_at=now() where promotion_redemption_id in (select id from private.promotion_redemptions where subscription_id=s.id) and revoked_at is null;
 end if;
 if allow_write and (paid or s.paid_through is not null or state_value='trial') then
  perform set_config('nuthrick.billing_apply','true',true);
  insert into private.professional_access(professional_id,plan_id,status,starts_at,ends_at,source,billing_interval,credit_anchor_at)
  values(owner,m.plan_id,state_value,least(s.credit_anchor_at,period_start),case when state_value='grace' then grace_end when state_value='suspended' then null else period_end end,'billing',m.interval,s.credit_anchor_at)
  on conflict(professional_id) do update set plan_id=excluded.plan_id,status=excluded.status,ends_at=excluded.ends_at,source='billing',billing_interval=excluded.billing_interval,credit_anchor_at=excluded.credit_anchor_at,updated_at=now();
  if state_value in ('active','trial') and (paid or state_value='trial') then
   update private.billing_checkout_intents set state='completed',provider_subscription_id=s.provider_subscription_id where id=intent.id;
   perform private.billing_redeem(intent,s,s.period_start);
   begin result:=private.allocate_plan_month(owner,now()); exception when others then if sqlerrm<>'unsettled_period' then raise; end if; result:='{"allocated":false,"reason":"unsettled_period"}'; end;
  end if;
 end if;
 for inv in select x from jsonb_array_elements(jsonb_build_array(inv,latest)) x where x is not null and x<>'null' loop
  if inv->>'customer_id'<>s.provider_customer_id or inv->>'subscription_id'<>s.provider_subscription_id then raise exception 'invalid_provider_identity'; end if;
  insert into private.billing_payments(provider_invoice_id,professional_id,subscription_id,price_mapping_id,amount_due,amount_paid,currency,status,issued_at,paid_at,hosted_url)
  values(inv->>'id',owner,s.id,coalesce((select id from private.billing_price_mappings where provider_price_id=inv->>'price_id'),s.price_mapping_id),(inv->>'amount_due')::bigint,(inv->>'amount_paid')::bigint,inv->>'currency',inv->>'status',(inv->>'created')::timestamptz,(inv->>'paid_at')::timestamptz,inv->>'hosted_url')
  on conflict(provider_invoice_id) do update set amount_paid=greatest(private.billing_payments.amount_paid,excluded.amount_paid),status=case when private.billing_payments.status='paid' then 'paid' else excluded.status end,paid_at=coalesce(private.billing_payments.paid_at,excluded.paid_at),hosted_url=excluded.hosted_url,updated_at=now();
 end loop;
 if old_s.id is null or (old_s.state,old_s.price_mapping_id,old_s.paid_through,old_s.cancel_at_period_end) is distinct from (s.state,s.price_mapping_id,s.paid_through,s.cancel_at_period_end) then
  perform private.billing_audit('billing_subscription_synced',owner,s.id,jsonb_build_object('state',s.state,'price_mapping_id',m.id,'paid_through',s.paid_through,'event_id',event_id,'manual_hold',s.manual_hold));
 end if;
 update private.billing_webhook_events set processed_at=now(),last_error=null where provider_event_id=event_id;
 update private.billing_customers set lease_key=null,lease_until=null where professional_id=owner and lease_key=lock_key;
 return jsonb_build_object('processed',true,'state',s.state,'manual_hold',s.manual_hold,'allocation',result);
end $$;
revoke all on function private.billing_apply(jsonb) from public,anon,authenticated,service_role;

create function private.billing_price_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(m)||jsonb_build_object('plan_name',p.name,'rank',p.billing_rank) from private.billing_price_mappings m join private.plans p on p.id=m.plan_id where m.id=p_id
$$;
revoke all on function private.billing_price_json(uuid) from public,anon,authenticated,service_role;

-- This entry point is service-only. The Edge handler supplies the verified JWT owner,
-- and invokes event branches only after verifying Stripe's signature over the raw body.
create function private.billing_server(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(p_data->>'owner')::uuid; lk uuid:=(p_data->>'lock_key')::uuid; op uuid:=(p_data->>'operation_key')::uuid;
 c private.billing_customers; i private.billing_checkout_intents; promo private.promotion_campaigns; m private.billing_price_mappings; s private.billing_subscriptions;
 operation private.billing_operations; ev private.billing_webhook_events; actor uuid:=(p_data->>'actor')::uuid; result jsonb; request_data jsonb; action_value text; begin
 if p_action='authorize_admin' then
  if actor is null or not exists(select 1 from private.platform_admins where user_id=actor and enabled) then raise exception 'admin_required' using errcode='42501'; end if;
  return '{"authorized":true}';
 elsif p_action='claim_event' then
  if p_data->>'livemode' is distinct from 'false' then raise exception 'live_mode_forbidden'; end if;
  select professional_id into owner from private.billing_customers where provider_customer_id=p_data->>'customer_id';
  if owner is null then return '{"ignored":true}'; end if;
  perform private.billing_lock(owner,lk);
  insert into private.billing_webhook_events(provider_event_id,event_type,provider_created_at,professional_id)
   values(p_data->>'event_id',p_data->>'type',to_timestamp((p_data->>'created')::double precision),owner) on conflict do nothing;
  select * into ev from private.billing_webhook_events where provider_event_id=p_data->>'event_id' for update;
  if ev.professional_id<>owner or ev.event_type<>p_data->>'type' then raise exception 'invalid_provider_identity'; end if;
  if ev.processed_at is not null then
   update private.billing_customers set lease_key=null,lease_until=null where professional_id=owner and lease_key=lk;
   return '{"replay":true}'; end if;
  update private.billing_webhook_events set attempts=attempts+1 where provider_event_id=ev.provider_event_id;
  select * into i from private.billing_checkout_intents where professional_id=owner and (provider_session_id=p_data->>'checkout_id' or provider_subscription_id=p_data->>'subscription_id' or state in ('reserved','open')) order by created_at desc limit 1;
  return jsonb_build_object('owner',owner,'intent',to_jsonb(i),'managed_subscription',exists(select 1 from private.billing_subscriptions where professional_id=owner and provider_subscription_id=p_data->>'subscription_id'));
 elsif p_action='lock' then
  perform private.billing_lock(owner,lk); return jsonb_build_object('locked',true);
 end if;
 perform private.billing_require_lock(owner,lk);
 select * into c from private.billing_customers where professional_id=owner;
 if p_action='unlock' then
  update private.billing_customers set lease_key=null,lease_until=null where professional_id=owner and lease_key=lk;
  return '{"unlocked":true}';
 elsif p_action='apply' then return private.billing_apply(p_data);
 elsif p_action='event_failed' then
  if coalesce(p_data->>'code','') !~ '^[a-z_]{1,64}$' then raise exception 'invalid_input'; end if;
  update private.billing_webhook_events set last_error=p_data->>'code' where provider_event_id=p_data->>'event_id' and professional_id=owner and processed_at is null;
  return '{"retryable":true}';
 elsif p_action='event_done' then
  if p_data->>'checkout_state'='expired' then
   update private.billing_checkout_intents set state='expired' where professional_id=owner and provider_session_id=p_data->>'checkout_id' and state in ('reserved','open');
  end if;
  update private.billing_webhook_events set processed_at=now(),last_error=null where provider_event_id=p_data->>'event_id' and professional_id=owner;
  update private.billing_customers set lease_key=null,lease_until=null where professional_id=owner and lease_key=lk;
  return '{"processed":true}';
 elsif p_action='price_catalog' then
  if actor is null or not exists(select 1 from private.platform_admins where user_id=actor and enabled) then raise exception 'admin_required' using errcode='42501'; end if;
  result:='[]';
  for request_data in select jsonb_build_object('id',p.id,'interval',v.interval) from private.plans p cross join (values('monthly'),('annual'))v(interval) where p.active and not p.internal_only order by p.id,v.interval loop
   m:=private.billing_price((request_data->>'id')::uuid,request_data->>'interval'); result:=result||jsonb_build_array(private.billing_price_json(m.id));
  end loop;
  return result;
 elsif p_action='price_sync_done' then
  if actor is null or not exists(select 1 from private.platform_admins where user_id=actor and enabled) then raise exception 'admin_required' using errcode='42501'; end if;
  insert into private.billing_operations(operation_key,professional_id,action,request,result) values(op,actor,'sync_prices','{}',jsonb_build_object('synced',true)) on conflict do nothing;
  if found then perform private.billing_audit('billing_prices_synced',null,null,jsonb_build_object('operation_key',op),actor); end if;
  return '{"synced":true}';
 elsif p_action='context' then
  select * into i from private.billing_checkout_intents where professional_id=owner and state in ('reserved','open');
  select * into s from private.billing_subscriptions where professional_id=owner order by created_at desc limit 1;
  return jsonb_build_object('customer',to_jsonb(c)-'lease_key'-'lease_until','intent',to_jsonb(i),'subscription',to_jsonb(s),'price',private.billing_price_json(s.price_mapping_id));
 elsif p_action='preview' or p_action='prepare_checkout' then
  if not (select enabled from private.billing_settings) or not exists(select 1 from private.billing_test_accounts where professional_id=owner) then raise exception 'test_checkout_unavailable'; end if;
 if exists(select 1 from private.platform_admins where user_id=owner and enabled) or exists(select 1 from private.access_grants where professional_id=owner and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now())) or exists(select 1 from private.professional_access a join private.plans p on p.id=a.plan_id where a.professional_id=owner and p.internal_only and a.source<>'legacy' and a.status in ('active','trial') and (a.ends_at is null or a.ends_at>now())) then raise exception 'internal_access_protected'; end if;
  m:=private.billing_price((p_data->>'plan_id')::uuid,p_data->>'interval');
  select * into i from private.billing_checkout_intents where professional_id=owner and state in ('reserved','open') for update;
  if coalesce(btrim(p_data->>'code'),'')<>'' then
   select * into promo from private.promotion_campaigns where code=upper(btrim(p_data->>'code')) for update;
   perform private.promotion_eligible(owner,promo,m.plan_id,m.interval,i.id);
  end if;
  if p_action='preview' then return jsonb_build_object('price',private.billing_price_json(m.id),'campaign',case when promo.id is not null then jsonb_build_object('name',promo.name,'code',promo.code,'benefits',promo.benefits,'fallback',promo.fallback) else null end); end if;
  if i.id is not null and (i.price_mapping_id<>m.id or i.campaign_id is distinct from promo.id) then raise exception 'checkout_pending'; end if;
  if i.id is null then
   if op is null then raise exception 'invalid_input'; end if;
   if exists(select 1 from private.billing_checkout_intents where id=op) then raise exception 'operation_already_used'; end if;
   if exists(select 1 from private.billing_subscriptions where professional_id=owner and state<>'cancelled') then raise exception 'subscription_exists'; end if;
   insert into private.billing_checkout_intents(id,professional_id,price_mapping_id,campaign_id,campaign_snapshot,access_revision,expires_at)
   values(op,owner,m.id,promo.id,case when promo.id is not null then to_jsonb(promo) else null end,(select updated_at from private.professional_access where professional_id=owner),now()+interval '35 minutes') returning * into i;
  end if;
  return jsonb_build_object('intent',to_jsonb(i),'price',private.billing_price_json(m.id),'customer_id',c.provider_customer_id);
 elsif p_action='customer_saved' then
  if c.provider_customer_id is not null and c.provider_customer_id<>p_data->>'customer_id' then raise exception 'customer_mapping_mismatch'; end if;
  update private.billing_customers set provider_customer_id=p_data->>'customer_id' where professional_id=owner;
  return '{"saved":true}';
 elsif p_action='price_saved' then
  select * into m from private.billing_price_mappings where id=(p_data->>'price_mapping_id')::uuid for update;
  if m.id is null or (m.provider_price_id is not null and m.provider_price_id<>p_data->>'price_id') then raise exception 'price_mapping_mismatch'; end if;
  update private.billing_price_mappings set provider_price_id=p_data->>'price_id' where id=m.id;
  return '{"saved":true}';
 elsif p_action='promotion_saved' then
  select * into i from private.billing_checkout_intents where id=(p_data->>'intent_id')::uuid and professional_id=owner;
  if i.campaign_id is null then raise exception 'unknown_checkout'; end if;
  insert into private.billing_promotion_mappings(campaign_id,version,price_mapping_id,provider_coupon_id,end_at) values(i.campaign_id,(i.campaign_snapshot->>'version')::integer,i.price_mapping_id,p_data->>'coupon_id',(p_data->>'end_at')::timestamptz) on conflict do nothing;
  return '{"saved":true}';
 elsif p_action='checkout_saved' then
  update private.billing_checkout_intents set provider_session_id=p_data->>'session_id',url=p_data->>'url',state='open',expires_at=to_timestamp((p_data->>'expires_at')::double precision)
  where id=(p_data->>'intent_id')::uuid and professional_id=owner and state in ('reserved','open') and (provider_session_id is null or provider_session_id=p_data->>'session_id') returning * into i;
  if i.id is null then raise exception 'unknown_checkout'; end if;
  return jsonb_build_object('url',i.url,'id',i.id);
 elsif p_action='checkout_expired' then
  update private.billing_checkout_intents set state='expired' where id=(p_data->>'intent_id')::uuid and professional_id=owner and state in ('reserved','open');
  return '{"expired":true}';
 elsif p_action='prepare_operation' then
  action_value:=p_data->>'action'; request_data:=coalesce(p_data->'request','{}');
  if op is null or action_value not in ('portal','change','cancel','resume','cancel_now') then raise exception 'invalid_input'; end if;
  if action_value='cancel_now' then
   if actor is null or not exists(select 1 from private.platform_admins where user_id=actor and enabled) then raise exception 'admin_required' using errcode='42501'; end if;
   if request_data->>'confirmation' is distinct from 'CANCELAR AHORA' or length(btrim(coalesce(request_data->>'reason','')))<8 or length(request_data->>'reason')>500 then raise exception 'confirmation_required'; end if;
  elsif actor is distinct from owner then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into operation from private.billing_operations where operation_key=op for update;
  if operation.operation_key is not null then
   if operation.professional_id<>owner or operation.action<>action_value or operation.request<>request_data then raise exception 'operation_mismatch'; end if;
   if operation.result is not null then return jsonb_build_object('replay',true,'result',operation.result); end if;
  else insert into private.billing_operations(operation_key,professional_id,action,request) values(op,owner,action_value,request_data); end if;
  select * into s from private.billing_subscriptions where professional_id=owner order by created_at desc limit 1 for update;
  if c.provider_customer_id is null then raise exception 'customer_missing'; end if;
  if action_value<>'portal' and (s.id is null or s.state='cancelled') then raise exception 'subscription_missing'; end if;
  if action_value='resume' and not s.cancel_at_period_end then raise exception 'subscription_change_unavailable'; end if;
  if action_value='change' then
   if s.manual_hold then raise exception 'manual_access_protected'; end if;
   if s.state<>'active' or s.cancel_at_period_end then raise exception 'subscription_change_unavailable'; end if;
   m:=private.billing_price((request_data->>'plan_id')::uuid,request_data->>'interval');
   if m.id=s.price_mapping_id then raise exception 'same_plan'; end if;
  end if;
  return jsonb_build_object('subscription',to_jsonb(s),'current_price',private.billing_price_json(s.price_mapping_id),'target_price',private.billing_price_json(m.id),'customer_id',c.provider_customer_id);
 elsif p_action='operation_saved' then
  select * into operation from private.billing_operations where operation_key=op and professional_id=owner for update;
  if operation.operation_key is null then raise exception 'unknown_operation'; end if;
  if operation.result is not null then return operation.result; end if;
  result:=p_data->'result';
  update private.billing_operations set result=(p_data->'result')||jsonb_build_object('saved',true) where operation_key=op;
  if operation.action='change' then
   update private.billing_subscriptions set pending_plan_id=(operation.request->>'plan_id')::uuid,pending_interval=operation.request->>'interval',provider_schedule_id=result->>'schedule_id',updated_at=now() where professional_id=owner and state<>'cancelled';
  elsif operation.action in ('cancel','cancel_now') then
   update private.billing_subscriptions set pending_plan_id=null,pending_interval=null,updated_at=now() where professional_id=owner and state<>'cancelled';
  end if;
  perform private.billing_audit('billing_'||operation.action||'_requested',owner,null,jsonb_build_object('operation_key',op,'request',operation.request-'confirmation','result',result),case when operation.action='cancel_now' then actor else null end,operation.request->>'reason');
  return result;
 else raise exception 'invalid_action'; end if;
end $$;
create function public.billing_server(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.billing_server(p_action,p_data)$$;
revoke all on function private.billing_server(text,jsonb),public.billing_server(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.billing_server(text,jsonb),public.billing_server(text,jsonb) to service_role;

create or replace function private.public_plan_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'monthly_price',p.monthly_price,'annual_price',p.annual_price,'currency',p.currency,'credits_provisional',p.credits_provisional,'values',(select jsonb_object_agg(entitlement_key,value) from private.plan_entitlements where plan_id=p.id)) order by display_order,name),'[]') from private.plans p where active and not internal_only
$$;

-- Annual payments still allocate one calendar month at a time. Expired grace
-- is also enforced by the resolver, independent of scheduler latency.
create function private.billing_tick(p_at timestamptz default now()) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.billing_subscriptions; allocations integer:=0; suspensions integer:=0; r jsonb; begin
 for s in select * from private.billing_subscriptions where not manual_hold and state in ('active','trial','grace') order by professional_id loop
  perform 1 from public.professional_profiles where id=s.professional_id for update;
  select * into s from private.billing_subscriptions where id=s.id and not manual_hold and state in ('active','trial','grace') for update;
  if s.id is null then continue; end if;
  if s.state='grace' and s.grace_until<=p_at then
   perform set_config('nuthrick.billing_apply','true',true);
   update private.billing_subscriptions set state='suspended',updated_at=now() where id=s.id;
   update private.professional_access set status='suspended',ends_at=null,updated_at=now() where professional_id=s.professional_id and source='billing' and status='grace';
   perform private.billing_audit('billing_grace_expired',s.professional_id,s.id,jsonb_build_object('grace_until',s.grace_until)); suspensions:=suspensions+1;
  elsif s.state in ('active','trial') and (s.paid_through>p_at or (s.state='trial' and s.period_end>p_at)) then
   begin r:=private.allocate_plan_month(s.professional_id,p_at); if (r->>'allocated')::boolean then allocations:=allocations+1; end if;
   exception when others then if sqlerrm<>'unsettled_period' then raise; end if; end;
  end if;
 end loop;
 return jsonb_build_object('allocations',allocations,'suspensions',suspensions);
end $$;
revoke all on function private.billing_tick(timestamptz) from public,anon,authenticated,service_role;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('nuthrick-billing-monthly-and-grace','*/15 * * * *','select private.billing_tick();');
 end if;
end $$;


-- Encrypted Vault fallback for hosts managed through the Supabase connector.
-- No caller-selected secret name, no credentials in admin or professional RPCs.
create function private.billing_provider_credentials() returns jsonb language plpgsql security definer set search_path='' as $$
declare credentials jsonb; begin
 select decrypted_secret::jsonb into credentials from vault.decrypted_secrets where name='nuthrick_billing_stripe_test';
 if credentials->>'mode' is distinct from 'test' or coalesce(credentials->>'secret_key','') !~ '^sk_test_[A-Za-z0-9]+$' or coalesce(credentials->>'account_id','') !~ '^acct_[A-Za-z0-9]+$' or coalesce(credentials->>'webhook_secret','') !~ '^whsec_[A-Za-z0-9]+$' then raise exception 'billing_not_configured'; end if;
 return credentials;
exception when undefined_table or invalid_text_representation then raise exception 'billing_not_configured';
end $$;
create function public.billing_provider_credentials() returns jsonb language sql security invoker set search_path='' as $$select private.billing_provider_credentials()$$;
revoke all on function private.billing_provider_credentials(),public.billing_provider_credentials() from public,anon,authenticated,service_role;
grant execute on function private.billing_provider_credentials(),public.billing_provider_credentials() to service_role;
