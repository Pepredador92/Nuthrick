begin;

create or replace function private.credit_owner_environment(p_owner uuid)
returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.billing_test_accounts where professional_id=p_owner)
  and not exists(select 1 from private.billing_subscriptions where professional_id=p_owner and mode='live')
  and not exists(select 1 from private.professional_access where professional_id=p_owner and billing_mode='live')
 then 'test' else 'live' end
$$;
revoke all on function private.credit_owner_environment(uuid) from public,anon,authenticated,service_role;

-- Reuse the existing one-time purchase, webhook, ledger and refund paths for
-- Live AI credits. Subscription checkout remains a separate closed switch.
alter table private.ai_live_pilot_configuration
  add column credit_purchase_enabled boolean not null default false;

alter table private.ai_credit_packages drop constraint ai_credit_packages_test_only_check;
alter table private.ai_credit_packages alter column test_only set default false;
update private.ai_credit_packages
set test_only=false,
    name=regexp_replace(name,'\s*·\s*TEST$',''),
    description='Recarga de créditos adicionales para las funciones de IA incluidas en tu plan. Pago único; los créditos adicionales no vencen.',
    version=version+1,
    updated_at=now()
where active and not internal_only and test_only
  and ((credits=100 and price_amount=99) or (credits=500 and price_amount=349) or (credits=1000 and price_amount=699));

alter table private.ai_credit_price_mappings drop constraint ai_credit_price_mappings_mode_check;
alter table private.ai_credit_price_mappings add constraint ai_credit_price_mappings_mode_check check(mode in ('test','live'));
alter table private.ai_credit_price_mappings alter column mode set default private.billing_environment();
alter table private.ai_credit_price_mappings add unique(id,mode);

alter table private.ai_credit_purchases drop constraint ai_credit_purchases_mode_check;
alter table private.ai_credit_purchases add constraint ai_credit_purchases_mode_check check(mode in ('test','live'));
alter table private.ai_credit_purchases alter column mode set default private.billing_environment();
alter table private.ai_credit_purchases add foreign key(price_mapping_id,mode) references private.ai_credit_price_mappings(id,mode);
drop index private.ai_credit_one_open_checkout;
create unique index ai_credit_one_open_checkout on private.ai_credit_purchases(professional_id,mode) where closed_at is null;
create index ai_credit_purchases_owner_mode_date on private.ai_credit_purchases(professional_id,mode,created_at desc);

create or replace function private.credit_price(p_package uuid,p_mode text)
returns private.ai_credit_price_mappings language plpgsql security definer set search_path='' as $$
declare p private.ai_credit_packages; m private.ai_credit_price_mappings; fp text;
begin
 if p_mode is distinct from private.billing_environment() then raise exception 'billing_environment_mismatch'; end if;
 select * into p from private.ai_credit_packages where id=p_package and active and not internal_only for share;
 if p.id is null or (p_mode='live' and p.test_only) then raise exception 'credit_package_unavailable'; end if;
 fp:=md5(p.id::text||':'||p.version::text||':'||p.credits::text||':'||p.bonus_credits::text||':'||p.price_amount::text||':MXN:stripe:'||p_mode);
 insert into private.ai_credit_price_mappings(package_id,package_version,package_name,credits,bonus_credits,amount,currency,mode,fingerprint)
 values(p.id,p.version,p.name,p.credits,p.bonus_credits,round(p.price_amount*100),'MXN',p_mode,fp)
 on conflict(fingerprint) do nothing;
 select * into m from private.ai_credit_price_mappings where fingerprint=fp and mode=p_mode;
 return m;
end $$;
revoke all on function private.credit_price(uuid,text) from public,anon,authenticated,service_role;

create or replace function private.credit_price(p_package uuid)
returns private.ai_credit_price_mappings language plpgsql security definer set search_path='' as $$
begin
 return private.credit_price(p_package,private.billing_environment());
end $$;
revoke all on function private.credit_price(uuid) from public,anon,authenticated,service_role;

