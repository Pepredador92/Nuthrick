-- Operational mail can consume real business events independently of Stripe mode.
-- Delivery remains controlled until the existing sender tests and launch gates pass.
alter table private.transactional_email_settings drop constraint transactional_email_settings_delivery_mode_check;
alter table private.transactional_email_settings add constraint transactional_email_settings_delivery_mode_check check(delivery_mode in ('simulated','controlled','operational'));
alter table private.transactional_email_settings add column operational_since timestamptz;

create or replace function private.enqueue_transactional_email(p_event_key text,p_owner uuid,p_template_key text,p_payload jsonb default '{}',p_recipient_email text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;safe jsonb;recipient text;env text;begin
 if p_event_key is null or p_event_key !~ '^[A-Za-z0-9_:.-]{3,180}$' then raise exception 'invalid_email_event';end if;
 if not exists(select 1 from private.transactional_email_templates where key=p_template_key and active) then raise exception 'email_template_unavailable';end if;
 env:=coalesce(p_payload->'metadata'->>'mode',p_payload->>'mode','test');
 if env not in ('test','live') then raise exception 'invalid_email_environment';end if;
 -- Only explicitly selected operational fields may leave the business module.
 safe:=jsonb_strip_nulls(jsonb_build_object('mode',env,'ends_at',p_payload->>'ends_at','ended_at',p_payload->>'ended_at','amount_minor',p_payload->'amount_minor','currency',p_payload->>'currency','event',p_template_key));
 recipient:=lower(btrim(coalesce(p_recipient_email,(select email from auth.users where id=p_owner))));
 insert into private.transactional_email_outbox(event_key,professional_id,recipient_email,template_key,payload,mode,configuration_revision)
 values(p_event_key,p_owner,recipient,p_template_key,safe,env,(select configuration_revision from private.transactional_email_settings where id)) on conflict(event_key) do nothing returning id into result_id;
 return result_id;
end $$;

-- Generate mail from canonical state changes, rather than every synchronization audit.
create function private.subscription_email_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; event_suffix text; payload jsonb;begin
 payload:=jsonb_build_object('mode',new.mode,'ends_at',coalesce(new.grace_until,new.period_end));
 event_suffix:=new.id::text||':'||coalesce(new.latest_invoice_id,extract(epoch from new.period_start)::bigint::text);
 if tg_op='INSERT' or old.state is distinct from new.state then
  k:=case new.state when 'active' then case when tg_op='UPDATE' and old.state in ('grace','suspended') then 'payment_recovered' else 'subscription_activated' end when 'grace' then 'grace_started' when 'suspended' then 'account_suspended' when 'cancelled' then 'subscription_cancelled' end;
  if k is not null then perform private.enqueue_transactional_email('subscription:'||event_suffix||':'||k,new.professional_id,k,payload);end if;
 end if;
 if new.provider_status in ('past_due','unpaid','incomplete') and (tg_op='INSERT' or old.provider_status is distinct from new.provider_status) then
  perform private.enqueue_transactional_email('subscription:'||event_suffix||':payment_failed',new.professional_id,'payment_failed',payload);
 end if;
 if new.cancel_at_period_end and (tg_op='INSERT' or not old.cancel_at_period_end) then
  perform private.enqueue_transactional_email('subscription:'||event_suffix||':cancellation_scheduled',new.professional_id,'cancellation_scheduled',jsonb_build_object('mode',new.mode,'ends_at',new.period_end));
 end if;
 return new;
end $$;
create trigger subscription_operational_email after insert or update on private.billing_subscriptions for each row execute function private.subscription_email_trigger();
revoke all on function private.subscription_email_trigger() from public,anon,authenticated,service_role;

create function private.payment_email_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
  perform private.enqueue_transactional_email('invoice:'||new.mode||':'||new.provider_invoice_id||':paid',new.professional_id,'payment_confirmed',jsonb_build_object('mode',new.mode,'amount_minor',new.amount_paid,'currency',new.currency));
 end if;
 return new;
end $$;
create trigger payment_operational_email after insert or update on private.billing_payments for each row execute function private.payment_email_trigger();
revoke all on function private.payment_email_trigger() from public,anon,authenticated,service_role;

create or replace function private.transactional_email_audit_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; payload jsonb;begin
 if new.target_professional is null then return new;end if;
 k:=case when new.action in ('promotion_redeemed','code_redeemed') then 'promotion_applied' when new.action='purchase_paid' then 'credits_purchased' when new.action='refund' then 'credits_refunded' else null end;
 if k is not null then
  payload:=jsonb_build_object('metadata',jsonb_build_object('mode',case when new.action='code_redeemed' then 'live' else new.metadata->>'mode' end),'amount_minor',coalesce(new.metadata->'amount',new.metadata->'refunded_amount'),'currency',coalesce(new.metadata->>'currency','MXN'));
  perform private.enqueue_transactional_email('audit:'||new.id::text||':'||k,new.target_professional,k,payload);
 end if;
 return new;
end $$;

-- Beta is a real entitlement, independent from payment-provider test events.
create or replace function private.enqueue_beta_lifecycle_emails() returns integer language plpgsql security definer set search_path='' as $$
declare a record;n integer:=0;r uuid;k text;begin
 for a in select professional_id,ends_at from private.professional_access where source='beta_code' and status not in ('cancelled','suspended') and ends_at is not null and ends_at<=now()+interval '7 days' and ends_at>=now()-interval '1 day' loop
  k:=case when a.ends_at>now() then 'beta_expiring' else 'beta_expired' end;
  r:=private.enqueue_transactional_email(k||':'||a.professional_id::text||':'||extract(epoch from a.ends_at)::bigint::text,a.professional_id,k,jsonb_build_object('mode','live','ends_at',a.ends_at));
  if r is not null then n:=n+1;end if;
 end loop;return n;
end $$;
create or replace function private.professional_welcome_email_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform private.enqueue_transactional_email('welcome:'||new.id::text,new.id,'welcome','{"mode":"live"}');return new;
end $$;

-- Renewal data must come from the billing provider, including discounts and taxes.
-- Internal service entry point; no arbitrary client-supplied dates, prices or recipients.
create function private.queue_verified_renewal(p_subscription uuid,p_at timestamptz,p_amount bigint,p_currency text) returns uuid language plpgsql security definer set search_path='' as $$
declare s private.billing_subscriptions;begin
 select * into s from private.billing_subscriptions where id=p_subscription;
 if s.id is null or s.state not in ('active','trial') or s.cancel_at_period_end or p_at is distinct from s.period_end or p_at<now()+interval '5 days' or p_at>now()+interval '8 days' or p_amount is null or p_amount<0 or p_currency is distinct from 'MXN' then raise exception 'invalid_renewal_notice';end if;
 return private.enqueue_transactional_email('renewal:'||s.id::text||':'||extract(epoch from p_at)::bigint::text,s.professional_id,'renewal_upcoming',jsonb_build_object('mode',s.mode,'ends_at',p_at,'amount_minor',p_amount,'currency',p_currency));
end $$;
revoke all on function private.queue_verified_renewal(uuid,timestamptz,bigint,text) from public,anon,authenticated,service_role;

-- Extend claims only for fresh real events after activation. Never release historical backlog.
do $patch$
declare d text;original text;begin
 d:=pg_get_functiondef('private.transactional_email_server(text,jsonb)'::regprocedure);original:=d;
 d:=replace(d,$old$s.delivery_mode<>'controlled'$old$,$new$s.delivery_mode not in ('controlled','operational')$new$);
 d:=replace(d,$old$and is_test_delivery and mode='test'$old$,$new$and ((is_test_delivery and mode='test') or (s.delivery_mode='operational' and not is_test_delivery and mode='live' and created_at>=s.operational_since))$new$);
 d:=replace(d,$old$and exists(select 1 from private.transactional_email_test_recipients r where r.email=o.recipient_email)$old$,$new$and (not is_test_delivery or exists(select 1 from private.transactional_email_test_recipients r where r.email=o.recipient_email))$new$);
 d:=replace(d,$old$'subject',t.subject,'body',t.body,$old$,$new$'subject',t.subject,'body',t.body,'details',payload,$new$);
 d:=replace(d,$old$lk:=(p_data->>'lease_key')::uuid;$old$,$new$-- An expired Gmail lease with a prepared message has an unknown outcome.
  if s.provider='gmail' then
   update private.transactional_email_outbox set status='failed',attempts=5,delivery_status='unknown',last_error='email_delivery_requires_reconciliation',lease_key=null,lease_until=null
   where lease_until<now() and prepared_message is not null and provider_message_id is null and attempts>0;
  end if;
  lk:=(p_data->>'lease_key')::uuid;$new$);
 d:=replace(d,$old$case when (p_data->>'failed')::integer>0 then 'failed'$old$,$new$case when (p_data->>'failed')::integer>0 or coalesce((p_data->>'collection_failed')::boolean,false) then 'failed'$new$);
 d:=replace(d,$old$'failed',p_data->'failed'))$old$,$new$'failed',p_data->'failed','collection_failed',p_data->'collection_failed'))$new$);
 if original=d or position('details' in d)=0 or position('operational_since' in d)=0 then raise exception 'commercial_claim_patch_missing';end if;
 execute d;
 d:=pg_get_functiondef('private.email_admin_api(text,jsonb)'::regprocedure);
 d:=replace(d,$old$if item.first_attempt_at<now()-interval '23 hours' then$old$,$new$if item.delivery_status='unknown' or item.first_attempt_at<now()-interval '23 hours' then$new$);
 execute d;
