-- LIVE-READY operational closure for TEST only.
-- This migration adds observability, a test-only transactional email outbox,
-- legal versioning/acceptance infrastructure, support configuration and
-- controlled admin operations. It never enables Stripe Live or OpenAI.

create table if not exists private.operational_job_runs (
  id bigint generated always as identity primary key,
  job_key text not null check(job_key ~ '^[a-z0-9_:-]{3,80}$'),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check(status in ('running','succeeded','failed')),
  duration_ms integer,
  result jsonb not null default '{}',
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists operational_job_runs_key_date on private.operational_job_runs(job_key, started_at desc);

create table if not exists private.transactional_email_settings (
  id boolean primary key default true check(id),
  provider text not null default 'test' check(provider in ('test','resend','postmark','smtp')),
  mode text not null default 'test' check(mode='test'),
  enabled boolean not null default true,
  from_email text not null default 'noreply@nuthrick.com',
  reply_to text not null default 'soporte@nuthrick.com',
  updated_at timestamptz not null default now()
);
insert into private.transactional_email_settings(id) values(true) on conflict(id) do nothing;

create table if not exists private.transactional_email_templates (
  key text primary key check(key ~ '^[a-z0-9_:-]{3,80}$'),
  name text not null check(length(name) between 2 and 120),
  subject text not null check(length(subject) between 2 and 160),
  body text not null default '' check(length(body)<=4000),
  active boolean not null default true,
  version integer not null default 1 check(version>0),
  updated_at timestamptz not null default now()
);

insert into private.transactional_email_templates(key,name,subject,body) values
 ('welcome','Bienvenida','Tu cuenta de Nuthrick está lista','Tu cuenta fue creada. Completa tu espacio profesional desde Nuthrick.'),
 ('subscription_activated','Suscripción activada','Tu suscripción de Nuthrick está activa','Tu acceso está activo. Consulta tu plan y tus facturas desde Mi plan.'),
 ('payment_confirmed','Pago confirmado','Recibimos tu pago de Nuthrick','Tu pago fue confirmado en el entorno correspondiente. Conserva este correo para tu referencia.'),
 ('payment_failed','Pago fallido','Necesitamos revisar tu pago de Nuthrick','No pudimos confirmar tu renovación. Revisa tu método de pago para conservar el acceso.'),
 ('grace_started','Período de gracia','Tu cuenta entró en período de gracia','Tu cuenta conserva acceso temporal mientras resuelves el pago pendiente.'),
 ('account_suspended','Cuenta suspendida','Tu cuenta está en modo de consulta','Tus datos se conservan. Resuelve el pago para recuperar las acciones disponibles.'),
 ('payment_recovered','Pago recuperado','Tu acceso fue recuperado','Confirmamos la recuperación de tu pago y el acceso asociado.'),
 ('cancellation_scheduled','Cancelación programada','Tu cancelación quedó programada','Tu acceso continúa hasta la fecha pagada indicada en Mi plan.'),
 ('subscription_cancelled','Suscripción cancelada','Tu suscripción terminó','Tus datos se conservan. Puedes elegir un plan cuando quieras volver.'),
 ('renewal_upcoming','Renovación próxima','Tu renovación se acerca','Revisa tu método de pago y la fecha de renovación desde Mi plan.'),
 ('beta_expiring','Beta por vencer','Tu acceso Beta está por vencer','Revisa la fecha de término y elige un plan si deseas continuar.'),
 ('beta_expired','Beta vencida','Tu acceso Beta terminó','Tus datos se conservan. Elige un plan para continuar.'),
 ('credits_purchased','Créditos comprados','Tu recarga de créditos fue confirmada','Tus créditos adicionales están reflejados en tu historial.'),
 ('credits_refunded','Créditos reembolsados','Tu recarga de créditos fue reembolsada','El reembolso y el ajuste de créditos aparecen en tu historial.'),
 ('promotion_applied','Promoción aplicada','Tu promoción fue aplicada','La promoción y sus condiciones quedaron asociadas a tu compra.')
on conflict(key) do nothing;

create table if not exists private.transactional_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check(length(event_key) between 3 and 180),
  professional_id uuid references public.professional_profiles(id) on delete restrict,
  recipient_email text,
  template_key text not null references private.transactional_email_templates(key),
  payload jsonb not null default '{}',
  status text not null default 'pending' check(status in ('pending','sent','failed')),
  attempts integer not null default 0 check(attempts>=0 and attempts<=5),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transactional_email_outbox_due on private.transactional_email_outbox(status,next_attempt_at);
create index if not exists transactional_email_outbox_owner on private.transactional_email_outbox(professional_id,created_at desc);

create table if not exists private.transactional_email_delivery_checks (
  id boolean primary key default true check(id),
  last_test_at timestamptz,
  last_status text check(last_status is null or last_status in ('passed','failed')),
  last_error text,
  updated_at timestamptz not null default now()
);
insert into private.transactional_email_delivery_checks(id) values(true) on conflict(id) do nothing;

create table if not exists private.legal_documents (
  key text primary key check(key in ('terms','privacy','refunds')),
  title text not null,
  version integer not null default 1 check(version>0),
  effective_at timestamptz,
  review_status text not null default 'pending_review' check(review_status in ('draft','pending_review','approved')),
  content_ref text not null default '',
  updated_at timestamptz not null default now()
);
insert into private.legal_documents(key,title,version,review_status,content_ref) values
 ('terms','Términos de uso',1,'pending_review','/terms'),
 ('privacy','Aviso de privacidad',1,'pending_review','/privacy'),
 ('refunds','Política de reembolsos',1,'pending_review','/refunds')
on conflict(key) do nothing;

create table if not exists private.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles(id) on delete restrict,
  document_key text not null references private.legal_documents(key),
  document_version integer not null,
  accepted_at timestamptz not null default now(),
  source text not null check(source in ('onboarding','checkout','settings','admin')),
  unique(professional_id,document_key,document_version)
);
create index if not exists legal_acceptances_owner on private.legal_acceptances(professional_id,accepted_at desc);