create or replace function private.credit_purchase_allowed(p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>'ai.credit_purchase')::boolean,false)
  and exists(select 1 from public.professional_profiles where id=p_owner and onboarding_completed)
  and case when private.credit_owner_environment(p_owner)='live' then
    private.ai_live_pilot_eligible(p_owner)
    and coalesce((select credit_purchase_enabled from private.ai_live_pilot_configuration where id),false)
    and coalesce((private.resolve_effective_entitlements(p_owner)->>'read_only')::boolean,true)=false
    and exists(select 1 from private.ai_processing_consents c join private.ai_live_pilot_configuration cfg on cfg.id and c.notice_version=cfg.consent_version
      where c.professional_id=p_owner and c.revoked_at is null and c.patient_authorization_confirmed)
    and exists(select 1 from private.ai_feature_config where enabled)
  else (select enabled from private.billing_settings)
    and exists(select 1 from private.billing_test_accounts where professional_id=p_owner)
  end
$$;
revoke all on function private.credit_purchase_allowed(uuid) from public,anon,authenticated,service_role;

create or replace function private.credit_purchase_summary(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'mode',private.credit_owner_environment(p_owner),
  'enabled',case when private.credit_owner_environment(p_owner)='live'
    then coalesce((select credit_purchase_enabled from private.ai_live_pilot_configuration where id),false)
    else (select enabled from private.billing_settings) end,
  'eligible',private.credit_purchase_allowed(p_owner),
  'test_eligible',exists(select 1 from private.billing_test_accounts where professional_id=p_owner),
  'live_eligible',private.credit_owner_environment(p_owner)='live' and private.credit_purchase_allowed(p_owner),
  'balances',coalesce((select jsonb_build_object(
    'included',case when billing_period_end>now() then included_credits-reserved_included else 0 end,
    'additional',purchased_credits-reserved_purchased,
    'available',case when purchased_credits<reserved_purchased or exists(select 1 from private.ai_credit_purchases where professional_id=p_owner and mode=private.credit_owner_environment(p_owner) and status='in_review') then 0 else greatest(0,(case when billing_period_end>now() then included_credits-reserved_included else 0 end)+purchased_credits-reserved_purchased) end,
    'debt',greatest(0,-purchased_credits),
    'in_review',exists(select 1 from private.ai_credit_purchases where professional_id=p_owner and mode=private.credit_owner_environment(p_owner) and status='in_review'),
    'period_end',billing_period_end) from private.ai_accounts where professional_id=p_owner),
    '{"included":0,"additional":0,"available":0,"debt":0,"in_review":false}'),
  'packages',coalesce((select jsonb_agg(to_jsonb(x)) from (
    select id,code,name,description,credits,bonus_credits,price_amount,currency,test_only
    from private.ai_credit_packages where active and not internal_only
      and (private.credit_owner_environment(p_owner)<>'live' or not test_only)
    order by display_order,name)x),'[]'),
  'purchases',coalesce((select jsonb_agg(to_jsonb(x)) from (
    select id,package_snapshot->>'name' as package_name,credits_purchased,bonus_credits,amount_paid,expected_amount,currency,status,created_at,paid_at,credited_at,refunded_amount,reversed_credits,review_reason
    from private.ai_credit_purchases where professional_id=p_owner and mode=private.credit_owner_environment(p_owner) order by created_at desc limit 50)x),'[]'),
  'pending',(select jsonb_build_object('id',id,'status',status,'expires_at',expires_at,'url',checkout_url)
    from private.ai_credit_purchases where professional_id=p_owner and mode=private.credit_owner_environment(p_owner) and closed_at is null),
  'history',coalesce((select jsonb_agg(to_jsonb(x)) from (
    select id,type,included_delta,purchased_delta,credit_purchase_id,created_at from private.ai_credit_ledger
    where professional_id=p_owner and type not in ('RESERVE','RELEASE','USAGE') order by created_at desc,id desc limit 50)x),'[]'))