end $patch$;

-- Transport proof and commercial readiness are separate assertions.
do $transport$
declare d text;begin
 d:=pg_get_functiondef('private.transactional_email_ready()'::regprocedure);
 d:=replace(d,'FUNCTION private.transactional_email_ready()','FUNCTION private.transactional_email_transport_ready()');
 d:=replace(d,'s.delivery_mode=''controlled''','s.delivery_mode in (''controlled'',''operational'')');
 d:=replace(d,'count(*)=15','count(*)=16');
 d:=replace(d,'s.last_worker_at is not null','s.last_worker_at>now()-interval ''30 minutes''');
 execute d;
end $transport$;
create or replace function private.transactional_email_ready() returns boolean language sql stable security definer set search_path='' as $$
 select private.transactional_email_transport_ready()
 and (select delivery_mode='operational' from private.transactional_email_settings where id)
 and coalesce((select status='succeeded' from private.operational_job_runs where job_key='transactional_email_real_worker' order by id desc limit 1),false)
 and exists(select 1 from private.pre_live_operational_evidence e join private.transactional_email_settings s on s.id where e.key='commercial_email_end_to_end' and (e.evidence->>'configuration_revision')::integer=s.configuration_revision and e.evidence->>'passed'='true')
 and exists(select 1 from private.pre_live_operational_evidence e join private.transactional_email_settings s on s.id where e.key='mail_oauth_continuity' and e.evidence->>'sender_email'=s.from_email and e.evidence->>'production_verified'='true')
