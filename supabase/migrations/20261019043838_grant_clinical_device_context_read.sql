begin;
-- The clinical source is SECURITY INVOKER and joins device sessions to label
-- current/historical measurements. Fresh installations with automatic API
-- grants disabled need this explicit server-only read permission.
grant select on public.consultation_device_sessions to service_role;
commit;