$$;
revoke all on function private.credit_purchase_summary(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.apply_credit_payment(p_owner uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.ai_credit_purchases; m private.ai_credit_price_mappings; a private.ai_accounts; s jsonb:=p_data->'payment';
 total numeric; target_reversal numeric; delta numeric; refunded bigint; review text; next_status text; first_grant boolean:=false; event_key uuid;
begin
 perform private.billing_require_lock(p_owner,(p_data->>'lock_key')::uuid);
 if not exists(select 1 from private.billing_webhook_events where mode=private.billing_environment() and provider_event_id=p_data->>'event_id' and professional_id=p_owner and processed_at is null) then raise exception 'unknown_event'; end if;
 insert into private.ai_accounts(professional_id) values(p_owner) on conflict do nothing;
 select * into a from private.ai_accounts where professional_id=p_owner for update;
 select * into p from private.ai_credit_purchases where id=(p_data->>'purchase_id')::uuid and professional_id=p_owner for update;
 select * into m from private.ai_credit_price_mappings where id=p.price_mapping_id;
 if p.id is null or p.mode<>private.billing_environment() or m.mode<>p.mode or s->>'mode' is distinct from 'payment' or s->>'livemode' is distinct from (p.mode='live')::text
  or s->>'customer_id' is distinct from (select provider_customer_id from private.billing_customers where mode=p.mode and professional_id=p_owner)
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
 update private.billing_webhook_events set processed_at=now(),last_error=null where mode=private.billing_environment() and provider_event_id=p_data->>'event_id' and professional_id=p_owner;
 update private.billing_customers set lease_key=null,lease_until=null where mode=p.mode and professional_id=p_owner and lease_key=(p_data->>'lock_key')::uuid;
 return jsonb_build_object('processed',true,'status',next_status,'credited',first_grant);
end $function$
;
CREATE OR REPLACE FUNCTION private.credit_billing_server(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner uuid:=(p_data->>'owner')::uuid; op uuid:=(p_data->>'operation_key')::uuid; p private.ai_credit_purchases;
 pkg private.ai_credit_packages; m private.ai_credit_price_mappings; c private.promotion_campaigns; b jsonb; expected bigint; bonus numeric; result jsonb;
begin
 perform private.billing_require_lock(owner,(p_data->>'lock_key')::uuid);

 if p_action='credit_price_catalog' then
  if not exists(select 1 from private.platform_admins where user_id=(p_data->>'actor')::uuid and enabled) then raise exception 'admin_required'; end if;
  result:='[]'::jsonb;
  for pkg in select * from private.ai_credit_packages where active and not internal_only and (private.billing_environment()='test' or not test_only) order by display_order loop
   m:=private.credit_price(pkg.id); result:=result||jsonb_build_array(to_jsonb(m));
  end loop;
  return result;
 end if;
 if p_action='credit_apply' then return private.apply_credit_payment(owner,p_data); end if;
 if p_action in ('credit_prepare','credit_preview') then
  if private.billing_environment() is distinct from private.credit_owner_environment(owner) then raise exception 'billing_environment_mismatch'; end if;
  if not private.credit_purchase_allowed(owner) then raise exception 'credit_purchase_not_allowed'; end if;
  select * into p from private.ai_credit_purchases where professional_id=owner and mode=private.billing_environment() and closed_at is null;
  if p.id is not null then
   if p.package_id is distinct from (p_data->>'package_id')::uuid or coalesce(p.campaign_snapshot->>'code','')<>upper(btrim(coalesce(p_data->>'code',''))) then raise exception 'credit_checkout_pending'; end if;
   if p_action='credit_prepare' then return jsonb_build_object('purchase',to_jsonb(p),'price',(select to_jsonb(x) from private.ai_credit_price_mappings x where id=p.price_mapping_id),'customer_id',(select provider_customer_id from private.billing_customers where mode=private.billing_environment() and professional_id=owner)); end if;
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
  if (select count(*) from private.ai_credit_purchases where professional_id=owner and mode=private.billing_environment() and created_at>now()-interval '1 hour')>=5 or (select count(*) from private.ai_credit_purchases where professional_id=owner and mode=private.billing_environment() and created_at>now()-interval '24 hours')>=20 then raise exception 'credit_checkout_rate_limited'; end if;
  insert into private.ai_credit_purchases(id,professional_id,package_id,price_mapping_id,package_snapshot,credits_purchased,bonus_credits,amount,expected_amount,currency,campaign_id,campaign_snapshot,expires_at,mode)
  values(op,owner,pkg.id,m.id,to_jsonb(pkg),pkg.credits,bonus,m.amount,expected,m.currency,c.id,case when c.id is not null then to_jsonb(c) else null end,now()+interval '35 minutes',private.billing_environment()) returning * into p;
  perform private.billing_audit('purchase_started',owner,p.id,jsonb_build_object('package_id',pkg.id,'credits',pkg.credits,'bonus',bonus,'amount',expected));
  return jsonb_build_object('purchase',to_jsonb(p),'price',to_jsonb(m),'customer_id',(select provider_customer_id from private.billing_customers where mode=private.billing_environment() and professional_id=owner));
 elsif p_action='credit_context' then
  select * into p from private.ai_credit_purchases where professional_id=owner and mode=private.billing_environment() and closed_at is null;
  return jsonb_build_object('purchase',to_jsonb(p),'customer_id',(select provider_customer_id from private.billing_customers where mode=private.billing_environment() and professional_id=owner));
 elsif p_action='credit_price_saved' then
  select * into m from private.ai_credit_price_mappings where id=(p_data->>'price_mapping_id')::uuid and mode=private.billing_environment() for update;
  if m.id is null or (m.provider_price_id is not null and m.provider_price_id<>p_data->>'price_id') then raise exception 'price_mapping_mismatch'; end if;
  update private.ai_credit_price_mappings set provider_price_id=p_data->>'price_id' where id=m.id;
 elsif p_action='credit_coupon_saved' then
  select * into p from private.ai_credit_purchases where id=(p_data->>'purchase_id')::uuid and professional_id=owner and mode=private.billing_environment() and mode=private.billing_environment();
  if p.campaign_id is null then raise exception 'unknown_purchase'; end if;
  insert into private.billing_promotion_mappings(campaign_id,version,credit_price_mapping_id,provider_coupon_id)
   values(p.campaign_id,(p.campaign_snapshot->>'version')::integer,p.price_mapping_id,p_data->>'coupon_id') on conflict do nothing;
  update private.ai_credit_purchases set coupon_id=p_data->>'coupon_id' where id=p.id;
 elsif p_action='credit_checkout_saved' then
  update private.ai_credit_purchases set provider_checkout_id=p_data->>'checkout_id',checkout_url=p_data->>'url',expires_at=to_timestamp((p_data->>'expires_at')::double precision)
   where id=(p_data->>'purchase_id')::uuid and professional_id=owner and mode=private.billing_environment() and closed_at is null and (provider_checkout_id is null or provider_checkout_id=p_data->>'checkout_id') returning * into p;
  if p.id is null then raise exception 'unknown_purchase'; end if;
  return jsonb_build_object('id',p.id,'url',p.checkout_url);
 elsif p_action='credit_expired' then
  update private.ai_credit_purchases set status='cancelled',closed_at=now(),updated_at=now() where id=(p_data->>'purchase_id')::uuid and professional_id=owner and mode=private.billing_environment() and closed_at is null;
 else raise exception 'invalid_action'; end if;
 return '{"saved":true}';
end $function$
;
CREATE OR REPLACE FUNCTION private.billing_server(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; purchase private.ai_credit_purchases; env text:=coalesce(p_data->>'environment','test'); owner uuid:=(p_data->>'owner')::uuid;
begin
 if p_action='environment' then
  if owner is null then raise exception 'unauthorized'; end if;
  if p_data->>'requested_environment' is not null then
   if p_data->>'action' not in ('sync_prices','inspect_live','sync_credit_prices') or not exists(select 1 from private.platform_admins where user_id=owner and enabled) then raise exception 'admin_required'; end if;
   if p_data->>'requested_environment' not in ('test','live') then raise exception 'billing_environment_mismatch'; end if;
   if p_data->>'requested_environment'='live' then perform private.billing_live_guard(); end if;
   return jsonb_build_object('mode',p_data->>'requested_environment');
  end if;
  return jsonb_build_object('mode',case when left(coalesce(p_data->>'action',''),7)='credit_' then private.credit_owner_environment(owner) else private.billing_owner_environment(owner) end);
 end if;
 if env not in ('test','live') then raise exception 'billing_environment_mismatch'; end if;
 perform set_config('nuthrick.billing_environment',env,true);
 if env='live' and p_action<>'unlock' then perform private.billing_live_guard(); end if;
 if p_action='live_signature_verified' then
  if env<>'live' then raise exception 'billing_environment_mismatch'; end if;
  update private.billing_live_configuration set webhook_verified_at=now(),updated_at=now() where id;
  return '{"verified":true}';
 end if;
 if p_action in ('live_inspection_context','live_inspection_saved') then
  if env<>'live' then raise exception 'billing_environment_mismatch'; end if;
  if not exists(select 1 from private.platform_admins where user_id=(p_data->>'actor')::uuid and enabled) then raise exception 'admin_required'; end if;
  perform private.billing_require_lock(owner,(p_data->>'lock_key')::uuid);
  if p_action='live_inspection_context' then
   return jsonb_build_object('prices',coalesce((select jsonb_agg(private.billing_price_json(m.id)) from private.billing_price_mappings m join private.plans p on p.id=m.plan_id where m.mode='live' and p.active and not p.internal_only and m.amount=round(100*case m.interval when 'monthly' then p.monthly_price else p.annual_price end)),'[]'),'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',s.provider_subscription_id,'customer_id',s.provider_customer_id,'price_id',m.provider_price_id,'status',s.provider_status,'cancel_at_period_end',s.cancel_at_period_end)) from private.billing_subscriptions s join private.billing_price_mappings m on m.id=s.price_mapping_id where s.mode='live'),'[]'));
  end if;
  result:=p_data->'result';
  update private.billing_live_configuration set account_verified_at=now(),webhook_reachable_at=case when (result->>'webhook_reachable')::boolean then now() end,portal_verified_at=case when (result->>'portal_verified')::boolean then now() end,reconciliation_verified_at=case when (result->>'reconciliation_ok')::boolean then now() end,last_inspection_at=now(),last_inspection=result,updated_at=now() where id;
  perform private.billing_audit('live_configuration_inspected',null,null,result,(p_data->>'actor')::uuid);
  return result;
 end if;
 if left(p_action,7)='credit_' then
  return private.credit_billing_server(p_action,p_data);
 end if;
 if p_action='claim_event' and env='test' and exists(select 1 from private.billing_customers c join private.professional_access a on a.professional_id=c.professional_id where c.mode='test' and c.provider_customer_id=p_data->>'customer_id' and a.billing_mode='live') then return '{"ignored":true}'; end if;
 result:=private.billing_subscription_server(p_action,p_data);
 if p_action='claim_event' and result->>'owner' is not null and not coalesce((result->>'replay')::boolean,false) then
  select * into purchase from private.ai_credit_purchases where mode=env and professional_id=(result->>'owner')::uuid and
   (provider_checkout_id=p_data->>'checkout_id' or provider_payment_id=p_data->>'payment_id' or (provider_checkout_id is null and id::text=p_data->>'credit_reference')) order by created_at desc limit 1;
  result:=result||jsonb_build_object('credit_purchase',case when purchase.id is null then null else to_jsonb(purchase) end);
 end if;
 return result;