$$;
revoke all on function private.transactional_email_ready(),private.transactional_email_transport_ready() from public,anon,authenticated,service_role;

do $patch$
declare d text;begin
 d:=pg_get_functiondef('private.pre_live_evidence()'::regprocedure);
 d:=replace(d,'Falta verificar el proveedor, el remitente, la ejecución del worker y la recepción de cinco pruebas controladas.','Falta comprobar el transporte, los eventos comerciales completos y la continuidad de OAuth. Cinco pruebas recibidas por sí solas no cierran este control.');
 d:=replace(d,$old$exists(select 1 from private.ai_credit_packages where active and not internal_only and test_only)$old$,$new$(select count(distinct credits)=3 from private.ai_credit_packages where active and not internal_only and test_only and currency='MXN' and (credits,price_amount) in ((100,99),(500,349),(1000,699)))$new$);
 d:=replace(d,'Los paquetes activos permanecen identificados como TEST hasta aprobar precios comerciales.','Precios comerciales registrados: 100/$99, 500/$349 y 1,000/$699 MXN. Compra Live de créditos deshabilitada.');
 execute d;
end $patch$;

-- Confirmed subscription refunds are distinct from credit balance adjustments.
insert into private.transactional_email_templates(key,name,subject,body) values
 ('subscription_refunded','Reembolso de suscripción','Tu reembolso fue confirmado','El procesador confirmó el reembolso del importe indicado. El plazo para verlo reflejado depende de tu banco. El reembolso no cambia por sí solo la fecha de cancelación de tu plan.');

