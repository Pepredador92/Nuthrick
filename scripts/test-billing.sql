-- Disposable local fixture. No provider calls, real identities or clinical records.
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ASSERTION: %',label; end if;end$$;
insert into auth.users(id,email,email_confirmed_at) values
 ('ba000000-0000-4000-8000-000000000001','billing-admin@example.test',now()),
 ('ba000000-0000-4000-8000-000000000002','billing-a@example.test',now()),
 ('ba000000-0000-4000-8000-000000000003','billing-b@example.test',now());
insert into private.platform_admins(user_id) values('ba000000-0000-4000-8000-000000000001');
insert into private.billing_test_accounts(professional_id) values('ba000000-0000-4000-8000-000000000002'),('ba000000-0000-4000-8000-000000000003');
update private.billing_settings set enabled=true;
select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000001',false);
select public.billing_admin_api('save_campaign',jsonb_build_object('id','bb000000-0000-4000-8000-000000000001','code','UAZ2026','name','Universidad UAZ','audience','university','starts_at',now()-interval '1 day','eligible_plan_ids',jsonb_build_array((select id from private.plans where code='esencial')),'intervals',jsonb_build_array('monthly'),'benefits','[{"type":"custom_price","amount":249,"duration":{"kind":"months","months":12}},{"type":"initial_ai_credits","amount":20,"duration":{"kind":"invoice"}}]'::jsonb,'max_redemptions',100,'max_per_professional',1));
select pg_temp.assert_true(jsonb_array_length(public.billing_admin_api('campaigns'))=1,'admin campaign creation');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.billing_server(text,jsonb)','EXECUTE'),'service RPC is not callable by professional');
select pg_temp.assert_true(not has_function_privilege('anon','public.my_billing()','EXECUTE'),'anonymous billing denied');
select pg_temp.assert_true(not has_table_privilege('authenticated','private.billing_payments','SELECT'),'direct private payments denied');

do $$declare owner uuid:='ba000000-0000-4000-8000-000000000002'; lk uuid:=gen_random_uuid(); op uuid:='bc000000-0000-4000-8000-000000000001'; ctx jsonb; es uuid:=(select id from private.plans where code='esencial'); begin
 perform private.billing_server('lock',jsonb_build_object('owner',owner,'lock_key',lk));
 ctx:=private.billing_server('prepare_checkout',jsonb_build_object('owner',owner,'lock_key',lk,'operation_key',op,'plan_id',es,'interval','monthly','code','UAZ2026'));
 perform pg_temp.assert_true(ctx->'intent'->>'state'='reserved','checkout reserves usage');
 perform private.billing_server('customer_saved',jsonb_build_object('owner',owner,'lock_key',lk,'customer_id','cus_fixture_a'));
 perform private.billing_server('price_saved',jsonb_build_object('owner',owner,'lock_key',lk,'price_mapping_id',ctx->'price'->>'id','price_id','price_fixture_es_month'));
 perform private.billing_server('checkout_saved',jsonb_build_object('owner',owner,'lock_key',lk,'intent_id',op,'session_id','cs_fixture_a','url','https://checkout.stripe.com/c/pay/cs_fixture_a','expires_at',extract(epoch from now()+interval '35 minutes')));
 ctx:=private.billing_server('prepare_checkout',jsonb_build_object('owner',owner,'lock_key',lk,'operation_key',gen_random_uuid(),'plan_id',es,'interval','monthly','code','UAZ2026'));
 perform pg_temp.assert_true(ctx->'intent'->>'id'=op::text,'checkout retry reuses reserved intent');
 perform pg_temp.assert_true(not exists(select 1 from private.professional_access where professional_id=owner),'checkout URL cannot activate access');
 perform private.billing_server('unlock',jsonb_build_object('owner',owner,'lock_key',lk));
end $$;

