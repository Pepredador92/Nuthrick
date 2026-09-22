-- SETUP --
alter table patients add column status text default 'active';
alter table consultations add column consultation_date timestamptz default now();
alter table consultation_snapshots add column clinical_records jsonb default '{}';
alter table food_items add column catalog_code text,add column normalized_name text;
alter table nutrition_plans add column id uuid default gen_random_uuid(),add column draft_revision integer default 1,
 add column diet_menu jsonb,add column exchange_prescription jsonb,add column meal_distribution jsonb;
create table recipes(id uuid primary key,owner_id uuid,active boolean,source text,name text);
create table recipe_items(id uuid,recipe_id uuid,food_item_id uuid,display_order integer);
create function private.portal_goals(pid uuid,owner_id uuid) returns table("consultationId" uuid,date timestamptz,revision integer,"questionKey" text,content text)
 language sql as $$select c.id,c.consultation_date,a.revision,a.question_key,a.value#>>'{}' from public.consultations c join public.consultation_answers a on a.consultation_id=c.id where c.patient_id=pid and c.professional_id=owner_id and c.status='completed' and a.question_key='treatment_objective'$$;
-- CORE --
-- WORKSHOP --
create function pg_temp.assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception '%',msg;end if;end$$;
create function pg_temp.reject(q text) returns void language plpgsql as $$begin begin execute q;exception when others then return;end;raise exception 'Expected rejection: %',q;end$$;
insert into professional_profiles values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into patients(id,professional_id,full_name) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','SYNTHETIC');
insert into consultations(id,professional_id,patient_id,status) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','completed');
insert into consultation_snapshots(professional_id,consultation_id,patient_id,revision,clinical_records) select professional_id,id,patient_id,1,'{"pes":{"approved_at":"2026-09-21"},"recall":{"approved_at":"2026-09-21","items":[{"mealLabel":"Desayuno","food":{"name":"Huevo"},"quantity":2,"unit":"piece"}]}}' from consultations;
insert into consultation_answers(professional_id,consultation_id,patient_id,revision,question_key,value) select professional_id,id,patient_id,1,'treatment_objective','"Objetivo real"' from consultations;
insert into consultation_answers(professional_id,consultation_id,patient_id,revision,question_key,value) select professional_id,id,patient_id,1,'pes_statement','"PES aprobado"' from consultations;
insert into nutrition_plans(id,professional_id,patient_id,consultation_id,status,target_calories,macro_distribution,updated_at)
 select '30000000-0000-0000-0000-000000000001',professional_id,patient_id,id,'draft',2000,'{"macros":{"PROTEIN":{"grams":100},"CARBOHYDRATE":{"grams":250},"FAT":{"grams":60}}}',now() from consultations;
select pg_temp.assert(not has_function_privilege('authenticated','public.ai_workshop_source(uuid,uuid,integer)','execute'),'source leak');
select pg_temp.assert(not has_function_privilege('authenticated','public.ai_workshop_decision(uuid,uuid,integer,uuid,text,text,jsonb)','execute'),'apply leak');
select pg_temp.assert(not (select enabled from private.ai_feature_config where feature='diet_workshop'),'feature must remain disabled');
select pg_temp.reject($q$select ai_workshop_source('00000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',1)$q$);
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select pg_temp.reject($q$select ai_workshop_status('30000000-0000-0000-0000-000000000001')$q$);
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select pg_temp.assert(ai_workshop_status('30000000-0000-0000-0000-000000000001')->>'enabled'='false','disabled UI');
do $$
declare source jsonb; before_plan jsonb; owner uuid:='00000000-0000-0000-0000-000000000001'; pid uuid:='30000000-0000-0000-0000-000000000001'; gid uuid:=gen_random_uuid();
begin
 source:=ai_workshop_source(owner,pid,1);
 perform pg_temp.assert(source->>'approvedPes'='PES aprobado' and source->>'goal'='Objetivo real' and jsonb_array_length(source->'recall')=1,'canonical clinical context');
 update consultation_snapshots set clinical_records='{}';
 perform pg_temp.assert(ai_workshop_source(owner,pid,1)->>'approvedPes' is null,'unapproved PES leak');
 source:=ai_workshop_source(owner,pid,1);
 insert into private.ai_accounts(professional_id) values(owner);
 insert into private.ai_generations(id,professional_id,idempotency_key,request_hash,feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost,workshop_plan_id,workshop_revision)
 values(gid,owner,gen_random_uuid(),repeat('a',64),'diet_workshop','openai','mock','diet_workshop@1','{}','succeeded',0,0,0,pid,1);
 select to_jsonb(p) into before_plan from nutrition_plans p where id=pid;
 perform ai_workshop_decision(owner,pid,1,gid,source->>'stamp','discarded');
 perform pg_temp.assert((select to_jsonb(p)=before_plan from nutrition_plans p where id=pid),'discard mutated draft');
 update private.ai_generations set workshop_decision=null where id=gid;
 perform pg_temp.reject(format('select ai_workshop_decision(%L,%L,1,%L,%L,%L,%L)',owner,pid,gid,'stale','accepted','{}'));
 perform pg_temp.assert((select to_jsonb(p)=before_plan from nutrition_plans p where id=pid),'stale apply mutated draft');
 perform ai_workshop_decision(owner,pid,1,gid,source->>'stamp','accepted','{"exchange_prescription":{"test":1},"meal_distribution":{"test":2},"diet_menu":{"test":3}}');
 perform pg_temp.assert((select status='draft' and target_calories=2000 and exchange_prescription->>'test'='1' and meal_distribution->>'test'='2' and diet_menu->>'test'='3' from nutrition_plans where id=pid),'not atomic / target changed');
 perform pg_temp.assert((select workshop_decision='accepted' from private.ai_generations where id=gid),'missing decision audit');
 perform pg_temp.assert((select count(*)=0 from private.ai_credit_ledger),'test spent credits');
end $$;
rollback;
select 'Workshop ownership, canonical context, disabled feature, atomic application and audit: OK';
