begin;
create function private.admin_commercial_costs() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_platform_admin();
 -- Only the configured conversion; no keys, prompts, patient data or balances.
 return jsonb_build_object('checked_at',now(),'features',coalesce((select jsonb_agg(jsonb_build_object(
  'feature',feature,'usd_per_credit',1/nullif(credits_per_usd*credit_multiplier,0),'pricing_version',pricing_version) order by feature)
  from private.ai_feature_config where enabled and feature in ('recall_24h','pes_diagnosis','diet_draft')),'[]'));
end $$;
create function public.admin_commercial_costs() returns jsonb language sql security invoker set search_path='' as $$select private.admin_commercial_costs()$$;
revoke all on function private.admin_commercial_costs(),public.admin_commercial_costs() from public,anon,authenticated,service_role;
grant execute on function private.admin_commercial_costs(),public.admin_commercial_costs() to authenticated;
commit;
