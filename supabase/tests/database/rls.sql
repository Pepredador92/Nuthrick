begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'professional-one@nuthrick.test'),
  ('20000000-0000-4000-8000-000000000002', 'professional-two@nuthrick.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select id from public.professional_profiles order by id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$,
  'a professional can only select their own profile'
);

select lives_ok(
  $$update public.professional_profiles
      set full_name = 'Professional One',
          professional_title = 'Nutrióloga',
          public_slug = 'professional-one',
          onboarding_completed = true,
          is_public = true
    where id = '10000000-0000-4000-8000-000000000001'$$,
  'a professional can update their own profile'
);

select lives_ok(
  $$insert into public.patients (id, full_name, email)
    values ('30000000-0000-4000-8000-000000000003', 'Patient One', 'patient-one@nuthrick.test')$$,
  'a professional can create their own patient'
);

select results_eq(
  $$select full_name from public.patients$$,
  $$values ('Patient One'::text)$$,
  'a professional can only select their own patients'
);

select lives_ok(
  $$insert into public.patient_tags (name) values ('Prospecto')$$,
  'a professional can create their own tag'
);

select lives_ok(
  $$insert into public.patient_measurements (patient_id, weight_kg, height_cm)
    select id, 70, 175 from public.patients limit 1$$,
  'a professional can create a measurement for their own patient'
);

select lives_ok(
  $$insert into public.professional_businesses (establishment_name)
    values ('Consultorio Uno')$$,
  'owner columns default to auth.uid()'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);

select results_eq(
  $$select id from public.professional_profiles order by id$$,
  $$values ('20000000-0000-4000-8000-000000000002'::uuid)$$,
  'the second professional cannot see the first profile'
);

select is_empty(
  $$select id from public.patients$$,
  'the second professional cannot see the first professional patients'
);

select is_empty(
  $$update public.patients
      set full_name = 'Compromised'
    where id = '30000000-0000-4000-8000-000000000003'
    returning id$$,
  'the second professional cannot update the first patient'
);

select is_empty(
  $$delete from public.patients
    where id = '30000000-0000-4000-8000-000000000003'
    returning id$$,
  'the second professional cannot delete the first patient'
);

select is_empty(
  $$update public.professional_profiles
      set full_name = 'Compromised'
    where id = '10000000-0000-4000-8000-000000000001'
    returning id$$,
  'the second professional cannot update the first profile'
);

select throws_ok(
  $$insert into public.professional_businesses (professional_id, establishment_name)
    values ('10000000-0000-4000-8000-000000000001', 'Compromised')$$,
  '42501',
  null,
  'RLS rejects an insert that claims another owner'
);

select throws_ok(
  $$insert into public.patient_measurements (professional_id, patient_id, weight_kg, height_cm)
    values ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 70, 175)$$,
  '23503',
  null,
  'cross-professional measurements are rejected'
);

select is_empty(
  $$delete from public.professional_businesses
    where professional_id = '10000000-0000-4000-8000-000000000001'
    returning id$$,
  'the second professional cannot delete the first business'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select results_eq(
  $$select slug::text from public.public_professional_pages$$,
  $$values ('professional-one'::text)$$,
  'anonymous visitors can read an explicitly published page'
);

select ok(
  not exists (
    select 1
    from public.public_professional_pages
    where content ? 'id' or content ? 'email' or content ? 'storage_key'
  ),
  'the public projection omits private identifiers'
);

select throws_ok(
  $$select * from public.professional_profiles$$,
  '42501',
  null,
  'anonymous visitors cannot query private profiles'
);

select * from finish();
rollback;
