begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

insert into auth.users(id, email) values
  ('f6000000-0000-4000-8000-000000000006', 'followup-owner@nuthrick.test'),
  ('f7000000-0000-4000-8000-000000000007', 'followup-other@nuthrick.test');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f6000000-0000-4000-8000-000000000006', true);
insert into public.patients(id, full_name) values
  ('f8000000-0000-4000-8000-000000000008', 'Paciente con seguimiento'),
  ('f9000000-0000-4000-8000-000000000009', 'Otro paciente');

select is(
  (select count(*) from public.save_measurement_workspace(array['weight', 'waist_circumference'])),
  2::bigint,
  'creates the professional workspace used by patient follow-up'
);
select is(
  (select count(*) from public.save_patient_measurement_followup(
    'f8000000-0000-4000-8000-000000000008',
    array['waist_circumference', 'weight']
  )),
  2::bigint,
  'saves the selected measurements for one patient'
);
select is(
  (select array_agg(measurement_type_id order by measurement_type_id)
   from public.patient_measurement_followup_items
   where patient_id = 'f8000000-0000-4000-8000-000000000008'),
  array['waist_circumference', 'weight']::text[],
  'the follow-up preserves its patient-specific selection'
);
select is(
  (select count(*) from public.consultation_measurements
   where patient_id = 'f8000000-0000-4000-8000-000000000008'),
  0::bigint,
  'configuring a follow-up creates no clinical value'
);
select is(
  (select count(*) from public.save_measurement_workspace(array['weight'])),
  1::bigint,
  'allows a global workspace item to be removed'
);
select is(
  (select array_agg(measurement_type_id order by measurement_type_id)
   from public.patient_measurement_followup_items
   where patient_id = 'f8000000-0000-4000-8000-000000000008'),
  array['waist_circumference', 'weight']::text[],
  'removing a global item does not erase the saved patient selection'
);
select set_config('request.jwt.claim.sub', 'f7000000-0000-4000-8000-000000000007', true);
select is(
  (select count(*) from public.patient_measurement_followup_items),
  0::bigint,
  'another professional cannot read patient follow-up through RLS'
);

select * from finish();
rollback;
