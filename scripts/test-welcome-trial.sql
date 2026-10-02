-- Runs only inside test-public-sales.mjs's disposable, rollback-only database.
select pg_temp.sales_assert(not private.welcome_trial_eligible('1e000000-0000-4000-8000-000000000003','live'),'Trial switch starts closed');
select pg_temp.sales_assert(not has_function_privilege('authenticated','private.welcome_trial_eligible(uuid,text)','execute'),'Browser cannot query other accounts eligibility');
update private.billing_settings set welcome_trial_enabled=true;
select pg_temp.sales_assert(private.welcome_trial_eligible('1e000000-0000-4000-8000-000000000003','live'),'Unused account is eligible');
select pg_temp.sales_assert(not private.welcome_trial_eligible('1e000000-0000-4000-8000-000000000001','live'),'Existing subscriber excluded');
select pg_temp.sales_assert(not private.welcome_trial_eligible((select user_id from private.platform_admins limit 1),'live'),'Administrators excluded');
select pg_temp.sales_assert(not private.welcome_trial_eligible('00000000-0000-4000-8000-000000000000','live'),'Unknown account excluded');
select pg_temp.sales_assert((private.billing_summary('1e000000-0000-4000-8000-000000000003')->'welcome_trial'->>'eligible')::boolean,'Summary exposes self eligibility');
select pg_temp.sales_assert((public.plan_catalog()->0->>'welcome_trial_days')::int=30,'Public catalogue advertises enabled offer');

