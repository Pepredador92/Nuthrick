begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(11);

select is(
  (select count(*) from public.calculation_definitions where is_catalog_visible),
  19::bigint,
  'the interactive master catalogue exposes every initial method'
);
select is(
  (select count(*) from public.calculation_definitions where is_catalog_visible and status = 'implemented'),
  3::bigint,
  'only the three simple verified indices are implemented'
);
select is(
  (select status from public.calculation_definitions where code = 'density_jackson_pollock_7'),
  'not_implemented',
  'complex methods remain explicitly pending'
);

insert into auth.users(id, email) values
  ('fc000000-0000-4000-8000-000000000001', 'calculation-owner@nuthrick.test'),
  ('fc100000-0000-4000-8000-000000000002', 'calculation-other@nuthrick.test');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000001', true);
insert into public.patients(id, full_name, height_cm, birth_date, equation_sex)
values ('fc200000-0000-4000-8000-000000000003', 'Paciente de cálculos', 174, '1992-06-10', 'male');
insert into public.consultations(id, patient_id, status, consultation_type, sequence_number, consultation_date)
values ('fc300000-0000-4000-8000-000000000004', 'fc200000-0000-4000-8000-000000000003', 'draft', 'initial', 0, '2026-09-04T12:00:00Z');

select is(
  (select count(*) from public.save_consultation_measurements(
    'fc300000-0000-4000-8000-000000000004',
    '{"weight":82,"waist_circumference":88,"hip_circumference":101}'::jsonb
  )),
  3::bigint,
  'saves the real measurements before calculation results'
);
select is(
  (select count(*) from public.save_consultation_calculation_results(
    'fc300000-0000-4000-8000-000000000004',
    jsonb_build_object('bmi', jsonb_build_object(
      'rawResult', 82::numeric / power(1.74::numeric, 2),
      'displayedResult', '27.1',
      'inputs', jsonb_build_object(
        'weight', jsonb_build_object('label','Peso','source','consultation_measurement','value','82','unit','kg','measurementCode','weight','measurementId',(select id from public.consultation_measurements where consultation_id='fc300000-0000-4000-8000-000000000004' and measurement_type_id='weight')),
        'height', jsonb_build_object('label','Estatura','source','patient_record','value','174','unit','cm','patientField','height_cm')
      ),
      'dependencies', '{}'::jsonb,
      'patientContext', jsonb_build_object('birthDate','1992-06-10','equationSex','male','age',34,'consultationDate','2026-09-04T12:00:00Z')
    ))
  )),
  1::bigint,
  'persists an implemented calculation with its trace'
);
select is(
  (select method_name from public.consultation_calculation_results where consultation_id='fc300000-0000-4000-8000-000000000004'),
  'IMC',
  'stores the exact method identity'
);
select is(
  (select input_snapshot->'weight'->>'measurementId' from public.consultation_calculation_results where consultation_id='fc300000-0000-4000-8000-000000000004'),
  (select id::text from public.consultation_measurements where consultation_id='fc300000-0000-4000-8000-000000000004' and measurement_type_id='weight'),
  'links the result to its source measurement'
);
select throws_ok(
  $$select * from public.save_consultation_calculation_results(
    'fc300000-0000-4000-8000-000000000004',
    jsonb_build_object('bmi', jsonb_build_object(
      'rawResult', 82::numeric / power(1.80::numeric, 2),
      'displayedResult', '25.3',
      'inputs', jsonb_build_object(
        'weight', jsonb_build_object('label','Peso','source','consultation_measurement','value','82','unit','kg','measurementCode','weight','measurementId',(select id from public.consultation_measurements where consultation_id='fc300000-0000-4000-8000-000000000004' and measurement_type_id='weight')),
        'height', jsonb_build_object('label','Estatura','source','calculation_result','value','180','unit','cm','patientField','height_cm')
      ),
      'dependencies', '{}'::jsonb,
      'patientContext', '{}'::jsonb
    ))
  )$$,
  '23514', 'Calculation inputs do not match the catalogue',
  'a client cannot forge a different input source'
);
select throws_ok(
  $$select * from public.save_consultation_calculation_results(
    'fc300000-0000-4000-8000-000000000004',
    jsonb_build_object('density_jackson_pollock_7', jsonb_build_object('rawResult',1.1,'displayedResult','1.10000','inputs','{}'::jsonb,'dependencies','{}'::jsonb,'patientContext','{}'::jsonb))
  )$$,
  '23514', 'Calculation is not implemented',
  'a pending formula cannot produce a result'
);
select set_config('request.jwt.claim.sub', 'fc100000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from public.consultation_calculation_results),
  0::bigint,
  'another professional cannot read calculation results through RLS'
);
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000001', true);
update public.consultations
set status = 'completed', completed_at = '2026-09-04T13:00:00Z'
where id = 'fc300000-0000-4000-8000-000000000004';
delete from public.consultation_calculation_results
where consultation_id = 'fc300000-0000-4000-8000-000000000004';
select is(
  (select count(*) from public.consultation_calculation_results where consultation_id='fc300000-0000-4000-8000-000000000004'),
  1::bigint,
  'completed consultation results cannot be deleted directly'
);

select * from finish();
rollback;
