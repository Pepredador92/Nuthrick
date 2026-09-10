begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(11);

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

select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000002',true);
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
