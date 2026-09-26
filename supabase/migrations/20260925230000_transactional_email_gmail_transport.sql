-- Real transactional email transport using the already-authorized Gmail OAuth
-- sender. This does not create an @nuthrick.com mailbox, change DNS, enable
-- Stripe Live, or enable OpenAI.

alter table private.transactional_email_settings
  drop constraint if exists transactional_email_settings_mode_check,
  drop constraint if exists transactional_email_settings_provider_check;
alter table private.transactional_email_settings
  add constraint transactional_email_settings_mode_check check (mode in ('test','live')),
  add constraint transactional_email_settings_provider_check check (provider in ('test','resend','postmark','smtp','gmail'));

create or replace function private.email_gmail_admin_api(p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin(); sender text; support text;
begin
 if p_action<>'configure' then raise exception 'invalid_action'; end if;
 if p_data->>'confirmation' is distinct from 'SOLO CORREOS DE PRUEBA CONTROLADOS' then raise exception 'confirmation_required'; end if;
 sender:=lower(btrim(p_data->>'from_email'));
 select support_email into support from private.support_settings where id and contacts_verified_at is not null;
 if support is null or sender is distinct from lower(support) then raise exception 'invalid_sender'; end if;
 if not exists(select 1 from private.agenda_mail_sender where singleton and lower(email)=sender) then raise exception 'email_sender_unavailable'; end if;
 update private.transactional_email_settings
 set configuration_revision=configuration_revision+1,
     provider='gmail', mode='live', delivery_mode='controlled', enabled=true,
     domain_id=null, domain_name=null, domain_evidence=jsonb_build_object('provider','gmail_oauth'),
     from_email=sender, reply_to=lower(support), verified_at=null, runtime_verified_at=null,
     webhook_verified_at=null, last_worker_at=null, updated_at=now();
 perform private.billing_audit('email_configure_gmail',null,null,jsonb_build_object('sender',sender),actor);
 return private.email_delivery_overview();
end $$;
create function public.email_gmail_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.email_gmail_admin_api(p_action,p_data)$$;
revoke all on function private.email_gmail_admin_api(text,jsonb),public.email_gmail_admin_api(text,jsonb) from public,anon,service_role;
grant execute on function private.email_gmail_admin_api(text,jsonb),public.email_gmail_admin_api(text,jsonb) to authenticated;

create or replace function private.transactional_email_ready() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.transactional_email_settings s where id and enabled and (
   (s.provider='resend' and s.delivery_mode='controlled' and s.verified_at>now()-interval '7 days' and s.runtime_verified_at is not null and s.webhook_verified_at is not null and s.last_worker_at is not null and s.domain_evidence->>'spf'='true' and s.domain_evidence->>'dkim'='true' and s.domain_evidence->>'dmarc'='true')
   or (s.provider='gmail' and s.mode='live' and s.delivery_mode='controlled' and s.verified_at>now()-interval '7 days' and s.runtime_verified_at is not null and s.last_worker_at is not null)
 ))
 and (select count(*)=15 from private.transactional_email_templates where active)
 and (select contacts_verified_at is not null from private.support_settings where id)
 and (select count(distinct template_key)=5 from private.transactional_email_outbox where configuration_revision=(select configuration_revision from private.transactional_email_settings where id) and is_test_delivery and provider_message_id is not null and observed_at is not null and delivery_status in ('accepted','delivered'))
 and not exists(select 1 from private.transactional_email_outbox where configuration_revision=(select configuration_revision from private.transactional_email_settings where id) and is_test_delivery and status='failed')
$$;
revoke all on function private.transactional_email_ready() from public,anon,authenticated,service_role;

