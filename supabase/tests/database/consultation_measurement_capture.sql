begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

insert into auth.users(id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'capture-owner@nuthrick.test'),
  ('e2000000-0000-4000-8000-000000000002', 'capture-other@nuthrick.test');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
insert into public.patients(id, full_name)
values ('e3000000-0000-4000-8000-000000000003', 'Paciente de mediciones');
insert into public.consultations(id, patient_id, status, consultation_type, sequence_number)
values ('e4000000-0000-4000-8000-000000000004', 'e3000000-0000-4000-8000-000000000003', 'draft', 'initial', 0);

select is(
  (select count(*) from public.save_consultation_measurements(
    'e4000000-0000-4000-8000-000000000004',
    '{"weight":82.4,"waist_circumference":91.5}'::jsonb
  )), 2::bigint, 'saves only the supplied direct measurements'
);
select is(
  (select count(*) from public.consultation_measurements where consultation_id='e4000000-0000-4000-8000-000000000004'),
  2::bigint, 'a consultation owns its captured values'
);
select is(
  (select count(*) from public.save_consultation_measurements(
    'e4000000-0000-4000-8000-000000000004',
    '{"weight":81.9}'::jsonb
  )), 1::bigint, 'replaces the current consultation set atomically'
);
select is(
  (select value #>> '{}' from public.consultation_measurements where consultation_id='e4000000-0000-4000-8000-000000000004' and measurement_type_id='weight'),
  '81.9', 'correcting weight updates rather than duplicates the current value'
);
select is(
  (select count(*) from public.consultation_measurements where consultation_id='e4000000-0000-4000-8000-000000000004'),
  1::bigint, 'clearing an entered value removes only that current consultation record'
);
select throws_ok(
  $$select * from public.save_consultation_measurements('e4000000-0000-4000-8000-000000000004','{"hemoglobin":14}'::jsonb)$$,
  '23514', 'Measurement type is unavailable in this workspace',
  'laboratory analytes cannot be captured in measurements'
);
select throws_ok(
  $$select * from public.save_consultation_measurements('e4000000-0000-4000-8000-000000000004','{"weight":-1}'::jsonb)$$,
  '23514', 'Measurement value is outside the allowed capture range',
  'negative direct measurements are rejected'
);
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select * from public.save_consultation_measurements('e4000000-0000-4000-8000-000000000004','{"weight":70}'::jsonb)$$,
  '42501', 'Measurements can only be saved in an owned draft consultation',
  'another professional cannot save measurements into this consultation'
);

select * from finish();
rollback;
