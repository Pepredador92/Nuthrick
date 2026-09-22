-- Isolated transactional schema; no production connection or patient data.
begin;
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
create schema private;
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public,private to authenticated,service_role;
create table professional_profiles(id uuid primary key);
create table patients(id uuid primary key,professional_id uuid,deleted_at timestamptz,full_name text,email text,phone text);
create table consultations(id uuid primary key,professional_id uuid,patient_id uuid,deleted_at timestamptz,status text);
create table consultation_snapshots(id uuid primary key default gen_random_uuid(),professional_id uuid,consultation_id uuid,patient_id uuid,revision integer,structure jsonb,template_id uuid,template_name text,template_version integer,created_at timestamptz);
create table consultation_answers(id uuid primary key default gen_random_uuid(),professional_id uuid,consultation_id uuid,patient_id uuid,revision integer,question_key text,value jsonb,updated_at timestamptz default clock_timestamp(),unique(professional_id,consultation_id,revision,question_key));
create table consultation_measurements(id uuid default gen_random_uuid(),professional_id uuid,consultation_id uuid,patient_id uuid,measurement_type_id text,value jsonb,unit text,updated_at timestamptz default clock_timestamp());
create table laboratory_results(id uuid default gen_random_uuid(),professional_id uuid,consultation_id uuid,patient_id uuid,analyte_name_snapshot text,numeric_comparator text,numeric_value numeric,text_value text,unit text,updated_at timestamptz default clock_timestamp());
create table consultation_calculation_results(id uuid default gen_random_uuid(),professional_id uuid,consultation_id uuid,patient_id uuid,result_key text,method_name text,method_version text,displayed_result text,unit text,calculated_at timestamptz,updated_at timestamptz default clock_timestamp());
create table consultation_anthropometry(professional_id uuid,consultation_id uuid,revision integer);
create table nutrition_plans(professional_id uuid,patient_id uuid,consultation_id uuid,target_calories numeric,macro_distribution jsonb,status text,updated_at timestamptz);
create table food_items(id uuid primary key,owner_id uuid,active boolean,name text,portion_amount numeric,portion_fraction jsonb,portion_unit text,edible_grams numeric,group_code text,portion_description text,exchange_system_code text,exchange_catalog_version text,source text,source_version text,is_custom boolean,attributes jsonb);
create function save_consultation_responses(target_consultation uuid,expected_revision integer,responses jsonb) returns void language plpgsql as $$
begin insert into public.consultation_answers(professional_id,consultation_id,patient_id,revision,question_key,value)
select auth.uid(),target_consultation,c.patient_id,expected_revision,e.key,e.value from public.consultations c cross join lateral jsonb_each(responses) e where c.id=target_consultation
on conflict(professional_id,consultation_id,revision,question_key) do update set value=excluded.value,updated_at=clock_timestamp();end;$$;
grant select on all tables in schema public to service_role;
-- AI CORE --
-- CLINICAL MIGRATION --
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assertion failed: %',label;end if;end$$;
create function pg_temp.reject(query text,expected text) returns void language plpgsql as $$begin execute query; raise exception 'Unexpected success'; exception when others then if sqlerrm<>expected and sqlstate<>expected then raise;end if;end$$;
insert into professional_profiles values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into patients values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',null,'SYNTHETIC',null,null);
insert into consultations values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',null,'draft');
insert into consultation_snapshots(professional_id,consultation_id,patient_id,revision,structure) select professional_id,id,patient_id,1,'{"sections":[{"questions":[{"question_key":"pes_statement"}]}]}' from consultations;
insert into consultation_answers(professional_id,consultation_id,patient_id,revision,question_key,value) select professional_id,id,patient_id,1,'main_reason','"Mejorar hábitos"' from consultations;
insert into food_items values('30000000-0000-0000-0000-000000000001',null,true,'Huevo entero',1,null,'piece',50,'AOA_MODERATE_FAT','1 pieza','SMAE_NOM037_2012','1.0.0','test','1',false,'{}'),('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',true,'Privado',1,null,'piece',50,'AOA_MODERATE_FAT','1 pieza','SMAE_NOM037_2012','1.0.0','test','1',true,'{}');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.reject($q$select clinical_workspace('20000000-0000-0000-0000-000000000001',1)$q$,'context_unavailable');
select pg_temp.reject($q$select ai_clinical_source('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1)$q$,'42501');
select pg_temp.reject($q$update consultation_snapshots set clinical_records='{"pes":{"generated_with_ai":true}}'$q$,'42501');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((clinical_workspace('20000000-0000-0000-0000-000000000001',1)->'readiness')='{"interview":true,"objective":false,"anthropometry":false,"laboratories":false}', 'interview enough without labs');
select pg_temp.reject($q$select clinical_workspace('20000000-0000-0000-0000-000000000001',2)$q$,'context_unavailable');
select pg_temp.reject($q$select clinical_workspace('20000000-0000-0000-0000-000000000001',1,'pes','{"stamp":"stale"}')$q$,'context_changed');
select clinical_workspace('20000000-0000-0000-0000-000000000001',1,'pes',jsonb_build_object('stamp',clinical_workspace('20000000-0000-0000-0000-000000000001',1)->>'stamp','problem','Revisado','etiology','Profesional','signsSymptoms',jsonb_build_array('Entrevista'),'pesStatement','PES editado por profesional'));
reset role;
select pg_temp.assert_true((select value='"PES editado por profesional"' from consultation_answers where question_key='pes_statement'),'PES uses existing answers');
select pg_temp.assert_true((select clinical_records->'pes'->>'generated_with_ai'='false' from consultation_snapshots),'manual does not forge AI provenance');
create function pg_temp.recall(food text,unit text) returns jsonb language sql as $$ select clinical_workspace('20000000-0000-0000-0000-000000000001',1,'recall',jsonb_build_object('stamp',clinical_workspace('20000000-0000-0000-0000-000000000001',1)->>'stamp','narrative','2 huevos','items',jsonb_build_array(jsonb_build_object('foodId',food,'quantity',100,'unit',unit,'mealLabel','Desayuno','rawText','2 huevos','energy_kcal',99999)))) $$;
set local role authenticated;
select pg_temp.reject($q$select pg_temp.recall('30000000-0000-0000-0000-000000000002','g')$q$,'food_unavailable');
select pg_temp.reject($q$select pg_temp.recall('30000000-0000-0000-0000-000000000001','plato')$q$,'unit_unavailable');
select pg_temp.recall('30000000-0000-0000-0000-000000000001','g');
reset role;
select pg_temp.assert_true((select clinical_records->'recall'->'items'->0->>'quantity'='2.0000000000000000' from consultation_snapshots),'grams converted using catalog, not guessed');
select pg_temp.assert_true((select not (clinical_records->'recall'->'items'->0 ? 'energy_kcal') from consultation_snapshots),'forged totals not stored');
insert into consultation_snapshots(professional_id,consultation_id,patient_id,revision,structure) select professional_id,consultation_id,patient_id,2,structure from consultation_snapshots where revision=1;
select pg_temp.assert_true((select a.clinical_records=b.clinical_records from consultation_snapshots a cross join consultation_snapshots b where a.revision=1 and b.revision=2),'new revision inherits clinical records');
set local role authenticated;
select pg_temp.reject($q$select clinical_workspace('20000000-0000-0000-0000-000000000001',1,'pes','{}')$q$,'context_unavailable');
reset role;
update consultations set status='completed';
set local role authenticated;
select pg_temp.reject($q$select clinical_workspace('20000000-0000-0000-0000-000000000001',2)$q$,'context_unavailable');
reset role;
select pg_temp.assert_true((select bool_and(not enabled) from private.ai_feature_config where feature in ('pes_diagnosis','recall_24h')),'clinical AI remains disabled');
rollback;
