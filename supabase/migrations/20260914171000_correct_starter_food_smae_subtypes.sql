-- Correct the starter catalog against the documented SMAE subgroups.
-- Historical nutrition_plans.diet_menu snapshots are intentionally untouched.

update public.food_items
set
  group_code = corrections.group_code,
  portion_amount = corrections.portion_amount,
  portion_unit = corrections.portion_unit,
  portion_description = corrections.portion_description,
  source = corrections.source,
  source_version = corrections.source_version,
  source_reference = corrections.source_reference
from (values
  ('MX_WHOLE_EGG', 'AOA_MODERATE_FAT', 1::numeric, 'piece', '1 pieza',
    'IMSS_SMAE_4E', '2021', 'Procedimiento IMSS 2660-003-013 · Huevo entero fresco · AOA moderado'),
  ('MX_EGG_WHITE', 'AOA_VERY_LOW_FAT', 2::numeric, 'piece', '2 piezas',
    'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · AOA muy bajo aporte de grasa · Clara de huevo'),
  ('MX_COOKED_CHICKEN_BREAST', 'AOA_VERY_LOW_FAT', 30::numeric, 'g', '30 g',
    'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · AOA muy bajo aporte de grasa · Pechuga de pollo'),
  ('MX_COOKED_LEAN_BEEF', 'AOA_VERY_LOW_FAT', 30::numeric, 'g', '30 g',
    'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · AOA muy bajo aporte de grasa · Bistec de res'),
  ('MX_TUNA_WATER_DRAINED', 'AOA_VERY_LOW_FAT', 30::numeric, 'g', '30 g',
    'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · AOA muy bajo aporte de grasa · Atún en agua drenado'),
  ('MX_COOKED_WHITE_FISH', 'AOA_VERY_LOW_FAT', 40::numeric, 'g', '40 g',
    'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · AOA muy bajo aporte de grasa · Filete de pescado'),
  ('MX_PANELA_CHEESE', 'AOA_LOW_FAT', 40::numeric, 'g', '40 g',
    'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · AOA bajo aporte de grasa · Queso panela')
) as corrections(stable_code, group_code, portion_amount, portion_unit, portion_description, source, source_version, source_reference)
where public.food_items.stable_code = corrections.stable_code
  and public.food_items.owner_id is null
  and public.food_items.catalog_code = 'NUTHRICK_MX_STARTER';

-- Recipe contributions are derived from the corrected food rows. This updates
-- only reusable catalog recipes; already-materialized patient plan snapshots
-- remain immutable.
update public.recipe_items ri
set
  food_snapshot = jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'group_code', f.group_code,
    'portion_amount', f.portion_amount,
    'portion_unit', f.portion_unit,
    'portion_description', f.portion_description,
    'exchange_system_code', f.exchange_system_code,
    'exchange_catalog_version', f.exchange_catalog_version,
    'source', f.source,
    'source_version', f.source_version,
    'is_custom', f.is_custom,
    'attributes', f.attributes
  ),
  exchange_contribution = jsonb_build_array(jsonb_build_object(
    'group_code', f.group_code,
    'portions', round(ri.amount / f.portion_amount, 6)
  ))
from public.food_items f, public.recipes r
where ri.food_item_id = f.id
  and ri.recipe_id = r.id
  and f.owner_id is null
  and f.catalog_code = 'NUTHRICK_MX_STARTER'
  and r.owner_id is null
  and r.source = 'NUTHRICK_STARTER_RECIPES';

do $$
begin
  if exists (
    select 1
    from public.food_items
    where owner_id is null
      and catalog_code = 'NUTHRICK_MX_STARTER'
      and group_code not in (
        'VEGETABLES','FRUITS','CEREALS_NO_FAT','CEREALS_WITH_FAT','LEGUMES',
        'AOA_VERY_LOW_FAT','AOA_LOW_FAT','AOA_MODERATE_FAT','AOA_HIGH_FAT',
        'MILK_SKIM','MILK_SEMI_SKIM','MILK_WHOLE','MILK_WITH_SUGAR',
        'FATS_NO_PROTEIN','FATS_WITH_PROTEIN','SUGARS_NO_FAT','SUGARS_WITH_FAT'
      )
  ) then
    raise exception 'Starter catalog contains an invalid exchange group';
  end if;

  if exists (
    select 1
    from public.recipe_items ri
    join public.recipes r on r.id = ri.recipe_id
    left join public.food_items f on f.id = ri.food_item_id
    where r.owner_id is null
      and r.source = 'NUTHRICK_STARTER_RECIPES'
      and (f.id is null or f.group_code is null)
  ) then
    raise exception 'Starter recipe contains an unclassified food item';
  end if;
end
$$;