end $function$
;
do $$ declare d text; old_fragment text; new_fragment text; begin
 d:=pg_get_functiondef('private.pre_live_evidence()'::regprocedure);
 old_fragment:=$old$jsonb_build_object('key','credit_packages','label','Paquetes de recarga','status',case when exists(select 1 from private.ai_credit_packages where active and not internal_only and test_only) then 'ready' else 'pending' end,'detail','Los paquetes activos permanecen identificados como TEST hasta aprobar precios comerciales.')$old$;
 new_fragment:=$new$jsonb_build_object('key','credit_packages','label','Precios de paquetes IA registrados','status',case when (select count(*)=3 from private.ai_credit_packages where active and not internal_only and ((credits=100 and price_amount=99) or (credits=500 and price_amount=349) or (credits=1000 and price_amount=699))) then 'ready' else 'pending' end,'detail','Precios comerciales registrados: 100/$99, 500/$349 y 1,000/$699 MXN. La compra Live queda sujeta a sincronización y al piloto autorizado.')$new$;
 if position(old_fragment in d)=0 then
  old_fragment:=$old$jsonb_build_object('key','credit_packages','label','Paquetes de recarga','status',case when (select count(distinct credits)=3 from private.ai_credit_packages where active and not internal_only and test_only and currency='MXN' and (credits,price_amount) in ((100,99),(500,349),(1000,699))) then 'ready' else 'pending' end,'detail','Precios comerciales registrados: 100/$99, 500/$349 y 1,000/$699 MXN. Compra Live de créditos deshabilitada.')$old$;
 end if;
 d:=replace(d,old_fragment,new_fragment);
 if position(new_fragment in d)=0 then raise exception 'pre_live_credit_package_patch_failed'; end if;
 execute d;