create function pg_temp.snapshot(p_status text,p_invoice_status text,p_start timestamptz,p_end timestamptz,p_invoice text default 'in_fixture_a') returns jsonb language sql as $$
 select jsonb_build_object('id','sub_fixture_a','intent_id','bc000000-0000-4000-8000-000000000001','customer_id','cus_fixture_a','price_id','price_fixture_es_month','livemode',false,'status',p_status,'provider_status',p_status,'period_start',p_start,'period_end',p_end,'anchor',now()-interval '1 day','cancel_at_period_end',false,'pending_update',false,'latest_invoice',jsonb_build_object('id',p_invoice,'subscription_id','sub_fixture_a','customer_id','cus_fixture_a','price_id','price_fixture_es_month','status',p_invoice_status,'amount_due',24900,'amount_paid',case when p_invoice_status='paid' then 24900 else 0 end,'currency','MXN','created',p_start,'paid_at',case when p_invoice_status='paid' then p_start else null end,'period_start',p_start,'period_end',p_end,'hosted_url','https://invoice.stripe.com/i/fixture'))
$$;
create function pg_temp.event(p_id text,p_snapshot jsonb) returns jsonb language plpgsql as $$declare lk uuid:=gen_random_uuid(); ctx jsonb; begin
 ctx:=private.billing_server('claim_event',jsonb_build_object('event_id',p_id,'type','customer.subscription.updated','customer_id','cus_fixture_a','subscription_id','sub_fixture_a','created',extract(epoch from now()),'livemode',false,'lock_key',lk));
 if ctx->>'replay'='true' then return ctx; end if;
 return private.billing_server('apply',jsonb_build_object('event_id',p_id,'owner',ctx->>'owner','lock_key',lk,'subscription',p_snapshot)); end $$;
select pg_temp.event('evt_initial_incomplete',pg_temp.snapshot('incomplete','open',now()-interval '1 day',now()+interval '29 days'));
select pg_temp.assert_true(not exists(select 1 from private.professional_access where professional_id='ba000000-0000-4000-8000-000000000002'),'unpaid subscription cannot activate');
select pg_temp.event('evt_paid',pg_temp.snapshot('active','paid',now()-interval '1 day',now()+interval '29 days'));
do $$declare lk uuid:=gen_random_uuid(); ctx jsonb; begin
 ctx:=private.billing_server('claim_event',jsonb_build_object('event_id','evt_delayed','type','customer.subscription.updated','customer_id','cus_fixture_a','subscription_id','sub_fixture_a','created',extract(epoch from now()),'livemode',false,'lock_key',lk));
 perform private.billing_server('event_failed',jsonb_build_object('owner',ctx->>'owner','lock_key',lk,'event_id','evt_delayed','code','billing_unavailable'));
 perform pg_temp.assert_true((select processed_at is null and last_error='billing_unavailable' from private.billing_webhook_events where provider_event_id='evt_delayed'),'failed event remains unprocessed with safe diagnostics');
 perform private.billing_server('unlock',jsonb_build_object('owner',ctx->>'owner','lock_key',lk));
