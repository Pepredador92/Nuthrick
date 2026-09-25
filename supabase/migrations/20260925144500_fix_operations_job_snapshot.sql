-- Use the newest run from either pg_cron or the audited manual entrypoint.
-- A stale failed cron record must not hide a successful TEST rerun.
create or replace function private.operations_jobs() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb:='[]'::jsonb;
begin
  if to_regclass('cron.job') is null then
    return coalesce((select jsonb_agg(jsonb_build_object('jobname',job_key,'active',true,'last_run_at',started_at,'last_status',status,'last_error',error_code,'duration_ms',duration_ms) order by job_key) from private.operational_job_runs where id in (select max(id) from private.operational_job_runs group by job_key)),'[]'::jsonb);
  end if;
  execute $sql$
    select coalesce(jsonb_agg(jsonb_build_object(
      'jobid',j.jobid,'jobname',j.jobname,'schedule',j.schedule,'active',j.active,
      'last_run_at',case when coalesce(o.manual_started,'epoch'::timestamptz) > coalesce(r.cron_started,'epoch'::timestamptz) then o.manual_started else r.cron_started end,
      'last_status',case when coalesce(o.manual_started,'epoch'::timestamptz) > coalesce(r.cron_started,'epoch'::timestamptz) then o.manual_status else r.cron_status end,
      'last_error',case when (case when coalesce(o.manual_started,'epoch'::timestamptz) > coalesce(r.cron_started,'epoch'::timestamptz) then o.manual_status else r.cron_status end)='failed' then case when coalesce(o.manual_started,'epoch'::timestamptz) > coalesce(r.cron_started,'epoch'::timestamptz) then o.manual_error else r.cron_error end else null end,
      'duration_ms',case when coalesce(o.manual_started,'epoch'::timestamptz) > coalesce(r.cron_started,'epoch'::timestamptz) then o.manual_duration else r.cron_duration end
    ) order by j.jobname),'[]'::jsonb)
    from cron.job j
    left join lateral(select d.start_time as cron_started,d.status as cron_status,d.return_message as cron_error,case when d.end_time is null then null else extract(epoch from(d.end_time-d.start_time))*1000 end as cron_duration from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1) r on true
    left join lateral(select x.started_at as manual_started,x.status as manual_status,x.error_code as manual_error,x.duration_ms as manual_duration from private.operational_job_runs x where x.job_key=case j.jobname when 'nuthrick-billing-monthly-and-grace' then 'billing_monthly_and_grace' when 'nuthrick-transactional-email-outbox' then 'transactional_email_outbox' else '' end order by x.started_at desc limit 1) o on true
    where j.jobname like 'nuthrick-%'
  $sql$ into snapshot;
  return snapshot;
end $$;
revoke all on function private.operations_jobs() from public,anon,authenticated,service_role;
