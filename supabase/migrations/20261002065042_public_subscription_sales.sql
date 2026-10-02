begin;

-- General sales is independent of the pilot allowlist and of the TEST switch.
-- Kept closed until the deployed billing function has the inspection refresh.
alter table private.billing_live_configuration add column public_sales_enabled boolean not null default false;

create or replace function private.billing_owner_environment(p_owner uuid)
returns text language sql stable security definer set search_path='' as $$
 select private.credit_owner_environment(p_owner)
$$;

create function private.billing_live_customer_allowed(p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.professional_profiles where id=p_owner)
 and private.billing_owner_environment(p_owner)='live'
 and (exists(select 1 from private.billing_live_allowlist where professional_id=p_owner and enabled)
   or (select public_sales_enabled from private.billing_live_configuration where id))
$$;
revoke all on function private.billing_live_customer_allowed(uuid) from public,anon,authenticated,service_role;

-- All readiness checks still gate Checkout. Stale evidence is refreshed by the
-- service before prepare_checkout/preview, never fabricated or waived.
do $$ declare d text; begin
 d:=pg_get_functiondef('private.billing_live_guard(uuid,boolean)'::regprocedure);
 if position('if not exists(select 1 from private.billing_live_allowlist where professional_id=p_owner and enabled)' in d)=0 then raise exception 'live_guard_patch_missing'; end if;
 d:=replace(d,'if not exists(select 1 from private.billing_live_allowlist where professional_id=p_owner and enabled)','if not private.billing_live_customer_allowed(p_owner)');
 execute d;
end $$;

alter function private.billing_live_readiness() rename to billing_pilot_readiness;
revoke all on function private.billing_pilot_readiness() from public,anon,authenticated,service_role;
create function private.billing_live_readiness() returns jsonb language sql stable security definer set search_path='' as $$
 select r || jsonb_build_object('public_sales_enabled',c.public_sales_enabled,'checks',
   (select jsonb_agg(case when item->>'key'='live_pilot' and c.public_sales_enabled
    then jsonb_build_object('key','live_pilot','label','Venta general autorizada','status','ready','detail','Clientes reales en Live; cuentas TEST aisladas. La compra requiere revisión del proveedor, aceptación legal y pago verificado.')
    else item end order by n) from jsonb_array_elements(r->'checks') with ordinality x(item,n)))
 from private.billing_live_configuration c cross join lateral (select private.billing_pilot_readiness() r) v where c.id
$$;
revoke all on function private.billing_live_readiness() from public,anon,authenticated,service_role;

alter function private.billing_summary(uuid) rename to billing_summary_before_public_sales;
revoke all on function private.billing_summary_before_public_sales(uuid) from public,anon,authenticated,service_role;
create function private.billing_summary(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.billing_summary_before_public_sales(p_owner) || case when private.billing_owner_environment(p_owner)='live'
 then jsonb_build_object('enabled',c.checkout_enabled,'checkout_eligible',
   c.checkout_enabled and c.preparation_enabled and private.billing_live_customer_allowed(p_owner) and private.billing_legal_ready())
 else '{}'::jsonb end from private.billing_live_configuration c where c.id
$$;
revoke all on function private.billing_summary(uuid) from public,anon,authenticated,service_role;

alter function private.billing_server(text,jsonb) rename to billing_server_before_public_sales;
revoke all on function private.billing_server_before_public_sales(text,jsonb) from public,anon,authenticated,service_role;
create function private.billing_server(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(p_data->>'owner')::uuid; env text:=p_data->>'environment'; result jsonb; prices jsonb:='[]'; p record; m private.billing_price_mappings;
begin
 if p_action not in ('sales_inspection_context','sales_inspection_saved') then
  return private.billing_server_before_public_sales(p_action,p_data);
 end if;
 if env is distinct from 'live' or not private.billing_live_customer_allowed(owner) then raise exception 'live_account_not_allowed'; end if;
 if not (select checkout_enabled from private.billing_live_configuration where id) then raise exception 'live_checkout_disabled'; end if;
 perform set_config('nuthrick.billing_environment','live',true);
 perform private.billing_live_guard();
 perform private.billing_require_lock(owner,(p_data->>'lock_key')::uuid);
 if p_action='sales_inspection_context' then
  if not exists(select 1 from jsonb_array_elements(private.billing_live_readiness()->'checks') c
    where c->>'key' in ('live_provider','live_prices','live_webhook','live_portal','live_reconciliation') and c->>'status'<>'ready') then
   return '{"required":false}';
  end if;
  for p in select plan.id,v.interval from private.plans plan cross join (values('monthly'),('annual')) v(interval)
    where plan.active and not plan.internal_only order by plan.id,v.interval loop
   m:=private.billing_price(p.id,p.interval);
   prices:=prices||jsonb_build_array(private.billing_price_json(m.id));
  end loop;
  return jsonb_build_object('required',true,'prices',prices,'subscriptions',coalesce((
   select jsonb_agg(jsonb_build_object('id',s.provider_subscription_id,'customer_id',s.provider_customer_id,'price_id',pm.provider_price_id,'status',s.provider_status,'cancel_at_period_end',s.cancel_at_period_end))
   from private.billing_subscriptions s join private.billing_price_mappings pm on pm.id=s.price_mapping_id where s.mode='live'),'[]'));
 end if;
 result:=p_data->'result';
 if result is null or jsonb_typeof(result)<>'object' then raise exception 'invalid_input'; end if;
 update private.billing_live_configuration set account_verified_at=now(),
   webhook_reachable_at=case when (result->>'webhook_reachable')::boolean then now() end,
   portal_verified_at=case when (result->>'portal_verified')::boolean then now() end,
   reconciliation_verified_at=case when (result->>'reconciliation_ok')::boolean then now() end,
   last_inspection_at=now(),last_inspection=result,updated_at=now() where id;
 perform private.billing_audit('live_configuration_refreshed',null,null,result,null);
 return result;
end $$;
revoke all on function private.billing_server(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.billing_server(text,jsonb) to service_role;
commit;