end $$;
select pg_temp.assert_true((select status='active' and source='billing' from private.professional_access where professional_id='ba000000-0000-4000-8000-000000000002'),'first successful payment activates after incomplete webhook');
select pg_temp.assert_true((select purchased_credits=20 and included_credits=10 from private.ai_accounts where professional_id='ba000000-0000-4000-8000-000000000002'),'welcome ledger plus one monthly allocation');
select pg_temp.assert_true((select count(*)=1 from private.promotion_redemptions),'one attribution');
select pg_temp.event('evt_paid',pg_temp.snapshot('active','paid',now()-interval '1 day',now()+interval '29 days'));
select pg_temp.event('evt_delayed',pg_temp.snapshot('active','paid',now()-interval '1 day',now()+interval '29 days'));
select pg_temp.assert_true((select attempts=2 and last_error is null and processed_at is not null from private.billing_webhook_events where provider_event_id='evt_delayed'),'webhook retry clears failure without losing the event');
select pg_temp.assert_true((select count(*)=2 from private.ai_credit_ledger where professional_id='ba000000-0000-4000-8000-000000000002'),'duplicate/different event IDs do not duplicate credits');
select pg_temp.assert_true((select count(*)=1 from private.billing_payments),'invoices deduplicated');
-- Failed immediate upgrade keeps the paid plan active for its remaining paid period.
select pg_temp.event('evt_unpaid_upgrade',pg_temp.snapshot('active','open',now()-interval '1 day',now()+interval '29 days','in_upgrade'));
select pg_temp.assert_true((select status='active' from private.professional_access where professional_id='ba000000-0000-4000-8000-000000000002'),'unpaid upgrade preserves paid access');
-- Renewal fails after the existing paid period.
update private.billing_subscriptions set paid_through=now()-interval '1 hour' where provider_subscription_id='sub_fixture_a';
select pg_temp.event('evt_renewal_failed',pg_temp.snapshot('payment_due','open',now(),now()+interval '30 days','in_renewal'));
select pg_temp.assert_true((select state='grace' and grace_until>now()+interval '6 days' from private.billing_subscriptions where provider_subscription_id='sub_fixture_a'),'seven day grace');
select pg_temp.assert_true(private.resolve_effective_entitlements('ba000000-0000-4000-8000-000000000002')->>'allowed'='true','grace allows usage');
update private.billing_subscriptions set grace_until=now()-interval '1 second' where provider_subscription_id='sub_fixture_a';
select pg_temp.assert_true(private.resolve_effective_entitlements('ba000000-0000-4000-8000-000000000002')->>'read_only'='true','expired grace is read-only before cron');
select private.billing_tick();
select pg_temp.assert_true((select status='suspended' from private.professional_access where professional_id='ba000000-0000-4000-8000-000000000002'),'cron persists suspension');
select pg_temp.event('evt_recovered',pg_temp.snapshot('active','paid',now(),now()+interval '30 days','in_renewal'));
select pg_temp.assert_true((select status='active' from private.professional_access where professional_id='ba000000-0000-4000-8000-000000000002'),'recovery reactivates');
select pg_temp.assert_true((select count(*)=1 from private.promotion_redemptions),'recovery does not re-redeem promotion');
-- Own billing only, plus operations are idempotent and cannot be forged by a different actor.
select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000003',false);
select pg_temp.assert_true(public.my_billing()->'subscription'='null'::jsonb,'another professional sees no subscription');
do $$declare owner uuid:='ba000000-0000-4000-8000-000000000002'; lk uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); ctx jsonb; begin
 perform private.billing_server('lock',jsonb_build_object('owner',owner,'lock_key',lk));
 ctx:=private.billing_server('prepare_operation',jsonb_build_object('owner',owner,'actor',owner,'lock_key',lk,'operation_key',op,'action','cancel','request','{}'::jsonb));
 perform private.billing_server('operation_saved',jsonb_build_object('owner',owner,'actor',owner,'lock_key',lk,'operation_key',op,'result','{"requested":true}'::jsonb));
 ctx:=private.billing_server('prepare_operation',jsonb_build_object('owner',owner,'actor',owner,'lock_key',lk,'operation_key',op,'action','cancel','request','{}'::jsonb));
 perform pg_temp.assert_true(ctx->>'replay'='true','operation replay');
 perform private.billing_server('unlock',jsonb_build_object('owner',owner,'lock_key',lk));
end $$;
select 'PASS billing SQL: authorization, checkout, first activation, invoice/credit idempotence, attribution, grace, recovery and operation replay';

create function pg_temp.reject(p_sql text,p_error text) returns void language plpgsql as $$begin
 begin execute p_sql; exception when others then if sqlerrm=p_error or position(p_error in sqlerrm)>0 then return; end if; raise; end;
 raise exception 'Expected error %',p_error;
