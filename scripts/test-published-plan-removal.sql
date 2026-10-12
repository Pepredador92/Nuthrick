-- Synthetic local fixtures; every schema change and record is rolled back.
begin;
-- SETUP --
create schema auth;
create function auth.uid() returns uuid language sql as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated;
alter table public.nutrition_plans add column draft_revision bigint not null default 1;
-- Commercial/retention policy is outside this fixture's scope.
create function private.require_portal_capability(uuid,text,text) returns void language plpgsql as $$begin return;end$$;
create function private.require_retention_patient(uuid,uuid) returns void language plpgsql as $$begin return;end$$;
-- BASE MIGRATIONS --
grant select on all tables in schema public to service_role;
grant update on public.nutrition_plans to service_role;
alter table public.nutrition_plan_versions enable row level security;
grant select on public.nutrition_plan_versions to authenticated;
create policy owner_read on public.nutrition_plan_versions for select to authenticated
  using (professional_id=(select auth.uid()));

insert into public.patients(id,professional_id,full_name) values
  ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Otro paciente del mismo profesional');
insert into public.nutrition_plans(id,professional_id,patient_id,status) select
  ('70000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','active'
  from generate_series(1,7)n;
update public.nutrition_plans set professional_id='00000000-0000-0000-0000-000000000002',
  patient_id='10000000-0000-0000-0000-000000000002' where id='70000000-0000-0000-0000-000000000004';
update public.nutrition_plans set status='draft' where id='70000000-0000-0000-0000-000000000005';
update public.nutrition_plans set status='archived' where id='70000000-0000-0000-0000-000000000006';
insert into public.nutrition_plan_versions(id,plan_id,professional_id,patient_id,version_number,published_at,snapshot)
  select ('80000000-0000-0000-0000-'||lpad((n*10+v)::text,12,'0'))::uuid,np.id,np.professional_id,np.patient_id,v,
    '2026-10-01'::timestamptz,jsonb_build_object('plan',jsonb_build_object('title','Plan sintético '||n),'content','Preserved snapshot '||v)
  from generate_series(1,7)n join public.nutrition_plans np
    on np.id=('70000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
  cross join generate_series(1,2)v where n<>5;
update public.nutrition_plans np set current_version_id=v.id from public.nutrition_plan_versions v
  where v.plan_id=np.id and v.version_number=2;
-- Reproduce an old workshop removal before the fix is installed.
update public.nutrition_plans set status='archived',deleted_at='2026-10-05'::timestamptz
  where id='70000000-0000-0000-0000-000000000001';
insert into private.patient_portals(patient_id,shared_plan_id) values
  ('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001');
create temp table original_publications as
  select id,snapshot,version_number,published_at from public.nutrition_plan_versions;
-- SYNCHRONIZATION MIGRATION --

create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %',label;end if;end$$;
create function pg_temp.reject(q text,expected text) returns void language plpgsql as $$
begin execute q;raise exception 'Unexpected success';exception when others then if sqlstate<>expected then raise;end if;end$$;
select pg_temp.assert((select bool_and(retired_at='2026-10-05'::timestamptz and retired_by=professional_id)
  from public.nutrition_plan_versions where plan_id='70000000-0000-0000-0000-000000000001'),'old deleted publications repaired');
select pg_temp.assert((select shared_plan_id is null from private.patient_portals),'old sharing repaired');
select pg_temp.assert((select bool_and(retired_at is null) from public.nutrition_plan_versions
  where plan_id<>'70000000-0000-0000-0000-000000000001'),'active and archived plans preserved');
select pg_temp.assert(not has_function_privilege('anon','public.remove_published_nutrition_plan(uuid,bigint)','execute'),'anonymous removal rejected');
select pg_temp.assert(not has_function_privilege('authenticated','public.patient_portal(text,jsonb)','execute'),'browser cannot impersonate portal owner');
select pg_temp.assert(not has_table_privilege('authenticated','public.nutrition_plan_versions','update'),'snapshots remain read-only in browser');

set local role service_role;
do $$
declare owner jsonb:='{"owner":"00000000-0000-0000-0000-000000000001","patientId":"10000000-0000-0000-0000-000000000001"}';
  result jsonb;
begin
  result:=public.patient_portal('plan_history',owner);
  perform pg_temp.assert(jsonb_array_length(result->'versions')=8,'history excludes previously removed plan and other professional');
  perform pg_temp.assert(public.patient_portal('plan_version',owner||'{"versionId":"80000000-0000-0000-0000-000000000012"}')->>'error'='invalid_plan','removed publication cannot be read');
  perform pg_temp.assert(public.patient_portal('export_plan',owner||'{"versionId":"80000000-0000-0000-0000-000000000012","format":"pdf"}')->>'error'='invalid_plan','removed publication cannot be exported');
  perform pg_temp.assert(public.patient_portal('share_plan',owner||'{"planId":"70000000-0000-0000-0000-000000000001"}')->>'error'='invalid_plan','removed plan cannot be shared');
  perform public.patient_portal('share_plan',owner||'{"planId":"70000000-0000-0000-0000-000000000002"}');
  perform pg_temp.assert(public.patient_portal('plan_history',owner||'{"retireVersionId":"80000000-0000-0000-0000-000000000011"}')->>'ok'='true','retry for repaired publication succeeds');
end$$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select pg_temp.reject($q$select public.remove_published_nutrition_plan('70000000-0000-0000-0000-000000000004',1)$q$,'42501');
select pg_temp.reject($q$select public.remove_published_nutrition_plan('70000000-0000-0000-0000-000000000005',1)$q$,'23514');
select pg_temp.reject($q$select public.remove_published_nutrition_plan('70000000-0000-0000-0000-000000000002',2)$q$,'40001');
select public.remove_published_nutrition_plan('70000000-0000-0000-0000-000000000002',1);
select public.remove_published_nutrition_plan('70000000-0000-0000-0000-000000000002',1);
reset role;
select pg_temp.assert((select bool_and(retired_at is not null and retired_by=professional_id) from public.nutrition_plan_versions
  where plan_id='70000000-0000-0000-0000-000000000002'),'whole-plan removal retires all publications');
select pg_temp.assert((select status='archived' and deleted_at is not null and current_version_id is null from public.nutrition_plans
  where id='70000000-0000-0000-0000-000000000002'),'workshop plan and current publication withdrawn');
select pg_temp.assert((select shared_plan_id is null from private.patient_portals),'removed plan withdrawn from Super Link');

set local role service_role;
do $$
declare owner jsonb:='{"owner":"00000000-0000-0000-0000-000000000001","patientId":"10000000-0000-0000-0000-000000000001"}';
  result jsonb;
begin
  perform pg_temp.assert(jsonb_array_length(public.patient_portal('plan_history',owner)->'versions')=6,'removed plan disappears from patient history');
  perform pg_temp.assert(public.patient_portal('plan',owner)->'plan'='null'::jsonb,'no removed plan delivered');
  perform pg_temp.assert(public.patient_portal('plan_history',owner||'{"retireVersionId":"80000000-0000-0000-0000-000000000041"}')->>'error'='invalid_plan','cannot retire another professional publication');
  perform pg_temp.assert(public.patient_portal('plan_history',owner||'{"patientId":"10000000-0000-0000-0000-000000000003","retireVersionId":"80000000-0000-0000-0000-000000000031"}')->>'error'='invalid_plan','cannot retire another patient publication');
  result:=public.patient_portal('plan_history',owner||'{"retireVersionId":"80000000-0000-0000-0000-000000000031"}');
  perform pg_temp.assert(result->>'ok'='true' and result->>'removedFromSharedPlan'='false','obsolete version retired');
  perform pg_temp.assert(public.patient_portal('plan_version',owner||'{"versionId":"80000000-0000-0000-0000-000000000032"}') ? 'plan','other version of same plan preserved');
  perform public.patient_portal('share_plan',owner||'{"planId":"70000000-0000-0000-0000-000000000003"}');
  result:=public.patient_portal('plan_history',owner||'{"retireVersionId":"80000000-0000-0000-0000-000000000032"}');
  perform pg_temp.assert(result->>'ok'='true' and result->>'removedFromSharedPlan'='true','current version retired and unshared');
  perform pg_temp.assert(public.patient_portal('plan_history',owner||'{"retireVersionId":"80000000-0000-0000-0000-000000000032"}')->>'ok'='true','repeat retirement succeeds');
  perform pg_temp.assert(public.patient_portal('export_plan',owner||'{"versionId":"80000000-0000-0000-0000-000000000032","format":"pdf"}')->>'error'='invalid_plan','retired version cannot be exported');
  perform pg_temp.assert(public.patient_portal('plan_version',owner||'{"versionId":"80000000-0000-0000-0000-000000000062"}') ? 'plan','archiving without deletion preserves history');
end$$;
reset role;
set local role authenticated;
select public.remove_published_nutrition_plan('70000000-0000-0000-0000-000000000003',1);
reset role;
select pg_temp.assert((select count(*)=12 and bool_and(v.snapshot=o.snapshot and v.version_number=o.version_number and v.published_at=o.published_at)
  from public.nutrition_plan_versions v join original_publications o on o.id=v.id),'all clinical snapshots and publication provenance preserved');
rollback;
select 'Plan removal, history retirement, Super Link, retry, revision and ownership: OK';