create function private.queue_subscription_refunds(p_invoice jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p private.billing_payments;r jsonb;begin
 select * into p from private.billing_payments where provider_invoice_id=p_invoice->>'id' and mode=private.billing_environment();
 if p.provider_invoice_id is null then raise exception 'unknown_refund_invoice';end if;
 for r in select value from jsonb_array_elements(coalesce(p_invoice->'refunds','[]')) loop
  if r->>'id' !~ '^re_[A-Za-z0-9]+$' or r->>'currency' is distinct from p.currency or coalesce((r->>'amount')::bigint,0)<=0 or (r->>'amount')::bigint>p.amount_paid then raise exception 'invalid_refund_notice';end if;
  perform private.enqueue_transactional_email('refund:'||p.mode||':'||(r->>'id'),p.professional_id,'subscription_refunded',jsonb_build_object('mode',p.mode,'amount_minor',(r->>'amount')::bigint,'currency',p.currency));
 end loop;
end $$;
revoke all on function private.queue_subscription_refunds(jsonb) from public,anon,authenticated,service_role;
do $$declare d text;needle text:=$needle$ end loop;
 if old_s.id is null$needle$;begin
 d:=pg_get_functiondef('private.billing_apply(jsonb)'::regprocedure);
 if position(needle in d)=0 then raise exception 'refund_notice_patch_missing';end if;
 d:=replace(d,needle,$new$  perform private.queue_subscription_refunds(inv);
 end loop;
 if old_s.id is null$new$);execute d;
end $$;

-- Extend the existing service-only RPC without changing its grants.
do $$declare d text;begin
 d:=pg_get_functiondef('private.transactional_email_server(text,jsonb)'::regprocedure);
 d:=replace(d,$old$ if p_action='configuration' then$old$,$new$
 if p_action='renewal_candidates' then
  return coalesce((select jsonb_agg(to_jsonb(c)) from (
   select b.id,b.provider_subscription_id,b.provider_customer_id,b.period_end,b.mode from private.billing_subscriptions b
   where b.state in ('active','trial') and not b.cancel_at_period_end and b.period_end between now()+interval '5 days' and now()+interval '8 days'
    and (b.mode='test' or s.delivery_mode='operational')
    and not exists(select 1 from private.transactional_email_outbox o where o.event_key='renewal:'||b.id::text||':'||extract(epoch from b.period_end)::bigint::text)
   order by b.period_end limit 5)c),'[]');
 end if;
 if p_action='renewal_verified' then
  return jsonb_build_object('id',private.queue_verified_renewal((p_data->>'id')::uuid,(p_data->>'at')::timestamptz,(p_data->>'amount')::bigint,p_data->>'currency'));
 end if;
 if p_action='worker_failed' then
  insert into private.operational_job_runs(job_key,started_at,finished_at,status,result)
  values('transactional_email_real_worker',now(),now(),'failed',jsonb_build_object('error',case when p_data->>'code' ~ '^[a-z_]{3,80}$' then p_data->>'code' else 'email_unavailable' end));
  return '{"recorded":true}';
 end if;
 if p_action='configuration' then$new$);execute d;
end $$;

-- An audited switch arms only future events, with legal and continuity checks.
do $$declare d text;begin
 d:=pg_get_functiondef('private.email_admin_api(text,jsonb)'::regprocedure);
 d:=replace(d,$old$ if p_action='overview' then$old$,$new$
 if p_action='pause_operational' then
  update private.transactional_email_settings set delivery_mode='controlled',operational_since=null,updated_at=now() where id;
  perform private.billing_audit('email_operational_paused',null,null,'{}',actor);
  return private.email_delivery_overview();
 end if;
 if p_action='activate_operational' then
  if p_data->>'confirmation' is distinct from 'ACTIVAR CORREO OPERATIVO' then raise exception 'confirmation_required';end if;
  if not private.transactional_email_transport_ready() or not private.billing_legal_ready() then raise exception 'email_operational_not_ready';end if;
  if not exists(select 1 from private.pre_live_operational_evidence e join private.transactional_email_settings s on s.id where e.key='commercial_email_end_to_end' and e.evidence->>'passed'='true' and e.evidence->>'configuration_revision'=s.configuration_revision::text)
   or not exists(select 1 from private.pre_live_operational_evidence e join private.transactional_email_settings s on s.id where e.key='mail_oauth_continuity' and e.evidence->>'production_verified'='true' and e.evidence->>'sender_email'=s.from_email)
  then raise exception 'email_operational_not_ready';end if;
  update private.transactional_email_settings set delivery_mode='operational',operational_since=coalesce(operational_since,clock_timestamp()),updated_at=now() where id;
  perform private.billing_audit('email_operational_activated',null,null,'{}',actor);
  return private.email_delivery_overview();
 end if;
 if p_action='overview' then$new$);
 d:=replace(d,$old$s.delivery_mode<>'controlled'$old$,$new$s.delivery_mode not in ('controlled','operational')$new$);
 execute d;
end $$;

-- Provider acceptance does not imply inbox delivery; surface pending controls explicitly.
do $$declare d text;begin
 d:=pg_get_functiondef('private.email_delivery_overview()'::regprocedure);
 d:=replace(d,$old$'ready',private.transactional_email_ready(),$old$,$new$'ready',private.transactional_email_ready(),'transport_ready',private.transactional_email_transport_ready(),
 'controls',jsonb_build_object('legal_ready',private.billing_legal_ready(),
 'commercial_evidence',exists(select 1 from private.pre_live_operational_evidence e join private.transactional_email_settings s on s.id where e.key='commercial_email_end_to_end' and e.evidence->>'passed'='true' and e.evidence->>'configuration_revision'=s.configuration_revision::text),
 'oauth_continuity',exists(select 1 from private.pre_live_operational_evidence e join private.transactional_email_settings s on s.id where e.key='mail_oauth_continuity' and e.evidence->>'production_verified'='true' and e.evidence->>'sender_email'=s.from_email),
 'latest_worker',(select jsonb_build_object('status',status,'finished_at',finished_at,'result',result) from private.operational_job_runs where job_key='transactional_email_real_worker' order by id desc limit 1)), $new$);execute d;
end $$;

-- Refresh provider verification before its seven-day validity window closes.
do $$declare d text;begin
 d:=pg_get_functiondef('private.email_job_entrypoint()'::regprocedure);
 d:=replace(d,'verified_at is null or runtime_verified_at is null','verified_at is null or verified_at<now()-interval ''1 day'' or runtime_verified_at is null');
 execute d;
end $$;
update private.transactional_email_templates set body='El beneficio y sus condiciones quedaron asociados a tu cuenta. Consulta su vigencia desde Mi plan.',version=version+1,updated_at=now() where key='promotion_applied';