end $$;

-- Production access is determined by the existing plan, not a one-user pilot.
alter table private.ai_live_pilot_configuration
 add column production_enabled boolean not null default false,
 add column production_daily_credits numeric(18,3) not null default 100 check(production_daily_credits>0),
 add column production_daily_generations integer not null default 100 check(production_daily_generations between 1 and 1000);
alter table private.ai_pilot_limits drop constraint ai_pilot_limits_max_daily_generations_check;
alter table private.ai_pilot_limits add constraint ai_pilot_limits_max_daily_generations_check check(max_daily_generations between 1 and 1000);

create or replace function private.ai_live_pilot_eligible(p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select production_enabled from private.ai_live_pilot_configuration where id),false)
 and exists(select 1 from public.professional_profiles where id=p_owner and onboarding_completed)
 and private.credit_owner_environment(p_owner)='live'
 and not exists(select 1 from private.ai_credit_purchases where professional_id=p_owner and mode='test' and credited_at is not null and credits_purchased+bonus_credits>reversed_credits)
 and coalesce((private.resolve_effective_entitlements(p_owner)->>'allowed')::boolean,false)
 and not coalesce((private.resolve_effective_entitlements(p_owner)->>'read_only')::boolean,true)
 and not exists(select 1 from private.professional_access where professional_id=p_owner and source='billing' and billing_mode='test')
 and (coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>'ai.recall_24h')::boolean,false)
   or coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>'ai.pes')::boolean,false)
   or coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>'ai.diet_draft')::boolean,false))
