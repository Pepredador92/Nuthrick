create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
create function pg_temp.reject(query text,code text) returns void language plpgsql as $$begin begin execute query;exception when others then if position(code in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected rejection: %',code;end$$;
-- LOCAL disposable database only: no provider calls, real recipients or production approvals.
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',false);
select pg_temp.assert(not private.transactional_email_ready(),'Five old inbox proofs cannot satisfy new commercial readiness');
select pg_temp.assert(not has_function_privilege('authenticated','private.queue_verified_renewal(uuid,timestamptz,bigint,text)','EXECUTE'),'Renewal input is not client writable');
insert into private.agenda_mail_sender(singleton,email,encrypted_refresh_token) values(true,'sender@example.org','LOCAL_FIXTURE') on conflict(singleton) do update set email=excluded.email;
update private.transactional_email_settings set provider='gmail',from_email='sender@example.org',reply_to='support@example.org',verified_at=now(),runtime_verified_at=now(),delivery_mode='controlled',configuration_revision=40,domain_evidence='{"oauth":true,"sender_email":"sender@example.org"}';
select private.enqueue_transactional_email('local-real-event', 'ab000000-0000-4000-8000-000000000002','welcome','{"mode":"live","patient_name":"PRIVATE_SECRET","diagnosis":"PRIVATE_SECRET"}','recipient@example.org');
select private.enqueue_transactional_email('local-real-event', 'ab000000-0000-4000-8000-000000000002','welcome','{"mode":"live"}','recipient@example.org');
select pg_temp.assert((select count(*)=1 from private.transactional_email_outbox where event_key='local-real-event'),'Business event idempotency');
select pg_temp.assert((select payload::text not like '%PRIVATE_SECRET%' and configuration_revision=40 from private.transactional_email_outbox where event_key='local-real-event'),'Safe payload and current sender revision');
select pg_temp.assert(private.transactional_email_server('claim',jsonb_build_object('lease_key',gen_random_uuid())) is null,'Controlled mode cannot claim real recipient');
-- Only future events become eligible when operation is armed; historic backlog stays closed.
update private.transactional_email_settings set delivery_mode='operational',operational_since=clock_timestamp();
select pg_temp.assert(private.transactional_email_server('claim',jsonb_build_object('lease_key',gen_random_uuid())) is null,'Activation does not release backlog');
select private.enqueue_transactional_email('local-operational-event', 'ab000000-0000-4000-8000-000000000002','payment_confirmed','{"mode":"live","amount_minor":34900,"currency":"MXN"}','recipient@example.org');
select private.enqueue_transactional_email('local-test-event', 'ab000000-0000-4000-8000-000000000002','payment_confirmed','{"mode":"test"}','recipient@example.org');
do $$declare e jsonb; lease uuid:=gen_random_uuid();begin
 e:=private.transactional_email_server('claim',jsonb_build_object('lease_key',lease));
 perform pg_temp.assert(e->>'mode'='live' and e->'details'->>'amount_minor'='34900','Operational claim has correct environment and amount');
 perform private.transactional_email_server('prepare',jsonb_build_object('id',e->'id','lease_key',lease,'message','{"subject":"prepared"}'::jsonb));
 update private.transactional_email_outbox set lease_until=now()-interval '1 minute' where id=(e->>'id')::uuid;
 perform private.transactional_email_server('claim',jsonb_build_object('lease_key',gen_random_uuid()));
 perform pg_temp.assert((select delivery_status='unknown' and attempts=5 from private.transactional_email_outbox where id=(e->>'id')::uuid),'Expired prepared Gmail lease requires reconciliation');
 perform pg_temp.reject(format('select public.email_admin_api(''retry'',%L::jsonb)',jsonb_build_object('id',e->'id')::text),'email_delivery_requires_reconciliation');
end $$;
select pg_temp.assert(private.transactional_email_server('claim',jsonb_build_object('lease_key',gen_random_uuid())) is null,'Test business events never reach real recipients');
-- Exercise canonical state transitions and duplicate updates.
insert into private.billing_customers(professional_id,mode,provider_customer_id) values('ab000000-0000-4000-8000-000000000002','test','cus_local_mail');
insert into private.billing_subscriptions(id,professional_id,provider_subscription_id,provider_customer_id,price_mapping_id,state,provider_status,period_start,period_end,credit_anchor_at,paid_through,mode)
select 'ac000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000002','sub_local_mail','cus_local_mail',id,'active','active',now()-interval '23 days',now()+interval '7 days',now()-interval '23 days',now()+interval '7 days','test' from private.billing_price_mappings where mode='test' limit 1;
update private.billing_subscriptions set state='grace',provider_status='past_due',grace_until=now()+interval '3 days' where provider_subscription_id='sub_local_mail';
update private.billing_subscriptions set state='grace',provider_status='past_due' where provider_subscription_id='sub_local_mail';
update private.billing_subscriptions set state='active',provider_status='active' where provider_subscription_id='sub_local_mail';
update private.billing_subscriptions set cancel_at_period_end=true where provider_subscription_id='sub_local_mail';
update private.billing_subscriptions set state='cancelled' where provider_subscription_id='sub_local_mail';
select pg_temp.assert((select count(*)=6 from private.transactional_email_outbox where event_key like 'subscription:ac000000-0000-4000-8000-000000000001:%'),'Activation, failure, grace, recovery and two cancellation events exactly once');
select pg_temp.assert((select bool_and(mode='test') from private.transactional_email_outbox where event_key like 'subscription:ac000000-0000-4000-8000-000000000001:%'),'Subscription test events retain test mode');
insert into private.billing_payments(provider_invoice_id,professional_id,subscription_id,price_mapping_id,amount_due,amount_paid,currency,status,issued_at,paid_at,mode)
select 'in_local_mail',professional_id,id,price_mapping_id,34900,34900,'MXN','paid',now(),now(),'test' from private.billing_subscriptions where provider_subscription_id='sub_local_mail';
update private.billing_payments set status='paid' where provider_invoice_id='in_local_mail';
select pg_temp.assert((select count(*)=1 from private.transactional_email_outbox where event_key='invoice:test:in_local_mail:paid'),'Confirmed invoice not duplicated by replay');
update private.billing_subscriptions set state='active',cancel_at_period_end=false where provider_subscription_id='sub_local_mail';
select private.queue_verified_renewal(id,period_end,34900,'MXN') from private.billing_subscriptions where provider_subscription_id='sub_local_mail';
select private.queue_verified_renewal(id,period_end,34900,'MXN') from private.billing_subscriptions where provider_subscription_id='sub_local_mail';
select pg_temp.assert((select count(*)=1 from private.transactional_email_outbox where event_key like 'renewal:ac000000-0000-4000-8000-000000000001:%'),'Renewal notice exactly once for a billing period');
select pg_temp.reject($q$select private.queue_verified_renewal('ac000000-0000-4000-8000-000000000001',now()+interval '4 days',34900,'MXN')$q$,'invalid_renewal_notice');
select pg_temp.assert(not private.transactional_email_ready(),'Implemented event queue without actual end-to-end/continuity proof remains pending');
select pg_temp.reject($q$select public.email_admin_api('activate_operational','{"confirmation":"ACTIVAR CORREO OPERATIVO"}')$q$,'email_operational_not_ready');
select private.transactional_email_server('worker_failed','{"code":"email_sender_reauthorization_required"}');
select pg_temp.assert((select status='failed' from private.operational_job_runs where job_key='transactional_email_real_worker' order by id desc limit 1),'Failures before claim are monitored');
select set_config('nuthrick.billing_environment','test',false);
select private.queue_subscription_refunds('{"id":"in_local_mail","refunds":[{"id":"re_localconfirmed","amount":12300,"currency":"MXN"}]}');
select private.queue_subscription_refunds('{"id":"in_local_mail","refunds":[{"id":"re_localconfirmed","amount":12300,"currency":"MXN"}]}');
select pg_temp.assert((select count(*)=1 from private.transactional_email_outbox where event_key='refund:test:re_localconfirmed' and payload->>'amount_minor'='12300'),'Confirmed subscription refund exactly once');
select pg_temp.reject($q$select private.queue_subscription_refunds('{"id":"in_local_mail","refunds":[{"id":"re_invalid","amount":50000,"currency":"MXN"}]}')$q$,'invalid_refund_notice');
do $$declare result jsonb;lease uuid:=gen_random_uuid();begin
 result:=private.billing_server('claim_event',jsonb_build_object('environment','test','event_id','evt_subscription_without_credit_purchase','type','customer.subscription.updated','customer_id','cus_local_mail','subscription_id','sub_local_mail','created',extract(epoch from now()),'livemode',false,'lock_key',lease));
 perform pg_temp.assert(result->'credit_purchase'='null'::jsonb,'Subscription webhook without a purchase returns JSON null, not an object with null fields');
 perform private.billing_server('event_done',jsonb_build_object('environment','test','owner',result->>'owner','lock_key',lease,'event_id','evt_subscription_without_credit_purchase'));
end $$;
-- LOCAL fake transport evidence: an extra observed category cannot erase readiness
-- and cannot substitute for one of the five specifically required categories.
update private.transactional_email_settings set enabled=true,provider='gmail',mode='live',configuration_revision=50,verified_at=now(),runtime_verified_at=now(),last_worker_at=now(),delivery_mode='controlled';
update private.support_settings set contacts_verified_at=now();
insert into private.transactional_email_outbox(event_key,recipient_email,template_key,payload,mode,is_test_delivery,configuration_revision,status,delivery_status,provider_message_id,observed_at)
select 'local-transport:'||k,'recipient@example.org',k,'{}','test',true,50,'sent','accepted','local-proof-'||k,now() from unnest(array['welcome','payment_confirmed','payment_failed','credits_purchased','credits_refunded','subscription_activated'])k;
select pg_temp.assert(private.transactional_email_transport_ready(),'Required five transport proofs plus additional commercial templates remain ready');
update private.transactional_email_outbox set observed_at=null where event_key='local-transport:credits_refunded';
select pg_temp.assert(not private.transactional_email_transport_ready(),'Additional template cannot replace required credit refund proof');

-- Complete LOCAL fixtures exercise the activation branch past its early gates.
-- Missing/mismatched proofs must still fail; full proofs must reach the update.
update private.transactional_email_outbox set observed_at=now() where event_key='local-transport:credits_refunded';
select pg_temp.assert(private.billing_legal_ready(),'Local approved legal fixtures exist');
select private.transactional_email_server('worker_done','{"accepted":0,"failed":0,"collection_failed":false}');
insert into private.pre_live_operational_evidence(key,evidence) values
 ('commercial_email_end_to_end','{"passed":true,"configuration_revision":50}')
on conflict(key) do update set evidence=excluded.evidence;
select pg_temp.reject($q$select public.email_admin_api('activate_operational','{"confirmation":"ACTIVAR CORREO OPERATIVO"}')$q$,'email_operational_not_ready');
insert into private.pre_live_operational_evidence(key,evidence) values
 ('mail_oauth_continuity','{"production_verified":true,"sender_email":"wrong@example.org"}')
on conflict(key) do update set evidence=excluded.evidence;
select pg_temp.reject($q$select public.email_admin_api('activate_operational','{"confirmation":"ACTIVAR CORREO OPERATIVO"}')$q$,'email_operational_not_ready');
update private.pre_live_operational_evidence set evidence='{"production_verified":true,"sender_email":"sender@example.org"}' where key='mail_oauth_continuity';
select public.email_admin_api('activate_operational','{"confirmation":"ACTIVAR CORREO OPERATIVO"}');
select pg_temp.assert(private.transactional_email_ready(),'Complete evidence activates operational email through the administrative API');
select pg_temp.assert((select operational_since is not null and delivery_mode='operational' from private.transactional_email_settings where id),'Activation records its start boundary');
select pg_temp.assert(not (select checkout_enabled from private.billing_live_configuration where id),'Email activation does not enable Stripe Live checkout');
select public.email_admin_api('pause_operational','{}');
select pg_temp.assert(not private.transactional_email_ready(),'Pausing disables operational email readiness');
