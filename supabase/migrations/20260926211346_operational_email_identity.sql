-- One operational sender for Agenda and commercial mail. Administrative access
-- is resolved from platform_admins, independently of the sender address.
create function private.operational_mail_context(p_actor uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
   'sender_email',s.from_email,'reply_to',s.reply_to,
   'can_manage',exists(select 1 from private.platform_admins a where a.user_id=p_actor and a.enabled),
   'test_recipients',coalesce((select jsonb_agg(email) from private.transactional_email_test_recipients),'[]'::jsonb)
 ) from private.transactional_email_settings s where s.id
$$;
create function public.operational_mail_context(p_actor uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.operational_mail_context(p_actor)
$$;
revoke all on function private.operational_mail_context(uuid),public.operational_mail_context(uuid) from public,anon,authenticated;
grant execute on function private.operational_mail_context(uuid),public.operational_mail_context(uuid) to service_role;

-- Configure the intended sender before authorizing its OAuth connection. All
-- readiness evidence is invalidated; the worker still requires verification.
create or replace function private.email_gmail_admin_api(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin(); sender text; support text;
begin
 if p_action<>'configure' then raise exception 'invalid_action'; end if;
 if p_data->>'confirmation' is distinct from 'SOLO CORREOS DE PRUEBA CONTROLADOS' then raise exception 'confirmation_required'; end if;
 sender:=lower(btrim(p_data->>'from_email'));
 if coalesce(sender,'') !~ '^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$' then raise exception 'invalid_sender'; end if;
 select support_email into support from private.support_settings where id and contacts_verified_at is not null;
 if support is null then raise exception 'legal_contact_required'; end if;
 update private.transactional_email_settings
 set configuration_revision=configuration_revision+1,
     provider='gmail',mode='live',delivery_mode='controlled',enabled=true,
     domain_id=null,domain_name=null,domain_evidence=jsonb_build_object('provider','gmail_oauth'),
     from_email=sender,reply_to=lower(support),verified_at=null,runtime_verified_at=null,
     webhook_verified_at=null,last_worker_at=null,updated_at=now() where id;
 perform private.billing_audit('email_configure_gmail',null,null,jsonb_build_object('sender',sender),actor);
 return private.email_delivery_overview();
end $$;
revoke all on function private.email_gmail_admin_api(text,jsonb) from public,anon,service_role;
grant execute on function private.email_gmail_admin_api(text,jsonb) to authenticated;
