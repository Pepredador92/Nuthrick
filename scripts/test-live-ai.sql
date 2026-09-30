-- Synthetic fixtures only, run by scripts/test-live-ai.mjs in a disposable DB.
create function pg_temp.ai_assert(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
create function pg_temp.ai_reject(q text,msg text) returns void language plpgsql as $$begin begin execute q;exception when others then if position(msg in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected error: %',msg;end$$;
select pg_temp.ai_assert(not (select production_enabled from private.ai_live_pilot_configuration),'rollout starts disabled');
select pg_temp.ai_assert(not private.ai_feature_allowed('1e000000-0000-4000-8000-000000000001','recall_24h'),'disabled before rollout');
update private.ai_live_pilot_configuration set production_enabled=true,credit_purchase_enabled=true;
update private.ai_feature_config set enabled=true,model='synthetic-model',pricing_version='synthetic',input_usd_per_million=1,cached_usd_per_million=0.1,output_usd_per_million=2 where feature in ('recall_24h','pes_diagnosis','diet_draft');
select pg_temp.ai_assert(private.ai_live_pilot_eligible('1e000000-0000-4000-8000-000000000001'),'eligible by paid plan');
select pg_temp.ai_assert(not private.ai_feature_allowed('1e000000-0000-4000-8000-000000000001','recall_24h'),'no consent means no provider access');
select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',true);
select pg_temp.ai_reject($q$select public.accept_ai_processing_consent('ai-processing-2026-09-30-v1',false)$q$,'patient_authorization_required');
select pg_temp.ai_reject($q$select public.accept_ai_processing_consent('old-version',true)$q$,'consent_version_changed');
select pg_temp.ai_reject($q$select public.accept_ai_processing_consent('ai-processing-2026-09-30-v1',true)$q$,'legal_acceptance_required');
update private.legal_documents set review_status='approved' where key='privacy';
insert into private.legal_acceptances(professional_id,document_key,document_version,source)
select '1e000000-0000-4000-8000-000000000001',key,version,'settings' from private.legal_documents where key='privacy';
select public.accept_ai_processing_consent('ai-processing-2026-09-30-v1',true);
select public.accept_ai_processing_consent('ai-processing-2026-09-30-v1',true);
select pg_temp.ai_assert((select count(*)=1 from private.ai_processing_consents),'consent retry is idempotent');
select pg_temp.ai_assert(private.ai_feature_allowed('1e000000-0000-4000-8000-000000000001','recall_24h'),'consent enables paid entitlement');
select pg_temp.ai_assert(not private.ai_feature_allowed('1e000000-0000-4000-8000-000000000001','diet_draft'),'Esencial cannot use Profesional feature');
select pg_temp.ai_assert((select ends_at is null and max_daily_generations=100 from private.ai_pilot_limits where professional_id='1e000000-0000-4000-8000-000000000001'),'no pilot expiration inherited');
select public.revoke_ai_processing_consent();
select pg_temp.ai_assert(not private.ai_feature_allowed('1e000000-0000-4000-8000-000000000001','recall_24h'),'revocation blocks new requests');
select public.accept_ai_processing_consent('ai-processing-2026-09-30-v1',true);
select pg_temp.ai_assert(not has_function_privilege('anon','public.accept_ai_processing_consent(text,boolean)','execute'),'anonymous cannot consent');
select pg_temp.ai_assert(not has_table_privilege('authenticated','private.ai_processing_consents','INSERT'),'client cannot forge consent history');
update private.ai_credit_packages set active=true,internal_only=false,test_only=false,price_amount=99 where id='cb300000-0000-4000-8000-000000000001';
select set_config('nuthrick.billing_environment','live',true);
do $$
declare owner uuid:='1e000000-0000-4000-8000-000000000001'; lk uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); ctx jsonb; p private.ai_credit_purchases; before_balance numeric; proof jsonb;
begin
 perform private.billing_subscription_server('lock',jsonb_build_object('owner',owner,'lock_key',lk));
 ctx:=private.credit_billing_server('credit_prepare',jsonb_build_object('owner',owner,'lock_key',lk,'package_id','cb300000-0000-4000-8000-000000000001','operation_key',op));
 select * into p from private.ai_credit_purchases where id=op;
 perform pg_temp.ai_assert(p.mode='live' and ctx->'price'->>'mode'='live','price and purchase are Live');
 select purchased_credits into before_balance from private.ai_accounts where professional_id=owner;
 perform private.credit_billing_server('credit_price_saved',jsonb_build_object('owner',owner,'lock_key',lk,'price_mapping_id',p.price_mapping_id,'price_id','price_live_credit_synthetic'));
 insert into private.billing_webhook_events(mode,provider_event_id,professional_id,event_type,provider_created_at) values('live','evt_ai_live_synthetic',owner,'checkout.session.completed',now());
 proof:=jsonb_build_object('mode','payment','livemode',false,'customer_id','cus_unit_live_monthly','purchase_id',op,'owner',owner,'price_id','price_live_credit_synthetic','quantity',1,'currency','MXN','amount_total',9900,'checkout_id','cs_live_credit_synthetic','paid',true,'checkout_status','complete','amount_paid',9900,'paid_at',now(),'payment_id','pi_live_credit_synthetic','charge_id','ch_live_credit_synthetic');
 begin
  perform private.apply_credit_payment(owner,jsonb_build_object('lock_key',lk,'purchase_id',op,'event_id','evt_ai_live_synthetic','payment',proof));
  raise exception 'TEST proof accepted for Live';
 exception when others then if sqlerrm<>'invalid_payment_identity' then raise; end if; end;
 proof:=proof||'{"livemode":true}';
 perform private.apply_credit_payment(owner,jsonb_build_object('lock_key',lk,'purchase_id',op,'event_id','evt_ai_live_synthetic','payment',proof));
 perform pg_temp.ai_assert((select purchased_credits=before_balance+p.credits_purchased+p.bonus_credits from private.ai_accounts where professional_id=owner),'confirmed Live payment grants exact credits');
 perform private.billing_subscription_server('lock',jsonb_build_object('owner',owner,'lock_key',lk));
 insert into private.billing_webhook_events(mode,provider_event_id,professional_id,event_type,provider_created_at) values('live','evt_ai_live_duplicate',owner,'payment_intent.succeeded',now());
 perform private.apply_credit_payment(owner,jsonb_build_object('lock_key',lk,'purchase_id',op,'event_id','evt_ai_live_duplicate','payment',proof));
 perform pg_temp.ai_assert((select count(*)=1 from private.ai_credit_ledger where credit_purchase_id=op and type='PURCHASE'),'different event cannot grant twice');
 perform private.billing_subscription_server('lock',jsonb_build_object('owner',owner,'lock_key',lk));
 insert into private.billing_webhook_events(mode,provider_event_id,professional_id,event_type,provider_created_at) values('live','evt_ai_live_refund',owner,'charge.refunded',now());
 perform private.apply_credit_payment(owner,jsonb_build_object('lock_key',lk,'purchase_id',op,'event_id','evt_ai_live_refund','payment',proof||'{"amount_refunded":9900}'));
 perform pg_temp.ai_assert((select purchased_credits=before_balance from private.ai_accounts where professional_id=owner),'full refund reverses credit grant');
end $$;
select pg_temp.ai_assert(private.ai_live_pilot_policy_valid(),'readiness validates production controls');
select 'PASS consent, plan permissions, Live/Test isolation, idempotent grant and refund reversal';
