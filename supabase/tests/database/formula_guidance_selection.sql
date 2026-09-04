begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

insert into auth.users(id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'formula-owner@nuthrick.test'),
  ('b2000000-0000-4000-8000-000000000002', 'formula-other@nuthrick.test');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000001',
  true
);
insert into public.patients(id, full_name)
values ('b3000000-0000-4000-8000-000000000003', 'Selección de fórmulas');

select lives_ok($$
  insert into public.patient_measurement_templates(
    patient_id, revision, configuration
  ) values (
    'b3000000-0000-4000-8000-000000000003',
    1,
    '{
      "version":1,
      "entry":"measurements",
      "measurements":["weight","height"],
      "indicators":[],
      "methods":[],
      "calculations":["bmi","heath_carter"],
      "deviceId":null,
      "protocol":"",
      "scale":"",
      "caliper":"",
      "biaProtocol":""
    }'::jsonb
  )
$$, 'stores an explicit professional formula selection');

select is(
  (select configuration->'calculations'
   from public.patient_measurement_templates
   where patient_id = 'b3000000-0000-4000-8000-000000000003'),
  '["bmi", "heath_carter"]'::jsonb,
  'formula selection is retained verbatim'
);

select throws_ok($$
  update public.patient_measurement_templates
  set revision = 2,
      configuration = jsonb_set(
        configuration,
        '{calculations}',
        '["invented_formula"]'::jsonb
      )
  where patient_id = 'b3000000-0000-4000-8000-000000000003'
$$, 'P0001', 'Calculation selection unavailable',
  'rejects an unknown formula');

select throws_ok($$
  update public.patient_measurement_templates
  set revision = 2,
      configuration = jsonb_set(
        configuration,
        '{calculations}',
        '["bmi", "bmi"]'::jsonb
      )
  where patient_id = 'b3000000-0000-4000-8000-000000000003'
$$, 'P0001', 'Duplicate calculation selection',
  'rejects duplicated formula choices');

select ok(
  private.calculation_code_matches_definition('body_fat_jp7_siri', 'siri'),
  'accepts a Siri result with explicit source method'
);
select ok(
  private.calculation_code_matches_definition('fat_mass_lean_1996', 'fat_mass'),
  'accepts derived mass with explicit source method'
);
select isnt(
  private.calculation_code_matches_definition('body_fat_jp7_brozek', 'siri'),
  true,
  'rejects a result paired with the wrong equation definition'
);

select set_config(
  'request.jwt.claim.sub',
  'b2000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from public.patient_measurement_templates),
  0::bigint,
  'another professional cannot read the formula selection'
);

select * from finish();
rollback;