$$;

create or replace function private.ai_feature_allowed(p_owner uuid,p_feature text)
returns boolean language sql security definer set search_path='' as $$
 select private.ai_live_pilot_eligible(p_owner)
 and exists(select 1 from private.ai_feature_config c where c.feature=p_feature and c.enabled and c.execution_mode='real')
 and exists(select 1 from private.ai_processing_consents c
   join private.ai_live_pilot_configuration cfg on cfg.id and c.notice_version=cfg.consent_version
   where c.professional_id=p_owner and c.revoked_at is null and c.patient_authorization_confirmed)
 and exists(select 1 from private.ai_pilot_limits l where l.professional_id=p_owner and l.enabled
   and l.starts_at<=now() and (l.ends_at is null or l.ends_at>now()))
 and coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>
   case p_feature when 'recall_24h' then 'ai.recall_24h' when 'pes_diagnosis' then 'ai.pes' when 'diet_draft' then 'ai.diet_draft' else 'ai.unsupported' end)::boolean,false)
$$;

create or replace function public.accept_ai_processing_consent(p_version text,p_patient_authorization boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); cfg private.ai_live_pilot_configuration;
begin
 if owner is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select * into cfg from private.ai_live_pilot_configuration where id and production_enabled for share;
 if cfg.id is null or p_version is distinct from cfg.consent_version then raise exception 'consent_version_changed'; end if;
 if p_patient_authorization is distinct from true then raise exception 'patient_authorization_required'; end if;
 if not private.ai_live_pilot_eligible(owner) then raise exception 'ai_access_unavailable'; end if;
 if not exists(select 1 from private.legal_documents d join private.legal_acceptances a
   on a.document_key=d.key and a.document_version=d.version
   where d.key='privacy' and d.review_status='approved' and a.professional_id=owner) then raise exception 'legal_acceptance_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-consent:'||owner::text,0));
 if not exists(select 1 from private.ai_processing_consents where professional_id=owner and notice_version=cfg.consent_version and revoked_at is null) then
  insert into private.ai_processing_consents(professional_id,notice_version,patient_authorization_confirmed) values(owner,cfg.consent_version,true);
 end if;
 insert into private.ai_accounts(professional_id) values(owner) on conflict do nothing;
 insert into private.ai_pilot_limits(professional_id,enabled,max_total_generations,max_daily_generations,max_daily_credits,ends_at)
 values(owner,true,100,cfg.production_daily_generations,cfg.production_daily_credits,null)
 on conflict(professional_id) do update set enabled=true,max_daily_generations=cfg.production_daily_generations,
 max_daily_credits=cfg.production_daily_credits,ends_at=null,calibration_started_at=null,calibration_patient_id=null,
 calibration_request_limit=null,calibration_usd_limit=null,calibration_model_limits=null;
 begin perform private.allocate_plan_month(owner,now()); exception when others then if sqlerrm<>'unsettled_period' then raise; end if; end;
 return private.ai_processing_consent_status(owner);
end $$;

