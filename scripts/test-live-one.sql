create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception '%',label; end if; end$$;
select pg_temp.assert(not private.billing_legal_ready(),'Legal stays pending in the fixture');
do $$ begin
 begin perform private.billing_live_guard(); raise exception 'live unexpectedly allowed';
 exception when others then if sqlerrm<>'live_legal_pending' then raise; end if; end;
end $$;
select pg_temp.assert((select not preparation_enabled and not checkout_enabled from private.billing_live_configuration),'Live starts disabled');
select pg_temp.assert((select count(*)=0 from private.billing_live_allowlist),'No pilot account is authorized implicitly');
select pg_temp.assert(not has_function_privilege('authenticated','private.billing_provider_credentials_for(text)','EXECUTE'),'Browser cannot fetch credentials');
select pg_temp.assert(not has_function_privilege('anon','public.billing_provider_credentials_for(text)','EXECUTE'),'Anonymous cannot fetch credentials');
select pg_temp.assert((select count(*)=0 from private.billing_payments where mode='live'),'No Live payments created during preparation');

-- Unit fixtures exercise the private reducer below the legal gateway in this
-- disposable database only. No legal status is changed or approval simulated.
create schema live_one_test;
create table live_one_test.snapshots(owner uuid primary key,snapshot jsonb);
insert into auth.users(id,email,email_confirmed_at) values
 ('1e000000-0000-4000-8000-000000000001','live-unit-monthly@example.invalid',now()),
 ('1e000000-0000-4000-8000-000000000002','live-unit-annual@example.invalid',now());
insert into private.billing_customers(professional_id,mode,provider_customer_id) values
 ('1e000000-0000-4000-8000-000000000001','test','cus_unit_test'),
 ('1e000000-0000-4000-8000-000000000001','live','cus_unit_live_monthly'),
 ('1e000000-0000-4000-8000-000000000002','live','cus_unit_live_annual');
create function live_one_test.event(p_owner uuid,p_id text,p_snapshot jsonb) returns jsonb language plpgsql as $$
declare lk uuid:=gen_random_uuid(); ctx jsonb; begin
 perform set_config('nuthrick.billing_environment','live',true);
 ctx:=private.billing_subscription_server('claim_event',jsonb_build_object('event_id',p_id,'type','customer.subscription.updated','customer_id',p_snapshot->>'customer_id','subscription_id',p_snapshot->>'id','created',extract(epoch from now()),'livemode',true,'lock_key',lk));
 if ctx->>'replay'='true' then return ctx; end if;
 return private.billing_apply(jsonb_build_object('event_id',p_id,'owner',p_owner,'lock_key',lk,'subscription',p_snapshot));
end $$;
do $$
declare owner uuid; m private.billing_price_mappings; intent uuid; cid text; sid text; snap jsonb; cycle text; ends timestamptz;
begin
 perform set_config('nuthrick.billing_environment','live',true);
 for owner,cycle,cid in select * from (values
 ('1e000000-0000-4000-8000-000000000001'::uuid,'monthly','cus_unit_live_monthly'),
 ('1e000000-0000-4000-8000-000000000002'::uuid,'annual','cus_unit_live_annual')) x loop
  m:=private.billing_price((select id from private.plans where code=case cycle when 'monthly' then 'esencial' else 'profesional' end),cycle);
  update private.billing_price_mappings set provider_price_id='price_unit_live_'||cycle,provider_product_id='prod_unit_live_'||cycle where id=m.id returning * into m;
  intent:=gen_random_uuid();sid:='sub_unit_live_'||cycle;ends:=now()+case cycle when 'monthly' then interval '1 month' else interval '1 year' end;
  insert into private.billing_checkout_intents(id,professional_id,price_mapping_id,expires_at,mode) values(intent,owner,m.id,now()+interval '35 minutes','live');
  snap:=jsonb_build_object('id',sid,'intent_id',intent,'customer_id',cid,'price_id',m.provider_price_id,'livemode',true,'status','active','provider_status','active','period_start',now(),'period_end',ends,'anchor',now(),'cancel_at_period_end',false,'pending_update',false,'latest_invoice',jsonb_build_object('id','in_unit_live_'||cycle,'subscription_id',sid,'customer_id',cid,'price_id',m.provider_price_id,'status','paid','amount_due',m.amount,'amount_paid',m.amount,'currency','MXN','created',now(),'paid_at',now(),'period_start',now(),'period_end',ends,'hosted_url','https://invoice.stripe.com/i/fixture'));
  insert into live_one_test.snapshots values(owner,snap);
  perform live_one_test.event(owner,'evt_unit_live_initial_'||cycle,snap);
 end loop;
