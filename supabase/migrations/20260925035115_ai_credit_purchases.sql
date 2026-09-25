-- ADMIN-3: one-time TEST purchases use the existing accounts, ledger and billing lease.
create table private.ai_credit_packages (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^[A-Z0-9_-]{3,40}$'),
 name text not null check(length(name) between 1 and 120), description text not null default '' check(length(description)<=500),
 credits integer not null check(credits between 1 and 1000000), bonus_credits integer not null default 0 check(bonus_credits>=0),
 price_amount numeric(12,2) not null check(price_amount>=10 and price_amount<=1000000), currency text not null default 'MXN' check(currency='MXN'),
 active boolean not null default true, internal_only boolean not null default false, test_only boolean not null default true check(test_only),
 display_order integer not null default 0, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(credits+bonus_credits<=1000000)
);
create table private.ai_credit_price_mappings (
 id uuid primary key default gen_random_uuid(), package_id uuid not null references private.ai_credit_packages(id),
 package_version integer not null, package_name text not null, credits integer not null, bonus_credits integer not null,
 amount bigint not null check(amount>0), currency text not null check(currency='MXN'),
 provider text not null default 'stripe', mode text not null default 'test' check(mode='test'),
 fingerprint text not null unique, provider_price_id text unique, created_at timestamptz not null default now()
);
create index ai_credit_prices_package on private.ai_credit_price_mappings(package_id);
alter table private.promotion_campaigns add column target text not null default 'subscription' check(target in ('subscription','ai_credit_package'));
alter table private.promotion_campaigns add column eligible_package_ids uuid[] not null default '{}';
create table private.ai_credit_purchases (
 id uuid primary key, professional_id uuid not null references public.professional_profiles(id),
 package_id uuid not null references private.ai_credit_packages(id), price_mapping_id uuid not null references private.ai_credit_price_mappings(id),
 credit_policy_snapshot jsonb not null default '{"version":1,"expires_at":null,"consumption_order":"included_first"}',
 package_snapshot jsonb not null, credits_purchased numeric(18,3) not null check(credits_purchased>0), bonus_credits numeric(18,3) not null default 0 check(bonus_credits>=0),
 amount bigint not null check(amount>0), expected_amount bigint not null check(expected_amount>=0), amount_paid bigint not null default 0 check(amount_paid>=0), currency text not null check(currency='MXN'),
 provider text not null default 'stripe', mode text not null default 'test' check(mode='test'),
 provider_checkout_id text unique, provider_payment_id text unique, provider_charge_id text unique,
 status text not null default 'pending' check(status in ('pending','paid','failed','refunded','partially_refunded','cancelled','in_review')),
 checkout_url text check(checkout_url is null or checkout_url ~ '^https://checkout\.stripe\.com/'),
 campaign_id uuid references private.promotion_campaigns(id), campaign_snapshot jsonb,
 coupon_id text, expires_at timestamptz not null, closed_at timestamptz,
 paid_at timestamptz, credited_at timestamptz, refunded_at timestamptz,
 refunded_amount bigint not null default 0 check(refunded_amount>=0), reversed_credits numeric(18,3) not null default 0 check(reversed_credits>=0),
 dispute_id text, dispute_status text, review_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(credits_purchased+bonus_credits<=1000000), check(refunded_amount<=amount_paid), check(reversed_credits<=credits_purchased+bonus_credits)
);
create unique index ai_credit_one_open_checkout on private.ai_credit_purchases(professional_id) where closed_at is null;
create index ai_credit_purchases_owner_date on private.ai_credit_purchases(professional_id,created_at desc);
create index ai_credit_purchases_package on private.ai_credit_purchases(package_id);
create index ai_credit_purchases_price on private.ai_credit_purchases(price_mapping_id);
create index ai_credit_purchases_campaign on private.ai_credit_purchases(campaign_id,professional_id);

-- Shared promotion mapping and attribution accept exactly one purchase kind.
alter table private.billing_promotion_mappings drop constraint billing_promotion_mappings_pkey;
alter table private.billing_promotion_mappings alter column price_mapping_id drop not null;
alter table private.billing_promotion_mappings add column id uuid primary key default gen_random_uuid();
alter table private.billing_promotion_mappings add column credit_price_mapping_id uuid references private.ai_credit_price_mappings(id);
alter table private.billing_promotion_mappings add constraint promotion_one_price_kind check(num_nonnulls(price_mapping_id,credit_price_mapping_id)=1);
create unique index billing_promotion_subscription_unique on private.billing_promotion_mappings(campaign_id,version,price_mapping_id);
create unique index billing_promotion_credit_unique on private.billing_promotion_mappings(campaign_id,version,credit_price_mapping_id);
create index billing_promotion_credit_price on private.billing_promotion_mappings(credit_price_mapping_id);
alter table private.promotion_redemptions alter column checkout_id drop not null;
alter table private.promotion_redemptions alter column subscription_id drop not null;
alter table private.promotion_redemptions add column credit_purchase_id uuid unique references private.ai_credit_purchases(id);
alter table private.promotion_redemptions add constraint redemption_one_purchase_kind check(
 (credit_purchase_id is null and checkout_id is not null and subscription_id is not null) or
 (credit_purchase_id is not null and checkout_id is null and subscription_id is null));