-- External deployment/legal proofs are tested above; isolate checkout lifecycle.
create or replace function private.billing_checkout_guard(p_owner uuid) returns void language plpgsql as $$begin return;end$$;
do $$ declare owner uuid:='1e000000-0000-4000-8000-000000000003'; lk uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 request jsonb; ctx jsonb; snapshot jsonb; pid uuid; invoice jsonb; begin
 perform set_config('nuthrick.billing_environment','live',true);
 update private.billing_customers set lease_key=null,lease_until=null where professional_id=owner;
 perform private.billing_lock(owner,lk);
 request:=jsonb_build_object('owner',owner,'lock_key',lk,'operation_key',op,'plan_id',(select id from private.plans where code='profesional'),'interval','monthly');
 perform pg_temp.sales_reject(format('select private.billing_subscription_server(%L,%L::jsonb)','prepare_checkout',request::text),'trial_consent_required');
 request:=request||'{"welcome_trial_consent":true}';
 ctx:=private.billing_subscription_server('prepare_checkout',request);
 perform pg_temp.sales_assert((ctx->'intent'->>'trial_days')::int=30,'Server reserves 30 days');
 perform pg_temp.sales_assert(ctx->'intent'->>'trial_accepted_at' is not null,'Consent is recorded server-side');
 perform pg_temp.sales_assert(private.billing_subscription_server('prepare_checkout',request)->'intent'=ctx->'intent','Retry reuses same offer');
 perform pg_temp.sales_assert(not exists(select 1 from private.professional_access where professional_id=owner),'Checkout reservation alone never grants access');
 -- An abandoned checkout releases the offer; no trial consumed.
 perform private.billing_subscription_server('checkout_expired',request||jsonb_build_object('intent_id',op));
 request:=request||jsonb_build_object('operation_key',gen_random_uuid());
 ctx:=private.billing_subscription_server('prepare_checkout',request);
 op:=(ctx->'intent'->>'id')::uuid; pid:=(ctx->'price'->>'id')::uuid;
 update private.billing_customers set provider_customer_id='cus_welcome_trial' where professional_id=owner and mode='live';
 update private.billing_price_mappings set provider_price_id='price_welcome_trial' where id=pid;
 perform private.billing_subscription_server('unlock',request);
 invoice:=jsonb_build_object('id','in_welcome_zero','subscription_id','sub_welcome_trial','customer_id','cus_welcome_trial','price_id','price_welcome_trial','status','paid','amount_due',0,'amount_paid',0,'currency','MXN','created',now()-interval '29 days','paid_at',now()-interval '29 days','period_start',now()-interval '29 days','period_end',now()+interval '1 day','hosted_url','https://invoice.stripe.com/i/fixture');
 snapshot:=jsonb_build_object('id','sub_welcome_trial','intent_id',op,'customer_id','cus_welcome_trial','price_id','price_welcome_trial','livemode',true,'status','trial','provider_status','trialing','trial_end',now()+interval '1 day','period_start',now()-interval '29 days','period_end',now()+interval '1 day','anchor',now()+interval '1 day','cancel_at_period_end',false,'pending_update',false,'latest_invoice',invoice);
 perform live_one_test.event(owner,'evt_welcome_initial',snapshot);
 perform pg_temp.sales_assert((select status='trial' and ends_at=now()+interval '1 day' from private.professional_access where professional_id=owner),'Verified webhook grants bounded access');
 perform pg_temp.sales_assert((select paid_through is null from private.billing_subscriptions where provider_subscription_id='sub_welcome_trial'),'Zero trial invoice is not a paid period');
 perform pg_temp.sales_assert(not private.welcome_trial_eligible(owner,'live'),'Consumed once at verified subscription');
 perform pg_temp.sales_assert((select count(*)=1 and sum(allocation_amount)=50 from private.ai_credit_ledger where professional_id=owner and type='PLAN_ALLOCATION'),'One 50-credit allowance during trial');
 perform pg_temp.sales_assert((select allocation_period_end-allocation_period_start=interval '30 days' from private.ai_credit_ledger where professional_id=owner and type='PLAN_ALLOCATION'),'Credit window is exactly the trial, not a calendar month');
 perform live_one_test.event(owner,'evt_welcome_repeat',snapshot);
 perform private.allocate_plan_month(owner,now()+interval '12 hours');
 perform pg_temp.sales_assert((select count(*)=1 from private.ai_credit_ledger where professional_id=owner and type='PLAN_ALLOCATION'),'Repeat webhook and allocation never duplicate trial credits');
 perform live_one_test.event(owner,'evt_welcome_cancel_scheduled',snapshot||'{"cancel_at_period_end":true}');
 perform pg_temp.sales_assert((select status='trial' from private.professional_access where professional_id=owner),'Cancel at trial end preserves remaining free access');
 perform live_one_test.event(owner,'evt_welcome_cancelled',snapshot||'{"status":"ended","provider_status":"canceled"}');
 perform pg_temp.sales_assert((select status='cancelled' from private.professional_access where professional_id=owner),'Trial cancellation revokes access without a paid invoice');
 perform pg_temp.sales_assert(not private.welcome_trial_eligible(owner,'live'),'Cancellation does not renew trial');
 -- Independent provider state transitions also cover failed first charge/recovery.
 perform live_one_test.event(owner,'evt_welcome_trial_state',snapshot);
 perform live_one_test.event(owner,'evt_welcome_first_failure',snapshot||jsonb_build_object('status','payment_due','provider_status','past_due','latest_invoice',invoice||jsonb_build_object('id','in_welcome_paid','status','open','amount_due',49900)));
 perform pg_temp.sales_assert((select status='suspended' from private.professional_access where professional_id=owner),'Failed first charge does not grant paid access');
 perform live_one_test.event(owner,'evt_welcome_recovered',snapshot||jsonb_build_object('status','active','provider_status','active','period_start',now()+interval '1 day','period_end',now()+interval '1 day 1 month','latest_invoice',invoice||jsonb_build_object('id','in_welcome_paid','amount_due',49900,'amount_paid',49900,'period_start',now()+interval '1 day','period_end',now()+interval '1 day 1 month')));
 perform pg_temp.sales_assert((select status='active' from private.professional_access where professional_id=owner),'Verified first payment activates plan');
 perform private.allocate_plan_month(owner,now()+interval '1 day');
 perform pg_temp.sales_assert((select count(*)=2 from private.ai_credit_ledger where professional_id=owner and type='PLAN_ALLOCATION'),'First paid month grants once on trial end anchor');
end $$;

-- A 30-day trial beginning in February still receives one allowance, not two.
do $$ declare owner uuid:='1e000000-0000-4000-8000-000000000003'; begin
 update private.professional_access set status='trial', starts_at='2027-02-01',ends_at='2027-03-03',credit_anchor_at='2027-03-03' where professional_id=owner;
 update private.billing_subscriptions set state='trial',period_start='2027-02-01',period_end='2027-03-03',manual_hold=false where professional_id=owner;
 perform private.allocate_plan_month(owner,'2027-02-01');
 perform private.allocate_plan_month(owner,'2027-03-01');
 perform pg_temp.sales_assert((select count(*)=1 from private.ai_credit_ledger where professional_id=owner and type='PLAN_ALLOCATION' and allocation_period_start='2027-02-01'),'February boundary does not grant twice');
end $$;