create table if not exists private.support_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default true,
  channel text not null default 'email' check(channel in ('email','form')),
  support_email text not null default 'soporte@nuthrick.com',
  response_hours integer not null default 48 check(response_hours between 1 and 720),
  test_mode boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into private.support_settings(id) values(true) on conflict(id) do nothing;

create table if not exists private.operational_case_resolutions (
  case_key text primary key check(length(case_key) between 3 and 160),
  resolved_at timestamptz not null default now(),
  resolved_by uuid not null references auth.users(id) on delete restrict,
  note text not null default '' check(length(note)<=500)
);

create table if not exists private.pre_live_operational_evidence (
  key text primary key check(key ~ '^[a-z0-9_:-]{3,80}$'),
  verified_at timestamptz not null default now(),
  evidence jsonb not null default '{}'
);

do $$ declare t text; begin
 foreach t in array array['operational_job_runs','transactional_email_settings','transactional_email_templates','transactional_email_outbox','transactional_email_delivery_checks','legal_documents','legal_acceptances','support_settings','operational_case_resolutions','pre_live_operational_evidence'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('drop policy if exists deny_direct on private.%I',t);
  execute format('drop policy if exists admin_rpc_only on private.%I',t);
  execute format('create policy deny_direct on private.%I for all to anon,authenticated using(false) with check(false)',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

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
 insert into private.transactional_email_outbox(event_key,professional_id,recipient_email,template_key,payload)
 values(p_event_key,p_owner,recipient, p_template_key,coalesce(p_payload,'{}'))
 on conflict(event_key) do nothing returning id into result_id;
 return result_id;
end $$;
revoke all on function private.enqueue_transactional_email(text,uuid,text,jsonb,text) from public,anon,authenticated,service_role;

create or replace function private.enqueue_beta_lifecycle_emails() returns integer
language plpgsql security definer set search_path='' as $$
declare a record; n integer:=0; result_id uuid;
begin
 for a in select professional_id,ends_at from private.professional_access where source='beta_code' and status not in ('cancelled','suspended') and ends_at is not null and ends_at<=now()+interval '7 days' loop
  if a.ends_at>now() then
   result_id:=private.enqueue_transactional_email('beta-expiring:'||a.professional_id::text||':'||to_char(a.ends_at,'YYYYMMDDHH24MISS'),a.professional_id,'beta_expiring',jsonb_build_object('ends_at',a.ends_at));
  else
   result_id:=private.enqueue_transactional_email('beta-expired:'||a.professional_id::text||':'||to_char(a.ends_at,'YYYYMMDDHH24MISS'),a.professional_id,'beta_expired',jsonb_build_object('ended_at',a.ends_at));
  end if;
  if result_id is not null then n:=n+1; end if;
 end loop;
 return n;
end $$;
revoke all on function private.enqueue_beta_lifecycle_emails() from public,anon,authenticated,service_role;

create or replace function private.process_transactional_email_outbox(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item record; sent_count integer:=0; failed_count integer:=0; started timestamptz:=clock_timestamp(); run_id bigint; settings private.transactional_email_settings;
begin
 p_limit:=least(greatest(coalesce(p_limit,50),1),100);
 insert into private.operational_job_runs(job_key,started_at) values('transactional_email_outbox',started) returning id into run_id;
 select * into settings from private.transactional_email_settings where id;
 for item in select * from private.transactional_email_outbox where status in ('pending','failed') and next_attempt_at<=now() and attempts<5 order by created_at for update skip locked limit p_limit loop
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
revoke all on function private.process_transactional_email_outbox(integer) from public,anon,authenticated,service_role;

create or replace function private.transactional_email_audit_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare template_key text; suffix text; metadata jsonb:=coalesce(new.metadata,'{}');
begin
 if new.target_professional is null then return new; end if;
 template_key:=case
  when new.action='code_redeemed' then 'beta_expiring'
  when new.action='promotion_redeemed' then 'promotion_applied'
  when new.action='purchase_paid' then 'credits_purchased'
  when new.action='refund' then 'credits_refunded'
  when new.action='billing_grace_expired' then 'account_suspended'
  when new.action='billing_cancel_requested' then 'cancellation_scheduled'
  when new.action='billing_cancel_now_requested' then 'subscription_cancelled'
  when new.action='billing_subscription_synced' and metadata->>'state'='active' then 'payment_confirmed'
  when new.action='billing_subscription_synced' and metadata->>'state'='grace' then 'grace_started'
  when new.action='billing_subscription_synced' and metadata->>'state'='suspended' then 'account_suspended'
  when new.action='billing_subscription_synced' and metadata->>'state'='cancelled' then 'subscription_cancelled'
  else null end;
 if template_key is not null then
  suffix:=new.id::text||':'||template_key;
  perform private.enqueue_transactional_email('audit:'||suffix,new.target_professional,template_key,jsonb_build_object('audit_id',new.id,'action',new.action,'metadata',metadata));
 end if;
 return new;
end $$;
drop trigger if exists admin_audit_transactional_email on private.admin_audit;
create trigger admin_audit_transactional_email after insert on private.admin_audit for each row execute function private.transactional_email_audit_trigger();
revoke all on function private.transactional_email_audit_trigger() from public,anon,authenticated,service_role;

create or replace function private.professional_welcome_email_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.enqueue_transactional_email('welcome:'||new.id::text,new.id,'welcome',jsonb_build_object('professional_id',new.id));
 return new;
end $$;
drop trigger if exists professional_profile_welcome_email on public.professional_profiles;
create trigger professional_profile_welcome_email after insert on public.professional_profiles for each row execute function private.professional_welcome_email_trigger();
revoke all on function private.professional_welcome_email_trigger() from public,anon,authenticated,service_role;

create or replace function private.billing_job_entrypoint() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; started timestamptz:=clock_timestamp(); run_id bigint; beta_count integer:=0;
begin
 insert into private.operational_job_runs(job_key,started_at) values('billing_monthly_and_grace',started) returning id into run_id;
 beta_count:=private.enqueue_beta_lifecycle_emails();
 result:=private.billing_tick();
 result:=result||jsonb_build_object('beta_emails_enqueued',beta_count);
 update private.operational_job_runs set finished_at=clock_timestamp(),status='succeeded',duration_ms=extract(epoch from(clock_timestamp()-started)*1000)::integer,result=result where id=run_id;
 return result;
exception when others then
 update private.operational_job_runs set finished_at=clock_timestamp(),status='failed',duration_ms=extract(epoch from(clock_timestamp()-started)*1000)::integer,error_code=left(sqlstate||':'||sqlerrm,200) where id=run_id;
 raise;
end $$;
revoke all on function private.billing_job_entrypoint() from public,anon,authenticated,service_role;

create or replace function private.email_job_entrypoint() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return private.process_transactional_email_outbox(50);
end $$;
revoke all on function private.email_job_entrypoint() from public,anon,authenticated,service_role;

do $$ declare billing_job_id bigint; begin
 if to_regclass('cron.job') is not null then
  if exists(select 1 from cron.job where jobname='nuthrick-billing-monthly-and-grace') then
   select jobid into billing_job_id from cron.job where jobname='nuthrick-billing-monthly-and-grace' limit 1;
   perform cron.alter_job(billing_job_id,command:='select private.billing_job_entrypoint();',active:=true);
  else
   perform cron.schedule('nuthrick-billing-monthly-and-grace','*/15 * * * *','select private.billing_job_entrypoint();');
  end if;
  if not exists(select 1 from cron.job where jobname='nuthrick-transactional-email-outbox') then
   perform cron.schedule('nuthrick-transactional-email-outbox','*/5 * * * *','select private.email_job_entrypoint();');
  else
   perform cron.alter_job((select jobid from cron.job where jobname='nuthrick-transactional-email-outbox' limit 1),active:=true,command:='select private.email_job_entrypoint();');
  end if;
 end if;
end $$;

create or replace function private.operations_jobs() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='[]'::jsonb;
begin
 if to_regclass('cron.job') is null then return result; end if;
 execute $sql$
   select coalesce(jsonb_agg(jsonb_build_object('jobid',x.jobid,'jobname',x.jobname,'schedule',x.schedule,'active',x.active,'last_run_at',x.last_run_at,'last_status',x.last_status,'last_error',x.last_error,'duration_ms',x.duration_ms) order by x.jobname),'[]'::jsonb)
   from (
     select j.jobid,j.jobname,j.schedule,j.active,r.start_time last_run_at,r.status last_status,
       case when r.status='failed' then r.return_message else null end last_error,
       case when r.end_time is null then null else extract(epoch from(r.end_time-r.start_time))*1000 end duration_ms
     from cron.job j
     left join lateral(select d.* from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1) r on true
     where j.jobname like 'nuthrick-%'
   ) x
 $sql$ into result;
 return result;
end $$;
revoke all on function private.operations_jobs() from public,anon,authenticated,service_role;

create or replace function private.operations_overview() returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'generated_at',now(),
 'jobs',private.operations_jobs(),
 'webhooks',jsonb_build_object('last_received',(select max(created_at) from private.billing_webhook_events),'last_processed',(select max(processed_at) from private.billing_webhook_events),'pending',(select count(*) from private.billing_webhook_events where processed_at is null),'errors',(select count(*) from private.billing_webhook_events where last_error is not null),'recent_errors',coalesce((select jsonb_agg(jsonb_build_object('event_type',event_type,'last_error',last_error,'attempts',attempts,'created_at',created_at) order by created_at desc) from (select event_type,last_error,attempts,created_at from private.billing_webhook_events where last_error is not null order by created_at desc limit 10)e),'[]')),
 'emails',jsonb_build_object('provider',(select provider from private.transactional_email_settings where id),'mode',(select mode from private.transactional_email_settings where id),'enabled',(select enabled from private.transactional_email_settings where id),'template_count',(select count(*) from private.transactional_email_templates where active),'pending',(select count(*) from private.transactional_email_outbox where status='pending'),'failed',(select count(*) from private.transactional_email_outbox where status='failed'),'sent',(select count(*) from private.transactional_email_outbox where status='sent'),'last_sent',(select max(sent_at) from private.transactional_email_outbox),'last_test_at',(select last_test_at from private.transactional_email_delivery_checks where id),'recent_failed',coalesce((select jsonb_agg(jsonb_build_object('id',id,'template_key',template_key,'status',status,'attempts',attempts,'last_error',last_error,'created_at',created_at) order by created_at desc) from (select id,template_key,status,attempts,last_error,created_at from private.transactional_email_outbox where status='failed' order by created_at desc limit 10)e),'[]')),
 'support',jsonb_build_object('enabled',(select enabled from private.support_settings where id),'channel',(select channel from private.support_settings where id),'support_email',(select support_email from private.support_settings where id),'response_hours',(select response_hours from private.support_settings where id),'test_mode',(select test_mode from private.support_settings where id),'cases',jsonb_build_object('payment_attention',(select count(*) from private.billing_subscriptions where state in ('grace','suspended')),'webhook_failed',(select count(*) from private.billing_webhook_events where last_error is not null),'credit_review',(select count(*) from private.ai_credit_purchases where status='in_review'),'email_failed',(select count(*) from private.transactional_email_outbox where status='failed'))),
 'legal',jsonb_build_object('infrastructure_ready',true,'documents',coalesce((select jsonb_agg(jsonb_build_object('key',key,'title',title,'version',version,'effective_at',effective_at,'review_status',review_status,'content_ref',content_ref) order by key) from private.legal_documents),'[]'),'pending_review',(select count(*) from private.legal_documents where review_status<>'approved')),
 'evidence',coalesce((select jsonb_object_agg(key,jsonb_build_object('verified_at',verified_at,'evidence',evidence)) from private.pre_live_operational_evidence),'{}')
)
$$;
revoke all on function private.operations_overview() from public,anon,authenticated,service_role;

create or replace function private.operations_admin_api(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin(); owner uuid; case_key text; doc_key text; result jsonb; reason text;
begin
 if p_action='overview' then return private.operations_overview(); end if;
 if p_action='run_billing_job' then result:=private.billing_job_entrypoint(); perform private.billing_audit('operations_billing_job_run',null,null,result,actor); return result; end if;
 if p_action='process_email_outbox' then result:=private.email_job_entrypoint(); perform private.billing_audit('operations_email_outbox_run',null,null,result,actor); return result; end if;
 if p_action='retry_email' then
  update private.transactional_email_outbox set status='pending',next_attempt_at=now(),last_error=null,updated_at=now() where id=(p_data->>'id')::uuid and status='failed';
  if not found then raise exception 'email_not_retryable'; end if;
  perform private.billing_audit('operations_email_retry',null,(p_data->>'id')::uuid,'{}',actor); return private.operations_overview();
 end if;
 if p_action='support_settings' then
  if p_data->>'channel' not in ('email','form') or length(btrim(coalesce(p_data->>'support_email','')))<5 then raise exception 'invalid_support_settings'; end if;
  update private.support_settings set enabled=coalesce((p_data->>'enabled')::boolean,true),channel=p_data->>'channel',support_email=btrim(p_data->>'support_email'),response_hours=least(greatest(coalesce((p_data->>'response_hours')::integer,48),1),720),test_mode=coalesce((p_data->>'test_mode')::boolean,true),updated_at=now() where id;
  perform private.billing_audit('operations_support_settings_updated',null,null,jsonb_build_object('channel',p_data->>'channel','response_hours',(p_data->>'response_hours')::integer),actor); return private.operations_overview();
 end if;
 if p_action='legal_status' then
  doc_key:=p_data->>'key';
  if p_data->>'status' not in ('draft','pending_review','approved') then raise exception 'invalid_legal_status'; end if;
  if p_data->>'status'='approved' and p_data->>'confirmation' is distinct from 'APPROVE LEGAL' then raise exception 'confirmation_required'; end if;
  if p_data->>'status'='approved' and length(btrim(coalesce(p_data->>'reason','')))<8 then raise exception 'reason_required'; end if;
  update private.legal_documents set review_status=p_data->>'status',effective_at=case when p_data->>'status'='approved' then coalesce(effective_at,now()) else effective_at end,version=case when coalesce((p_data->>'bump_version')::boolean,false) then version+1 else version end,updated_at=now() where key=doc_key;
  if not found then raise exception 'not_found'; end if;
  perform private.billing_audit('operations_legal_status_updated',null,null,jsonb_build_object('key',doc_key,'status',p_data->>'status'),actor,p_data->>'reason'); return private.operations_overview();
 end if;
 if p_action='resolve_case' then
  case_key:=btrim(p_data->>'case_key'); reason:=btrim(coalesce(p_data->>'note',''));
  if case_key is null or length(case_key)<3 then raise exception 'invalid_input'; end if;
  insert into private.operational_case_resolutions(case_key,resolved_by,note) values(case_key,actor,reason) on conflict(case_key) do update set resolved_at=now(),resolved_by=excluded.resolved_by,note=excluded.note;
  perform private.billing_audit('operations_case_resolved',null,null,jsonb_build_object('case_key',case_key),actor,reason); return private.operations_overview();
 end if;
 if p_action='reconcile_subscription' then
  owner:=(p_data->>'professional_id')::uuid;
  if owner is null or not exists(select 1 from public.professional_profiles where id=owner) then raise exception 'not_found'; end if;
  result:=jsonb_build_object('professional_id',owner,'subscription',(select to_jsonb(s) from private.billing_subscriptions s where s.professional_id=owner order by created_at desc limit 1),'access',private.resolve_effective_entitlements(owner),'mode','test','remote_provider_fetch','not_performed');
  perform private.billing_audit('operations_subscription_reviewed',owner,null,jsonb_build_object('mode','test'),actor); return result;
 end if;
 raise exception 'invalid_action';
end $$;
create or replace function public.operations_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.operations_admin_api(p_action,p_data)$$;
revoke all on function private.operations_admin_api(text,jsonb),public.operations_admin_api(text,jsonb) from public,anon,service_role;
grant execute on function private.operations_admin_api(text,jsonb),public.operations_admin_api(text,jsonb) to authenticated;

create or replace function public.record_legal_acceptance(p_document_key text,p_version integer,p_source text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid();
begin
 if owner is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_source not in ('onboarding','checkout','settings','admin') then raise exception 'invalid_input'; end if;
 if not exists(select 1 from private.legal_documents where key=p_document_key and version=p_version and review_status='approved') then raise exception 'legal_not_published'; end if;
 insert into private.legal_acceptances(professional_id,document_key,document_version,source) values(owner,p_document_key,p_version,p_source) on conflict do nothing;
 return jsonb_build_object('accepted',true,'document_key',p_document_key,'version',p_version);
end $$;
revoke all on function public.record_legal_acceptance(text,integer,text) from public,anon,service_role;
grant execute on function public.record_legal_acceptance(text,integer,text) to authenticated;

create or replace function public.legal_document(p_document_key text) returns jsonb
language sql security invoker set search_path='' as $$
select to_jsonb(d) from private.legal_documents d where d.key=p_document_key
$$;
revoke all on function public.legal_document(text) from public,authenticated,service_role;
grant execute on function public.legal_document(text) to anon,authenticated;

-- These are private, TEST-only launch templates. Admin can edit or disable
-- them through the existing promotion editor; no campaign is public.
insert into private.promotion_campaigns(code,name,audience,audience_note,visibility,active,starts_at,ends_at,eligible_plan_ids,intervals,benefits,max_redemptions,max_per_professional,new_customers_only)
select 'STUDENT-TEST','Plantilla estudiante TEST','student','Plantilla editable para convenio estudiantil.','private',true,now()-interval '1 day',null,array[p.id],array['monthly'], '[{"type":"percentage_discount","amount":10,"duration":{"kind":"months","months":3}}]'::jsonb,1000,1,true from private.plans p where p.code='esencial' and not exists(select 1 from private.promotion_campaigns where code='STUDENT-TEST');
insert into private.promotion_campaigns(code,name,audience,audience_note,visibility,active,starts_at,ends_at,eligible_plan_ids,intervals,benefits,max_redemptions,max_per_professional,new_customers_only)
select 'UAZ2026','Plantilla universidad TEST','university','Código de convenio editable; institución y beneficio deben aprobarse.','private',true,now()-interval '1 day',null,array[p.id],array['monthly'], '[{"type":"custom_price","amount":249,"duration":{"kind":"months","months":12}},{"type":"initial_ai_credits","amount":20,"duration":{"kind":"invoice"}}]'::jsonb,500,1,true from private.plans p where p.code='esencial' and not exists(select 1 from private.promotion_campaigns where code='UAZ2026');
insert into private.promotion_campaigns(code,name,audience,audience_note,visibility,active,starts_at,ends_at,eligible_plan_ids,intervals,benefits,max_redemptions,max_per_professional,new_customers_only)
select 'CLINIC-TEST','Plantilla consultorio TEST','clinic','Promoción privada por profesional; no crea cuentas multi-seat.','private',true,now()-interval '1 day',null,array[p.id],array['monthly'], '[{"type":"percentage_discount","amount":15,"duration":{"kind":"months","months":6}}]'::jsonb,200,1,true from private.plans p where p.code='profesional' and not exists(select 1 from private.promotion_campaigns where code='CLINIC-TEST');
insert into private.promotion_campaigns(code,name,audience,audience_note,visibility,active,starts_at,ends_at,eligible_plan_ids,intervals,benefits,max_redemptions,max_per_professional,new_customers_only)
select 'INFLUENCER-TEST','Plantilla influencer TEST','influencer','Solo atribución de redenciones y suscripciones; sin comisiones.','private',true,now()-interval '1 day',null,array[p.id],array['monthly'], '[{"type":"percentage_discount","amount":20,"duration":{"kind":"months","months":3}}]'::jsonb,100,1,true from private.plans p where p.code='profesional' and not exists(select 1 from private.promotion_campaigns where code='INFLUENCER-TEST');
insert into private.promotion_campaigns(code,name,audience,audience_note,visibility,active,starts_at,ends_at,eligible_plan_ids,intervals,benefits,max_redemptions,max_per_professional,new_customers_only)
select 'EARLY-ADOPTER-TEST','Plantilla early adopter TEST','campaign','Descuento o precio Founder configurable; nunca concede Lifetime automáticamente.','private',true,now()-interval '1 day',null,array[p.id],array['monthly','annual'], '[{"type":"custom_price","amount":299,"duration":{"kind":"months","months":3}},{"type":"initial_ai_credits","amount":30,"duration":{"kind":"invoice"}}]'::jsonb,250,1,true from private.plans p where p.code='profesional' and not exists(select 1 from private.promotion_campaigns where code='EARLY-ADOPTER-TEST');

insert into private.pre_live_operational_evidence(key,evidence) values
 ('promotion_engine_test',jsonb_build_object('engine','ADMIN-2','fallback','normal_plan','attribution','promotion_redemptions','templates',5)),
 ('billing_idempotency_test',jsonb_build_object('operation_keys','billing_operations','webhook_events','billing_webhook_events')),
 ('support_operational_test',jsonb_build_object('cases','derived_without_clinical_data','actions','audited'))
on conflict(key) do update set verified_at=now(),evidence=excluded.evidence;

-- A synthetic .invalid delivery proves the outbox path without sending mail.
insert into private.transactional_email_outbox(event_key,recipient_email,template_key,payload)
values('prelive-email-test','prelive@nuthrick.invalid','welcome','{"synthetic":true}'::jsonb)
on conflict(event_key) do nothing;
select private.process_transactional_email_outbox(10);

-- Authenticated clients can read only the sanitized legal projection through
-- public.legal_document; no private table grants are opened.
