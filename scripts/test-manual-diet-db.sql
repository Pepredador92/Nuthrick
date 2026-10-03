begin;
create schema private;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create role authenticated;
create role anon;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
-- Only the local fixture stubs entitlements; production migration preserves the real guard.
create function private.require_my_entitlement(text) returns void language sql as $$ select $$;
create table professional_profiles(id uuid primary key,full_name text,professional_title text);
create table patients(id uuid primary key,professional_id uuid,full_name text);
create table consultations(id uuid primary key,professional_id uuid,patient_id uuid,consultation_date timestamptz);
create table nutrition_plans(id uuid primary key,professional_id uuid,patient_id uuid,consultation_id uuid,title text,assigned_at date,target_calories numeric,energy_calculation jsonb,macro_distribution jsonb,exchange_prescription jsonb,meal_distribution jsonb,diet_menu jsonb,draft_revision bigint default 1,current_version_id uuid);
create table nutrition_plan_versions(id uuid primary key default gen_random_uuid(),plan_id uuid,professional_id uuid,patient_id uuid,consultation_id uuid,version_number int,draft_revision bigint,snapshot_schema_version int,validation_rules_version text,content_hash text,idempotency_key uuid,snapshot jsonb,published_by uuid,published_at timestamptz default now());
-- MIGRATIONS --
insert into professional_profiles values('a1000000-0000-4000-8000-000000000001','Profesional ficticio',null);
insert into patients values('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Paciente ficticio');
insert into nutrition_plans(id,professional_id,patient_id,title,meal_distribution,diet_menu) values(
'a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Plan manual',
'{"status":"editing","meal_times":[{"id":"breakfast","display_name":"Desayuno"}],"distribution":[]}',
'{"status":"editing","week_plan":{"days":[{"day":"mon","assignments":[{"meal_time_id":"breakfast","option_snapshot":{"meal_time_id":"breakfast","entries":[]}}]}]}}');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.publish_nutrition_plan_version('a3000000-0000-4000-8000-000000000001',1,'a4000000-0000-4000-8000-000000000001');
select public.publish_nutrition_plan_version('a3000000-0000-4000-8000-000000000001',1,'a4000000-0000-4000-8000-000000000001');
reset role;
do $$
declare p public.nutrition_plans; v jsonb;
begin
 if (select count(*) from nutrition_plan_versions) <> 1 then raise exception 'Idempotency failed';end if;
 select * into p from nutrition_plans limit 1;
 if private.nutrition_plan_publication_errors(p)<>'[]'::jsonb then raise exception 'Incomplete plan blocked';end if;
 p.diet_menu:=jsonb_set(p.diet_menu,'{week_plan,days,0,assignments,0,option_snapshot,entries}','[{"quantity":-1,"unit":"g","type":"food","food_snapshot":{}}]');
 if private.nutrition_plan_publication_errors(p)='[]'::jsonb then raise exception 'Negative entry accepted';end if;
 p.diet_menu:=jsonb_set(p.diet_menu,'{week_plan,days,0,assignments,0,option_snapshot,entries}','[{"quantity":1,"unit":"g","type":"food"}]');
 if private.nutrition_plan_publication_errors(p)='[]'::jsonb then raise exception 'Missing food snapshot accepted';end if;
 p.patient_id:=null;
 if not private.nutrition_plan_publication_errors(p) @> '[{"code":"PATIENT_REQUIRED"}]'::jsonb then raise exception 'Patient guard missing';end if;
 begin
  perform public.publish_nutrition_plan_version('a3000000-0000-4000-8000-000000000001',2,gen_random_uuid());
  raise exception 'Wrong revision accepted';
 exception when serialization_failure then null;end;
 perform set_config('request.jwt.claim.sub','a5000000-0000-4000-8000-000000000001',true);
 begin
  perform public.publish_nutrition_plan_version('a3000000-0000-4000-8000-000000000001',1,gen_random_uuid());
  raise exception 'Another owner accepted';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: incomplete publication, idempotency, negative amounts, missing snapshot, patient, revision and ownership';
end $$;
rollback;
