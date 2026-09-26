-- The cron bearer stays in Vault. The Edge Function can validate it through a
-- restricted service-role RPC without copying the secret into function env vars.
create or replace function private.transactional_email_worker_authorized(p_token text)
returns boolean language sql security definer set search_path='' as $$
 select length(coalesce(p_token,''))>=32 and exists(
   select 1 from vault.decrypted_secrets
   where name='nuthrick_transactional_email_worker_secret' and decrypted_secret=p_token
 )
$$;
create function public.transactional_email_worker_authorized(p_token text)
returns boolean language sql security invoker set search_path='' as $$select private.transactional_email_worker_authorized(p_token)$$;
revoke all on function private.transactional_email_worker_authorized(text),public.transactional_email_worker_authorized(text) from public,anon,authenticated;
grant execute on function private.transactional_email_worker_authorized(text) to service_role;
