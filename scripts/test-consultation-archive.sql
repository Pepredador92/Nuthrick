-- LOCAL synthetic fixtures only, rolled back by the runner.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated;
create table public.consultations(id uuid primary key, professional_id uuid, patient_id uuid, status text, completed_at timestamptz);
create unique index one_draft on public.consultations(professional_id,patient_id) where status='draft';
create table public.consultation_snapshots(id uuid primary key default gen_random_uuid(),professional_id uuid,consultation_id uuid references public.consultations on delete cascade,patient_id uuid,template_id uuid,template_name text,template_version integer,structure jsonb,revision integer);
create table public.consultation_answers(professional_id uuid,consultation_id uuid references public.consultations on delete cascade,patient_id uuid,revision integer,question_key text,section_key text,response_area text,value jsonb);
create table public.measurements(consultation_id uuid references public.consultations on delete cascade,value numeric);
create table public.nutrition_plan_versions(consultation_id uuid references public.consultations on delete restrict,content jsonb);
alter table public.consultations enable row level security;
create policy own_read on public.consultations for select to authenticated using(professional_id=auth.uid());
create policy own_update on public.consultations for update to authenticated using(professional_id=auth.uid() and status='draft') with check(professional_id=auth.uid() and status in ('draft','completed','cancelled'));
create policy own_delete on public.consultations for delete to authenticated using(professional_id=auth.uid() and status='draft');
grant select,update,delete on public.consultations to authenticated;
insert into public.consultations values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','completed',now()),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','draft',null),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','completed',now());
insert into public.consultation_snapshots(consultation_id,revision,structure) values('10000000-0000-0000-0000-000000000001',1,'{"answers":"original"}');
insert into public.consultation_answers(consultation_id,revision,value) values('10000000-0000-0000-0000-000000000001',1,'"original"');
insert into public.measurements values('10000000-0000-0000-0000-000000000001',72);
insert into public.nutrition_plan_versions values('10000000-0000-0000-0000-000000000001','{"published":true}');
-- MIGRATION INSERTION POINT --
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ declare stamp timestamptz; begin
 if has_function_privilege('anon','public.delete_consultation_record(uuid)','execute') then raise exception 'Anonymous execute enabled'; end if;
 perform public.delete_consultation_record('10000000-0000-0000-0000-000000000001');
 select deleted_at into stamp from public.consultations where id='10000000-0000-0000-0000-000000000001';
 if stamp is null then raise exception 'Completed consultation not archived'; end if;
 perform public.delete_consultation_record('10000000-0000-0000-0000-000000000001');
 if (select deleted_at from public.consultations where id='10000000-0000-0000-0000-000000000001')<>stamp then raise exception 'Retry changed deletion'; end if;
 perform public.delete_consultation_record('10000000-0000-0000-0000-000000000002');
 if exists(select 1 from public.consultations where deleted_at is null) then raise exception 'Active history still contains removed consultations'; end if;
 if (select status from public.consultations where id='10000000-0000-0000-0000-000000000002')<>'cancelled' then raise exception 'Draft uniqueness not released'; end if;
 begin
   perform public.delete_consultation_record('10000000-0000-0000-0000-000000000003');
   raise exception 'Cross-owner archive succeeded';
 exception when insufficient_privilege then null; end;
 begin
   perform public.reopen_consultation_for_edit('10000000-0000-0000-0000-000000000001');
   raise exception 'Archived consultation reopened';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
   perform public.delete_consultation_record('10000000-0000-0000-0000-000000000003');
   raise exception 'Missing identity succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.consultations values('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','draft',null,null);
do $$ begin
 if (select count(*) from public.consultation_snapshots)<>1 or (select count(*) from public.consultation_answers)<>1 then raise exception 'Questionnaire history lost'; end if;
 if (select value from public.measurements)<>72 then raise exception 'Measurements lost'; end if;
 if (select content from public.nutrition_plan_versions)<>'{"published":true}'::jsonb then raise exception 'Published plan changed'; end if;
 if (select deleted_at from public.consultations where id='10000000-0000-0000-0000-000000000003') is not null then raise exception 'Other professional changed'; end if;
end $$;
select 'Completed/published + draft archive, retry, ownership, new draft, historical provenance: PASS' as result;
