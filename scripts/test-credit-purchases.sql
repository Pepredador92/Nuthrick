-- Disposable LOCAL database only; synthetic UUIDs and fake provider IDs.
create schema admin3_test;
create function admin3_test.ok(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
create function admin3_test.reject(q text,msg text) returns void language plpgsql as $$begin begin execute q;exception when others then if position(msg in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected error: %',msg;end$$;
insert into auth.users(id,email,email_confirmed_at) select ('ca300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'admin3-'||n||'@example.test',now() from generate_series(1,12)n;
update public.professional_profiles set onboarding_completed=true where id::text like 'ca300000-%';
insert into private.platform_admins(user_id) values('ca300000-0000-4000-8000-000000000001');
insert into private.billing_test_accounts(professional_id) select id from public.professional_profiles where id::text like 'ca300000-%';
insert into private.professional_access(professional_id,plan_id,status,source) select id,(select id from private.plans where code='esencial'),'active','manual' from public.professional_profiles where id::text like 'ca300000-%';
insert into private.ai_accounts(professional_id,included_credits,purchased_credits,billing_period_start,billing_period_end) select id,10,0,now(),now()+interval '1 month' from public.professional_profiles where id::text like 'ca300000-%' on conflict(professional_id) do update set included_credits=10,purchased_credits=0,billing_period_start=now(),billing_period_end=now()+interval '1 month';
update private.billing_settings set enabled=true;
select set_config('request.jwt.claim.sub','ca300000-0000-4000-8000-000000000001',false);
select public.ai_credit_admin_api('save_package','{"id":"cb300000-0000-4000-8000-000000000001","code":"TEST_SMALL","name":"100 créditos TEST","credits":100,"price_amount":10,"currency":"MXN","active":true}');
select public.ai_credit_admin_api('save_package','{"id":"cb300000-0000-4000-8000-000000000002","code":"TEST_MEDIUM","name":"500 créditos TEST","credits":500,"price_amount":25,"currency":"MXN","active":true}');
select public.ai_credit_admin_api('save_package','{"id":"cb300000-0000-4000-8000-000000000003","code":"TEST_LARGE","name":"1000 créditos TEST","credits":1000,"price_amount":50,"currency":"MXN","active":true}');
select admin3_test.ok(jsonb_array_length(public.ai_credit_admin_api('packages'))=3,'admin catalog returns all packages');
select admin3_test.ok(jsonb_array_length(public.ai_credit_admin_api('purchases'))=0,'admin purchase list starts empty');
select admin3_test.ok(public.ai_credit_admin_api('package','{"id":"cb300000-0000-4000-8000-000000000002"}')->>'credits'='500','admin package detail is readable');
select public.billing_admin_api('save_campaign',jsonb_build_object('id','cc300000-0000-4000-8000-000000000001','target','ai_credit_package','code','TEST_CREDITS','name','Recarga TEST','audience','campaign','starts_at',now()-interval '1 hour','eligible_package_ids',jsonb_build_array('cb300000-0000-4000-8000-000000000002'),'eligible_plan_ids','[]'::jsonb,'intervals','["monthly"]'::jsonb,'benefits','[{"type":"percentage_discount","amount":20,"duration":{"kind":"invoice"}},{"type":"bonus_ai_credits","amount":50,"duration":{"kind":"invoice"}}]'::jsonb,'max_redemptions',100,'max_per_professional',2));
select admin3_test.ok(not has_function_privilege('anon','public.my_ai_credits()','EXECUTE'),'anonymous denied');
select admin3_test.ok(not has_function_privilege('authenticated','private.credit_billing_server(text,jsonb)','EXECUTE'),'server helper denied');
select admin3_test.ok(not has_table_privilege('authenticated','private.ai_credit_purchases','SELECT'),'direct purchase access denied');
select admin3_test.ok(not has_table_privilege('service_role','private.ai_credit_ledger','UPDATE'),'ledger update denied');
select admin3_test.ok(not has_table_privilege('service_role','private.ai_credit_ledger','DELETE'),'ledger deletion denied');
select admin3_test.reject($q$select public.ai_credit_admin_api('save_package','{"code":"INVALID","name":"X","credits":100,"price_amount":1.001,"currency":"MXN"}')$q$,'invalid_package_price');
create function admin3_test.prepare(owner uuid,pkg uuid,code text default '',operation uuid default gen_random_uuid()) returns uuid language plpgsql as $$declare lk uuid:=gen_random_uuid();ctx jsonb;pid uuid;begin
 perform public.billing_server('lock',jsonb_build_object('owner',owner,'lock_key',lk));
 ctx:=public.billing_server('credit_prepare',jsonb_build_object('owner',owner,'lock_key',lk,'package_id',pkg,'code',code,'operation_key',operation));pid:=(ctx->'purchase'->>'id')::uuid;
 perform public.billing_server('customer_saved',jsonb_build_object('owner',owner,'lock_key',lk,'customer_id','cus_credit_'||owner));
 perform public.billing_server('credit_price_saved',jsonb_build_object('owner',owner,'lock_key',lk,'price_mapping_id',ctx->'price'->>'id','price_id','price_credit_'||(ctx->'price'->>'id')));
 perform public.billing_server('credit_checkout_saved',jsonb_build_object('owner',owner,'lock_key',lk,'purchase_id',pid,'checkout_id','cs_credit_'||pid,'url','https://checkout.stripe.com/c/pay/fixture','expires_at',extract(epoch from now()+interval '35 minutes')));
 perform public.billing_server('unlock',jsonb_build_object('owner',owner,'lock_key',lk));return pid;end$$;
create function admin3_test.snapshot(pid uuid) returns jsonb language sql as $$select jsonb_build_object('mode','payment','checkout_id',p.provider_checkout_id,'checkout_status','complete','purchase_id',p.id,'owner',p.professional_id,'customer_id',c.provider_customer_id,'payment_id','pi_credit_'||p.id,'charge_id','ch_credit_'||p.id,'price_id',m.provider_price_id,'quantity',1,'currency',p.currency,'amount_total',p.expected_amount,'amount_paid',p.expected_amount,'paid',true,'paid_at',now(),'payment_failed',false,'amount_refunded',0,'refund_pending',false,'dispute_id',null,'dispute_status',null,'livemode',false) from private.ai_credit_purchases p join private.billing_customers c using(professional_id) join private.ai_credit_price_mappings m on m.id=p.price_mapping_id where p.id=pid$$;
create function admin3_test.event(pid uuid,eid text,overrides jsonb default '{}') returns jsonb language plpgsql as $$declare lk uuid:=gen_random_uuid();s jsonb:=admin3_test.snapshot(pid)||overrides;ctx jsonb;begin
 ctx:=public.billing_server('claim_event',jsonb_build_object('event_id',eid,'type','checkout.session.completed','customer_id',s->>'customer_id','checkout_id',s->>'checkout_id','payment_id',s->>'payment_id','created',extract(epoch from now()),'livemode',false,'lock_key',lk));
 if ctx->>'replay'='true' then return ctx;end if;
 perform admin3_test.ok(ctx->'credit_purchase'->>'id'=pid::text,'gateway finds bound purchase');
 return public.billing_server('credit_apply',jsonb_build_object('owner',ctx->>'owner','lock_key',lk,'purchase_id',pid,'event_id',eid,'payment',s));end$$;
select admin3_test.prepare('ca300000-0000-4000-8000-000000000002','cb300000-0000-4000-8000-000000000002','TEST_CREDITS','cd300000-0000-4000-8000-000000000001');
select admin3_test.ok((select credits_purchased=500 and bonus_credits=50 and expected_amount=2000 and status='pending' from private.ai_credit_purchases where id='cd300000-0000-4000-8000-000000000001'),'discount and bonus use server package');
select admin3_test.ok((select purchased_credits=0 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000002'),'checkout alone grants nothing');
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_failed','{"paid":false,"checkout_status":"open","amount_paid":0,"payment_failed":true}');
select admin3_test.ok((select purchased_credits=0 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000002'),'failed payment grants nothing');
select admin3_test.reject($q$select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_tamper','{"amount_total":1}')$q$,'invalid_payment_identity');
select admin3_test.reject($q$select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_tamper_owner','{"owner":"ca300000-0000-4000-8000-000000000003"}')$q$,'invalid_payment_identity');
select public.ai_credit_admin_api('save_package','{"id":"cb300000-0000-4000-8000-000000000002","version":1,"code":"TEST_MEDIUM","name":"Paquete editado TEST","credits":600,"bonus_credits":10,"price_amount":30,"currency":"MXN","active":true}');
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_paid');
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_paid');
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_paid_again');
select admin3_test.ok((select purchased_credits=550 and included_credits=10 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000002'),'one grant preserves original snapshot and included balance');
select admin3_test.ok((select count(*)=1 from private.ai_credit_ledger where credit_purchase_id='cd300000-0000-4000-8000-000000000001' and type='PURCHASE'),'duplicate event and different event do not double grant');
select admin3_test.ok((select count(*)=1 from private.promotion_redemptions where credit_purchase_id='cd300000-0000-4000-8000-000000000001'),'shared promotion attribution once');
select admin3_test.ok((select purchased_credits=0 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000003'),'other owner balance unchanged');
update private.ai_accounts set billing_period_start=now()-interval '1 month',billing_period_end=now()-interval '1 second' where professional_id='ca300000-0000-4000-8000-000000000002';
select private.grant_credits_for_period('ca300000-0000-4000-8000-000000000002',gen_random_uuid(),'PLAN_ALLOCATION',50,now(),now()+interval '1 month',now());
select admin3_test.ok((select purchased_credits=550 and included_credits=50 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000002'),'renewal changes only included bucket');
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_partial','{"amount_refunded":1000}');
select admin3_test.ok((select purchased_credits=275 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000002'),'partial refund proportionally reverses purchased plus bonus');
-- Simulate an already settled use with an append-only entry; no AI provider calls.
insert into private.ai_credit_ledger(professional_id,type,purchased_delta,operation_key) values('ca300000-0000-4000-8000-000000000002','USAGE',-250,gen_random_uuid());
update private.ai_accounts set purchased_credits=purchased_credits-250,reserved_purchased=5 where professional_id='ca300000-0000-4000-8000-000000000002';
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_full','{"amount_refunded":2000}');
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_full_retry','{"amount_refunded":2000}');
select admin3_test.ok((select purchased_credits=-250 and reserved_purchased=5 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000002'),'full reversal records spent debt with reservation intact');
select admin3_test.ok(private.credit_purchase_summary('ca300000-0000-4000-8000-000000000002')->'balances'->>'available'='0','included credits cannot mask refund debt');
select admin3_test.reject($q$insert into private.ai_generations(professional_id) values('ca300000-0000-4000-8000-000000000002')$q$,'credit_account_restricted');
select private.adjust_ai_credits('ca300000-0000-4000-8000-000000000002',gen_random_uuid(),250);
select admin3_test.ok((select purchased_credits=0 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000002'),'admin adjustment regularizes debt');
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_refund_failed','{"amount_refunded":1000}');
select admin3_test.ok((select purchased_credits=275 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000002'),'failed previously succeeded refund restores only difference');
select admin3_test.ok((select sum(purchased_delta)=275 from private.ai_credit_ledger where credit_purchase_id='cd300000-0000-4000-8000-000000000001'),'purchase/refund/reversal ledger reconciles');
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_disputed','{"amount_refunded":1000,"dispute_id":"dp_test","dispute_status":"needs_response"}');
select admin3_test.reject($q$insert into private.ai_generations(professional_id) values('ca300000-0000-4000-8000-000000000002')$q$,'credit_account_restricted');
select admin3_test.event('cd300000-0000-4000-8000-000000000001','evt_credit_dispute_won','{"amount_refunded":1000,"dispute_id":"dp_test","dispute_status":"won"}');
select admin3_test.ok((select status='partially_refunded' from private.ai_credit_purchases where id='cd300000-0000-4000-8000-000000000001'),'won dispute clears review without granting again');
select admin3_test.prepare('ca300000-0000-4000-8000-000000000003','cb300000-0000-4000-8000-000000000001','','cd300000-0000-4000-8000-000000000002');
select admin3_test.event('cd300000-0000-4000-8000-000000000002','evt_credit_expired','{"paid":false,"checkout_status":"expired","amount_paid":0}');
select admin3_test.ok((select purchased_credits=0 from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000003'),'abandoned checkout grants nothing');
select set_config('request.jwt.claim.sub','ca300000-0000-4000-8000-000000000003',false);
select admin3_test.ok(jsonb_array_length(public.my_ai_credits()->'purchases')=1,'RPC shows only own purchases');
select admin3_test.reject($q$select public.ai_credit_admin_api('purchases')$q$,'admin_required');
select set_config('request.jwt.claim.sub','ca300000-0000-4000-8000-000000000001',false);
select public.ai_credit_admin_api('disable_package','{"id":"cb300000-0000-4000-8000-000000000001"}');
select admin3_test.reject($q$select admin3_test.prepare('ca300000-0000-4000-8000-000000000003','cb300000-0000-4000-8000-000000000001')$q$,'credit_package_unavailable');
select admin3_test.ok((select count(*)=2 from private.ai_credit_purchases),'package disabling preserves history');
select admin3_test.ok(jsonb_array_length(public.ai_credit_admin_api('purchases'))=2,'admin history returns both purchases');
select admin3_test.ok((select (item->>'purchases')::integer=1 and jsonb_array_length(item->'mappings')=1 from jsonb_array_elements(public.ai_credit_admin_api('packages')) item where item->>'code'='TEST_MEDIUM'),'admin catalog includes credited purchases and provider mapping');
-- Concurrent worker target and last available promotion, exercised by JS harness.
select admin3_test.prepare('ca300000-0000-4000-8000-000000000004','cb300000-0000-4000-8000-000000000003','','cd300000-0000-4000-8000-000000000003');
select public.billing_admin_api('save_campaign',jsonb_build_object('id','cc300000-0000-4000-8000-000000000002','target','ai_credit_package','code','TEST_LAST','name','Último uso TEST','audience','campaign','starts_at',now()-interval '1 hour','eligible_package_ids',jsonb_build_array('cb300000-0000-4000-8000-000000000003'),'eligible_plan_ids','[]'::jsonb,'intervals','["monthly"]'::jsonb,'benefits','[{"type":"fixed_discount","amount":1,"duration":{"kind":"invoice"}}]'::jsonb,'max_redemptions',1,'max_per_professional',1));
select 'PASS ADMIN-3 SQL: package admin, snapshots, eligibility, signed-event gate, ledger, refunds, debt, review, tenancy and renewal';

-- Eligibility is resolved from configuration, including internal and founder access.
do $$declare plan_code text; expected boolean; who uuid:='ca300000-0000-4000-8000-000000000008'; begin
 foreach plan_code in array array['esencial','profesional','beta','full_access'] loop
  update private.professional_access set plan_id=(select id from private.plans p where p.code=plan_code) where professional_id=who;
  expected:=(private.resolve_effective_entitlements(who)->'values'->>'ai.credit_purchase')::boolean;
  perform admin3_test.ok(private.credit_purchase_allowed(who)=expected,'configured eligibility: '||plan_code);
 end loop;
end$$;
select public.admin_api('grant_founder',jsonb_build_object('professional_id','ca300000-0000-4000-8000-000000000009','plan_id',(select id from private.plans where code='profesional'),'starts_at',now()-interval '1 day','reason','ADMIN-3 fixture founder'));
select admin3_test.ok(private.credit_purchase_allowed('ca300000-0000-4000-8000-000000000009'),'Founder inherits purchase permission');
update public.professional_profiles set onboarding_completed=false where id='ca300000-0000-4000-8000-000000000010';
select admin3_test.reject($q$select admin3_test.prepare('ca300000-0000-4000-8000-000000000010','cb300000-0000-4000-8000-000000000003')$q$,'credit_purchase_not_allowed');
-- Five abandoned sessions consume the hourly budget; preview remains read-only.
do $$declare pid uuid; begin for n in 1..5 loop
 pid:=admin3_test.prepare('ca300000-0000-4000-8000-000000000011','cb300000-0000-4000-8000-000000000003');
 perform admin3_test.event(pid,'evt_rate_'||n,'{"paid":false,"checkout_status":"expired","amount_paid":0}');
 end loop;end$$;
select admin3_test.reject($q$select admin3_test.prepare('ca300000-0000-4000-8000-000000000011','cb300000-0000-4000-8000-000000000003')$q$,'credit_checkout_rate_limited');

-- Existing reservation and settlement engine: included first, preserve in-flight debt.
-- A test-only entitlement admits the synthetic core_check feature through ADMIN-1.
insert into private.entitlement_catalog(key,label,category,value_type,display_order) values('ai.unsupported','Synthetic fixture','IA','boolean',999);
insert into private.plan_entitlements(plan_id,entitlement_key,value) select id,'ai.unsupported','true' from private.plans where code='esencial';
insert into private.ai_feature_config(feature,prompt_version) values('core_check','synthetic-test') on conflict do nothing;
update private.ai_feature_config set enabled=true,model='synthetic-test',pricing_version='synthetic-test',max_input_tokens=3000,max_output_tokens=16,input_usd_per_million=1000,output_usd_per_million=0,cached_usd_per_million=0,credits_per_usd=1,credit_multiplier=1 where feature='core_check';
insert into private.ai_feature_access(professional_id,feature,enabled) values('ca300000-0000-4000-8000-000000000012','core_check',true) on conflict(professional_id,feature) do update set enabled=true;
insert into private.ai_pilot_limits(professional_id,enabled,max_daily_credits,max_daily_generations,max_total_generations) values('ca300000-0000-4000-8000-000000000012',true,1000,20,100) on conflict(professional_id) do update set enabled=true,max_daily_credits=1000;
do $$declare who uuid:='ca300000-0000-4000-8000-000000000012';pid uuid;g jsonb;second_g jsonb; begin
 pid:=admin3_test.prepare(who,'cb300000-0000-4000-8000-000000000003');perform admin3_test.event(pid,'evt_inflight_paid');
 update private.ai_accounts set included_credits=1 where professional_id=who;
 g:=public.ai_server('reserve',who,jsonb_build_object('feature','core_check','idempotency_key',gen_random_uuid(),'request_hash',repeat('a',64),'config',public.ai_server('config',who,'{"feature":"core_check"}')))->'generation';
 perform admin3_test.ok((g->>'reserved_included')::numeric=1 and (g->>'reserved_purchased')::numeric=2,'existing reserve consumes included first');
 perform public.ai_server('claim',who,jsonb_build_object('generation_id',g->>'id'));
 second_g:=public.ai_server('reserve',who,jsonb_build_object('feature','core_check','idempotency_key',gen_random_uuid(),'request_hash',repeat('b',64),'config',public.ai_server('config',who,'{"feature":"core_check"}')))->'generation';
 perform admin3_test.event(pid,'evt_inflight_refunded','{"amount_refunded":5000}');
 begin perform public.ai_server('claim',who,jsonb_build_object('generation_id',second_g->>'id'));raise exception 'Expected blocked claim';exception when others then if sqlerrm<>'credit_account_restricted' then raise;end if;end;
 perform public.ai_server('settle',who,jsonb_build_object('generation_id',g->>'id','status','succeeded','input_tokens',3000,'output_tokens',0,'cached_tokens',0));
 perform public.ai_server('settle',who,jsonb_build_object('generation_id',second_g->>'id','status','failed','input_tokens',0,'output_tokens',0,'cached_tokens',0));
 perform admin3_test.ok((select included_credits=0 and purchased_credits=-2 and reserved_included=0 and reserved_purchased=0 from private.ai_accounts where professional_id=who),'in-flight settlement and release complete after refund without hiding debt');
end$$;
select 'PASS internal entitlements, Founder, rate limit, included-first reserve, refund during dispatch and debt settlement';

select admin3_test.reject($q$update private.ai_credit_ledger set purchased_delta=999 where credit_purchase_id='cd300000-0000-4000-8000-000000000001'$q$,'ledger_append_only');
select admin3_test.reject($q$delete from private.ai_credit_ledger where credit_purchase_id='cd300000-0000-4000-8000-000000000001'$q$,'ledger_append_only');
select admin3_test.ok((select credit_policy_snapshot->'expires_at'='null'::jsonb from private.ai_credit_purchases where id='cd300000-0000-4000-8000-000000000001'),'non-expiring policy is snapshotted');
select public.ai_credit_admin_api('save_package','{"id":"cb300000-0000-4000-8000-000000000002","version":2,"code":"TEST_MEDIUM","name":"Paquete TEST mínimo","credits":500,"price_amount":10,"currency":"MXN","active":true}');
select admin3_test.reject($q$select admin3_test.prepare('ca300000-0000-4000-8000-000000000007','cb300000-0000-4000-8000-000000000002','TEST_CREDITS')$q$,'credit_payment_minimum');
