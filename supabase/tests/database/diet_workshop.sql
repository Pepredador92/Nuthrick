begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(16);

insert into auth.users(id,email) values
  ('a1000000-0000-4000-8000-000000000001','diet-owner@nuthrick.test'),
  ('a2000000-0000-4000-8000-000000000002','diet-other@nuthrick.test');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
insert into public.patients(id,full_name) values
  ('a3000000-0000-4000-8000-000000000003','Paciente del taller'),
  ('a4000000-0000-4000-8000-000000000004','Paciente distinto');
insert into public.consultations(id,patient_id,consultation_type,sequence_number,status)
values ('a5000000-0000-4000-8000-000000000005','a3000000-0000-4000-8000-000000000003','initial',0,'completed');

select lives_ok(
  $$insert into public.nutrition_plans(title) values ('Plan libre')$$,
  'the owner can create a free draft'
);
select is(
  (select status from public.nutrition_plans where title='Plan libre'),
  'draft',
  'new workshop plans start as drafts'
);
select lives_ok(
  $$insert into public.nutrition_plans(patient_id,title) values ('a3000000-0000-4000-8000-000000000003','Plan sin consulta')$$,
  'a patient plan does not require a consultation'
);
select lives_ok(
  $$insert into public.nutrition_plans(patient_id,consultation_id,title) values ('a3000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000005','Plan vinculado')$$,
  'an owned consultation can be selected as source'
);
select throws_ok(
  $$insert into public.nutrition_plans(consultation_id,title) values ('a5000000-0000-4000-8000-000000000005','Plan inválido')$$,
  '23514',
  null,
  'a source consultation always requires its patient'
);
select throws_ok(
  $$insert into public.nutrition_plans(patient_id,consultation_id,title) values ('a4000000-0000-4000-8000-000000000004','a5000000-0000-4000-8000-000000000005','Plan cruzado')$$,
  '23503',
  null,
  'the source consultation must belong to the selected patient'
);
select lives_ok(
  $$update public.nutrition_plans set title='Borrador recuperado' where title='Plan libre'$$,
  'the owner can continue editing a draft'
);
select lives_ok(
  $$update public.nutrition_plans set meal_distribution='{"schema_version":1,"source_exchange_snapshot":null,"meal_times":[],"distribution":[],"derived_meal_totals":[],"status":"not_started"}'::jsonb where title='Borrador recuperado'$$,
  'a versioned meal distribution can be persisted on the owned plan'
);
select throws_ok(
  $$update public.nutrition_plans set meal_distribution='[]'::jsonb where title='Borrador recuperado'$$,
  '23514',
  null,
  'meal distribution rejects non-object payloads'
);
select lives_ok(
  $$insert into public.food_items(id,owner_id,name,normalized_name,exchange_system_code,exchange_catalog_version,group_code,portion_amount,portion_unit,portion_description,source,source_version,is_custom)
    values ('a6000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000001','Alimento verificado por profesional','alimento verificado por profesional','SMAE_NOM037_2012','1.0.0','FRUITS',1,'cup','1 taza','PROFESSIONAL_CUSTOM','1',true)$$,
  'the professional can create an explicitly custom food'
);
select lives_ok(
  $$with recipe as (
      insert into public.recipes(id,owner_id,name,normalized_name,source,source_version,is_custom)
      values ('a7000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000001','Receta personal','receta personal','PROFESSIONAL_CUSTOM','1',true)
      returning id
    )
    insert into public.recipe_items(owner_id,recipe_id,food_item_id,amount,unit,food_snapshot,exchange_contribution)
    select 'a1000000-0000-4000-8000-000000000001',id,'a6000000-0000-4000-8000-000000000006',1,'cup','{"id":"a6000000-0000-4000-8000-000000000006","name":"Alimento verificado por profesional"}'::jsonb,'[{"group_code":"FRUITS","portions":1}]'::jsonb from recipe$$,
  'the professional can create a reusable recipe with structured ingredients'
);
select lives_ok(
  $$update public.nutrition_plans set diet_menu='{"schema_version":1,"source_meal_distribution_snapshot":null,"menus":[],"active_menu_id":"menu-1","derived_exchange_usage":[],"status":"not_started"}'::jsonb where title='Borrador recuperado'$$,
  'a versioned diet menu can be persisted on the owned plan'
);
select throws_ok(
  $$update public.nutrition_plans set diet_menu='[]'::jsonb where title='Borrador recuperado'$$,
  '23514',
  null,
  'diet menu rejects non-object payloads'
);

select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000002',true);
select is_empty(
  $$select id from public.food_items$$,
  'another professional cannot read custom foods'
);
select is_empty(
  $$select id from public.nutrition_plans$$,
  'another professional cannot read workshop drafts'
);
select is_empty(
  $$update public.nutrition_plans set title='Comprometido' returning id$$,
  'another professional cannot update workshop drafts'
);

select * from finish();
rollback;
