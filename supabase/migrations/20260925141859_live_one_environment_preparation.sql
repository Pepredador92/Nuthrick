-- LIVE-1 preparation only. No credentials, Live objects, allowlist members or charges.
begin;

create function private.billing_environment() returns text language plpgsql stable set search_path='' as $$
declare env text:=coalesce(nullif(current_setting('nuthrick.billing_environment',true),''),'test');
begin
 if env not in ('test','live') then raise exception 'billing_environment_mismatch'; end if;
 return env;
end $$;
revoke all on function private.billing_environment() from public,anon,authenticated,service_role;

create table private.billing_live_configuration (
 id boolean primary key default true check(id),
 preparation_enabled boolean not null default false,
 checkout_enabled boolean not null default false,
 account_id text check(account_id ~ '^acct_[A-Za-z0-9]+$'),
 portal_configuration_id text check(portal_configuration_id ~ '^bpc_[A-Za-z0-9]+$'),
 account_verified_at timestamptz,
 webhook_verified_at timestamptz,
 webhook_reachable_at timestamptz,
 last_inspection_at timestamptz,
 last_inspection jsonb not null default '{}',
 portal_verified_at timestamptz,
 reconciliation_verified_at timestamptz,
 email_verified_at timestamptz,
 updated_at timestamptz not null default now(),
 check(not checkout_enabled or preparation_enabled)
);
insert into private.billing_live_configuration default values;
create function private.invalidate_live_verification() returns trigger language plpgsql set search_path='' as $$begin
 if new.account_id is distinct from old.account_id then
  new.account_verified_at:=null;new.webhook_verified_at:=null;new.webhook_reachable_at:=null;new.reconciliation_verified_at:=null;new.last_inspection:='{}';new.last_inspection_at:=null;new.portal_verified_at:=null;
 end if;
 if new.portal_configuration_id is distinct from old.portal_configuration_id then new.portal_verified_at:=null;end if;
 return new;
end $$;
revoke all on function private.invalidate_live_verification() from public,anon,authenticated,service_role;
create trigger invalidate_live_verification before update on private.billing_live_configuration for each row execute function private.invalidate_live_verification();
create table private.billing_live_allowlist (
 professional_id uuid primary key references public.professional_profiles(id),
 enabled boolean not null default false,
 authorized_by uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) between 8 and 500),
 created_at timestamptz not null default now()
);
create index billing_live_allowlist_authorized_by on private.billing_live_allowlist(authorized_by);
alter table private.billing_live_configuration enable row level security;
alter table private.billing_live_allowlist enable row level security;
create policy deny_direct on private.billing_live_configuration for all to anon,authenticated using(false) with check(false);
create policy deny_direct on private.billing_live_allowlist for all to anon,authenticated using(false) with check(false);
revoke all on private.billing_live_configuration,private.billing_live_allowlist from public,anon,authenticated,service_role;

alter table private.billing_customers drop constraint billing_customers_mode_check;
alter table private.billing_customers add constraint billing_customers_mode_check check(mode in ('test','live'));
alter table private.billing_customers alter column mode set default private.billing_environment();
alter table private.billing_price_mappings drop constraint billing_price_mappings_mode_check;
alter table private.billing_price_mappings add constraint billing_price_mappings_mode_check check(mode in ('test','live'));
alter table private.billing_price_mappings alter column mode set default private.billing_environment();
alter table private.billing_subscriptions drop constraint billing_subscriptions_mode_check;
alter table private.billing_subscriptions add constraint billing_subscriptions_mode_check check(mode in ('test','live'));
alter table private.billing_subscriptions alter column mode set default private.billing_environment();
alter table private.billing_payments drop constraint billing_payments_mode_check;
alter table private.billing_payments add constraint billing_payments_mode_check check(mode in ('test','live'));
alter table private.billing_payments alter column mode set default private.billing_environment();
alter table private.billing_webhook_events drop constraint billing_webhook_events_mode_check;
alter table private.billing_webhook_events add constraint billing_webhook_events_mode_check check(mode in ('test','live'));
alter table private.billing_webhook_events alter column mode set default private.billing_environment();
alter table private.billing_checkout_intents add column mode text not null default 'test' check(mode in ('test','live'));
alter table private.billing_checkout_intents alter column mode set default private.billing_environment();
alter table private.billing_operations add column mode text not null default 'test' check(mode in ('test','live'));
alter table private.billing_operations alter column mode set default private.billing_environment();
alter table private.billing_promotion_mappings add column mode text not null default 'test' check(mode in ('test','live'));
alter table private.billing_promotion_mappings alter column mode set default private.billing_environment();
alter table private.promotion_redemptions add column mode text not null default 'test' check(mode in ('test','live'));
alter table private.promotion_redemptions alter column mode set default private.billing_environment();
alter table private.promotion_campaigns add column mode text not null default 'test' check(mode in ('test','live'));
alter table private.billing_price_mappings add column provider_product_id text;
alter table private.billing_customers drop constraint billing_customers_pkey;
alter table private.billing_customers add primary key(professional_id,mode);
alter table private.billing_price_mappings add unique(id,mode);
alter table private.billing_subscriptions add unique(id,mode);
alter table private.promotion_campaigns add unique(id,mode);
alter table private.billing_checkout_intents add unique(id,mode);
drop index private.billing_one_pending_checkout;
create unique index billing_one_pending_checkout on private.billing_checkout_intents(professional_id,mode) where state in ('reserved','open');
alter table private.professional_access add column billing_mode text check(billing_mode in ('test','live'));
update private.professional_access set billing_mode='test' where source='billing';
alter table private.billing_checkout_intents add foreign key(price_mapping_id,mode) references private.billing_price_mappings(id,mode);
alter table private.billing_subscriptions add foreign key(price_mapping_id,mode) references private.billing_price_mappings(id,mode);
alter table private.billing_payments add foreign key(price_mapping_id,mode) references private.billing_price_mappings(id,mode);
alter table private.billing_promotion_mappings add foreign key(price_mapping_id,mode) references private.billing_price_mappings(id,mode);
alter table private.billing_checkout_intents add foreign key(professional_id,mode) references private.billing_customers(professional_id,mode);
alter table private.billing_subscriptions add foreign key(professional_id,mode) references private.billing_customers(professional_id,mode);
alter table private.billing_payments add foreign key(professional_id,mode) references private.billing_customers(professional_id,mode);
alter table private.billing_operations add foreign key(professional_id,mode) references private.billing_customers(professional_id,mode);
alter table private.billing_checkout_intents add foreign key(campaign_id,mode) references private.promotion_campaigns(id,mode);
alter table private.billing_subscriptions add foreign key(campaign_id,mode) references private.promotion_campaigns(id,mode);
alter table private.billing_promotion_mappings add foreign key(campaign_id,mode) references private.promotion_campaigns(id,mode);
alter table private.promotion_redemptions add foreign key(campaign_id,mode) references private.promotion_campaigns(id,mode);
alter table private.billing_payments add foreign key(subscription_id,mode) references private.billing_subscriptions(id,mode);
alter table private.promotion_redemptions add foreign key(subscription_id,mode) references private.billing_subscriptions(id,mode);
alter table private.promotion_redemptions add foreign key(checkout_id,mode) references private.billing_checkout_intents(id,mode);


create index billing_checkout_intents_price_mapping_id_env on private.billing_checkout_intents(price_mapping_id,mode);
create index billing_subscriptions_price_mapping_id_env on private.billing_subscriptions(price_mapping_id,mode);
create index billing_payments_price_mapping_id_env on private.billing_payments(price_mapping_id,mode);
create index billing_promotion_mappings_price_mapping_id_env on private.billing_promotion_mappings(price_mapping_id,mode);
create index billing_checkout_intents_professional_id_env on private.billing_checkout_intents(professional_id,mode);
create index billing_subscriptions_professional_id_env on private.billing_subscriptions(professional_id,mode);
create index billing_payments_professional_id_env on private.billing_payments(professional_id,mode);
create index billing_operations_professional_id_env on private.billing_operations(professional_id,mode);
create index billing_checkout_intents_campaign_id_env on private.billing_checkout_intents(campaign_id,mode);
create index billing_subscriptions_campaign_id_env on private.billing_subscriptions(campaign_id,mode);
create index billing_promotion_mappings_campaign_id_env on private.billing_promotion_mappings(campaign_id,mode);
create index promotion_redemptions_campaign_id_env on private.promotion_redemptions(campaign_id,mode);
create index billing_payments_subscription_id_env on private.billing_payments(subscription_id,mode);
create index promotion_redemptions_subscription_id_env on private.promotion_redemptions(subscription_id,mode);
create index promotion_redemptions_checkout_id_env on private.promotion_redemptions(checkout_id,mode);