end $$;
select pg_temp.reject($q$select public.billing_admin_api('campaigns')$q$,'admin_required');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.billing_provider_credentials()','EXECUTE'),'professional cannot read provider credentials');
select pg_temp.assert_true(not has_function_privilege('anon','public.billing_provider_credentials()','EXECUTE'),'anonymous cannot read provider credentials');
select pg_temp.reject($q$update private.promotion_campaigns set benefits='[{"type":"percentage_discount","duration":{"kind":"invoice"}}]' where code='UAZ2026'$q$,'invalid_benefit');
select pg_temp.reject($q$update private.promotion_campaigns set benefits='[{"type":"free_period","duration":{"kind":"months","months":1.5}}]' where code='UAZ2026'$q$,'invalid_duration');
select pg_temp.reject($q$update private.promotion_campaigns set intervals=array['annual'],benefits='[{"type":"free_period","duration":{"kind":"months","months":3}}]' where code='UAZ2026'$q$,'free_period_requires_monthly');
select pg_temp.reject($q$update private.promotion_campaigns set benefits='[{"type":"initial_ai_credits","amount":0,"duration":{"kind":"invoice"}}]' where code='UAZ2026'$q$,'invalid_benefit');
select pg_temp.reject($q$update private.promotion_campaigns set benefits='[{"type":"percentage_discount","amount":20,"duration":{"kind":"invoice"}},{"type":"free_period","duration":{"kind":"invoice"}}]' where code='UAZ2026'$q$,'one_financial_benefit');

do $$declare c private.promotion_campaigns; owner uuid:='ba000000-0000-4000-8000-000000000003'; es uuid:=(select id from private.plans where code='esencial'); pro uuid:=(select id from private.plans where code='profesional'); begin
 select * into c from private.promotion_campaigns where code='UAZ2026';
 c.active:=false;begin perform private.promotion_eligible(owner,c,es,'monthly');raise exception 'Expected disabled';exception when others then if sqlerrm<>'promotion_unavailable' then raise;end if;end;c.active:=true;
 c.ends_at:=now()-interval '1 second';begin perform private.promotion_eligible(owner,c,es,'monthly');raise exception 'Expected expired';exception when others then if sqlerrm<>'promotion_expired' then raise;end if;end;c.ends_at:=null;
 begin perform private.promotion_eligible(owner,c,pro,'monthly');raise exception 'Expected plan mismatch';exception when others then if sqlerrm<>'promotion_plan_ineligible' then raise;end if;end;
 begin perform private.promotion_eligible(owner,c,es,'annual');raise exception 'Expected interval mismatch';exception when others then if sqlerrm<>'promotion_interval_ineligible' then raise;end if;end;
 c.max_redemptions:=1;begin perform private.promotion_eligible(owner,c,es,'monthly');raise exception 'Expected total limit';exception when others then if sqlerrm<>'promotion_limit_reached' then raise;end if;end;c.max_redemptions:=100;
 begin perform private.promotion_eligible('ba000000-0000-4000-8000-000000000002',c,es,'monthly');raise exception 'Expected second use rejected';exception when others then if sqlerrm<>'promotion_already_used' then raise;end if;end;
 c.new_customers_only:=true;begin perform private.promotion_eligible('ba000000-0000-4000-8000-000000000002',c,es,'monthly');raise exception 'Expected new customer restriction';exception when others then if sqlerrm<>'promotion_new_customers_only' then raise;end if;end;
end $$;

create function pg_temp.event_for(p_owner uuid,p_snap jsonb,p_id text) returns jsonb language plpgsql as $$declare lk uuid:=gen_random_uuid();ctx jsonb;begin
 ctx:=private.billing_server('claim_event',jsonb_build_object('event_id',p_id,'type','customer.subscription.updated','customer_id',p_snap->>'customer_id','subscription_id',p_snap->>'id','created',extract(epoch from now()),'livemode',false,'lock_key',lk));
 if ctx->>'replay'='true' then return ctx;end if;
 return private.billing_server('apply',jsonb_build_object('owner',p_owner,'lock_key',lk,'event_id',p_id,'subscription',p_snap));
