-- Avoid PL/pgSQL variable/column ambiguity when the real pg_cron worker
-- records its result. The entrypoint remains idempotent and TEST-only.
create or replace function private.billing_job_entrypoint() returns jsonb
language plpgsql security definer set search_path='' as $$
declare job_result jsonb; started timestamptz:=clock_timestamp(); run_id bigint; beta_count integer:=0;
begin
  insert into private.operational_job_runs(job_key,started_at) values('billing_monthly_and_grace',started) returning id into run_id;
  beta_count:=private.enqueue_beta_lifecycle_emails();
  job_result:=private.billing_tick();
  job_result:=job_result||jsonb_build_object('beta_emails_enqueued',beta_count);
  update private.operational_job_runs as job_run
  set finished_at=clock_timestamp(),status='succeeded',duration_ms=extract(epoch from(clock_timestamp()-started)*1000)::integer,result=job_result
  where job_run.id=run_id;
  return job_result;
exception when others then
  update private.operational_job_runs as job_run
  set finished_at=clock_timestamp(),status='failed',duration_ms=extract(epoch from(clock_timestamp()-started)*1000)::integer,error_code=left(sqlstate||':'||sqlerrm,200)
  where job_run.id=run_id;
  raise;
end $$;
revoke all on function private.billing_job_entrypoint() from public,anon,authenticated,service_role;