create function private.billing_owner_environment(p_owner uuid) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.billing_live_allowlist where professional_id=p_owner and enabled)
   and (select checkout_enabled from private.billing_live_configuration where id) then 'live'
   when exists(select 1 from private.billing_subscriptions where professional_id=p_owner and mode='live') then 'live'
   else 'test' end
$$;
revoke all on function private.billing_owner_environment(uuid) from public,anon,authenticated,service_role;

create function private.billing_legal_ready() returns boolean language sql stable security definer set search_path='' as $$
 select count(*)=3 and bool_and(review_status='approved' and effective_at is not null and effective_at<=now())
 from private.legal_documents where key in ('terms','privacy','refunds')
$$;
revoke all on function private.billing_legal_ready() from public,anon,authenticated,service_role;

create function private.billing_live_guard(p_owner uuid default null,p_checkout boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if not private.billing_legal_ready() then raise exception 'live_legal_pending'; end if;
 r:=private.pre_live_evidence();
 if (r->'summary'->>'ready')::integer<>15 or (r->'summary'->>'pending')::integer<>0 or (r->'summary'->>'blocked')::integer<>0 then raise exception 'live_readiness_incomplete'; end if;
 if not (select preparation_enabled from private.billing_live_configuration where id) then raise exception 'live_preparation_disabled'; end if;
 if p_checkout then
  if not (select checkout_enabled from private.billing_live_configuration where id) then raise exception 'live_checkout_disabled'; end if;
  if not exists(select 1 from private.billing_live_allowlist where professional_id=p_owner and enabled) then raise exception 'live_account_not_allowed'; end if;
  if exists(select 1 from jsonb_array_elements(private.billing_live_readiness()->'checks') c where c->>'status'<>'ready') then raise exception 'live_readiness_incomplete'; end if;
 end if;
end $$;
revoke all on function private.billing_live_guard(uuid,boolean) from public,anon,authenticated,service_role;

create function private.billing_checkout_guard(p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.billing_environment()='live' then perform private.billing_live_guard(p_owner,true);
 elsif not (select enabled from private.billing_settings) or not exists(select 1 from private.billing_test_accounts where professional_id=p_owner) then raise exception 'test_checkout_unavailable';
 elsif exists(select 1 from private.professional_access where professional_id=p_owner and billing_mode='live') then raise exception 'billing_environment_mismatch'; end if;
end $$;
revoke all on function private.billing_checkout_guard(uuid) from public,anon,authenticated,service_role;

create or replace function private.billing_lock(p_owner uuid,p_key uuid) returns void language plpgsql security definer set search_path='' as $$ declare c private.billing_customers; begin
 if p_key is null then raise exception 'invalid_input'; end if;
 insert into private.billing_customers(professional_id) values(p_owner) on conflict do nothing;
 select * into c from private.billing_customers where mode=private.billing_environment() and professional_id=p_owner for update;
 if c.lease_until>clock_timestamp() and c.lease_key is distinct from p_key then raise exception 'billing_busy'; end if;
 update private.billing_customers set lease_key=p_key,lease_until=clock_timestamp()+interval '120 seconds' where mode=private.billing_environment() and professional_id=p_owner;
end $$;

create or replace function private.billing_require_lock(p_owner uuid,p_key uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform 1 from private.billing_customers where mode=private.billing_environment() and professional_id=p_owner and lease_key=p_key and lease_until>clock_timestamp() for update;
 if not found then raise exception 'billing_lease_expired'; end if;
 update private.billing_customers set lease_until=clock_timestamp()+interval '120 seconds' where mode=private.billing_environment() and professional_id=p_owner and lease_key=p_key;
end $$;

create or replace function private.billing_price(p_plan uuid,p_interval text) returns private.billing_price_mappings language plpgsql security definer set search_path='' as $$
declare p private.plans; m private.billing_price_mappings; amount_value bigint; fp text; begin
 select * into p from private.plans where id=p_plan and active and not internal_only;
 if p.id is null or p_interval not in ('monthly','annual') or p.currency<>'MXN' then raise exception 'plan_unavailable'; end if;
 amount_value:=round(100*case p_interval when 'monthly' then p.monthly_price else p.annual_price end);
 if amount_value is null or amount_value<=0 then raise exception 'price_not_configured'; end if;
 fp:=md5(p.id::text||':'||p_interval||':'||amount_value::text||':'||p.currency||':stripe:'||private.billing_environment());
 insert into private.billing_price_mappings(plan_id,interval,amount,currency,fingerprint) values(p.id,p_interval,amount_value,p.currency,fp) on conflict(fingerprint) do nothing;
 select * into m from private.billing_price_mappings where mode=private.billing_environment() and fingerprint=fp; return m;
end $$;

create or replace function private.billing_price_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(m)||jsonb_build_object('plan_name',p.name,'rank',p.billing_rank) from private.billing_price_mappings m join private.plans p on p.id=m.plan_id where m.id=p_id
$$;

create or replace function private.billing_apply(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(p_data->>'owner')::uuid; lock_key uuid:=(p_data->>'lock_key')::uuid; snap jsonb:=p_data->'subscription'; inv jsonb:=p_data->'invoice'; latest jsonb:=snap->'latest_invoice';
 s private.billing_subscriptions; old_s private.billing_subscriptions; m private.billing_price_mappings; intent private.billing_checkout_intents; a private.professional_access;
 state_value text; paid boolean; paid_end timestamptz; grace_end timestamptz; period_start timestamptz; period_end timestamptz; event_id text:=p_data->>'event_id'; result jsonb; allow_write boolean; begin
 perform private.billing_require_lock(owner,lock_key);
 perform 1 from public.professional_profiles where id=owner for update;
 if (select processed_at is not null from private.billing_webhook_events where mode=private.billing_environment() and provider_event_id=event_id) then return '{"replay":true}'; end if;
 if not exists(select 1 from private.billing_webhook_events where mode=private.billing_environment() and provider_event_id=event_id and professional_id=owner) then raise exception 'unclaimed_event'; end if;
 if snap->>'livemode' is distinct from (private.billing_environment()='live')::text or snap->>'customer_id' is distinct from (select provider_customer_id from private.billing_customers where mode=private.billing_environment() and professional_id=owner) then raise exception 'invalid_provider_identity'; end if;
 select * into m from private.billing_price_mappings where mode=private.billing_environment() and provider_price_id=snap->>'price_id';
 if m.id is null then raise exception 'unknown_provider_price'; end if;
 select * into s from private.billing_subscriptions where mode=private.billing_environment() and provider_subscription_id=snap->>'id' for update; old_s:=s;
 if exists(select 1 from private.billing_subscriptions where provider_subscription_id=snap->>'id' and mode<>private.billing_environment()) then raise exception 'billing_environment_mismatch'; end if;
 if s.id is not null and s.professional_id<>owner then raise exception 'invalid_provider_identity'; end if;
 select * into intent from private.billing_checkout_intents where mode=private.billing_environment() and professional_id=owner and (provider_subscription_id=snap->>'id' or (id::text=snap->>'intent_id' and state in ('open','reserved') and price_mapping_id=m.id)) order by created_at desc limit 1 for update;
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
 if not paid and s.id is not null then select * into m from private.billing_price_mappings where mode=private.billing_environment() and id=s.price_mapping_id; end if;
 select * into a from private.professional_access where professional_id=owner for update;
 allow_write:=coalesce(not coalesce(s.manual_hold,false) and (a.source='billing' or ((s.id is null or s.paid_through is null) and intent.id is not null and (a.professional_id is null or a.updated_at is not distinct from intent.access_revision))),false);
 if exists(select 1 from private.billing_subscriptions other where other.professional_id=owner and other.mode=private.billing_environment() and other.provider_subscription_id<>snap->>'id' and (other.state<>'cancelled' or other.created_at>coalesce(s.created_at,now()))) then allow_write:=false; end if;
 if private.billing_environment()='test' and a.billing_mode='live' then allow_write:=false; end if;
 if exists(select 1 from private.platform_admins where user_id=owner and enabled) or exists(select 1 from private.access_grants where professional_id=owner and grant_kind='founder' and revoked_at is null and starts_at<=now()) then allow_write:=false; end if;
 insert into private.billing_subscriptions(professional_id,provider_subscription_id,provider_customer_id,price_mapping_id,state,provider_status,period_start,period_end,credit_anchor_at,paid_through,grace_until,cancel_at_period_end,provider_schedule_id,campaign_id,campaign_snapshot,latest_invoice_id,last_provider_event_at,manual_hold)
 values(owner,snap->>'id',snap->>'customer_id',m.id,state_value,snap->>'provider_status',period_start,period_end,coalesce(s.credit_anchor_at,(snap->>'anchor')::timestamptz),paid_end,grace_end,coalesce((snap->>'cancel_at_period_end')::boolean,false),snap->>'schedule_id',intent.campaign_id,intent.campaign_snapshot,latest->>'id',(select provider_created_at from private.billing_webhook_events where mode=private.billing_environment() and provider_event_id=event_id),not allow_write)
 on conflict(provider_subscription_id) do update set price_mapping_id=excluded.price_mapping_id,state=excluded.state,provider_status=excluded.provider_status,period_start=excluded.period_start,period_end=excluded.period_end,paid_through=excluded.paid_through,grace_until=excluded.grace_until,cancel_at_period_end=excluded.cancel_at_period_end,provider_schedule_id=excluded.provider_schedule_id,latest_invoice_id=excluded.latest_invoice_id,last_provider_event_at=greatest(private.billing_subscriptions.last_provider_event_at,excluded.last_provider_event_at),updated_at=now(),pending_plan_id=case when excluded.price_mapping_id<>private.billing_subscriptions.price_mapping_id then null else private.billing_subscriptions.pending_plan_id end,pending_interval=case when excluded.price_mapping_id<>private.billing_subscriptions.price_mapping_id then null else private.billing_subscriptions.pending_interval end
 returning * into s;
 update private.billing_checkout_intents set provider_subscription_id=s.provider_subscription_id,state=case when paid or s.paid_through is not null or state_value='trial' then 'completed' when state_value='cancelled' then 'expired' else state end where mode=private.billing_environment() and id=intent.id;
 if state_value='cancelled' then
  update private.access_grants set revoked_at=now() where promotion_redemption_id in (select id from private.promotion_redemptions where subscription_id=s.id) and revoked_at is null;
  update private.professional_overrides set revoked_at=now() where promotion_redemption_id in (select id from private.promotion_redemptions where subscription_id=s.id) and revoked_at is null;
 end if;
 if allow_write and (paid or s.paid_through is not null or state_value='trial') then
  perform set_config('nuthrick.billing_apply','true',true);
  insert into private.professional_access(professional_id,plan_id,status,starts_at,ends_at,source,billing_interval,credit_anchor_at,billing_mode)
  values(owner,m.plan_id,state_value,least(s.credit_anchor_at,period_start),case when state_value='grace' then grace_end when state_value='suspended' then null else period_end end,'billing',m.interval,s.credit_anchor_at,private.billing_environment())
  on conflict(professional_id) do update set plan_id=excluded.plan_id,status=excluded.status,ends_at=excluded.ends_at,source='billing',billing_mode=excluded.billing_mode,billing_interval=excluded.billing_interval,credit_anchor_at=excluded.credit_anchor_at,updated_at=now();
  if state_value in ('active','trial') and (paid or state_value='trial') then
   update private.billing_checkout_intents set state='completed',provider_subscription_id=s.provider_subscription_id where mode=private.billing_environment() and id=intent.id;
   perform private.billing_redeem(intent,s,s.period_start);
   begin result:=private.allocate_plan_month(owner,now()); exception when others then if sqlerrm<>'unsettled_period' then raise; end if; result:='{"allocated":false,"reason":"unsettled_period"}'; end;
  end if;
 end if;
 for inv in select x from jsonb_array_elements(jsonb_build_array(inv,latest)) x where x is not null and x<>'null' loop
  if exists(select 1 from private.billing_payments where provider_invoice_id=inv->>'id' and mode<>private.billing_environment()) then raise exception 'billing_environment_mismatch'; end if;
  if inv->>'customer_id'<>s.provider_customer_id or inv->>'subscription_id'<>s.provider_subscription_id then raise exception 'invalid_provider_identity'; end if;
  insert into private.billing_payments(provider_invoice_id,professional_id,subscription_id,price_mapping_id,amount_due,amount_paid,currency,status,issued_at,paid_at,hosted_url)
  values(inv->>'id',owner,s.id,coalesce((select id from private.billing_price_mappings where mode=private.billing_environment() and provider_price_id=inv->>'price_id'),s.price_mapping_id),(inv->>'amount_due')::bigint,(inv->>'amount_paid')::bigint,inv->>'currency',inv->>'status',(inv->>'created')::timestamptz,(inv->>'paid_at')::timestamptz,inv->>'hosted_url')
  on conflict(provider_invoice_id) do update set amount_paid=greatest(private.billing_payments.amount_paid,excluded.amount_paid),status=case when private.billing_payments.status='paid' then 'paid' else excluded.status end,paid_at=coalesce(private.billing_payments.paid_at,excluded.paid_at),hosted_url=excluded.hosted_url,updated_at=now();
 end loop;
 if old_s.id is null or (old_s.state,old_s.price_mapping_id,old_s.paid_through,old_s.cancel_at_period_end) is distinct from (s.state,s.price_mapping_id,s.paid_through,s.cancel_at_period_end) then
  perform private.billing_audit('billing_subscription_synced',owner,s.id,jsonb_build_object('state',s.state,'price_mapping_id',m.id,'paid_through',s.paid_through,'event_id',event_id,'manual_hold',s.manual_hold));
 end if;
 update private.billing_webhook_events set processed_at=now(),last_error=null where mode=private.billing_environment() and provider_event_id=event_id;
 update private.billing_customers set lease_key=null,lease_until=null where mode=private.billing_environment() and professional_id=owner and lease_key=lock_key;
 return jsonb_build_object('processed',true,'state',s.state,'manual_hold',s.manual_hold,'allocation',result);
end $$;

create or replace function private.billing_subscription_server(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(p_data->>'owner')::uuid; lk uuid:=(p_data->>'lock_key')::uuid; op uuid:=(p_data->>'operation_key')::uuid;
 c private.billing_customers; i private.billing_checkout_intents; promo private.promotion_campaigns; m private.billing_price_mappings; s private.billing_subscriptions;
 operation private.billing_operations; ev private.billing_webhook_events; actor uuid:=(p_data->>'actor')::uuid; result jsonb; request_data jsonb; action_value text; begin
 if p_action='authorize_admin' then
  if actor is null or not exists(select 1 from private.platform_admins where user_id=actor and enabled) then raise exception 'admin_required' using errcode='42501'; end if;
  return '{"authorized":true}';
 elsif p_action='claim_event' then
  if p_data->>'livemode' is distinct from (private.billing_environment()='live')::text then raise exception 'live_mode_forbidden'; end if;
  select professional_id into owner from private.billing_customers where mode=private.billing_environment() and provider_customer_id=p_data->>'customer_id';
  if owner is null then return '{"ignored":true}'; end if;
  perform private.billing_lock(owner,lk);
  insert into private.billing_webhook_events(provider_event_id,event_type,provider_created_at,professional_id)
   values(p_data->>'event_id',p_data->>'type',to_timestamp((p_data->>'created')::double precision),owner) on conflict do nothing;
  select * into ev from private.billing_webhook_events where mode=private.billing_environment() and provider_event_id=p_data->>'event_id' for update;
  if exists(select 1 from private.billing_webhook_events where provider_event_id=p_data->>'event_id' and mode<>private.billing_environment()) then raise exception 'billing_environment_mismatch'; end if;
  if ev.professional_id<>owner or ev.event_type<>p_data->>'type' then raise exception 'invalid_provider_identity'; end if;
  if ev.processed_at is not null then
   update private.billing_customers set lease_key=null,lease_until=null where mode=private.billing_environment() and professional_id=owner and lease_key=lk;
   return '{"replay":true}'; end if;
  update private.billing_webhook_events set attempts=attempts+1 where mode=private.billing_environment() and provider_event_id=ev.provider_event_id;
  select * into i from private.billing_checkout_intents where mode=private.billing_environment() and professional_id=owner and (provider_session_id=p_data->>'checkout_id' or provider_subscription_id=p_data->>'subscription_id' or state in ('reserved','open')) order by created_at desc limit 1;
  return jsonb_build_object('owner',owner,'intent',to_jsonb(i),'managed_subscription',exists(select 1 from private.billing_subscriptions where mode=private.billing_environment() and professional_id=owner and provider_subscription_id=p_data->>'subscription_id'));
 elsif p_action='lock' then
  perform private.billing_lock(owner,lk); return jsonb_build_object('locked',true);
 end if;
 perform private.billing_require_lock(owner,lk);
 select * into c from private.billing_customers where mode=private.billing_environment() and professional_id=owner;
 if p_action='unlock' then
  update private.billing_customers set lease_key=null,lease_until=null where mode=private.billing_environment() and professional_id=owner and lease_key=lk;
  return '{"unlocked":true}';
 elsif p_action='apply' then return private.billing_apply(p_data);
 elsif p_action='event_failed' then
  if coalesce(p_data->>'code','') !~ '^[a-z_]{1,64}$' then raise exception 'invalid_input'; end if;
  update private.billing_webhook_events set last_error=p_data->>'code' where mode=private.billing_environment() and provider_event_id=p_data->>'event_id' and professional_id=owner and processed_at is null;
  return '{"retryable":true}';
 elsif p_action='event_done' then
  if p_data->>'checkout_state'='expired' then
   update private.billing_checkout_intents set state='expired' where mode=private.billing_environment() and professional_id=owner and provider_session_id=p_data->>'checkout_id' and state in ('reserved','open');
  end if;
  update private.billing_webhook_events set processed_at=now(),last_error=null where mode=private.billing_environment() and provider_event_id=p_data->>'event_id' and professional_id=owner;
  update private.billing_customers set lease_key=null,lease_until=null where mode=private.billing_environment() and professional_id=owner and lease_key=lk;
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
  select * into i from private.billing_checkout_intents where mode=private.billing_environment() and professional_id=owner and state in ('reserved','open');
  select * into s from private.billing_subscriptions where mode=private.billing_environment() and professional_id=owner order by created_at desc limit 1;
  return jsonb_build_object('customer',to_jsonb(c)-'lease_key'-'lease_until','intent',to_jsonb(i),'subscription',to_jsonb(s),'price',private.billing_price_json(s.price_mapping_id));
 elsif p_action='preview' or p_action='prepare_checkout' then
  perform private.billing_checkout_guard(owner);
 if exists(select 1 from private.platform_admins where user_id=owner and enabled) or exists(select 1 from private.access_grants where professional_id=owner and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now())) or exists(select 1 from private.professional_access a join private.plans p on p.id=a.plan_id where a.professional_id=owner and p.internal_only and a.source<>'legacy' and a.status in ('active','trial') and (a.ends_at is null or a.ends_at>now())) then raise exception 'internal_access_protected'; end if;
  m:=private.billing_price((p_data->>'plan_id')::uuid,p_data->>'interval');
  select * into i from private.billing_checkout_intents where mode=private.billing_environment() and professional_id=owner and state in ('reserved','open') for update;
  if coalesce(btrim(p_data->>'code'),'')<>'' then
   select * into promo from private.promotion_campaigns where mode=private.billing_environment() and code=upper(btrim(p_data->>'code')) for update;
   perform private.promotion_eligible(owner,promo,m.plan_id,m.interval,i.id);
  end if;
  if p_action='preview' then return jsonb_build_object('price',private.billing_price_json(m.id),'campaign',case when promo.id is not null then jsonb_build_object('name',promo.name,'code',promo.code,'benefits',promo.benefits,'fallback',promo.fallback) else null end); end if;
  if i.id is not null and (i.price_mapping_id<>m.id or i.campaign_id is distinct from promo.id) then raise exception 'checkout_pending'; end if;
  if i.id is null then
   if op is null then raise exception 'invalid_input'; end if;
   if exists(select 1 from private.billing_checkout_intents where mode=private.billing_environment() and id=op) then raise exception 'operation_already_used'; end if;
   if exists(select 1 from private.billing_subscriptions where mode=private.billing_environment() and professional_id=owner and state<>'cancelled') then raise exception 'subscription_exists'; end if;
   insert into private.billing_checkout_intents(id,professional_id,price_mapping_id,campaign_id,campaign_snapshot,access_revision,expires_at)
   values(op,owner,m.id,promo.id,case when promo.id is not null then to_jsonb(promo) else null end,(select updated_at from private.professional_access where professional_id=owner),now()+interval '35 minutes') returning * into i;
  end if;
  return jsonb_build_object('intent',to_jsonb(i),'price',private.billing_price_json(m.id),'customer_id',c.provider_customer_id);
 elsif p_action='customer_saved' then
  if c.provider_customer_id is not null and c.provider_customer_id<>p_data->>'customer_id' then raise exception 'customer_mapping_mismatch'; end if;
  update private.billing_customers set provider_customer_id=p_data->>'customer_id' where mode=private.billing_environment() and professional_id=owner;
  return '{"saved":true}';
 elsif p_action='price_saved' then
  select * into m from private.billing_price_mappings where mode=private.billing_environment() and id=(p_data->>'price_mapping_id')::uuid for update;
  if m.id is null or (m.provider_price_id is not null and m.provider_price_id<>p_data->>'price_id') then raise exception 'price_mapping_mismatch'; end if;
  update private.billing_price_mappings set provider_price_id=p_data->>'price_id',provider_product_id=coalesce(p_data->>'product_id',provider_product_id) where mode=private.billing_environment() and id=m.id;
  return '{"saved":true}';
 elsif p_action='promotion_saved' then
  select * into i from private.billing_checkout_intents where mode=private.billing_environment() and id=(p_data->>'intent_id')::uuid and professional_id=owner;
  if i.campaign_id is null then raise exception 'unknown_checkout'; end if;
  insert into private.billing_promotion_mappings(campaign_id,version,price_mapping_id,provider_coupon_id,end_at) values(i.campaign_id,(i.campaign_snapshot->>'version')::integer,i.price_mapping_id,p_data->>'coupon_id',(p_data->>'end_at')::timestamptz) on conflict do nothing;
  return '{"saved":true}';
 elsif p_action='checkout_saved' then
  update private.billing_checkout_intents set provider_session_id=p_data->>'session_id',url=p_data->>'url',state='open',expires_at=to_timestamp((p_data->>'expires_at')::double precision)
  where mode=private.billing_environment() and id=(p_data->>'intent_id')::uuid and professional_id=owner and state in ('reserved','open') and (provider_session_id is null or provider_session_id=p_data->>'session_id') returning * into i;
  if i.id is null then raise exception 'unknown_checkout'; end if;
  return jsonb_build_object('url',i.url,'id',i.id);
 elsif p_action='checkout_expired' then
  update private.billing_checkout_intents set state='expired' where mode=private.billing_environment() and id=(p_data->>'intent_id')::uuid and professional_id=owner and state in ('reserved','open');
  return '{"expired":true}';
 elsif p_action='prepare_operation' then
  action_value:=p_data->>'action'; request_data:=coalesce(p_data->'request','{}');
  if op is null or action_value not in ('portal','change','cancel','resume','cancel_now') then raise exception 'invalid_input'; end if;
  if action_value='cancel_now' then
   if actor is null or not exists(select 1 from private.platform_admins where user_id=actor and enabled) then raise exception 'admin_required' using errcode='42501'; end if;
   if request_data->>'confirmation' is distinct from 'CANCELAR AHORA' or length(btrim(coalesce(request_data->>'reason','')))<8 or length(request_data->>'reason')>500 then raise exception 'confirmation_required'; end if;
  elsif actor is distinct from owner then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into operation from private.billing_operations where mode=private.billing_environment() and operation_key=op for update;
  if operation.operation_key is not null then
   if operation.professional_id<>owner or operation.action<>action_value or operation.request<>request_data then raise exception 'operation_mismatch'; end if;
   if operation.result is not null then return jsonb_build_object('replay',true,'result',operation.result); end if;
  else insert into private.billing_operations(operation_key,professional_id,action,request) values(op,owner,action_value,request_data); end if;
  select * into s from private.billing_subscriptions where mode=private.billing_environment() and professional_id=owner order by created_at desc limit 1 for update;
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
  select * into operation from private.billing_operations where mode=private.billing_environment() and operation_key=op and professional_id=owner for update;
  if operation.operation_key is null then raise exception 'unknown_operation'; end if;
  if operation.result is not null then return operation.result; end if;
  result:=p_data->'result';
  update private.billing_operations set result=(p_data->'result')||jsonb_build_object('saved',true) where mode=private.billing_environment() and operation_key=op;
  if operation.action='change' then
   update private.billing_subscriptions set pending_plan_id=(operation.request->>'plan_id')::uuid,pending_interval=operation.request->>'interval',provider_schedule_id=result->>'schedule_id',updated_at=now() where mode=private.billing_environment() and professional_id=owner and state<>'cancelled';
  elsif operation.action in ('cancel','cancel_now') then
   update private.billing_subscriptions set pending_plan_id=null,pending_interval=null,updated_at=now() where mode=private.billing_environment() and professional_id=owner and state<>'cancelled';
  end if;
  perform private.billing_audit('billing_'||operation.action||'_requested',owner,null,jsonb_build_object('operation_key',op,'request',operation.request-'confirmation','result',result),case when operation.action='cancel_now' then actor else null end,operation.request->>'reason');
  return result;
 else raise exception 'invalid_action'; end if;
end $$;

create or replace function private.apply_credit_payment(p_owner uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  or s->>'customer_id' is distinct from (select provider_customer_id from private.billing_customers where mode='test' and professional_id=p_owner)
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
 update private.billing_customers set lease_key=null,lease_until=null where mode='test' and professional_id=p_owner and lease_key=(p_data->>'lock_key')::uuid;
 return jsonb_build_object('processed',true,'status',next_status,'credited',first_grant);
end $$;

create or replace function private.credit_billing_server(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   if p_action='credit_prepare' then return jsonb_build_object('purchase',to_jsonb(p),'price',(select to_jsonb(x) from private.ai_credit_price_mappings x where id=p.price_mapping_id),'customer_id',(select provider_customer_id from private.billing_customers where mode='test' and professional_id=owner)); end if;
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
  return jsonb_build_object('purchase',to_jsonb(p),'price',to_jsonb(m),'customer_id',(select provider_customer_id from private.billing_customers where mode='test' and professional_id=owner));
 elsif p_action='credit_context' then
  select * into p from private.ai_credit_purchases where professional_id=owner and closed_at is null;
  return jsonb_build_object('purchase',to_jsonb(p),'customer_id',(select provider_customer_id from private.billing_customers where mode='test' and professional_id=owner));
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

create or replace function private.promotion_common_eligible(p_owner uuid,p_campaign private.promotion_campaigns,p_ignore uuid) returns void language plpgsql security definer set search_path='' as $$
declare used integer; begin
 if p_campaign.mode is distinct from private.billing_environment() then raise exception 'billing_environment_mismatch'; end if;
 if p_campaign.id is null or not p_campaign.active then raise exception 'promotion_unavailable'; end if;
 if p_campaign.starts_at>now() or p_campaign.ends_at<=now() or exists(select 1 from jsonb_array_elements(p_campaign.benefits) b where b->'duration'->>'kind'='until' and (b->'duration'->>'until')::timestamptz<=now()) then raise exception 'promotion_expired'; end if;
 if p_campaign.new_customers_only and (exists(select 1 from private.billing_subscriptions where mode=private.billing_environment() and professional_id=p_owner and paid_through is not null) or exists(select 1 from private.ai_credit_purchases where mode=private.billing_environment() and professional_id=p_owner and credited_at is not null)) then raise exception 'promotion_new_customers_only'; end if;
 select count(*) into used from (
  select professional_id,id from private.billing_checkout_intents where mode=private.billing_environment() and campaign_id=p_campaign.id and state<>'expired'
  union all select professional_id,id from private.ai_credit_purchases where mode=private.billing_environment() and campaign_id=p_campaign.id and status<>'cancelled'
 ) x where id is distinct from p_ignore;
 if p_campaign.max_redemptions is not null and used>=p_campaign.max_redemptions then raise exception 'promotion_limit_reached'; end if;
 select count(*) into used from (
  select professional_id,id from private.billing_checkout_intents where mode=private.billing_environment() and campaign_id=p_campaign.id and state<>'expired'
  union all select professional_id,id from private.ai_credit_purchases where mode=private.billing_environment() and campaign_id=p_campaign.id and status<>'cancelled'
 ) x where professional_id=p_owner and id is distinct from p_ignore;
 if used>=p_campaign.max_per_professional then raise exception 'promotion_already_used'; end if;
end $$;

create or replace function private.billing_audit(p_action text,p_owner uuid,p_entity uuid,p_metadata jsonb,p_actor uuid default null,p_reason text default null) returns void language sql security definer set search_path='' as $$
 insert into private.admin_audit(action,entity,entity_id,actor_admin,actor_user,target_professional,reason,metadata)
 values(p_action,'billing',p_entity::text,p_actor,case when p_actor is null then p_owner else null end,p_owner,p_reason,coalesce(p_metadata,'{}')||jsonb_build_object('mode',private.billing_environment()))
$$;

create or replace function private.billing_tick(p_at timestamptz default now()) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.billing_subscriptions; allocations integer:=0; suspensions integer:=0; r jsonb; begin
 for s in select * from private.billing_subscriptions where not manual_hold and state in ('active','trial','grace') order by professional_id loop
  perform 1 from public.professional_profiles where id=s.professional_id for update;
  select * into s from private.billing_subscriptions where id=s.id and not manual_hold and state in ('active','trial','grace') for update;
  if s.id is null then continue; end if;
  perform set_config('nuthrick.billing_environment',s.mode,true);
  if not exists(select 1 from private.professional_access where professional_id=s.professional_id and source='billing' and billing_mode=s.mode) then continue; end if;
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

create function private.billing_provider_credentials_for(p_environment text) returns jsonb language plpgsql security definer set search_path='' as $$
declare credentials jsonb;
begin
 if p_environment='test' then return private.billing_provider_credentials(); end if;
 if p_environment is distinct from 'live' then raise exception 'billing_environment_mismatch'; end if;
 perform private.billing_live_guard();
 select decrypted_secret::jsonb into credentials from vault.decrypted_secrets where name='nuthrick_billing_stripe_live';
 if credentials->>'mode' is distinct from 'live'
 or coalesce(credentials->>'secret_key','') !~ '^sk_live_[A-Za-z0-9]+$'
 or coalesce(credentials->>'webhook_secret','') !~ '^whsec_[A-Za-z0-9]+$'
 or credentials->>'account_id' is distinct from (select account_id from private.billing_live_configuration where id)
 or coalesce(credentials->>'account_id','') !~ '^acct_[A-Za-z0-9]+$'
 or (credentials ? 'publishable_key' and credentials->>'publishable_key' !~ '^pk_live_[A-Za-z0-9]+$') then raise exception 'billing_not_configured'; end if;
 return credentials||jsonb_build_object('portal_configuration_id',(select portal_configuration_id from private.billing_live_configuration where id));
end $$;
create function public.billing_provider_credentials_for(p_environment text) returns jsonb language sql security invoker set search_path='' as $$select private.billing_provider_credentials_for(p_environment)$$;
revoke all on function private.billing_provider_credentials_for(text),public.billing_provider_credentials_for(text) from public,anon,authenticated,service_role;
grant execute on function private.billing_provider_credentials_for(text),public.billing_provider_credentials_for(text) to service_role;

create or replace function private.billing_server(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; purchase private.ai_credit_purchases; env text:=coalesce(p_data->>'environment','test'); owner uuid:=(p_data->>'owner')::uuid;
begin
 if p_action='environment' then
  if owner is null then raise exception 'unauthorized'; end if;
  if p_data->>'requested_environment' is not null then
   if p_data->>'action' not in ('sync_prices','inspect_live') or not exists(select 1 from private.platform_admins where user_id=owner and enabled) then raise exception 'admin_required'; end if;
   if p_data->>'requested_environment' not in ('test','live') then raise exception 'billing_environment_mismatch'; end if;
   if p_data->>'requested_environment'='live' then perform private.billing_live_guard(); end if;
   return jsonb_build_object('mode',p_data->>'requested_environment');
  end if;
  return jsonb_build_object('mode',case when left(coalesce(p_data->>'action',''),7)='credit_' then 'test' else private.billing_owner_environment(owner) end);
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
  if env<>'test' then raise exception 'live_credit_purchases_disabled'; end if;
  if exists(select 1 from private.professional_access where professional_id=owner and billing_mode='live') then raise exception 'billing_environment_mismatch'; end if;
  return private.credit_billing_server(p_action,p_data);
 end if;
 if p_action='claim_event' and env='test' and exists(select 1 from private.billing_customers c join private.professional_access a on a.professional_id=c.professional_id where c.mode='test' and c.provider_customer_id=p_data->>'customer_id' and a.billing_mode='live') then return '{"ignored":true}'; end if;
 result:=private.billing_subscription_server(p_action,p_data);
 if p_action='claim_event' and env='test' and result->>'owner' is not null and not coalesce((result->>'replay')::boolean,false) then
  select * into purchase from private.ai_credit_purchases where mode='test' and professional_id=(result->>'owner')::uuid and
   (provider_checkout_id=p_data->>'checkout_id' or provider_payment_id=p_data->>'payment_id' or (provider_checkout_id is null and id::text=p_data->>'credit_reference')) order by created_at desc limit 1;
  result:=result||jsonb_build_object('credit_purchase',to_jsonb(purchase));
 end if;
 return result;
end $$;

-- The same resolver/allocator only observes the environment that owns access.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.resolve_effective_entitlements(uuid)'::regprocedure);
 if position('from private.billing_subscriptions where professional_id=p_owner' in definition)=0 then raise exception 'billing_environment_patch_missing'; end if;
 definition:=replace(definition,'from private.billing_subscriptions where professional_id=p_owner','from private.billing_subscriptions where mode=coalesce(a.billing_mode,''test'') and professional_id=p_owner');
 execute definition;
 definition:=pg_get_functiondef('private.allocate_plan_month(uuid,timestamptz)'::regprocedure);
 if position('from private.billing_subscriptions where professional_id=p_owner' in definition)=0 then raise exception 'billing_environment_patch_missing'; end if;
 definition:=replace(definition,'from private.billing_subscriptions where professional_id=p_owner','from private.billing_subscriptions where mode=coalesce(a.billing_mode,''test'') and professional_id=p_owner');
 execute definition;
end $$;

-- Replace the PRE-LIVE summary with evidence-backed operational checks.
-- Legal intentionally remains pending until an authorized human approves it.
create or replace function private.pre_live_evidence()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  credentials jsonb := '{}'::jsonb;
  credentials_ok boolean := false;
  openai_enabled boolean := false;
  promotions_ready boolean := false;
  jobs_ready boolean := false;
  email_ready boolean := false;
  support_ready boolean := false;
  legal_ready boolean := false;
  checks jsonb;
begin
  begin
    credentials := private.billing_provider_credentials();
    credentials_ok := credentials->>'mode' = 'test'
      and credentials->>'secret_key' ~ '^sk_test_[A-Za-z0-9]+$'
      and credentials->>'account_id' ~ '^acct_[A-Za-z0-9]+$';
  exception when others then
    credentials_ok := false;
  end;

  select exists(select 1 from private.ai_feature_config where enabled) into openai_enabled;

  promotions_ready :=
    exists(select 1 from private.promotion_campaigns c
      where c.active and c.target='subscription' and c.starts_at<=now()
        and (c.ends_at is null or c.ends_at>now()) and c.fallback='normal_plan'
        and cardinality(c.eligible_plan_ids)>0)
    and exists(select 1 from private.pre_live_operational_evidence where key='promotion_engine_test');

  jobs_ready :=
    exists(select 1 from jsonb_array_elements(private.operations_jobs()) j where j->>'jobname'='nuthrick-billing-monthly-and-grace' and (j->>'active')::boolean and j->>'last_status'='succeeded')
    and exists(select 1 from jsonb_array_elements(private.operations_jobs()) j where j->>'jobname'='nuthrick-transactional-email-outbox' and (j->>'active')::boolean and j->>'last_status'='succeeded')
    and to_regprocedure('private.billing_job_entrypoint()') is not null
    and to_regprocedure('private.email_job_entrypoint()') is not null;

  email_ready :=
    (select s.enabled and s.mode='test' and s.provider='test' from private.transactional_email_settings s where s.id)
    and (select count(*)>=15 from private.transactional_email_templates where active)
    and (select d.last_status='passed' and d.last_test_at is not null from private.transactional_email_delivery_checks d where d.id)
    and not exists(select 1 from private.transactional_email_outbox where mode='test' and status='failed');

  support_ready :=
    (select s.enabled and s.channel in ('email','form') and length(btrim(s.support_email))>=5 from private.support_settings s where s.id)
    and to_regprocedure('private.operations_overview()') is not null
    and to_regprocedure('private.operations_admin_api(text,jsonb)') is not null
    and exists(select 1 from private.pre_live_operational_evidence where key='support_operational_test');

  legal_ready := private.billing_legal_ready();

  checks := jsonb_build_array(
    jsonb_build_object('key','stripe_mode','label','Configuración TEST conservada','status',case when (select mode='test' and provider='stripe' from private.billing_settings where id) then 'ready' else 'blocked' end,'detail',case when (select mode='test' and provider='stripe' from private.billing_settings where id) then 'El entorno TEST conserva su configuración; Live dispone de controles y autorización independientes.' else 'La configuración no está limitada a Stripe Test.' end),
    jsonb_build_object('key','stripe_credentials','label','Credenciales Stripe Test en Vault','status',case when credentials_ok then 'ready' else 'blocked' end,'detail',case when credentials_ok then 'Credenciales verificadas sin exponer secretos.' else 'No se encontró una configuración Test válida.' end),
    jsonb_build_object('key','webhook','label','Webhook firmado','status',case when credentials->>'webhook_secret' ~ '^whsec_[A-Za-z0-9]+$' then 'ready' else 'blocked' end,'detail',case when credentials->>'webhook_secret' ~ '^whsec_[A-Za-z0-9]+$' then 'Secret de webhook disponible solo para el servidor.' else 'Falta el secret de webhook Test.' end),
    jsonb_build_object('key','live_separation','label','Separación TEST / LIVE','status',case when not exists(select 1 from private.billing_price_mappings where mode not in ('test','live')) and not exists(select 1 from private.ai_credit_price_mappings where mode not in ('test','live')) then 'ready' else 'blocked' end,'detail','Los mappings identifican TEST o LIVE y sus relaciones impiden mezclar entornos.'),
    jsonb_build_object('key','commercial_plans','label','Planes comerciales','status',case when (select count(*) from private.plans where active and not internal_only)=2 and (select count(*) from private.plans where code='esencial' and monthly_price=349 and annual_price=3490 and currency='MXN')=1 and (select count(*) from private.plans where code='profesional' and monthly_price=499 and annual_price=4990 and currency='MXN')=1 then 'ready' else 'blocked' end,'detail','Esencial $349/$3,490 MXN y Profesional $499/$4,990 MXN.'),
    jsonb_build_object('key','credit_packages','label','Paquetes de recarga','status',case when exists(select 1 from private.ai_credit_packages where active and not internal_only and test_only) then 'ready' else 'pending' end,'detail','Los paquetes activos permanecen identificados como TEST hasta aprobar precios comerciales.'),
    jsonb_build_object('key','promotions','label','Promociones','status',case when promotions_ready then 'ready' else 'pending' end,'detail',case when promotions_ready then 'Plantillas TEST privadas, fallback a precio normal y atribución disponibles en Admin → Promociones.' else 'Falta una campaña TEST válida o evidencia del recorrido de redención.' end),
    jsonb_build_object('key','beta_access','label','Beta / BETA5','status',case when exists(select 1 from private.access_codes where active and exists(select 1 from private.plans p where p.id=access_codes.plan_id and p.code='beta')) then 'ready' else 'pending' end,'detail','El canje concede 90 días configurados y cero créditos IA; la fecha se muestra al profesional.'),
    jsonb_build_object('key','renewal_job','label','Renovaciones y gracia','status',case when jobs_ready then 'ready' else 'pending' end,'detail',case when jobs_ready then 'pg_cron mantiene billing y outbox TEST activos; el último run exitoso se ve en Operaciones.' else 'Confirma jobs, último run e idempotencia en Operaciones.' end),
    jsonb_build_object('key','openai','label','OpenAI deshabilitado','status',case when openai_enabled then 'blocked' else 'ready' end,'detail',case when openai_enabled then 'Hay una configuración IA habilitada.' else 'No hay features IA reales habilitadas; las pruebas usan mocks.' end),
    jsonb_build_object('key','receipts','label','Recibos / invoices','status',case when exists(select 1 from private.billing_payments where hosted_url is not null) then 'ready' else 'pending' end,'detail','Los recibos disponibles se abren mediante URLs HTTPS de Stripe; CFDI queda fuera de PRE-LIVE.'),
    jsonb_build_object('key','transactional_email','label','Emails transaccionales','status',case when email_ready then 'ready' else 'pending' end,'detail',case when email_ready then '15 plantillas, outbox TEST, idempotencia y entrega sintética verificadas; no se enviaron correos reales.' else 'Falta proveedor TEST, plantillas, prueba de entrega o hay fallos en el outbox.' end),
    jsonb_build_object('key','legal','label','Términos, privacidad y reembolsos','status',case when legal_ready then 'ready' else 'pending' end,'detail',case when legal_ready then 'Versiones aprobadas y registro de aceptación disponible.' else 'Infraestructura versionada lista; la aprobación humana/legal sigue pendiente.' end),
    jsonb_build_object('key','support_monitoring','label','Soporte y monitoring','status',case when support_ready then 'ready' else 'pending' end,'detail',case when support_ready then 'Canal, vista Operaciones, runbook y acciones auditadas disponibles sin abrir datos clínicos.' else 'Falta canal, vista o evidencia operativa.' end),
    jsonb_build_object('key','test_evidence','label','Evidencia de pagos Test','status',case when exists(select 1 from private.billing_webhook_events where mode='test' and processed_at is not null) then 'ready' else 'pending' end,'detail',jsonb_build_object('webhooks_processed',(select count(*) from private.billing_webhook_events where mode='test' and processed_at is not null),'test_accounts',(select count(*) from private.billing_test_accounts),'subscriptions',(select count(*) from private.billing_subscriptions where mode='test'),'credit_purchases',(select count(*) from private.ai_credit_purchases where mode='test')))
  );

  return jsonb_build_object(
    'generated_at',now(),
    'mode',(select mode from private.billing_settings where id),
    'live_enabled',(select checkout_enabled from private.billing_live_configuration where id),
    'openai_enabled',openai_enabled,
    'checks',checks,
    'operations',private.operations_overview(),
    'live_payments',(select count(*) from private.billing_payments where mode='live' and status='paid'),
    'summary',jsonb_build_object('ready',(select count(*) from jsonb_array_elements(checks) x where x->>'status'='ready'),'pending',(select count(*) from jsonb_array_elements(checks) x where x->>'status'='pending'),'blocked',(select count(*) from jsonb_array_elements(checks) x where x->>'status'='blocked'))
  );
end $$;

revoke all on function private.pre_live_evidence() from public,anon,authenticated,service_role;
create or replace function private.pre_live_readiness() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_platform_admin();
 return private.pre_live_evidence()||jsonb_build_object('live',private.billing_live_readiness());
end $$;

alter table private.transactional_email_outbox add column mode text not null default 'test' check(mode in ('test','live'));
create index transactional_email_environment_status on private.transactional_email_outbox(mode,status,created_at);

create function private.billing_environment_overview(p_environment text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_environment not in ('test','live') then raise exception 'billing_environment_mismatch'; end if;
 return jsonb_build_object('mode',p_environment,
 'customers',(select count(*) from private.billing_customers where mode=p_environment and provider_customer_id is not null),
 'subscriptions',(select count(*) from private.billing_subscriptions where mode=p_environment),
 'operations_unresolved',(select count(*) from private.billing_operations where mode=p_environment and result is null and created_at<now()-interval '2 minutes'),
 'payments',(select count(*) from private.billing_payments where mode=p_environment),
 'subscription_mismatches',case when p_environment='live' then (select jsonb_array_length(last_inspection->'mismatches') from private.billing_live_configuration where id) else null end,
 'reconciliation_checked_at',case when p_environment='live' then (select last_inspection_at from private.billing_live_configuration where id) else null end,
 'issues',jsonb_build_object(
  'payments',coalesce((select jsonb_agg(to_jsonb(x)) from(select provider_invoice_id as id,professional_id,status,issued_at from private.billing_payments where mode=p_environment and status not in ('paid','void') order by issued_at desc limit 20)x),'[]'),
  'webhooks',coalesce((select jsonb_agg(to_jsonb(x)) from(select provider_event_id,last_error from private.billing_webhook_events where mode=p_environment and last_error is not null order by created_at desc limit 20)x),'[]'),
  'emails',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,template_key,last_error from private.transactional_email_outbox where mode=p_environment and status='failed' order by created_at desc limit 20)x),'[]'),
  'subscriptions',case when p_environment='live' then (select coalesce(last_inspection->'mismatches','[]') from private.billing_live_configuration where id) else '[]'::jsonb end),
 'paid_payments',(select count(*) from private.billing_payments where mode=p_environment and status='paid'),
 'payment_attention',(select count(*) from private.billing_subscriptions where mode=p_environment and state in ('grace','suspended')),
 'webhooks_pending',(select count(*) from private.billing_webhook_events where mode=p_environment and processed_at is null),
 'webhooks_failed',(select count(*) from private.billing_webhook_events where mode=p_environment and last_error is not null),
 'emails_pending',(select count(*) from private.transactional_email_outbox where mode=p_environment and status='pending'),
 'emails_failed',(select count(*) from private.transactional_email_outbox where mode=p_environment and status='failed'));
end $$;
revoke all on function private.billing_environment_overview(text) from public,anon,authenticated,service_role;

create function private.billing_live_readiness() returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.billing_live_configuration; checks jsonb; credentials_present boolean; counts jsonb;
begin
 select * into c from private.billing_live_configuration where id;
 begin
  select exists(select 1 from vault.secrets where name='nuthrick_billing_stripe_live') into credentials_present;
 exception when undefined_table or invalid_schema_name then credentials_present:=false; end;
 counts:=private.billing_environment_overview('live');
 checks:=jsonb_build_array(
  jsonb_build_object('key','live_legal','label','Aprobación legal humana','status',case when private.billing_legal_ready() then 'ready' else 'blocked' end,'detail','Términos, privacidad y reembolsos deben tener versión aprobada y fecha efectiva vigente.'),
  jsonb_build_object('key','live_provider','label','Cuenta y credenciales Live verificadas','status',case when credentials_present and c.account_id is not null and c.account_verified_at>now()-interval '24 hours' then 'ready' else 'pending' end,'detail','Se requiere una verificación del servidor contra la cuenta Live de Nuthrick. Presencia de un secreto no equivale a validación.'),
  jsonb_build_object('key','live_prices','label','Precios Live conforme a Admin','status',case when c.last_inspection_at>now()-interval '24 hours' and c.last_inspection->>'prices_verified'='true' and (select count(*)=2 from private.plans where active and not internal_only) and not exists(select 1 from private.plans p cross join(values('monthly'),('annual'))i(interval) where p.active and not p.internal_only and not exists(select 1 from private.billing_price_mappings m where m.mode='live' and m.plan_id=p.id and m.interval=i.interval and m.amount=round(100*case i.interval when 'monthly' then p.monthly_price else p.annual_price end) and m.currency=p.currency and m.provider_price_id is not null and m.provider_product_id is not null and c.last_inspection->'price_mapping_ids' ? m.id::text)) then 'ready' else 'pending' end,'detail','Los cuatro precios se verifican contra la configuración comercial vigente; no se copian IDs TEST.'),
  jsonb_build_object('key','live_webhook','label','Webhook Live alcanzable y firma verificada','status',case when c.webhook_verified_at is not null and c.webhook_reachable_at>now()-interval '24 hours' then 'ready' else 'pending' end,'detail','La evidencia debe proceder de un evento Live firmado; una respuesta HTTP por sí sola no basta.'),
  jsonb_build_object('key','live_portal','label','Customer Portal Live revisado','status',case when c.portal_configuration_id is not null and c.portal_verified_at>now()-interval '24 hours' then 'ready' else 'pending' end,'detail','Método de pago, facturas, datos comerciales y cancelación al finalizar el período; cambios de plan deshabilitados en el portal.'),
  jsonb_build_object('key','live_reconciliation','label','Conciliación con Stripe Live','status',case when c.reconciliation_verified_at>now()-interval '24 hours' then 'ready' else 'pending' end,'detail','Se requiere una lectura del proveedor Live y comparación con los mappings locales.'),
  jsonb_build_object('key','live_operations','label','Operaciones Live sin fallos','status',case when (counts->>'operations_unresolved')::integer=0 and (counts->>'webhooks_failed')::integer=0 and (counts->>'emails_failed')::integer=0 and coalesce((counts->>'subscription_mismatches')::integer,0)=0 then 'ready' else 'blocked' end,'detail',counts),
  jsonb_build_object('key','live_monitoring','label','Monitoring y jobs activos','status',case when exists(select 1 from jsonb_array_elements(private.operations_jobs()) j where j->>'jobname'='nuthrick-billing-monthly-and-grace' and (j->>'active')::boolean and j->>'last_status'='succeeded') then 'ready' else 'pending' end,'detail','Un único job conserva la idempotencia; cada suscripción conserva su entorno.'),
  jsonb_build_object('key','live_email','label','Entrega real de correo verificada','status',case when c.email_verified_at is not null and exists(select 1 from private.transactional_email_settings where enabled and mode='live' and provider<>'test') then 'ready' else 'pending' end,'detail','El proveedor actual es TEST. Requiere proveedor y remitente operativos; no se cuentan entregas simuladas como reales.'),
  jsonb_build_object('key','live_pilot','label','Cuenta piloto autorizada','status',case when exists(select 1 from private.billing_live_allowlist where enabled) then 'ready' else 'pending' end,'detail','La lista comienza vacía. Solo se añadirán profesionales controlados o expresamente autorizados.'),
  jsonb_build_object('key','live_ai','label','Recargas IA fuera del lanzamiento Live','status',case when not exists(select 1 from private.ai_credit_price_mappings where mode<>'test') and not exists(select 1 from private.ai_feature_config where enabled) then 'ready' else 'blocked' end,'detail','ADMIN-3 continúa en TEST; OpenAI no se activa en esta fase.')
 );
 return jsonb_build_object('preparation_enabled',c.preparation_enabled,'checkout_enabled',c.checkout_enabled,'credentials_present',credentials_present,'checks',checks,'counts',counts);
end $$;
revoke all on function private.billing_live_readiness() from public,anon,authenticated,service_role;

create or replace function private.billing_summary(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode',private.billing_owner_environment(p_owner),'enabled',(select enabled from private.billing_settings),'test_eligible',exists(select 1 from private.billing_test_accounts where professional_id=p_owner),
 'checkout_eligible',case when private.billing_owner_environment(p_owner)='live' then (select checkout_enabled from private.billing_live_configuration where id) and exists(select 1 from private.billing_live_allowlist where professional_id=p_owner and enabled) and private.billing_legal_ready() and not exists(select 1 from jsonb_array_elements(private.billing_live_readiness()->'checks') c where c->>'status'<>'ready') else (select enabled from private.billing_settings) and exists(select 1 from private.billing_test_accounts where professional_id=p_owner) end,
 'access',private.resolve_effective_entitlements(p_owner),'subscription',(select to_jsonb(s)||jsonb_build_object('plan_name',p.name,'plan_id',p.id,'interval',m.interval,'amount',m.amount,'currency',m.currency,'pending_plan_name',pp.name) from private.billing_subscriptions s join private.billing_price_mappings m on m.id=s.price_mapping_id join private.plans p on p.id=m.plan_id left join private.plans pp on pp.id=s.pending_plan_id where s.mode=private.billing_owner_environment(p_owner) and s.professional_id=p_owner order by s.created_at desc limit 1),
 'payments',coalesce((select jsonb_agg(to_jsonb(t)) from (select provider_invoice_id,amount_due,amount_paid,currency,status,issued_at,paid_at,hosted_url from private.billing_payments where mode=private.billing_owner_environment(p_owner) and professional_id=p_owner order by issued_at desc limit 50)t),'[]'),
 'credits',private.credit_purchase_summary(p_owner)->'balances')
$$;

-- Credentials stay server-only. The existing no-argument function stays TEST.
alter function private.operations_overview() rename to operations_pre_live_overview;
revoke all on function private.operations_pre_live_overview() from public,anon,authenticated,service_role;
create function private.operations_overview() returns jsonb language sql stable security definer set search_path='' as $$
 select private.operations_pre_live_overview()||jsonb_build_object('environments',jsonb_build_array(private.billing_environment_overview('test'),private.billing_environment_overview('live')))
$$;
revoke all on function private.operations_overview() from public,anon,authenticated,service_role;

create or replace function private.enqueue_transactional_email(
  p_event_key text,
  p_owner uuid,
  p_template_key text,
  p_payload jsonb default '{}',
  p_recipient_email text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare result_id uuid; recipient text;
begin
 if p_event_key is null or p_event_key !~ '^[A-Za-z0-9_:.\-]{3,180}$' then raise exception 'invalid_email_event'; end if;
 if not exists(select 1 from private.transactional_email_templates where key=p_template_key and active) then raise exception 'email_template_unavailable'; end if;
 recipient:=coalesce(p_recipient_email,(select email from auth.users where id=p_owner));
 insert into private.transactional_email_outbox(event_key,professional_id,recipient_email,template_key,payload,mode)
 values(p_event_key,p_owner,recipient, p_template_key,coalesce(p_payload,'{}'),coalesce(p_payload->'metadata'->>'mode','test'))
 on conflict(event_key) do nothing returning id into result_id;
 return result_id;
end $$;

create or replace function private.process_transactional_email_outbox(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item record; sent_count integer:=0; failed_count integer:=0; started timestamptz:=clock_timestamp(); run_id bigint; settings private.transactional_email_settings;
begin
 p_limit:=least(greatest(coalesce(p_limit,50),1),100);
 insert into private.operational_job_runs(job_key,started_at) values('transactional_email_outbox',started) returning id into run_id;
 select * into settings from private.transactional_email_settings where id;
 for item in select * from private.transactional_email_outbox where mode='test' and status in ('pending','failed') and next_attempt_at<=now() and attempts<5 order by created_at for update skip locked limit p_limit loop
  if not settings.enabled or settings.mode<>'test' or settings.provider<>'test' then
   update private.transactional_email_outbox set status='failed',attempts=least(attempts+1,5),last_error='email_provider_not_ready',next_attempt_at=now()+interval '1 hour',updated_at=now() where id=item.id;
   failed_count:=failed_count+1;
  elsif coalesce(item.recipient_email,'')='' then
   update private.transactional_email_outbox set status='failed',attempts=least(attempts+1,5),last_error='recipient_missing',next_attempt_at=now()+interval '1 hour',updated_at=now() where id=item.id;
   failed_count:=failed_count+1;
  else
   update private.transactional_email_outbox set status='sent',attempts=attempts+1,sent_at=now(),last_error=null,updated_at=now() where id=item.id;
   sent_count:=sent_count+1;
  end if;
 end loop;
 update private.transactional_email_delivery_checks set last_test_at=case when exists(select 1 from private.transactional_email_outbox where event_key='prelive-email-test' and status='sent') then coalesce(last_test_at,now()) else last_test_at end,last_status=case when failed_count=0 then coalesce(last_status,'passed') else 'failed' end,last_error=case when failed_count=0 then null else 'outbox_delivery_failed' end,updated_at=now() where id;
 update private.operational_job_runs set finished_at=clock_timestamp(),status=case when failed_count=0 then 'succeeded' else 'failed' end,duration_ms=extract(epoch from(clock_timestamp()-started)*1000)::integer,result=jsonb_build_object('sent',sent_count,'failed',failed_count) where id=run_id;
 return jsonb_build_object('sent',sent_count,'failed',failed_count);
end $$;
commit;