end $$;
create function pg_temp.seed_checkout(p_owner uuid,p_code text,p_interval text,p_promo text default '') returns jsonb language plpgsql as $$declare lk uuid:=gen_random_uuid();op uuid:=gen_random_uuid();ctx jsonb;pid text;cid text:='cus_'||replace(p_owner::text,'-','');sid text:='sub_'||replace(op::text,'-','');snap jsonb;starts timestamptz:=now()-interval '1 day';ends timestamptz;begin
 insert into auth.users(id,email,email_confirmed_at) values(p_owner,p_owner::text||'@example.test',now()) on conflict(id) do nothing;
 insert into private.billing_test_accounts(professional_id) values(p_owner) on conflict do nothing;
 perform private.billing_server('lock',jsonb_build_object('owner',p_owner,'lock_key',lk));
 ctx:=private.billing_server('prepare_checkout',jsonb_build_object('owner',p_owner,'lock_key',lk,'operation_key',op,'plan_id',(select id from private.plans where code=p_code),'interval',p_interval,'code',p_promo));
 pid:=coalesce(ctx->'price'->>'provider_price_id','price_'||p_code||'_'||p_interval);
 perform private.billing_server('customer_saved',jsonb_build_object('owner',p_owner,'lock_key',lk,'customer_id',cid));
 perform private.billing_server('price_saved',jsonb_build_object('owner',p_owner,'lock_key',lk,'price_mapping_id',ctx->'price'->>'id','price_id',pid));
 perform private.billing_server('checkout_saved',jsonb_build_object('owner',p_owner,'lock_key',lk,'intent_id',op,'session_id','cs_'||replace(op::text,'-',''),'url','https://checkout.stripe.com/c/pay/fixture','expires_at',extract(epoch from now()+interval '35 minutes')));
 perform private.billing_server('unlock',jsonb_build_object('owner',p_owner,'lock_key',lk));
 ends:=starts+case when p_interval='annual' then interval '1 year' else interval '1 month' end;
 snap:=jsonb_build_object('id',sid,'intent_id',op,'customer_id',cid,'price_id',pid,'status','active','provider_status','active','livemode',false,'period_start',starts,'period_end',ends,'anchor',starts,'cancel_at_period_end',false,'pending_update',false,'latest_invoice',jsonb_build_object('id','in_'||replace(op::text,'-',''),'subscription_id',sid,'customer_id',cid,'price_id',pid,'status','paid','amount_due',ctx->'price'->'amount','amount_paid',ctx->'price'->'amount','currency','MXN','created',starts,'paid_at',starts,'period_start',starts,'period_end',ends,'hosted_url','https://invoice.stripe.com/i/fixture'));
 perform pg_temp.event_for(p_owner,snap,'evt_'||replace(op::text,'-',''));return snap;
