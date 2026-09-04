begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

insert into auth.users(id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'workspace-owner@nuthrick.test'),
  ('f2000000-0000-4000-8000-000000000002', 'workspace-other@nuthrick.test');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*) from public.save_measurement_workspace(array['weight', 'triceps_skinfold'])),
  2::bigint,
  'adds only selected catalogue measurements to the professional workspace'
);
select is(
  (select array_agg(measurement_type_id order by display_order) from public.professional_measurement_workspace_items),
  array['weight', 'triceps_skinfold']::text[],
  'preserves the professional-selected workspace order'
);
select is(
  (select count(*) from public.consultation_measurements),
  0::bigint,
  'configuring a workspace does not create clinical consultation values'
);
select is(
  (select count(*) from public.save_measurement_workspace(array['triceps_skinfold'])),
  1::bigint,
  'removing an item replaces only the workspace configuration'
);
select is(
  (select array_agg(measurement_type_id order by display_order) from public.professional_measurement_workspace_items),
  array['triceps_skinfold']::text[],
  'a removed workspace item is no longer configured'
);
select throws_ok(
  $$select * from public.save_measurement_workspace(array['hemoglobin'])$$,
  '23514', 'Measurement type is unavailable in this workspace',
  'laboratory analytes cannot be added to the workspace'
);
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from public.professional_measurement_workspace_items),
  0::bigint,
  'another professional cannot read this workspace through RLS'
);

select * from finish();
rollback;
