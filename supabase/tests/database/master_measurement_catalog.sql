begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);

select is(
  (select count(*) from measurement_types where created_by is null and is_active),
  181::bigint,
  'system catalog is factory-provided and complete'
);
select is(
  (select count(*) from measurement_types where is_isak and 'complete' = any(isak_profiles)),
  43::bigint,
  'ISAK complete profile has exactly 43 direct measurements'
);
select is(
  (select count(*) from measurement_types where is_isak and 'restricted' = any(isak_profiles)),
  21::bigint,
  'ISAK restricted profile has exactly 21 direct measurements'
);
select is(
  (select count(*) from measurement_types where is_isak and category = 'general'),
  4::bigint,
  'ISAK includes four general measurements'
);
select is(
  (select count(*) from measurement_types where is_isak and category = 'skinfold'),
  8::bigint,
  'ISAK includes eight skinfolds'
);
select is(
  (select count(*) from measurement_types where is_isak and category = 'circumference'),
  13::bigint,
  'ISAK includes thirteen circumferences'
);
select is(
  (select count(*) from measurement_types where is_isak and category = 'anthropometric_length'),
  9::bigint,
  'ISAK includes nine lengths and heights'
);
select is(
  (select count(*) from measurement_types where is_isak and category = 'bone_breadth'),
  9::bigint,
  'ISAK includes nine bone breadths and depths'
);
select is(
  (select unit from measurement_types where code = 'triceps_skinfold'),
  'mm',
  'triceps skinfold retains its stable identity and millimetre unit'
);
select is(
  (select source_kind from measurement_types where code = 'body_fat_percentage_device'),
  'device_reported',
  'device-reported body fat is distinct from future calculated values'
);
select is(
  (select source_kind from measurement_types where code = 'serum_glucose'),
  'laboratory_reported',
  'serum glucose is identified as a laboratory value'
);
select is(
  (select source_kind from measurement_types where code = 'capillary_glucose'),
  'direct',
  'capillary glucose is distinct from serum glucose'
);
select ok(
  (select unit is null and data_type = 'boolean' from measurement_types where code = 'urine_nitrites'),
  'qualitative laboratory values are not forced into numeric units'
);
select is(
  (select count(*) from (select code from measurement_types group by code having count(*) > 1) duplicates),
  0::bigint,
  'catalog has no duplicate stable identifiers'
);

select * from finish();
rollback;
