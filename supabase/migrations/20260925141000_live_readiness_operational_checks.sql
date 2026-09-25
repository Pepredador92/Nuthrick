-- Replace the PRE-LIVE summary with evidence-backed operational checks.
-- Legal intentionally remains pending until an authorized human approves it.
create or replace function private.pre_live_readiness()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := private.require_platform_admin();
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
    and not exists(select 1 from private.transactional_email_outbox where status='failed');

  support_ready :=
    (select s.enabled and s.channel in ('email','form') and length(btrim(s.support_email))>=5 from private.support_settings s where s.id)
    and to_regprocedure('private.operations_overview()') is not null
    and to_regprocedure('private.operations_admin_api(text,jsonb)') is not null
    and exists(select 1 from private.pre_live_operational_evidence where key='support_operational_test');

  legal_ready := not exists(select 1 from private.legal_documents where review_status<>'approved');

  checks := jsonb_build_array(
    jsonb_build_object('key','stripe_mode','label','Stripe permanece en TEST','status',case when (select mode='test' and provider='stripe' from private.billing_settings where id) then 'ready' else 'blocked' end,'detail',case when (select mode='test' and provider='stripe' from private.billing_settings where id) then 'El proveedor y la configuración de billing están limitados a Stripe Test.' else 'La configuración no está limitada a Stripe Test.' end),
    jsonb_build_object('key','stripe_credentials','label','Credenciales Stripe Test en Vault','status',case when credentials_ok then 'ready' else 'blocked' end,'detail',case when credentials_ok then 'Credenciales verificadas sin exponer secretos.' else 'No se encontró una configuración Test válida.' end),
    jsonb_build_object('key','webhook','label','Webhook firmado','status',case when credentials->>'webhook_secret' ~ '^whsec_[A-Za-z0-9]+$' then 'ready' else 'blocked' end,'detail',case when credentials->>'webhook_secret' ~ '^whsec_[A-Za-z0-9]+$' then 'Secret de webhook disponible solo para el servidor.' else 'Falta el secret de webhook Test.' end),
    jsonb_build_object('key','live_separation','label','Separación TEST / LIVE','status',case when not exists(select 1 from private.billing_price_mappings where mode<>'test') and not exists(select 1 from private.ai_credit_price_mappings where mode<>'test') then 'ready' else 'blocked' end,'detail','Los mappings actuales son Test; Live requiere productos, precios, credenciales y webhook separados.'),
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
    'live_enabled',false,
    'openai_enabled',openai_enabled,
    'checks',checks,
    'operations',private.operations_overview(),
    'summary',jsonb_build_object('ready',(select count(*) from jsonb_array_elements(checks) x where x->>'status'='ready'),'pending',(select count(*) from jsonb_array_elements(checks) x where x->>'status'='pending'),'blocked',(select count(*) from jsonb_array_elements(checks) x where x->>'status'='blocked'))
  );
end $$;
revoke all on function private.pre_live_readiness() from public,anon,service_role;
grant execute on function private.pre_live_readiness() to authenticated;