end $$;
select pg_temp.assert((select count(*)=2 from private.billing_customers where professional_id='1e000000-0000-4000-8000-000000000001'),'One owner has separate TEST and LIVE customer mappings');
select pg_temp.assert((select count(*)=2 from private.professional_access where billing_mode='live' and status='active'),'Live reducer activates only the Live access mapping');
select pg_temp.assert((select count(*)=2 from private.billing_payments where mode='live'),'Exactly one payment per Live unit subscription');
select pg_temp.assert((select count(*)=2 from private.ai_credit_ledger where professional_id in(select owner from live_one_test.snapshots) and type='PLAN_ALLOCATION'),'Monthly and annual each grant one month');
select pg_temp.assert((select count(*)=2 from private.transactional_email_outbox where mode='live'),'Live audit enqueues only Live emails');
select private.process_transactional_email_outbox();
select pg_temp.assert((select count(*)=0 from private.transactional_email_outbox where mode='live' and status='sent'),'TEST worker cannot mark Live emails as delivered');
select live_one_test.event(owner,'evt_unit_live_initial_monthly',snapshot) from live_one_test.snapshots where owner='1e000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*)=2 from private.ai_credit_ledger where professional_id in(select owner from live_one_test.snapshots) and type='PLAN_ALLOCATION'),'Replaying event does not duplicate credits');
select pg_temp.assert((select count(*)=2 from private.transactional_email_outbox where mode='live'),'Replaying event does not duplicate email');

do $$ declare live_price uuid:=(select id from private.billing_price_mappings where provider_price_id='price_unit_live_monthly'); test_price uuid:=(select id from private.billing_price_mappings where mode='test' limit 1); begin
 begin
  insert into private.billing_checkout_intents(id,professional_id,price_mapping_id,mode,expires_at) values(gen_random_uuid(),'1e000000-0000-4000-8000-000000000001',test_price,'live',now()+interval '1 hour');
  raise exception 'cross-environment price accepted';
 exception when foreign_key_violation then null; end;
 begin
  update private.billing_subscriptions set price_mapping_id=test_price where mode='live' and price_mapping_id=live_price;
  raise exception 'cross-environment subscription mapping accepted';
 exception when foreign_key_violation then null; end;
end $$;
select pg_temp.assert(private.billing_server('claim_event',jsonb_build_object('environment','test','livemode',false,'customer_id','cus_unit_test','event_id','evt_test_after_live','created',extract(epoch from now()),'type','invoice.paid','lock_key',gen_random_uuid()))->>'ignored'='true','Late TEST webhook cannot modify Live access');
select pg_temp.assert((select count(*)=0 from private.billing_webhook_events where provider_event_id='evt_test_after_live'),'Cross-environment event does not claim a subscription');

select live_one_test.event(owner,'evt_unit_live_cancel',snapshot||'{"cancel_at_period_end":true}') from live_one_test.snapshots where owner='1e000000-0000-4000-8000-000000000001';
select pg_temp.assert((select status='active' from private.professional_access where professional_id='1e000000-0000-4000-8000-000000000001'),'Live cancel-at-period-end preserves access');
update private.billing_subscriptions set paid_through=now()-interval '1 hour' where provider_subscription_id='sub_unit_live_monthly';
select live_one_test.event(owner,'evt_unit_live_failed',snapshot||jsonb_build_object('status','payment_due','latest_invoice',(snapshot->'latest_invoice')||jsonb_build_object('id','in_unit_live_renewal','status','open','amount_paid',0))) from live_one_test.snapshots where owner='1e000000-0000-4000-8000-000000000001';
select pg_temp.assert((select status='grace' from private.professional_access where professional_id='1e000000-0000-4000-8000-000000000001'),'Live renewal failure enters grace');
update private.billing_subscriptions set grace_until=now()-interval '1 second' where provider_subscription_id='sub_unit_live_monthly';
select private.billing_tick();
select pg_temp.assert((select status='suspended' from private.professional_access where professional_id='1e000000-0000-4000-8000-000000000001'),'Single scheduler suspends expired Live grace');
select live_one_test.event(owner,'evt_unit_live_recovered',snapshot||jsonb_build_object('latest_invoice',(snapshot->'latest_invoice')||jsonb_build_object('id','in_unit_live_renewal'))) from live_one_test.snapshots where owner='1e000000-0000-4000-8000-000000000001';
select pg_temp.assert((select status='active' from private.professional_access where professional_id='1e000000-0000-4000-8000-000000000001'),'Verified recovery restores Live access');
select pg_temp.assert(not private.billing_legal_ready(),'Legal is still pending after all local unit fixtures');
