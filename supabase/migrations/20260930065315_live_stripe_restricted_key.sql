-- Restricted Live keys preserve the environment/account/operational gates.
-- Permissions are enforced by Stripe; no new SQL grants or checkout activation.
create or replace function private.billing_provider_credentials_for(p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare credentials jsonb;
begin
 if p_environment='test' then return private.billing_provider_credentials(); end if;
 if p_environment is distinct from 'live' then raise exception 'billing_environment_mismatch'; end if;
 perform private.billing_live_guard();
 select decrypted_secret::jsonb into credentials from vault.decrypted_secrets where name='nuthrick_billing_stripe_live';
 if credentials->>'mode' is distinct from 'live'
 or coalesce(credentials->>'secret_key','') !~ '^(sk|rk)_live_[A-Za-z0-9]+$'
 or coalesce(credentials->>'webhook_secret','') !~ '^whsec_[A-Za-z0-9]+$'
 or credentials->>'account_id' is distinct from (select account_id from private.billing_live_configuration where id)
 or coalesce(credentials->>'account_id','') !~ '^acct_[A-Za-z0-9]+$'
 or (credentials ? 'publishable_key' and credentials->>'publishable_key' !~ '^pk_live_[A-Za-z0-9]+$') then raise exception 'billing_not_configured'; end if;
 return credentials||jsonb_build_object('portal_configuration_id',(select portal_configuration_id from private.billing_live_configuration where id));
end $$;