end $$;
create temp table fixture_snapshots(name text primary key,snapshot jsonb);
insert into fixture_snapshots values('annual',pg_temp.seed_checkout('ba000000-0000-4000-8000-000000000005','profesional','annual'));
select pg_temp.assert_true((select included_credits=50 from private.ai_accounts where professional_id='ba000000-0000-4000-8000-000000000005'),'annual starts with one month, not 600 credits');
select private.billing_tick(now()+interval '1 month');
select private.billing_tick(now()+interval '1 month');
select pg_temp.assert_true((select included_credits=50 from private.ai_accounts where professional_id='ba000000-0000-4000-8000-000000000005'),'annual balance renews monthly without accumulating');
select pg_temp.assert_true((select count(*)=2 from private.ai_credit_ledger where professional_id='ba000000-0000-4000-8000-000000000005' and type='PLAN_ALLOCATION'),'annual concurrent/repeated tick grants a month once');
-- Cancellation keeps clinical records and an old subscription cannot override a new one.
insert into public.patients(professional_id,full_name) values('ba000000-0000-4000-8000-000000000005','SYNTHETIC ANNUAL PATIENT');
select pg_temp.event_for('ba000000-0000-4000-8000-000000000005',snapshot||'{"cancel_at_period_end":true}'::jsonb,'evt_cancel_at_end') from fixture_snapshots where name='annual';
select pg_temp.assert_true((select status='active' from private.professional_access where professional_id='ba000000-0000-4000-8000-000000000005'),'cancel at period end retains access');
select pg_temp.event_for('ba000000-0000-4000-8000-000000000005',snapshot||'{"cancel_at_period_end":false}'::jsonb,'evt_resumed') from fixture_snapshots where name='annual';
select pg_temp.assert_true((select not cancel_at_period_end from private.billing_subscriptions where professional_id='ba000000-0000-4000-8000-000000000005'),'resume clears cancellation');
select pg_temp.event_for('ba000000-0000-4000-8000-000000000005',snapshot||'{"status":"ended","provider_status":"canceled"}'::jsonb,'evt_ended') from fixture_snapshots where name='annual';
select pg_temp.assert_true((select status='cancelled' from private.professional_access where professional_id='ba000000-0000-4000-8000-000000000005'),'immediate termination ends access');
select pg_temp.assert_true((select count(*)=1 from public.patients where professional_id='ba000000-0000-4000-8000-000000000005'),'cancellation preserves patients');
insert into fixture_snapshots values('resubscribed',pg_temp.seed_checkout('ba000000-0000-4000-8000-000000000005','esencial','annual'));
select pg_temp.event_for('ba000000-0000-4000-8000-000000000005',snapshot||'{"status":"ended","provider_status":"canceled"}'::jsonb,'evt_old_ended_delayed') from fixture_snapshots where name='annual';
select pg_temp.assert_true((select status='active' and plan_id=(select id from private.plans where code='esencial') from private.professional_access where professional_id='ba000000-0000-4000-8000-000000000005'),'old subscription cannot cancel newer subscription');
-- Temporary benefits reuse existing grants/overrides and expire to the base plan.
insert into private.promotion_campaigns(code,name,audience,eligible_plan_ids,intervals,benefits,starts_at) select 'BONUSACCESS','Temporal','campaign',array[id],array['annual'],jsonb_build_array(jsonb_build_object('type','plan_upgrade','plan_id',(select id from private.plans where code='profesional'),'duration',jsonb_build_object('kind','months','months',1)),jsonb_build_object('type','temporary_entitlement','entitlement','exports.tex','value',true,'duration',jsonb_build_object('kind','months','months',1)),jsonb_build_object('type','initial_ai_credits','amount',20,'duration',jsonb_build_object('kind','invoice'))),now()-interval '1 day' from private.plans where code='esencial';
insert into fixture_snapshots values('temporary',pg_temp.seed_checkout('ba000000-0000-4000-8000-000000000006','esencial','annual','BONUSACCESS'));
select pg_temp.assert_true(private.resolve_effective_entitlements('ba000000-0000-4000-8000-000000000006')->>'plan_name'='Profesional','promotion plan upgrade is effective');
select pg_temp.assert_true((select included_credits=50 and purchased_credits=20 from private.ai_accounts where professional_id='ba000000-0000-4000-8000-000000000006'),'promotion upgrade monthly credits plus welcome ledger');
update private.access_grants set ends_at=now()-interval '1 second' where professional_id='ba000000-0000-4000-8000-000000000006';
update private.professional_overrides set ends_at=now()-interval '1 second' where professional_id='ba000000-0000-4000-8000-000000000006';
select pg_temp.assert_true(private.resolve_effective_entitlements('ba000000-0000-4000-8000-000000000006')->>'plan_name'='Esencial','expired grant restores base plan');
select pg_temp.assert_true(private.resolve_effective_entitlements('ba000000-0000-4000-8000-000000000006')->'values'->>'exports.tex'='false','expired temporary permission restores base entitlement');
select private.billing_tick(now()+interval '1 month');
select pg_temp.assert_true((select included_credits=10 and purchased_credits=20 from private.ai_accounts where professional_id='ba000000-0000-4000-8000-000000000006'),'next annual allocation falls back to base credits, welcome credits remain');
-- Administrative changes stay authoritative across later paid webhooks.
update private.professional_access set status='suspended',updated_at=now() where professional_id='ba000000-0000-4000-8000-000000000006';
select pg_temp.event_for('ba000000-0000-4000-8000-000000000006',snapshot,'evt_paid_after_manual_hold') from fixture_snapshots where name='temporary';
select pg_temp.assert_true((select status='suspended' from private.professional_access where professional_id='ba000000-0000-4000-8000-000000000006'),'webhook cannot override an administrative suspension');
select 'PASS billing lifecycle: annual/monthly credits, cancel/resume, resubscribe, stale old subscriptions, benefit expiry and admin precedence';