create or replace function private.transactional_email_server(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.transactional_email_settings;item private.transactional_email_outbox;t private.transactional_email_templates;lk uuid;result jsonb;run_id bigint;
begin
 if p_action='authorize_admin' then
  if not exists(select 1 from private.platform_admins where user_id=(p_data->>'actor')::uuid and enabled) then raise exception 'admin_required';end if;return '{"authorized":true}';
 end if;
 select * into s from private.transactional_email_settings where id;
 if p_action='configuration' then return to_jsonb(s);end if;
 if p_action='gmail_credentials' then
  if s.provider<>'gmail' then raise exception 'email_configuration_required';end if;
  return (select jsonb_build_object('email',email,'encrypted_refresh_token',encrypted_refresh_token) from private.agenda_mail_sender where singleton);
 end if;
 if p_action='verified' then
  if (p_data->>'configuration_revision')::integer is distinct from s.configuration_revision or p_data->>'domain_id' is distinct from s.domain_id::text or p_data->>'domain_name' is distinct from s.domain_name then raise exception 'email_configuration_changed';end if;
  update private.transactional_email_settings set domain_evidence=p_data->'evidence',runtime_verified_at=case when coalesce((p_data->>'runtime_ready')::boolean,false) then now() end,verified_at=case when (s.provider='gmail' and p_data->'evidence'->>'oauth'='true') or (p_data->'evidence'->>'spf'='true' and p_data->'evidence'->>'dkim'='true' and p_data->'evidence'->>'dmarc'='true') then now() end where id;
  return private.email_delivery_overview();
 end if;
 if p_action='delivery_event' then
  if coalesce(p_data->>'event_id','') !~ '^[A-Za-z0-9_-]{5,200}$' or p_data->>'type' not in ('email.sent','email.delivered','email.bounced','email.failed','email.complained','email.delivery_delayed','email.suppressed') or coalesce(p_data->>'provider_message_id','') !~ '^[A-Za-z0-9_-]{5,200}$' then raise exception 'invalid_email_event';end if;
  insert into private.transactional_email_provider_events(event_id,provider_message_id,event_type,occurred_at) values(p_data->>'event_id',p_data->>'provider_message_id',p_data->>'type',(p_data->>'occurred_at')::timestamptz) on conflict(event_id) do nothing;
  update private.transactional_email_settings set webhook_verified_at=now() where id;
  perform private.apply_email_delivery(p_data->>'provider_message_id');return '{"received":true}';
 end if;
 if p_action='claim' then
  if not s.enabled or s.delivery_mode<>'controlled' or s.provider not in ('resend','gmail') or s.verified_at<now()-interval '7 days' or s.verified_at is null or s.runtime_verified_at is null then raise exception 'email_configuration_required';end if;
  lk:=(p_data->>'lease_key')::uuid;if lk is null then raise exception 'invalid_input';end if;
  select * into item from private.transactional_email_outbox o where o.configuration_revision=s.configuration_revision and is_test_delivery and mode='test' and provider_message_id is null and status in ('pending','failed') and attempts<5 and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and exists(select 1 from private.transactional_email_test_recipients r where r.email=o.recipient_email) order by created_at for update skip locked limit 1;
  if item.id is null then return null;end if;
  if item.first_attempt_at<now()-interval '23 hours' then
   update private.transactional_email_outbox set status='failed',attempts=5,last_error='email_delivery_requires_reconciliation',delivery_status='unknown' where id=item.id;return null;
  end if;
  select * into t from private.transactional_email_templates where key=item.template_key and active;
  if t.key is null then raise exception 'email_template_unavailable';end if;
  update private.transactional_email_outbox set lease_key=lk,lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),delivery_snapshot=coalesce(delivery_snapshot,jsonb_build_object('id',id,'recipient',recipient_email,'template_key',template_key,'subject',t.subject,'body',t.body,'mode',mode,'controlled_test',is_test_delivery,'from_email',s.from_email,'reply_to',s.reply_to,'support_email',(select support_email from private.support_settings where id),'privacy_email',(select privacy_email from private.support_settings where id))),updated_at=now() where id=item.id returning * into item;
  return item.delivery_snapshot||jsonb_build_object('attempts',item.attempts,'first_attempt_at',item.first_attempt_at,'prepared_message',item.prepared_message);
 end if;
 if p_action='prepare' then
  update private.transactional_email_outbox set prepared_message=coalesce(prepared_message,p_data->'message') where id=(p_data->>'id')::uuid and lease_key=(p_data->>'lease_key')::uuid returning prepared_message into result;
  if not found then raise exception 'email_lease_expired';end if;return result;
 end if;
 if p_action='complete' then
  select * into item from private.transactional_email_outbox where id=(p_data->>'id')::uuid and lease_key=(p_data->>'lease_key')::uuid for update;
  if item.id is null then raise exception 'email_lease_expired';end if;
  if nullif(p_data->>'provider_message_id','') is not null then
   update private.transactional_email_outbox set provider_message_id=p_data->>'provider_message_id',status='sent',delivery_status='accepted',sent_at=now(),last_error=null,lease_key=null,lease_until=null,updated_at=now() where id=item.id;
   perform private.apply_email_delivery(p_data->>'provider_message_id');
  else
   if coalesce(p_data->>'code','') !~ '^[a-z_]{3,80}$' then raise exception 'invalid_input';end if;
   update private.transactional_email_outbox set status=case when attempts>=5 or not coalesce((p_data->>'retryable')::boolean,false) then 'failed' else 'pending' end,attempts=case when not coalesce((p_data->>'retryable')::boolean,false) then 5 else attempts end,delivery_status=case when p_data->>'code'='email_delivery_unknown' then 'unknown' else 'failed' end,last_error=p_data->>'code',next_attempt_at=now()+make_interval(mins=>least(60,power(2,attempts)::integer)),lease_key=null,lease_until=null,updated_at=now() where id=item.id;
  end if;
  return '{"saved":true}';
 end if;
 if p_action='worker_done' then
  update private.transactional_email_settings set last_worker_at=now() where id;
  insert into private.operational_job_runs(job_key,started_at,finished_at,status,result) values('transactional_email_real_worker',now(),now(),case when (p_data->>'failed')::integer>0 then 'failed' else 'succeeded' end,jsonb_build_object('accepted',p_data->'accepted','failed',p_data->'failed')) returning id into run_id;
  return jsonb_build_object('run_id',run_id);
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function private.transactional_email_server(text,jsonb) from public,anon,authenticated;
grant execute on function private.transactional_email_server(text,jsonb) to service_role;

do $$
declare definition text; start_at integer; end_at integer;
begin
 select pg_get_functiondef('private.pre_live_evidence()'::regprocedure) into definition;
 start_at:=position('  email_ready :=' in definition); end_at:=position('  support_ready :=' in definition);
 if start_at=0 or end_at<=start_at then raise exception 'readiness_patch_missing'; end if;
 definition:=substring(definition from 1 for start_at-1)||'  email_ready := private.transactional_email_ready();'||chr(10)||chr(10)||substring(definition from end_at);
 definition:=replace(definition,'Falta verificar proveedor real, SPF/DKIM/DMARC y recepción de cinco pruebas controladas.','Falta verificar el proveedor, el remitente, la ejecución del worker y la recepción de cinco pruebas controladas.');
 execute definition;
end $$;