-- Refund debt stays in the existing additional bucket, including in-flight reservations.
alter table private.ai_accounts drop constraint ai_accounts_purchased_credits_check;
alter table private.ai_accounts drop constraint ai_accounts_check1;
alter table private.ai_accounts add constraint ai_reserved_purchased_nonnegative check(reserved_purchased>=0);
alter table private.ai_credit_ledger drop constraint ai_credit_ledger_type_check;
alter table private.ai_credit_ledger add constraint ai_credit_ledger_type_check check(type in ('PLAN_ALLOCATION','PURCHASE','USAGE','REFUND','REFUND_REVERSAL','ADMIN_ADJUSTMENT','RESERVE','RELEASE'));
alter table private.ai_credit_ledger add column credit_purchase_id uuid references private.ai_credit_purchases(id);
create index ai_ledger_credit_purchase on private.ai_credit_ledger(credit_purchase_id);
create unique index ai_one_purchase_grant on private.ai_credit_ledger(credit_purchase_id) where type='PURCHASE';

do $$ declare t text; begin
 foreach t in array array['ai_credit_packages','ai_credit_price_mappings','ai_credit_purchases'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('create policy deny_direct on private.%I for all to anon,authenticated using(false) with check(false)',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
update private.entitlement_catalog set label='Comprar créditos IA' where key='ai.credit_purchase';
update private.plan_entitlements set value='true' where entitlement_key='ai.credit_purchase' and plan_id in (select id from private.plans where code in ('esencial','profesional'));

create function private.credit_usage_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (tg_op='INSERT' or (old.status='reserved' and new.status='running')) and
  ((select purchased_credits<reserved_purchased from private.ai_accounts where professional_id=new.professional_id) or
   exists(select 1 from private.ai_credit_purchases where professional_id=new.professional_id and status='in_review')) then
  raise exception 'credit_account_restricted';
 end if;
 return new;
end $$;
revoke all on function private.credit_usage_guard() from public,anon,authenticated,service_role;
create trigger ai_credit_usage_guard before insert or update of status on private.ai_generations for each row execute function private.credit_usage_guard();

create function private.credit_purchase_allowed(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>'ai.credit_purchase')::boolean,false)
  and exists(select 1 from public.professional_profiles where id=p_owner and onboarding_completed)
$$;
revoke all on function private.credit_purchase_allowed(uuid) from public,anon,authenticated,service_role;

create function private.credit_price(p_package uuid) returns private.ai_credit_price_mappings language plpgsql security definer set search_path='' as $$
declare p private.ai_credit_packages; m private.ai_credit_price_mappings; fp text; begin
 select * into p from private.ai_credit_packages where id=p_package and active and not internal_only for share;
 if p.id is null then raise exception 'credit_package_unavailable'; end if;
 fp:=md5(p.id::text||':'||p.version::text||':'||p.credits::text||':'||p.bonus_credits::text||':'||p.price_amount::text||':MXN:stripe:test');
 insert into private.ai_credit_price_mappings(package_id,package_version,package_name,credits,bonus_credits,amount,currency,fingerprint)
 values(p.id,p.version,p.name,p.credits,p.bonus_credits,round(p.price_amount*100),'MXN',fp) on conflict(fingerprint) do nothing;
 select * into m from private.ai_credit_price_mappings where fingerprint=fp; return m;
end $$;
revoke all on function private.credit_price(uuid) from public,anon,authenticated,service_role;

-- Shared conditions and limits cover subscription and credit purchases.
create function private.promotion_common_eligible(p_owner uuid,p_campaign private.promotion_campaigns,p_ignore uuid) returns void language plpgsql security definer set search_path='' as $$
declare used integer; begin
 if p_campaign.id is null or not p_campaign.active then raise exception 'promotion_unavailable'; end if;
 if p_campaign.starts_at>now() or p_campaign.ends_at<=now() or exists(select 1 from jsonb_array_elements(p_campaign.benefits) b where b->'duration'->>'kind'='until' and (b->'duration'->>'until')::timestamptz<=now()) then raise exception 'promotion_expired'; end if;
 if p_campaign.new_customers_only and (exists(select 1 from private.billing_subscriptions where professional_id=p_owner and paid_through is not null) or exists(select 1 from private.ai_credit_purchases where professional_id=p_owner and credited_at is not null)) then raise exception 'promotion_new_customers_only'; end if;
 select count(*) into used from (
  select professional_id,id from private.billing_checkout_intents where campaign_id=p_campaign.id and state<>'expired'
  union all select professional_id,id from private.ai_credit_purchases where campaign_id=p_campaign.id and status<>'cancelled'
 ) x where id is distinct from p_ignore;
 if p_campaign.max_redemptions is not null and used>=p_campaign.max_redemptions then raise exception 'promotion_limit_reached'; end if;
 select count(*) into used from (
  select professional_id,id from private.billing_checkout_intents where campaign_id=p_campaign.id and state<>'expired'
  union all select professional_id,id from private.ai_credit_purchases where campaign_id=p_campaign.id and status<>'cancelled'
 ) x where professional_id=p_owner and id is distinct from p_ignore;
 if used>=p_campaign.max_per_professional then raise exception 'promotion_already_used'; end if;
end $$;
revoke all on function private.promotion_common_eligible(uuid,private.promotion_campaigns,uuid) from public,anon,authenticated,service_role;
create or replace function private.promotion_eligible(p_owner uuid,p_campaign private.promotion_campaigns,p_plan uuid,p_interval text,p_ignore_intent uuid default null) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.promotion_common_eligible(p_owner,p_campaign,p_ignore_intent);
 if p_campaign.target<>'subscription' or not p_plan=any(p_campaign.eligible_plan_ids) then raise exception 'promotion_plan_ineligible'; end if;
 if not p_interval=any(p_campaign.intervals) then raise exception 'promotion_interval_ineligible'; end if;
end $$;

create function private.credit_purchase_summary(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode','test','enabled',(select enabled from private.billing_settings),'eligible',private.credit_purchase_allowed(p_owner),
 'test_eligible',exists(select 1 from private.billing_test_accounts where professional_id=p_owner),
 'balances',coalesce((select jsonb_build_object('included',case when billing_period_end>now() then included_credits-reserved_included else 0 end,
  'additional',purchased_credits-reserved_purchased,'available',case when purchased_credits<reserved_purchased or exists(select 1 from private.ai_credit_purchases where professional_id=p_owner and status='in_review') then 0 else greatest(0,(case when billing_period_end>now() then included_credits-reserved_included else 0 end)+purchased_credits-reserved_purchased) end,
  'debt',greatest(0,-purchased_credits),'in_review',exists(select 1 from private.ai_credit_purchases where professional_id=p_owner and status='in_review'),'period_end',billing_period_end) from private.ai_accounts where professional_id=p_owner),'{"included":0,"additional":0,"available":0,"debt":0,"in_review":false}'),
 'packages',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,code,name,description,credits,bonus_credits,price_amount,currency,test_only from private.ai_credit_packages where active and not internal_only order by display_order,name)x),'[]'),
 'purchases',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,package_snapshot->>'name' as package_name,credits_purchased,bonus_credits,amount_paid,expected_amount,currency,status,created_at,paid_at,credited_at,refunded_amount,reversed_credits,review_reason from private.ai_credit_purchases where professional_id=p_owner order by created_at desc limit 50)x),'[]'),
 'pending',(select jsonb_build_object('id',id,'status',status,'expires_at',expires_at,'url',checkout_url) from private.ai_credit_purchases where professional_id=p_owner and closed_at is null),
 'history',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,type,included_delta,purchased_delta,credit_purchase_id,created_at from private.ai_credit_ledger where professional_id=p_owner and type not in ('RESERVE','RELEASE','USAGE') order by created_at desc,id desc limit 50)x),'[]'))
