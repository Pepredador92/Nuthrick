-- Durable retries and reconciliation. Keep disabled until the Edge Function
-- and its matching Vault/Edge secret have been configured and smoke-tested.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_agenda_worker()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare worker_secret text; request_id bigint;
begin
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets where name = 'agenda_worker_secret';
  if worker_secret is null or length(worker_secret) < 32 then
    raise exception 'agenda_worker_configuration_required';
  end if;
  select net.http_post(
    url := 'https://qlsqhvyrslclmlstlemn.supabase.co/functions/v1/agenda',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || worker_secret),
    body := '{"op":"worker"}'::jsonb,
    timeout_milliseconds := 140000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.invoke_agenda_worker() from public, anon, authenticated, service_role;

select cron.schedule('nuthrick-agenda-worker', '* * * * *',
  'select private.invoke_agenda_worker();');
select cron.alter_job((select jobid from cron.job where jobname='nuthrick-agenda-worker'), active := false);
commit;
