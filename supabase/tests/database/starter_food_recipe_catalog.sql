begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(21);

select is(
  (select count(*)::integer from public.food_items where source in ('NOM-037-SSA2-2012','IMSS_SMAE_4E','DOF_SMAE_PORTIONS','IMSS_HEALTHY_MENU','MUNICIPIO_JUAREZ_EXCHANGE_LIST') and not is_custom),
  42,
  'the curated starter catalog contains forty-two global foods'
);
select is(
  (select count(*)::integer from public.recipes where source = 'NUTHRICK_STARTER_RECIPES' and source_version = '1.0.0' and not is_custom),
  24,
  'the starter library contains twenty-four global recipes'
);
select is(
  (select id from public.food_items where stable_code = 'MX_CORN_TORTILLA'),
  md5('nuthrick-food:MX_CORN_TORTILLA')::uuid,
  'food ids are stable and deterministic'
);
select is(
  (select catalog_code from public.food_items where stable_code = 'MX_CORN_TORTILLA'),
  'NUTHRICK_MX_STARTER',
  'global foods preserve the starter catalog identity'
);
select is(
  (select id from public.recipes where stable_code = 'MX_CHICKEN_RICE_VEGETABLES'),
  md5('nuthrick-recipe:MX_CHICKEN_RICE_VEGETABLES')::uuid,
  'recipe ids are stable and deterministic'
);
select is(
  (select count(distinct stable_code)::integer from public.food_items where stable_code is not null),
  (select count(*)::integer from public.food_items where stable_code is not null),
  'stable food codes do not duplicate'
);
select is(
  (select count(distinct stable_code)::integer from public.recipes where stable_code is not null),
  (select count(*)::integer from public.recipes where stable_code is not null),
  'stable recipe codes do not duplicate'
);
select ok(
  (select every(source_reference is not null and source_version is not null) from public.food_items where not is_custom),
  'every global food preserves source, version and reference'
);
select is(
  (select group_code from public.food_items where stable_code = 'MX_CORN_TORTILLA'),
  'CEREALS_NO_FAT',
  'tortilla keeps its documented exchange group'
);
select is(
  (select portion_amount from public.food_items where stable_code = 'MX_COOKED_BEANS'),
  0.500::numeric,
  'beans keep their structured half-cup amount'
);
select is(
  (select portion_unit from public.food_items where stable_code = 'MX_COOKED_BEANS'),
  'cup',
  'beans keep their structured unit'
);
select ok(
  (select aliases @> array['pollo deshebrado'] from public.food_items where stable_code = 'MX_COOKED_CHICKEN_BREAST'),
  'canonical chicken preserves its search aliases'
);
select ok(
  (select jsonb_array_length(alternate_portions) > 0 from public.food_items where stable_code = 'MX_SKIM_MILK'),
  'documented alternate presentations remain structured'
);
select is(
  (select count(*)::integer from public.recipe_items ri join public.recipes r on r.id = ri.recipe_id where r.stable_code = 'MX_CHICKEN_RICE_VEGETABLES'),
  3,
  'a starter recipe contains structured food references'
);
select is(
  (select (exchange_contribution->0->>'portions')::numeric from public.recipe_items ri join public.recipes r on r.id = ri.recipe_id join public.food_items f on f.id = ri.food_item_id where r.stable_code = 'MX_CHICKEN_RICE_VEGETABLES' and f.stable_code = 'MX_COOKED_CHICKEN_BREAST'),
  2.000000::numeric,
  'recipe exchanges are derived from ingredient amount and food portion'
);
select ok(
  (select 'BREAKFAST' = any(meal_types) from public.recipes where stable_code = 'MX_OATS_BANANA'),
  'breakfast recipes carry meal-time metadata'
);
select ok(
  (select substitution_notes is not null from public.recipes where stable_code = 'MX_CHICKEN_RICE_VEGETABLES'),
  'quantity-aware substitution notes are preserved'
);

insert into auth.users(id,email) values
  ('b1000000-0000-4000-8000-000000000001','starter-owner@nuthrick.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);

select ok(
  exists(select 1 from public.food_items where stable_code = 'MX_CORN_TORTILLA'),
  'authenticated professionals can read the global food catalog'
);
select is_empty(
  $$update public.food_items set name = 'Alterado' where stable_code = 'MX_CORN_TORTILLA' returning id$$,
  'authenticated professionals cannot update global foods'
);
select is_empty(
  $$delete from public.recipes where stable_code = 'MX_OATS_BANANA' returning id$$,
  'authenticated professionals cannot delete global recipes'
);
select lives_ok(
  $$insert into public.food_items(owner_id,name,normalized_name,exchange_system_code,exchange_catalog_version,group_code,portion_amount,portion_unit,portion_description,source,source_version,is_custom)
    values ('b1000000-0000-4000-8000-000000000001','Alimento personal','alimento personal','SMAE_NOM037_2012','1.0.0','FRUITS',1,'cup','1 taza','PROFESSIONAL_CUSTOM','1',true)$$,
  'personal foods remain writable by their owner'
);

select * from finish();
rollback;
