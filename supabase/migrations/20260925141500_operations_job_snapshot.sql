-- Include manually triggered entrypoints in the same operational snapshot as
-- pg_cron. This lets an admin verify a job immediately after a TEST run while
-- still requiring an active scheduler for readiness.
create or replace function private.operations_jobs() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='[]'::jsonb;
begin
 if to_regclass('cron.job') is null then
  return coalesce((select jsonb_agg(jsonb_build_object('jobname',job_key,'active',true,'last_run_at',started_at,'last_status',status,'last_error',error_code,'duration_ms',duration_ms) order by job_key) from private.operational_job_runs where id in (select max(id) from private.operational_job_runs group by job_key)),'[]'::jsonb);
 end if;
 execute $sql$
   select coalesce(jsonb_agg(jsonb_build_object(
     'jobid',x.jobid,'jobname',x.jobname,'schedule',x.schedule,'active',x.active,
     'last_run_at',coalesce(x.cron_started,x.manual_started),
     'last_status',coalesce(x.cron_status,x.manual_status),
     'last_error',case when coalesce(x.cron_status,x.manual_status)='failed' then coalesce(x.cron_error,x.manual_error) else null end,
     'duration_ms',coalesce(x.cron_duration,x.manual_duration)
   ) order by x.jobname),'[]'::jsonb)
   from (
     select j.jobid,j.jobname,j.schedule,j.active,
       r.start_time cron_started,r.status cron_status,
       case when r.status='failed' then r.return_message else null end cron_error,
       case when r.end_time is null then null else extract(epoch from(r.end_time-r.start_time))*1000 end cron_duration,
       o.started_at manual_started,o.status manual_status,o.error_code manual_error,o.duration_ms manual_duration
     from cron.job j
     left join lateral(select d.* from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1) r on true
     left join lateral(select x.* from private.operational_job_runs x where x.job_key=case j.jobname when 'nuthrick-billing-monthly-and-grace' then 'billing_monthly_and_grace' when 'nuthrick-transactional-email-outbox' then 'transactional_email_outbox' else '' end order by x.started_at desc limit 1) o on true
     where j.jobname like 'nuthrick-%'
   ) x
 $sql$ into result;
 return result;
end $$;
revoke all on function private.operations_jobs() from public,anon,authenticated,service_role;
