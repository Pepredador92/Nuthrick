begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(40);

select is(
  (select count(*)::integer from public.food_items where source in ('NOM-037-SSA2-2012','IMSS_SMAE_4E','DOF_SMAE_PORTIONS','IMSS_HEALTHY_MENU','MUNICIPIO_JUAREZ_EXCHANGE_LIST') and not is_custom),
  42,
  'the curated starter catalog contains forty-two global foods'
);
select is(
  (select count(*)::integer from public.food_items where catalog_code = 'NUTHRICK_MX_SMAE_4E_2014' and owner_id is null and not is_custom),
  90,
  'the curated SMAE release contains ninety rows including one pending clarification'
);
select is(
  (select count(*)::integer from public.food_items where owner_id is null and not is_custom),
  132,
  'the global catalog combines the starter and curated SMAE releases'
);
select is(
  (select id from public.food_items where stable_code = 'MX_SMAE_FRUIT_MANDARINA'),
  md5('nuthrick-food:MX_SMAE_FRUIT_MANDARINA')::uuid,
  'curated SMAE food ids are stable and deterministic'
);
select is(
  (select portion_amount from public.food_items where stable_code = 'MX_SMAE_CEREAL_NO_FAT_AVENA_COCIDA'),
  0.750::numeric,
  'fractional candidate portions are stored as numeric values'
);
select is(
  (select portion_unit from public.food_items where stable_code = 'MX_SMAE_MILK_WHOLE_JOCOQUE'),
  'tablespoon',
  'cucharadas map to the internal tablespoon unit'
);
select ok(
  (select source_reference = 'Sistema Mexicano de Alimentos Equivalentes, 4a edición (2014) · PDF p. 23'
   from public.food_items where stable_code = 'MX_SMAE_FRUIT_MANDARINA'),
  'each curated row preserves its declared version and page reference'
);
select ok(
  (select aliases @> array['huevo entero cocido', 'huevo entero fresco']
   from public.food_items where stable_code = 'MX_WHOLE_EGG'),
  'same-identity variants remain aliases instead of duplicate foods'
);
select ok(
  (select alternate_portions @> '[{"amount":2,"unit":"piece","display":"2 piezas (naranja)"}]'::jsonb
   from public.food_items where stable_code = 'MX_ORANGE_SEGMENTS'),
  'same-identity orange presentation is structured as an alternate portion'
);
select ok(
  (select attributes @> '{"soy":"contains"}'::jsonb
   from public.food_items where stable_code = 'MX_SMAE_MILK_SKIM_BEBIDA_DE_SOYA'),
  'structured restrictions can identify the soy beverage'
);
select is(
  (select count(*)::integer from public.food_items
   where owner_id is null and not is_custom and source = 'SMAE_4E_2014'
     and name in ('Huevo frito', 'Frijoles refritos, caseros o enlatados', 'Pollo rostizado', 'Papas fritas a la francesa', 'Queso Oaxaca Lala Light')),
  0,
  'prepared foods with inseparable added fat do not enter the global catalog'
);
select is(
  (select count(*)::integer from public.recipes where source = 'NUTHRICK_STARTER_RECIPES' and not is_custom),
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
  2.666667::numeric,
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

select ok(
  (select every(group_code in (
    'VEGETABLES','FRUITS','CEREALS_NO_FAT','CEREALS_WITH_FAT','LEGUMES',
    'AOA_VERY_LOW_FAT','AOA_LOW_FAT','AOA_MODERATE_FAT','AOA_HIGH_FAT',
    'MILK_SKIM','MILK_SEMI_SKIM','MILK_WHOLE','MILK_WITH_SUGAR',
    'FATS_NO_PROTEIN','FATS_WITH_PROTEIN','SUGARS_NO_FAT','SUGARS_WITH_FAT'
  )) from public.food_items where owner_id is null and catalog_code = 'NUTHRICK_MX_STARTER'),
  'every global starter food has a valid exact group code'
);
select is(
  (select count(*)::integer from public.food_items where owner_id is null and catalog_code = 'NUTHRICK_MX_STARTER' and group_code = 'AOA'),
  0,
  'no global food uses a generic AOA group'
);
select is((select group_code from public.food_items where stable_code = 'MX_WHOLE_EGG'), 'AOA_MODERATE_FAT', 'whole egg is moderate-fat AOA');
select is((select group_code from public.food_items where stable_code = 'MX_EGG_WHITE'), 'AOA_VERY_LOW_FAT', 'egg white is very-low-fat AOA');
select is((select group_code from public.food_items where stable_code = 'MX_COOKED_CHICKEN_BREAST'), 'AOA_VERY_LOW_FAT', 'chicken breast is very-low-fat AOA');
select is((select group_code from public.food_items where stable_code = 'MX_COOKED_LEAN_BEEF'), 'AOA_VERY_LOW_FAT', 'documented lean beef is very-low-fat AOA');
select is((select group_code from public.food_items where stable_code = 'MX_TUNA_WATER_DRAINED'), 'AOA_VERY_LOW_FAT', 'water-packed tuna is very-low-fat AOA');
select is((select group_code from public.food_items where stable_code = 'MX_COOKED_WHITE_FISH'), 'AOA_VERY_LOW_FAT', 'white fish is very-low-fat AOA');
select is((select portion_amount from public.food_items where stable_code = 'MX_PANELA_CHEESE'), 40.000::numeric, 'panela keeps its documented low-fat AOA portion');

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
