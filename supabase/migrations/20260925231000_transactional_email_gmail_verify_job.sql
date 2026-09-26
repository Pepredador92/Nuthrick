-- Let the existing outbox cron perform the first Gmail OAuth verification before
-- it attempts controlled sends. The worker secret remains server-only.
create or replace function private.email_job_entrypoint() returns jsonb language plpgsql security definer set search_path='' as $$
declare token text;request_id bigint;action jsonb;
begin
 if (select delivery_mode from private.transactional_email_settings where id)='simulated' then return private.process_transactional_email_outbox(50);end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='nuthrick_transactional_email_worker_secret';
 if token is null or length(token)<32 then raise exception 'email_worker_configuration_required';end if;
 action:=case when (select provider='gmail' and verified_at is null from private.transactional_email_settings where id) then '{"action":"verify"}'::jsonb else '{"action":"worker"}'::jsonb end;
 select net.http_post(url:='https://qlsqhvyrslclmlstlemn.supabase.co/functions/v1/transactional-email',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:=action,timeout_milliseconds:=120000) into request_id;
 return jsonb_build_object('dispatched',true,'request_id',request_id,'action',action->>'action');
end $$;