$$;
revoke all on function private.credit_purchase_summary(uuid) from public,anon,authenticated,service_role;
create function private.my_ai_credits() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return private.credit_purchase_summary(auth.uid()); end $$;
create function public.my_ai_credits() returns jsonb language sql security invoker set search_path='' as $$select private.my_ai_credits()$$;
revoke all on function private.my_ai_credits(),public.my_ai_credits() from public,anon,authenticated,service_role;
grant execute on function private.my_ai_credits(),public.my_ai_credits() to authenticated;

create function private.apply_credit_payment(p_owner uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.ai_credit_purchases; m private.ai_credit_price_mappings; a private.ai_accounts; s jsonb:=p_data->'payment';
 total numeric; target_reversal numeric; delta numeric; refunded bigint; review text; next_status text; first_grant boolean:=false; event_key uuid;
begin
 perform private.billing_require_lock(p_owner,(p_data->>'lock_key')::uuid);
 if not exists(select 1 from private.billing_webhook_events where provider_event_id=p_data->>'event_id' and professional_id=p_owner and processed_at is null) then raise exception 'unknown_event'; end if;
 insert into private.ai_accounts(professional_id) values(p_owner) on conflict do nothing;
 select * into a from private.ai_accounts where professional_id=p_owner for update;
 select * into p from private.ai_credit_purchases where id=(p_data->>'purchase_id')::uuid and professional_id=p_owner for update;
 select * into m from private.ai_credit_price_mappings where id=p.price_mapping_id;
 if p.id is null or s->>'mode' is distinct from 'payment' or s->>'livemode' is distinct from 'false'
  or s->>'customer_id' is distinct from (select provider_customer_id from private.billing_customers where professional_id=p_owner)
  or s->>'purchase_id' is distinct from p.id::text or s->>'owner' is distinct from p_owner::text
  or s->>'price_id' is distinct from m.provider_price_id or (s->>'quantity')::integer is distinct from 1
  or s->>'currency' is distinct from p.currency or (s->>'amount_total')::bigint is distinct from p.expected_amount
  or (p.provider_checkout_id is not null and p.provider_checkout_id is distinct from s->>'checkout_id')
  or (p.provider_payment_id is not null and p.provider_payment_id is distinct from s->>'payment_id') then raise exception 'invalid_payment_identity'; end if;
 total:=p.credits_purchased+p.bonus_credits;
 if s->>'paid'='true' and s->>'checkout_status'='complete' then
  if (s->>'amount_paid')::bigint is distinct from p.expected_amount then raise exception 'invalid_payment_amount'; end if;
  if p.credited_at is null then
   insert into private.ai_credit_ledger(professional_id,type,purchased_delta,operation_key,allocation_amount,credit_purchase_id)
    values(p_owner,'PURCHASE',total,p.id,total,p.id);
   update private.ai_accounts set purchased_credits=purchased_credits+total where professional_id=p_owner;
   p.credited_at:=now(); p.paid_at:=(s->>'paid_at')::timestamptz; p.amount_paid:=p.expected_amount; first_grant:=true;
   perform private.billing_audit('purchase_paid',p_owner,p.id,jsonb_build_object('amount',p.amount_paid,'currency',p.currency,'package_id',p.package_id));
   perform private.billing_audit('credits_granted',p_owner,p.id,jsonb_build_object('credits',p.credits_purchased,'bonus',p.bonus_credits));
   if p.campaign_id is not null then
    insert into private.promotion_redemptions(campaign_id,professional_id,credit_purchase_id,benefits,audience)
     values(p.campaign_id,p_owner,p.id,p.campaign_snapshot->'benefits',p.campaign_snapshot->>'audience');
    perform private.billing_audit('promotion_redeemed',p_owner,p.campaign_id,jsonb_build_object('credit_purchase_id',p.id,'code',p.campaign_snapshot->>'code'));
   end if;
  end if;
 end if;
 if p.credited_at is not null then
  refunded:=coalesce((s->>'amount_refunded')::bigint,0);
  if refunded<0 or refunded>p.amount_paid then raise exception 'invalid_refund_amount'; end if;
  target_reversal:=case when p.amount_paid=0 then 0 when refunded=p.amount_paid then total else trunc(total*refunded/p.amount_paid,3) end;
  delta:=target_reversal-p.reversed_credits;
  if delta<>0 then
   event_key:=md5('credit-refund:'||(p_data->>'event_id'))::uuid;
   insert into private.ai_credit_ledger(professional_id,type,purchased_delta,operation_key,credit_purchase_id)
    values(p_owner,case when delta>0 then 'REFUND' else 'REFUND_REVERSAL' end,-delta,event_key,p.id);
   update private.ai_accounts set purchased_credits=purchased_credits-delta where professional_id=p_owner;
   perform private.billing_audit(case when delta>0 then 'refund' else 'refund_reversed' end,p_owner,p.id,jsonb_build_object('credits_delta',-delta,'refunded_amount',refunded,'event_id',p_data->>'event_id'));
  end if;
  review:=case when coalesce(s->>'dispute_status','') not in ('','won','warning_closed') then 'payment_dispute' when s->>'refund_pending'='true' then 'refund_pending' else null end;
  next_status:=case when review is not null then 'in_review' when refunded=p.amount_paid and refunded>0 then 'refunded' when refunded>0 then 'partially_refunded' else 'paid' end;
  if review is not null and review is distinct from p.review_reason then perform private.billing_audit('purchase_in_review',p_owner,p.id,jsonb_build_object('reason',review)); end if;
  update private.ai_credit_purchases set status=next_status,credited_at=p.credited_at,paid_at=p.paid_at,amount_paid=p.amount_paid,closed_at=coalesce(closed_at,now()),
   provider_checkout_id=s->>'checkout_id',provider_payment_id=s->>'payment_id',provider_charge_id=s->>'charge_id',refunded_amount=refunded,reversed_credits=target_reversal,
   refunded_at=case when refunded>0 then coalesce(refunded_at,now()) else null end,dispute_id=s->>'dispute_id',dispute_status=s->>'dispute_status',review_reason=review,updated_at=now() where id=p.id;
 else
  next_status:=case when s->>'checkout_status'='expired' then 'cancelled' when s->>'payment_failed'='true' then 'failed' else 'pending' end;
  update private.ai_credit_purchases set status=next_status,provider_checkout_id=s->>'checkout_id',provider_payment_id=s->>'payment_id',
   closed_at=case when next_status='cancelled' then now() else null end,updated_at=now() where id=p.id;
 end if;
 update private.billing_webhook_events set processed_at=now(),last_error=null where provider_event_id=p_data->>'event_id' and professional_id=p_owner;
 update private.billing_customers set lease_key=null,lease_until=null where professional_id=p_owner and lease_key=(p_data->>'lock_key')::uuid;
 return jsonb_build_object('processed',true,'status',next_status,'credited',first_grant);
end $$;
revoke all on function private.apply_credit_payment(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.credit_billing_server(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(p_data->>'owner')::uuid; op uuid:=(p_data->>'operation_key')::uuid; p private.ai_credit_purchases;
 pkg private.ai_credit_packages; m private.ai_credit_price_mappings; c private.promotion_campaigns; b jsonb; expected bigint; bonus numeric; result jsonb;
begin
 perform private.billing_require_lock(owner,(p_data->>'lock_key')::uuid);
 if p_action='credit_apply' then return private.apply_credit_payment(owner,p_data); end if;
 if p_action in ('credit_prepare','credit_preview') then
  if not (select enabled from private.billing_settings) or not exists(select 1 from private.billing_test_accounts where professional_id=owner) then raise exception 'test_checkout_unavailable'; end if;
  if not private.credit_purchase_allowed(owner) then raise exception 'credit_purchase_not_allowed'; end if;
  select * into p from private.ai_credit_purchases where professional_id=owner and closed_at is null;
  if p.id is not null then
   if p.package_id is distinct from (p_data->>'package_id')::uuid or coalesce(p.campaign_snapshot->>'code','')<>upper(btrim(coalesce(p_data->>'code',''))) then raise exception 'credit_checkout_pending'; end if;
   if p_action='credit_prepare' then return jsonb_build_object('purchase',to_jsonb(p),'price',(select to_jsonb(x) from private.ai_credit_price_mappings x where id=p.price_mapping_id),'customer_id',(select provider_customer_id from private.billing_customers where professional_id=owner)); end if;
  end if;
  m:=private.credit_price((p_data->>'package_id')::uuid);
  select * into pkg from private.ai_credit_packages where id=m.package_id;
  expected:=m.amount; bonus:=pkg.bonus_credits;
  if coalesce(btrim(p_data->>'code'),'')<>'' then
   select * into c from private.promotion_campaigns where code=upper(btrim(p_data->>'code')) for update;
   perform private.promotion_common_eligible(owner,c,p.id);
   if c.target<>'ai_credit_package' or not pkg.id=any(c.eligible_package_ids) then raise exception 'promotion_package_ineligible'; end if;
   for b in select value from jsonb_array_elements(c.benefits) loop
    if b->>'type'='percentage_discount' then expected:=m.amount-round(m.amount*(b->>'amount')::numeric/100);
    elsif b->>'type'='fixed_discount' then expected:=m.amount-round((b->>'amount')::numeric*100);
    elsif b->>'type'='bonus_ai_credits' then bonus:=bonus+(b->>'amount')::numeric; end if;
   end loop;
  end if;
  if expected>0 and expected<1000 then raise exception 'credit_payment_minimum'; end if;
  if expected<0 or bonus+pkg.credits>1000000 then raise exception 'invalid_promotion_price'; end if;
  if p_action='credit_preview' then return jsonb_build_object('amount',expected,'currency',m.currency,'credits',pkg.credits,'bonus',bonus,'campaign',case when c.id is not null then jsonb_build_object('code',c.code,'name',c.name) else null end); end if;
  if op is null then raise exception 'invalid_input'; end if;
  if exists(select 1 from private.ai_credit_purchases where id=op) or exists(select 1 from private.billing_checkout_intents where id=op) then raise exception 'operation_already_used'; end if;
  if (select count(*) from private.ai_credit_purchases where professional_id=owner and created_at>now()-interval '1 hour')>=5 or (select count(*) from private.ai_credit_purchases where professional_id=owner and created_at>now()-interval '24 hours')>=20 then raise exception 'credit_checkout_rate_limited'; end if;
  insert into private.ai_credit_purchases(id,professional_id,package_id,price_mapping_id,package_snapshot,credits_purchased,bonus_credits,amount,expected_amount,currency,campaign_id,campaign_snapshot,expires_at)
  values(op,owner,pkg.id,m.id,to_jsonb(pkg),pkg.credits,bonus,m.amount,expected,m.currency,c.id,case when c.id is not null then to_jsonb(c) else null end,now()+interval '35 minutes') returning * into p;
  perform private.billing_audit('purchase_started',owner,p.id,jsonb_build_object('package_id',pkg.id,'credits',pkg.credits,'bonus',bonus,'amount',expected));
  return jsonb_build_object('purchase',to_jsonb(p),'price',to_jsonb(m),'customer_id',(select provider_customer_id from private.billing_customers where professional_id=owner));
 elsif p_action='credit_context' then
  select * into p from private.ai_credit_purchases where professional_id=owner and closed_at is null;
  return jsonb_build_object('purchase',to_jsonb(p),'customer_id',(select provider_customer_id from private.billing_customers where professional_id=owner));
 elsif p_action='credit_price_saved' then
  select * into m from private.ai_credit_price_mappings where id=(p_data->>'price_mapping_id')::uuid for update;
  if m.id is null or (m.provider_price_id is not null and m.provider_price_id<>p_data->>'price_id') then raise exception 'price_mapping_mismatch'; end if;
  update private.ai_credit_price_mappings set provider_price_id=p_data->>'price_id' where id=m.id;
 elsif p_action='credit_coupon_saved' then
  select * into p from private.ai_credit_purchases where id=(p_data->>'purchase_id')::uuid and professional_id=owner;
  if p.campaign_id is null then raise exception 'unknown_purchase'; end if;
  insert into private.billing_promotion_mappings(campaign_id,version,credit_price_mapping_id,provider_coupon_id)
   values(p.campaign_id,(p.campaign_snapshot->>'version')::integer,p.price_mapping_id,p_data->>'coupon_id') on conflict do nothing;
  update private.ai_credit_purchases set coupon_id=p_data->>'coupon_id' where id=p.id;
 elsif p_action='credit_checkout_saved' then
  update private.ai_credit_purchases set provider_checkout_id=p_data->>'checkout_id',checkout_url=p_data->>'url',expires_at=to_timestamp((p_data->>'expires_at')::double precision)
   where id=(p_data->>'purchase_id')::uuid and professional_id=owner and closed_at is null and (provider_checkout_id is null or provider_checkout_id=p_data->>'checkout_id') returning * into p;
  if p.id is null then raise exception 'unknown_purchase'; end if;
  return jsonb_build_object('id',p.id,'url',p.checkout_url);
 elsif p_action='credit_expired' then
  update private.ai_credit_purchases set status='cancelled',closed_at=now(),updated_at=now() where id=(p_data->>'purchase_id')::uuid and professional_id=owner and closed_at is null;
 else raise exception 'invalid_action'; end if;
 return '{"saved":true}';
end $$;
revoke all on function private.credit_billing_server(text,jsonb) from public,anon,authenticated,service_role;

-- Extend the existing authenticated gateway and event lease; keep subscription behavior intact.
alter function private.billing_server(text,jsonb) rename to billing_subscription_server;
revoke all on function private.billing_subscription_server(text,jsonb) from public,anon,authenticated,service_role;
create function private.billing_server(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; p private.ai_credit_purchases; begin
 if left(p_action,7)='credit_' then return private.credit_billing_server(p_action,p_data); end if;
 result:=private.billing_subscription_server(p_action,p_data);
 if p_action='claim_event' and result->>'owner' is not null and not coalesce((result->>'replay')::boolean,false) then
  select * into p from private.ai_credit_purchases where professional_id=(result->>'owner')::uuid and
   (provider_checkout_id=p_data->>'checkout_id' or provider_payment_id=p_data->>'payment_id' or (provider_checkout_id is null and id::text=p_data->>'credit_reference')) order by created_at desc limit 1;
  result:=result||jsonb_build_object('credit_purchase',to_jsonb(p));
 end if;
 return result;
end $$;
revoke all on function private.billing_server(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.billing_server(text,jsonb) to service_role;


-- Both purchase kinds use one campaign validator and administrative editor.
create or replace function private.validate_promotion() returns trigger language plpgsql set search_path='' as $$
declare b jsonb; d jsonb; k text; n integer:=0; fin integer:=0; seen text[]:='{}'; begin
 if tg_op='UPDATE' and new.target<>old.target then raise exception 'promotion_target_immutable'; end if;
 if new.target='ai_credit_package' then
  if cardinality(new.eligible_plan_ids)<>0 or cardinality(new.eligible_package_ids)=0 or exists(select 1 from unnest(new.eligible_package_ids) x where not exists(select 1 from private.ai_credit_packages p where p.id=x)) then raise exception 'invalid_promotion_packages'; end if;
  if jsonb_typeof(new.benefits) is distinct from 'array' or jsonb_array_length(new.benefits) not between 1 and 2 then raise exception 'invalid_benefit'; end if;
  for b in select value from jsonb_array_elements(new.benefits) loop
   k:=b->>'type';
   if k is null or k not in ('percentage_discount','fixed_discount','bonus_ai_credits') or jsonb_typeof(b->'amount') is distinct from 'number' or (b->>'amount')::numeric<=0 or (b->>'amount')::numeric>1000000 then raise exception 'invalid_benefit'; end if;
   if b->'duration'->>'kind' is distinct from 'invoice' then raise exception 'invalid_duration'; end if;
   if k=any(seen) then raise exception 'duplicate_benefit'; end if; seen:=array_append(seen,k);
   if k in ('percentage_discount','fixed_discount') then
    fin:=fin+1;
    if (b->>'amount')::numeric<>round((b->>'amount')::numeric,2) then raise exception 'invalid_benefit'; end if;
   end if;
   if fin>1 then raise exception 'one_financial_benefit'; end if;
   if k='percentage_discount' and (b->>'amount')::numeric>100 then raise exception 'invalid_benefit'; end if;
   if k='bonus_ai_credits' and (b->>'amount')::numeric<>round((b->>'amount')::numeric,3) then raise exception 'invalid_benefit'; end if;
  end loop;
  return new;
 end if;
 if cardinality(new.eligible_package_ids)<>0 then raise exception 'invalid_promotion_packages'; end if;

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

create or replace function private.billing_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin(); c private.promotion_campaigns; cid uuid; result jsonb; before_data jsonb; begin
 if p_action='overview' then return jsonb_build_object('settings',(select to_jsonb(s) from private.billing_settings s),'professionals',(select private.admin_api('professionals','{}')->'items'),'test_accounts',coalesce((select jsonb_agg(jsonb_build_object('id',t.professional_id,'name',p.full_name)) from private.billing_test_accounts t join public.professional_profiles p on p.id=t.professional_id),'[]'),'credit_packages',coalesce((select jsonb_agg(to_jsonb(p) order by display_order,name) from private.ai_credit_packages p),'[]'),'plans',(select private.admin_api('catalog','{}')->'plans'),'mappings',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('plan_name',p.name)) from private.billing_price_mappings m join private.plans p on p.id=m.plan_id),'[]')); end if;
 if p_action='campaigns' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select campaign_list.*,array(select p.name from private.plans p where p.id=any(campaign_list.eligible_plan_ids) order by p.display_order)||array(select p.name from private.ai_credit_packages p where p.id=any(campaign_list.eligible_package_ids) order by p.display_order) plan_names,(select count(*) from private.promotion_redemptions r where r.campaign_id=campaign_list.id) redeemed,(select count(*) from private.billing_checkout_intents i where i.campaign_id=campaign_list.id and i.state in ('reserved','open'))+(select count(*) from private.ai_credit_purchases i where i.campaign_id=campaign_list.id and i.closed_at is null) reserved from private.promotion_campaigns campaign_list order by campaign_list.created_at desc limit 200)x),'[]'); end if;
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
  insert into private.promotion_campaigns(id,code,name,audience,audience_note,visibility,active,starts_at,ends_at,eligible_plan_ids,intervals,benefits,max_redemptions,max_per_professional,new_customers_only,target,eligible_package_ids)
  values(cid,upper(btrim(p_data->>'code')),btrim(p_data->>'name'),p_data->>'audience',coalesce(p_data->>'audience_note',''),coalesce(p_data->>'visibility','private'),coalesce((p_data->>'active')::boolean,true),(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,array(select jsonb_array_elements_text(p_data->'eligible_plan_ids')::uuid),array(select jsonb_array_elements_text(p_data->'intervals')),p_data->'benefits',(p_data->>'max_redemptions')::integer,coalesce((p_data->>'max_per_professional')::integer,1),coalesce((p_data->>'new_customers_only')::boolean,false),coalesce(p_data->>'target','subscription'),array(select jsonb_array_elements_text(p_data->'eligible_package_ids')::uuid))
  on conflict(id) do update set target=excluded.target,eligible_package_ids=excluded.eligible_package_ids,name=excluded.name,audience=excluded.audience,audience_note=excluded.audience_note,visibility=excluded.visibility,active=excluded.active,starts_at=excluded.starts_at,ends_at=excluded.ends_at,eligible_plan_ids=excluded.eligible_plan_ids,intervals=excluded.intervals,benefits=excluded.benefits,max_redemptions=excluded.max_redemptions,max_per_professional=excluded.max_per_professional,new_customers_only=excluded.new_customers_only,version=private.promotion_campaigns.version+1,updated_at=now();
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

-- Positive courtesy adjustments can regularize refund debt.
create or replace function private.adjust_ai_credits(p_owner uuid,p_key uuid,p_amount numeric) returns void language plpgsql set search_path='' as $$
declare a private.ai_accounts; old_delta numeric; purchased_change numeric; included_change numeric:=0; available_included numeric; begin
 if p_key is null or p_amount is null or p_amount=0 or abs(p_amount)>1000000 or p_amount<>round(p_amount,3) then raise exception 'invalid_adjustment'; end if;
 insert into private.ai_accounts(professional_id) values(p_owner) on conflict do nothing;
 select * into a from private.ai_accounts where professional_id=p_owner for update;
 select purchased_delta+included_delta into old_delta from private.ai_credit_ledger where professional_id=p_owner and operation_key=p_key and type='ADMIN_ADJUSTMENT';
 if found then if old_delta<>p_amount then raise exception 'idempotency_conflict'; end if; return; end if;
 if exists(select 1 from private.ai_credit_ledger where professional_id=p_owner and operation_key=p_key) then raise exception 'idempotency_conflict'; end if;
 available_included:=case when a.billing_period_end>now() then a.included_credits-a.reserved_included else 0 end;
 if p_amount<0 and (a.purchased_credits<0 or a.purchased_credits-a.reserved_purchased+available_included+p_amount<0) then raise exception 'insufficient_unreserved_credits'; end if;
 purchased_change:=case when p_amount>0 then p_amount else -least(-p_amount,greatest(0,a.purchased_credits-a.reserved_purchased)) end;
 included_change:=p_amount-purchased_change;
 insert into private.ai_credit_ledger(professional_id,type,included_delta,purchased_delta,operation_key) values(p_owner,'ADMIN_ADJUSTMENT',included_change,purchased_change,p_key);
 update private.ai_accounts set purchased_credits=purchased_credits+purchased_change,included_credits=included_credits+included_change where professional_id=p_owner;
end $$;

create function private.ai_credit_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin(); p private.ai_credit_packages; pid uuid; result jsonb; before_data jsonb; begin
 if p_action='packages' then return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select p.*,(select count(*) from private.ai_credit_purchases r where r.package_id=p.id and r.credited_at is not null) purchases,
  (select jsonb_agg(to_jsonb(m) order by created_at desc) from private.ai_credit_price_mappings m where m.package_id=p.id) mappings
  from private.ai_credit_packages p order by display_order,name)x),'[]'); end if;
 if p_action='purchases' then return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select r.id,r.professional_id,p.full_name professional_name,r.package_snapshot->>'name' package_name,r.package_snapshot->>'code' package_code,
   r.credits_purchased,r.bonus_credits,r.amount,r.amount_paid,r.expected_amount,r.currency,r.status,r.refunded_amount,r.reversed_credits,r.review_reason,
   r.created_at,r.paid_at,r.credited_at,r.campaign_snapshot->>'code' promotion_code,r.provider,r.mode
  from private.ai_credit_purchases r join public.professional_profiles p on p.id=r.professional_id order by r.created_at desc limit 200)x),'[]'); end if;
 pid:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
 select * into p from private.ai_credit_packages where id=pid for update;
 if p_action='package' then if p.id is null then raise exception 'not_found'; end if; return to_jsonb(p); end if;
 if p_action='save_package' then
  if p.id is not null and p.version is distinct from (p_data->>'version')::integer then raise exception 'stale_revision'; end if;
  if (p_data->>'price_amount')::numeric<10 or (p_data->>'price_amount')::numeric is distinct from round((p_data->>'price_amount')::numeric,2) then raise exception 'invalid_package_price'; end if;
  if p.id is not null and p.code<>upper(btrim(p_data->>'code')) then raise exception 'code_immutable'; end if;
  before_data:=to_jsonb(p);
  insert into private.ai_credit_packages(id,code,name,description,credits,bonus_credits,price_amount,currency,active,internal_only,display_order)
   values(pid,upper(btrim(p_data->>'code')),btrim(p_data->>'name'),coalesce(p_data->>'description',''),(p_data->>'credits')::integer,coalesce((p_data->>'bonus_credits')::integer,0),(p_data->>'price_amount')::numeric,p_data->>'currency',coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'internal_only')::boolean,false),coalesce((p_data->>'display_order')::integer,0))
   on conflict(id) do update set name=excluded.name,description=excluded.description,credits=excluded.credits,bonus_credits=excluded.bonus_credits,price_amount=excluded.price_amount,currency=excluded.currency,active=excluded.active,internal_only=excluded.internal_only,display_order=excluded.display_order,version=private.ai_credit_packages.version+1,updated_at=now();
  select to_jsonb(x) into result from private.ai_credit_packages x where id=pid;
  perform private.billing_audit(case when p.id is null then 'credit_package_created' else 'credit_package_updated' end,null,pid,jsonb_build_object('before',before_data,'after',result),actor);
  return result;
 elsif p_action='disable_package' then
  if p.id is null then raise exception 'not_found'; end if;
  update private.ai_credit_packages set active=false,version=version+1,updated_at=now() where id=pid and active;
  if found then perform private.billing_audit('credit_package_disabled',null,pid,'{}',actor); end if;
  return '{"saved":true}';
 end if;
 raise exception 'invalid_action';
