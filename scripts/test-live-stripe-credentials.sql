-- Synthetic credentials in the disposable local database only.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception '%',label; end if; end$$;
do $$ begin
 begin perform private.billing_provider_credentials_for('live'); raise exception 'legal gate bypassed';
 exception when others then if sqlerrm<>'live_legal_pending' then raise; end if; end;
end $$;
select pg_temp.assert(not has_function_privilege('authenticated','private.billing_provider_credentials_for(text)','EXECUTE'),'Restricted key support grants no browser access');
select pg_temp.assert(not has_function_privilege('anon','public.billing_provider_credentials_for(text)','EXECUTE'),'Anonymous cannot read credentials');
-- Isolate credential validation after proving the real legal guard is retained.
create or replace function private.billing_live_guard(p_owner uuid default null,p_checkout boolean default false) returns void language plpgsql as $$begin return; end$$;
create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text);
update private.billing_live_configuration set account_id='acct_LOCALFIXTURE';
insert into vault.decrypted_secrets values('nuthrick_billing_stripe_live','{"mode":"live","account_id":"acct_LOCALFIXTURE","secret_key":"rk_live_LOCALFIXTURE","webhook_secret":"whsec_LOCALFIXTURE"}');
select pg_temp.assert(private.billing_provider_credentials_for('live')->>'secret_key'='rk_live_LOCALFIXTURE','Accept a restricted Live key');
do $$ declare invalid text; begin
 foreach invalid in array array['rk_test_LOCALFIXTURE','sk_test_LOCALFIXTURE','pk_live_LOCALFIXTURE','sk_org_LOCALFIXTURE','rk_live_'] loop
  update vault.decrypted_secrets set decrypted_secret=(decrypted_secret::jsonb||jsonb_build_object('secret_key',invalid))::text;
  begin perform private.billing_provider_credentials_for('live'); raise exception 'invalid key accepted';
  exception when others then if sqlerrm<>'billing_not_configured' then raise; end if; end;
 end loop;
end $$;
update vault.decrypted_secrets set decrypted_secret=(decrypted_secret::jsonb||'{"secret_key":"sk_live_LOCALFIXTURE"}'::jsonb)::text;
select pg_temp.assert(private.billing_provider_credentials_for('live')->>'secret_key'='sk_live_LOCALFIXTURE','Keep existing secret key compatibility');
update vault.decrypted_secrets set decrypted_secret=(decrypted_secret::jsonb||'{"secret_key":"rk_live_LOCALFIXTURE","account_id":"acct_OTHER"}'::jsonb)::text;
do $$ begin
 begin perform private.billing_provider_credentials_for('live'); raise exception 'foreign account accepted';
 exception when others then if sqlerrm<>'billing_not_configured' then raise; end if; end;
end $$;
select pg_temp.assert(not (select checkout_enabled from private.billing_live_configuration),'Credential support never enables checkout');
rollback;
