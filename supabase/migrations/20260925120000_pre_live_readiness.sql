-- PRE-LIVE: read-only readiness evidence for platform administrators.
-- This intentionally reports no provider secrets and cannot enable Live mode.
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
  checks jsonb;
begin
  -- The existing server-only helper reads Vault but the result is reduced to
  -- booleans below. No key, account id or webhook secret leaves this function.
  begin
    credentials := private.billing_provider_credentials();
    credentials_ok := credentials->>'mode' = 'test'
      and credentials->>'secret_key' ~ '^sk_test_[A-Za-z0-9]+$'
      and credentials->>'account_id' ~ '^acct_[A-Za-z0-9]+$';
  exception when others then
    credentials_ok := false;
  end;

  select exists(select 1 from private.ai_feature_config where enabled)
    into openai_enabled;

  checks := jsonb_build_array(
    jsonb_build_object(
      'key','stripe_mode','label','Stripe permanece en TEST','status',
      case when (select mode='test' and provider='stripe' from private.billing_settings where id) then 'ready' else 'blocked' end,
      'detail',case when (select mode='test' and provider='stripe' from private.billing_settings where id)
        then 'El proveedor y la configuración de billing están limitados a Stripe Test.'
        else 'La configuración no está limitada a Stripe Test.' end),
    jsonb_build_object(
      'key','stripe_credentials','label','Credenciales Stripe Test en Vault','status',case when credentials_ok then 'ready' else 'blocked' end,
      'detail',case when credentials_ok then 'Credenciales verificadas sin exponer secretos.' else 'No se encontró una configuración Test válida.' end),
    jsonb_build_object(
      'key','webhook','label','Webhook firmado','status',case when credentials->>'webhook_secret' ~ '^whsec_[A-Za-z0-9]+$' then 'ready' else 'blocked' end,
      'detail',case when credentials->>'webhook_secret' ~ '^whsec_[A-Za-z0-9]+$' then 'Secret de webhook disponible solo para el servidor.' else 'Falta el secret de webhook Test.' end),
    jsonb_build_object(
      'key','live_separation','label','Separación TEST / LIVE','status',case when not exists(select 1 from private.billing_price_mappings where mode<>'test') and not exists(select 1 from private.ai_credit_price_mappings where mode<>'test') then 'ready' else 'blocked' end,
      'detail','Los mappings actuales son Test; Live requiere productos, precios, credenciales y webhook separados.'),
    jsonb_build_object(
      'key','commercial_plans','label','Planes comerciales','status',case when (select count(*) from private.plans where active and not internal_only)=2 and (select count(*) from private.plans where code='esencial' and monthly_price=349 and annual_price=3490 and currency='MXN')=1 and (select count(*) from private.plans where code='profesional' and monthly_price=499 and annual_price=4990 and currency='MXN')=1 then 'ready' else 'blocked' end,
      'detail','Esencial $349/$3,490 MXN y Profesional $499/$4,990 MXN.'),
    jsonb_build_object(
      'key','credit_packages','label','Paquetes de recarga','status',case when exists(select 1 from private.ai_credit_packages where active and not internal_only and test_only) then 'ready' else 'pending' end,
      'detail','Los paquetes activos permanecen identificados como TEST hasta aprobar precios comerciales.'),
    jsonb_build_object(
      'key','promotions','label','Promociones','status',case when exists(select 1 from private.promotion_campaigns where active) then 'ready' else 'pending' end,
      'detail',jsonb_build_object('active_count',(select count(*) from private.promotion_campaigns where active),'expired_behavior','La validación server-side rechaza códigos vencidos o no elegibles.')),
    jsonb_build_object(
      'key','beta_access','label','Beta / BETA5','status',case when exists(select 1 from private.access_codes where active and exists(select 1 from private.plans p where p.id=access_codes.plan_id and p.code='beta')) then 'ready' else 'pending' end,
      'detail','El canje concede 90 días configurados y cero créditos IA; la fecha se muestra al profesional.'),
    jsonb_build_object(
      'key','renewal_job','label','Renovaciones y gracia','status',case when to_regprocedure('private.billing_tick(timestamp with time zone)') is not null then 'pending' else 'blocked' end,
      'detail','El motor de renovación existe; confirmar el job pg_cron y monitoreo antes de Live.'),
    jsonb_build_object(
      'key','openai','label','OpenAI deshabilitado','status',case when openai_enabled then 'blocked' else 'ready' end,
      'detail',case when openai_enabled then 'Hay una configuración IA habilitada.' else 'No hay features IA reales habilitadas; las pruebas usan mocks.' end),
    jsonb_build_object(
      'key','receipts','label','Recibos / invoices','status',case when exists(select 1 from private.billing_payments where hosted_url is not null) then 'ready' else 'pending' end,
      'detail','Los recibos disponibles se abren mediante URLs HTTPS de Stripe; CFDI queda fuera de PRE-LIVE.'),
    jsonb_build_object(
      'key','transactional_email','label','Emails transaccionales','status','pending',
      'detail','Alta, pago, fallo, cancelación, renovación, trial, recarga y refund requieren proveedor/plantillas operativas.'),
    jsonb_build_object(
      'key','legal','label','Términos, privacidad y reembolsos','status','pending',
      'detail','La aplicación tiene páginas marcador; el texto definitivo requiere aprobación legal.'),
    jsonb_build_object(
      'key','support_monitoring','label','Soporte y monitoring','status','pending',
      'detail','Definir responsable, canal, alertas de webhook, pagos, renovaciones y disputas antes de Live.'),
    jsonb_build_object(
      'key','test_evidence','label','Evidencia de pagos Test','status',case when exists(select 1 from private.billing_webhook_events where mode='test' and processed_at is not null) then 'ready' else 'pending' end,
      'detail',jsonb_build_object('webhooks_processed',(select count(*) from private.billing_webhook_events where mode='test' and processed_at is not null),'test_accounts',(select count(*) from private.billing_test_accounts),'subscriptions',(select count(*) from private.billing_subscriptions where mode='test'),'credit_purchases',(select count(*) from private.ai_credit_purchases where mode='test')))
  );

  return jsonb_build_object(
    'generated_at',now(),
    'mode',(select mode from private.billing_settings where id),
    'live_enabled',false,
    'openai_enabled',openai_enabled,
    'checks',checks,
    'summary',jsonb_build_object(
      'ready',(select count(*) from jsonb_array_elements(checks) x where x->>'status'='ready'),
      'pending',(select count(*) from jsonb_array_elements(checks) x where x->>'status'='pending'),
      'blocked',(select count(*) from jsonb_array_elements(checks) x where x->>'status'='blocked'))
  );
end $$;

create or replace function public.pre_live_readiness()
returns jsonb language sql security invoker set search_path='' as $$
  select private.pre_live_readiness()
$$;
revoke all on function private.pre_live_readiness(),public.pre_live_readiness() from public,anon,service_role;
grant execute on function private.pre_live_readiness(),public.pre_live_readiness() to authenticated;