end $$;
create function public.ai_credit_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.ai_credit_admin_api(p_action,p_data)$$;
revoke all on function private.ai_credit_admin_api(text,jsonb),public.ai_credit_admin_api(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.ai_credit_admin_api(text,jsonb),public.ai_credit_admin_api(text,jsonb) to authenticated;

create or replace function public.billing_server(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.billing_server(p_action,p_data)$$;

-- Mi plan uses the same effective balance, including refund restrictions.
create or replace function private.billing_summary(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode','test','enabled',(select enabled from private.billing_settings),'test_eligible',exists(select 1 from private.billing_test_accounts where professional_id=p_owner),
 'access',private.resolve_effective_entitlements(p_owner),'subscription',(select to_jsonb(s)||jsonb_build_object('plan_name',p.name,'plan_id',p.id,'interval',m.interval,'amount',m.amount,'currency',m.currency,'pending_plan_name',pp.name) from private.billing_subscriptions s join private.billing_price_mappings m on m.id=s.price_mapping_id join private.plans p on p.id=m.plan_id left join private.plans pp on pp.id=s.pending_plan_id where s.professional_id=p_owner order by s.created_at desc limit 1),
 'payments',coalesce((select jsonb_agg(to_jsonb(t)) from (select provider_invoice_id,amount_due,amount_paid,currency,status,issued_at,paid_at,hosted_url from private.billing_payments where professional_id=p_owner order by issued_at desc limit 50)t),'[]'),
 'credits',private.credit_purchase_summary(p_owner)->'balances')
$$;

-- All reversals are new entries. Even privileged maintenance cannot mutate history.
create function private.ai_ledger_append_only() returns trigger language plpgsql set search_path='' as $$begin
 raise exception 'ledger_append_only' using errcode='42501';
end$$;
revoke all on function private.ai_ledger_append_only() from public,anon,authenticated,service_role;
create trigger ai_ledger_append_only before update or delete on private.ai_credit_ledger for each row execute function private.ai_ledger_append_only();
