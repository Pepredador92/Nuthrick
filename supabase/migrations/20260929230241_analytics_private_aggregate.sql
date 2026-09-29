begin;
-- Keep the privileged aggregate behind an invoker API. The private function
-- still checks the platform administrator before reading any visit records.
alter function public.admin_site_analytics(integer) set schema private;
revoke all on function private.admin_site_analytics(integer) from public,anon,service_role;
grant execute on function private.admin_site_analytics(integer) to authenticated;
create function public.admin_site_analytics(p_days integer default 30) returns jsonb
language sql security invoker set search_path='' as $$ select private.admin_site_analytics(p_days) $$;
revoke all on function public.admin_site_analytics(integer) from public,anon,service_role;
grant execute on function public.admin_site_analytics(integer) to authenticated;
commit;