-- Actual price transitions through billing_apply, including a 60-patient downgrade.
insert into fixture_snapshots values('changing',pg_temp.seed_checkout('ba000000-0000-4000-8000-000000000007','esencial','monthly'));
do $$declare owner uuid:='ba000000-0000-4000-8000-000000000007'; snap jsonb; pro private.billing_price_mappings; es text; begin
 select snapshot into snap from fixture_snapshots where name='changing'; es:=snap->>'price_id';
 pro:=private.billing_price((select id from private.plans where code='profesional'),'monthly');
 update private.billing_price_mappings set provider_price_id='price_profesional_monthly' where id=pro.id;
 snap:=jsonb_set(snap,'{price_id}','"price_profesional_monthly"');
 snap:=jsonb_set(snap,'{latest_invoice}',(snap->'latest_invoice')||'{"id":"in_change_upgrade","price_id":"price_profesional_monthly","status":"open","amount_paid":0}');
 perform pg_temp.event_for(owner,snap,'evt_change_unpaid');
 perform pg_temp.assert_true(private.resolve_effective_entitlements(owner)->>'plan_name'='Esencial','unpaid new price does not upgrade access');
 snap:=jsonb_set(snap,'{latest_invoice}',(snap->'latest_invoice')||'{"status":"paid","amount_due":15000,"amount_paid":15000}');
 perform pg_temp.event_for(owner,snap,'evt_change_paid');
 perform pg_temp.assert_true(private.resolve_effective_entitlements(owner)->>'plan_name'='Profesional','paid prorated upgrade changes access');
 perform pg_temp.assert_true((select p.code='esencial' from private.billing_payments b join private.billing_price_mappings m on m.id=b.price_mapping_id join private.plans p on p.id=m.plan_id where b.provider_invoice_id=(select snapshot->'latest_invoice'->>'id' from fixture_snapshots where name='changing')),'old invoice keeps historical essential plan');
 insert into public.patients(professional_id,full_name) select owner,'SYNTHETIC BILLING DOWNGRADE '||n from generate_series(1,60)n;
 update private.billing_subscriptions set pending_plan_id=(select id from private.plans where code='esencial'),pending_interval='monthly' where professional_id=owner;
 perform pg_temp.event_for(owner,snap,'evt_change_scheduled');
 perform pg_temp.assert_true(private.resolve_effective_entitlements(owner)->>'plan_name'='Profesional','pending downgrade preserves paid professional plan');
 snap:=jsonb_set(snap,'{price_id}',to_jsonb(es));
 snap:=jsonb_set(snap,'{latest_invoice}',(snap->'latest_invoice')||jsonb_build_object('id','in_change_downgrade','price_id',es,'amount_paid',34900,'amount_due',34900));
 perform pg_temp.event_for(owner,snap,'evt_change_downgrade');
 perform pg_temp.assert_true(private.resolve_effective_entitlements(owner)->>'plan_name'='Esencial','verified paid downgrade applies essential plan');
end $$;
select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000007',false);
set role authenticated;
select pg_temp.assert_true(public.my_access()->'access'->'patient_usage'->>'over_limit'='true','billing downgrade marks over_limit');
select pg_temp.assert_true((select count(*)=60 from public.patients where status='active'),'all 60 patients remain active');
select pg_temp.reject($q$insert into public.patients(full_name) values('BLOCKED OVER LIMIT')$q$,'patients_limit_reached');
update public.patients set full_name='EXISTING RECORD REMAINS EDITABLE' where id=(select id from public.patients limit 1);
reset role;
select 'PASS billing upgrade/downgrade: unpaid protection, paid activation, historical invoices, scheduled access and 60 existing patients preserved';