-- Existing audit history is retained. Production has daily/concurrency/spend
-- controls, but no lifetime generation ceiling inherited from calibration.
do $$ declare d text; begin
 d:=pg_get_functiondef('public.ai_server(text,uuid,jsonb)'::regprocedure);
 d:=replace(d,'if (select count(*) from private.ai_generations where professional_id=p_owner and feature=c.feature and (status',
  'if not coalesce((select production_enabled from private.ai_live_pilot_configuration where id),false) and (select count(*) from private.ai_generations where professional_id=p_owner and feature=c.feature and (status');
 d:=replace(d,$old$if p_action='claim' then$old$,$new$if p_action='claim' then
   if not private.ai_feature_allowed(p_owner,g.feature) then raise exception 'feature_disabled'; end if;$new$);
 if position('if not coalesce((select production_enabled' in d)=0 then raise exception 'ai_production_limit_patch_failed'; end if;
 execute d;
end $$;

create or replace function private.ai_live_pilot_policy_valid()
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select production_enabled and production_daily_credits>0 and production_daily_generations between 1 and 1000
 from private.ai_live_pilot_configuration where id),false)
 and not exists(select 1 from private.ai_feature_config where enabled and (feature not in ('recall_24h','pes_diagnosis','diet_draft') or execution_mode<>'real'))
 and exists(select 1 from pg_proc where oid='private.ai_feature_allowed(uuid,text)'::regprocedure
   and position('ai_processing_consents' in prosrc)>0 and position('resolve_effective_entitlements' in prosrc)>0)
$$;

-- Keep published readiness descriptions aligned with the actual production gate.
do $$ declare d text; begin
 d:=pg_get_functiondef('private.pre_live_evidence()'::regprocedure);
 d:=replace(d,'Piloto de IA acotado','IA con permisos, consentimiento y saldo');
 d:=replace(d,'Solo la cuenta Live autorizada, con consentimiento vigente y límites de uso puede acceder a Recordatorio 24 h y diagnóstico PES.','Acceso por plan, consentimiento vigente, saldo y límites diarios; R24h, PES y Taller según los permisos contratados.');
 d:=replace(d,'OpenAI está desactivado hasta publicar las barreras del piloto.','Las funciones IA permanecen desactivadas.');
 d:=replace(d,'La compra Live queda sujeta a sincronización y al piloto autorizado.','La compra Live requiere precios sincronizados y acceso elegible.');
 execute d;
 d:=pg_get_functiondef('private.billing_live_readiness()'::regprocedure);
 d:=replace(d,'Piloto de IA y recargas controlados','IA y recargas con controles de producción');
 d:=replace(d,'El uso de IA se limita al piloto autorizado, al consentimiento registrado y a topes diarios; las recargas Live continúan independientes del checkout de suscripciones.','La IA requiere permisos del plan, consentimiento y saldo. Las recargas verifican el pago y mantienen separado TEST de Live.');
 execute d;
end $$;

-- Keep privileged implementations outside the exposed schema; each derives the
-- caller from auth.uid(), never from a client-supplied owner.
alter function public.my_ai_processing_consent() set schema private;
create function public.my_ai_processing_consent() returns jsonb language sql security invoker set search_path='' as $$ select private.my_ai_processing_consent() $$;
revoke all on function public.my_ai_processing_consent(),private.my_ai_processing_consent() from public,anon,authenticated,service_role;
grant execute on function public.my_ai_processing_consent(),private.my_ai_processing_consent() to authenticated;
alter function public.accept_ai_processing_consent(text,boolean) set schema private;
create function public.accept_ai_processing_consent(p_version text,p_patient_authorization boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.accept_ai_processing_consent(p_version,p_patient_authorization) $$;
revoke all on function public.accept_ai_processing_consent(text,boolean),private.accept_ai_processing_consent(text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.accept_ai_processing_consent(text,boolean),private.accept_ai_processing_consent(text,boolean) to authenticated;
alter function public.revoke_ai_processing_consent() set schema private;
create function public.revoke_ai_processing_consent() returns jsonb language sql security invoker set search_path='' as $$ select private.revoke_ai_processing_consent() $$;
revoke all on function public.revoke_ai_processing_consent(),private.revoke_ai_processing_consent() from public,anon,authenticated,service_role;
grant execute on function public.revoke_ai_processing_consent(),private.revoke_ai_processing_consent() to authenticated;

commit;
