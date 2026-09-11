-- Curated Mexican starter catalog for Objective 7.5.
-- Equivalence portions are transcribed from the documented sources below; recipe
-- quantities are independent instances and never redefine a food equivalence.

alter table public.food_items
  add column if not exists stable_code text,
  add column if not exists catalog_code text,
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists alternate_portions jsonb not null default '[]'::jsonb,
  add column if not exists source_reference text;

do $$
begin
  alter table public.food_items
    add constraint food_items_alternate_portions_array_check
    check (jsonb_typeof(alternate_portions) = 'array');
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.food_items
    add constraint food_items_system_identity_check
    check (is_custom or (owner_id is null and stable_code is not null and catalog_code is not null));
exception when duplicate_object then null;
end $$;

create unique index if not exists food_items_system_stable_code_idx
  on public.food_items (stable_code)
  where owner_id is null and not is_custom and active;

alter table public.recipes
  add column if not exists stable_code text,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists substitution_notes text,
  add column if not exists source_reference text;

do $$
begin
  alter table public.recipes
    add constraint recipes_system_identity_check
    check (is_custom or (owner_id is null and stable_code is not null));
exception when duplicate_object then null;
end $$;

create unique index if not exists recipes_system_stable_code_idx
  on public.recipes (stable_code)
  where owner_id is null and not is_custom and active;

comment on column public.food_items.stable_code is
  'Stable, version-independent identity for Nuthrick-owned catalog rows.';
comment on column public.food_items.catalog_code is
  'Stable identity of the curated catalog release that owns this row.';
comment on column public.food_items.aliases is
  'Normalized Spanish search aliases; never used to infer an equivalence.';
comment on column public.food_items.alternate_portions is
  'Additional documented presentations as structured amount/unit/display objects.';
comment on column public.food_items.source_reference is
  'Human-auditable location in the documented source supporting the equivalence.';
comment on column public.recipes.substitution_notes is
  'Optional explicit quantity-aware substitutions; not an automatic substitution engine.';

with food_seed(
  stable_code, name, normalized_name, aliases, category, group_code,
  portion_amount, portion_unit, portion_description, alternate_portions,
  attributes, source, source_version, source_reference
) as (
  values
    ('MX_CORN_TORTILLA', 'Tortilla de maíz', 'tortilla de maiz', array['tortilla','tortillas','tortilla de maiz'], 'cereales', 'CEREALS_NO_FAT', 1::numeric, 'tortilla', '1 tortilla', '[{"amount":30,"unit":"g","display":"aprox. 30 g"}]'::jsonb, '{"gluten":"unknown"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Pan y tortilla'),
    ('MX_BAKED_TOSTADA', 'Tostada de maíz horneada', 'tostada de maiz horneada', array['tostada','tostadas','tostada horneada'], 'cereales', 'CEREALS_NO_FAT', 2::numeric, 'piece', '2 tostadas', '[]'::jsonb, '{"gluten":"unknown"}'::jsonb, 'IMSS_SMAE_4E', '2022', 'Procedimiento IMSS 2250-003-002 · Cereales'),
    ('MX_BOLILLO_NO_CRUMB', 'Bolillo sin migajón', 'bolillo sin migajon', array['bolillo','pan bolillo'], 'cereales', 'CEREALS_NO_FAT', 0.333::numeric, 'piece', '⅓ de bolillo', '[]'::jsonb, '{"gluten":"contains"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Pan y tortilla'),
    ('MX_WHOLE_WHEAT_BREAD', 'Pan integral', 'pan integral', array['pan','pan de caja','pan de caja integral'], 'cereales', 'CEREALS_NO_FAT', 1::numeric, 'slice', '1 rebanada', '[]'::jsonb, '{"gluten":"contains"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Pan y tortilla'),
    ('MX_ROLLED_OATS', 'Avena en hojuelas', 'avena en hojuelas', array['avena','hojuelas de avena'], 'cereales', 'CEREALS_NO_FAT', 0.333::numeric, 'cup', '⅓ de taza', '[]'::jsonb, '{"gluten":"unknown"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Cereales'),
    ('MX_COOKED_WHITE_RICE', 'Arroz blanco cocido', 'arroz blanco cocido', array['arroz','arroz cocido','arroz blanco'], 'cereales', 'CEREALS_NO_FAT', 0.5::numeric, 'cup', '½ taza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Cereales'),
    ('MX_COOKED_BROWN_RICE', 'Arroz integral cocido', 'arroz integral cocido', array['arroz integral','arroz cocido integral'], 'cereales', 'CEREALS_NO_FAT', 0.5::numeric, 'cup', '½ taza', '[]'::jsonb, '{}'::jsonb, 'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · Tabla 4, cereales y tubérculos'),
    ('MX_COOKED_PASTA', 'Pasta cocida', 'pasta cocida', array['pasta','sopa de pasta','espagueti cocido'], 'cereales', 'CEREALS_NO_FAT', 0.5::numeric, 'cup', '½ taza', '[]'::jsonb, '{"gluten":"contains"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Cereales'),
    ('MX_COOKED_WHOLE_WHEAT_PASTA', 'Pasta integral cocida', 'pasta integral cocida', array['pasta integral','espagueti integral'], 'cereales', 'CEREALS_NO_FAT', 0.5::numeric, 'cup', '½ taza', '[]'::jsonb, '{"gluten":"contains"}'::jsonb, 'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · Tabla 4, cereales y tubérculos'),
    ('MX_COOKED_POTATO', 'Papa cocida', 'papa cocida', array['papa','patata','papa hervida'], 'cereales', 'CEREALS_NO_FAT', 0.5::numeric, 'piece', '½ pieza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Tubérculos'),

    ('MX_COOKED_BEANS', 'Frijoles cocidos', 'frijoles cocidos', array['frijol','frijoles','frijoles de la olla','frijoles caldosos'], 'leguminosas', 'LEGUMES', 0.5::numeric, 'cup', '½ taza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Leguminosas'),

    ('MX_WHOLE_EGG', 'Huevo entero', 'huevo entero', array['huevo','huevos','huevo de gallina'], 'aoa', 'AOA_LOW_FAT', 1::numeric, 'piece', '1 pieza', '[]'::jsonb, '{"egg":"contains"}'::jsonb, 'IMSS_SMAE_4E', '2022', 'Procedimiento IMSS 2250-003-002 · AOA'),
    ('MX_EGG_WHITE', 'Clara de huevo', 'clara de huevo', array['clara','claras','claras de huevo'], 'aoa', 'AOA_LOW_FAT', 2::numeric, 'piece', '2 piezas', '[]'::jsonb, '{"egg":"contains"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · AOA bajo en grasa'),
    ('MX_COOKED_CHICKEN_BREAST', 'Pechuga de pollo cocida sin piel', 'pechuga de pollo cocida sin piel', array['pollo','pollo cocido','pollo deshebrado','pechuga de pollo','pechuga cocida'], 'aoa', 'AOA_LOW_FAT', 40::numeric, 'g', '40 g', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · AOA bajo en grasa, peso cocido'),
    ('MX_COOKED_LEAN_BEEF', 'Carne de res magra cocida', 'carne de res magra cocida', array['carne','res','carne magra','bistec','bistec magro'], 'aoa', 'AOA_LOW_FAT', 40::numeric, 'g', '40 g', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · AOA bajo en grasa, peso cocido'),
    ('MX_COOKED_LEAN_PORK', 'Carne de cerdo magra cocida', 'carne de cerdo magra cocida', array['cerdo','cerdo magro','maciza de cerdo'], 'aoa', 'AOA_LOW_FAT', 40::numeric, 'g', '40 g', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · AOA bajo en grasa, peso cocido'),
    ('MX_TUNA_WATER_DRAINED', 'Atún en agua escurrido', 'atun en agua escurrido', array['atun','atún','atun en agua','atún en agua'], 'aoa', 'AOA_LOW_FAT', 30::numeric, 'g', '30 g', '[]'::jsonb, '{"fish":"contains"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · AOA bajo en grasa, peso escurrido'),
    ('MX_COOKED_WHITE_FISH', 'Pescado blanco cocido', 'pescado blanco cocido', array['pescado','pescado blanco','filete de pescado'], 'aoa', 'AOA_LOW_FAT', 30::numeric, 'g', '30 g', '[]'::jsonb, '{"fish":"contains"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · AOA bajo en grasa, peso cocido'),
    ('MX_PANELA_CHEESE', 'Queso panela', 'queso panela', array['panela','queso fresco','queso blanco'], 'aoa', 'AOA_LOW_FAT', 30::numeric, 'g', '30 g', '[]'::jsonb, '{"milk":"contains","lactose":"unknown"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · AOA bajo en grasa, quesos'),

    ('MX_SKIM_MILK', 'Leche descremada', 'leche descremada', array['leche','leche desnatada','leche sin grasa'], 'leches', 'MILK_SKIM', 1::numeric, 'cup', '1 taza (240 ml)', '[{"amount":240,"unit":"ml","display":"240 ml"}]'::jsonb, '{"milk":"contains","lactose":"contains"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Lácteos bajos en grasa'),
    ('MX_SEMI_SKIM_MILK', 'Leche semidescremada', 'leche semidescremada', array['leche semidescremada','leche 2%'], 'leches', 'MILK_SEMI_SKIM', 1::numeric, 'cup', '1 taza (240 ml)', '[{"amount":240,"unit":"ml","display":"240 ml"}]'::jsonb, '{"milk":"contains","lactose":"contains"}'::jsonb, 'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · Tabla 4, leches'),
    ('MX_WHOLE_MILK', 'Leche entera', 'leche entera', array['leche completa'], 'leches', 'MILK_WHOLE', 1::numeric, 'cup', '1 taza (240 ml)', '[{"amount":240,"unit":"ml","display":"240 ml"}]'::jsonb, '{"milk":"contains","lactose":"contains"}'::jsonb, 'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · Tabla 4, leches'),
    ('MX_NATURAL_SKIM_YOGURT', 'Yogur natural descremado sin azúcar', 'yogur natural descremado sin azucar', array['yogur','yogurt','yogur natural','yogurt natural sin azucar'], 'leches', 'MILK_SKIM', 1::numeric, 'cup', '1 taza (240 ml)', '[{"amount":240,"unit":"ml","display":"240 ml"}]'::jsonb, '{"milk":"contains","lactose":"contains"}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Lácteos bajos en grasa'),

    ('MX_BANANA', 'Plátano', 'platano', array['banana','plátano','platano tabasco'], 'frutas', 'FRUITS', 0.5::numeric, 'piece', '½ pieza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Frutas'),
    ('MX_PAPAYA', 'Papaya picada', 'papaya picada', array['papaya'], 'frutas', 'FRUITS', 0.667::numeric, 'cup', '⅔ de taza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Frutas'),
    ('MX_APPLE', 'Manzana pequeña', 'manzana pequena', array['manzana','manzana chica'], 'frutas', 'FRUITS', 1::numeric, 'piece', '1 pieza pequeña', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Frutas'),
    ('MX_ORANGE_SEGMENTS', 'Naranja en gajos', 'naranja en gajos', array['naranja','gajos de naranja'], 'frutas', 'FRUITS', 1::numeric, 'cup', '1 taza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Frutas'),
    ('MX_GUAVA', 'Guayaba', 'guayaba', array['guayabas'], 'frutas', 'FRUITS', 2::numeric, 'piece', '2 piezas', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Frutas'),

    ('MX_COOKED_NOPAL', 'Nopal cocido picado', 'nopal cocido picado', array['nopal','nopales','nopales cocidos'], 'verduras', 'VEGETABLES', 1::numeric, 'cup', '1 taza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Verduras'),
    ('MX_TOMATO', 'Jitomate', 'jitomate', array['tomate','tomate rojo'], 'verduras', 'VEGETABLES', 1::numeric, 'piece', '1 pieza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Verduras'),
    ('MX_RAW_ONION', 'Cebolla cruda', 'cebolla cruda', array['cebolla'], 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '½ taza', '[]'::jsonb, '{}'::jsonb, 'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · Tabla 4, verduras'),
    ('MX_RAW_MUSHROOM', 'Champiñón crudo', 'champinon crudo', array['champiñon','champiñones','champinon','hongos'], 'verduras', 'VEGETABLES', 1::numeric, 'cup', '1 taza', '[]'::jsonb, '{}'::jsonb, 'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · Tabla 4, verduras'),
    ('MX_RAW_CUCUMBER', 'Pepino', 'pepino', array['pepino crudo'], 'verduras', 'VEGETABLES', 1.5::numeric, 'cup', '1½ tazas', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Verduras'),
    ('MX_COOKED_CARROT', 'Zanahoria cocida', 'zanahoria cocida', array['zanahoria'], 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '½ taza', '[]'::jsonb, '{}'::jsonb, 'DOF_SMAE_PORTIONS', '2018', 'DOF 03/05/2018 · Tabla 4, verduras'),
    ('MX_LETTUCE', 'Lechuga', 'lechuga', array['ensalada verde'], 'verduras', 'VEGETABLES', 3::numeric, 'cup', '3 tazas', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Verduras'),
    ('MX_MIXED_VEGETABLES', 'Verduras mixtas', 'verduras mixtas', array['vegetales mixtos','mezcla de verduras'], 'verduras', 'VEGETABLES', 1::numeric, 'cup', '1 taza', '[]'::jsonb, '{}'::jsonb, 'IMSS_HEALTHY_MENU', '2024', 'Cartera de alimentación IMSS · preparaciones con verduras mixtas'),
    ('MX_POBLANO_PEPPER', 'Chile poblano', 'chile poblano', array['poblano','rajas de poblano'], 'verduras', 'VEGETABLES', 0.5::numeric, 'piece', '½ pieza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Verduras'),
    ('MX_ZUCCHINI', 'Calabacita', 'calabacita', array['calabaza','calabacitas'], 'verduras', 'VEGETABLES', 1::numeric, 'piece', '1 pieza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Verduras'),

    ('MX_AVOCADO', 'Aguacate', 'aguacate', array['palta'], 'grasas', 'FATS_NO_PROTEIN', 0.333::numeric, 'piece', '⅓ de pieza', '[]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Grasas monoinsaturadas'),
    ('MX_VEGETABLE_OIL', 'Aceite vegetal', 'aceite vegetal', array['aceite','aceite de maiz','aceite de canola'], 'grasas', 'FATS_NO_PROTEIN', 1::numeric, 'teaspoon', '1 cucharadita', '[{"amount":5,"unit":"ml","display":"5 ml"}]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Grasas'),
    ('MX_OLIVE_OIL', 'Aceite de oliva', 'aceite de oliva', array['oliva','aceite extra virgen'], 'grasas', 'FATS_NO_PROTEIN', 1::numeric, 'teaspoon', '1 cucharadita', '[{"amount":5,"unit":"ml","display":"5 ml"}]'::jsonb, '{}'::jsonb, 'NOM-037-SSA2-2012', '2012', 'Apéndice informativo F.3 · Grasas monoinsaturadas'),
    ('MX_PEANUT_BUTTER', 'Crema de cacahuate', 'crema de cacahuate', array['mantequilla de cacahuate','crema de mani'], 'grasas', 'FATS_WITH_PROTEIN', 2::numeric, 'teaspoon', '2 cucharaditas', '[{"amount":11,"unit":"g","display":"aprox. 11 g"}]'::jsonb, '{"peanut":"contains"}'::jsonb, 'MUNICIPIO_JUAREZ_EXCHANGE_LIST', 's.f.', 'Listado público de alimentos y porciones · Grasas monoinsaturadas')
)
insert into public.food_items (
  id, owner_id, stable_code, catalog_code, name, normalized_name, aliases, brand, category,
  exchange_system_code, exchange_catalog_version, group_code, portion_amount,
  portion_unit, portion_description, alternate_portions, edible_grams,
  energy_kcal, carbohydrate_g, protein_g, fat_g, fiber_g, sodium_mg,
  attributes, source, source_version, source_reference, is_custom, use_count, active
)
select
  md5('nuthrick-food:' || stable_code)::uuid, null, stable_code, 'NUTHRICK_MX_STARTER', name,
  normalized_name, aliases, null, category, 'SMAE_NOM037_2012', '1.0.0',
  group_code, portion_amount, portion_unit, portion_description,
  alternate_portions, null, null, null, null, null, null, null, attributes,
  source, source_version, source_reference, false, 0, true
from food_seed
on conflict (id) do update set
  stable_code = excluded.stable_code,
  catalog_code = excluded.catalog_code,
  name = excluded.name,
  normalized_name = excluded.normalized_name,
  aliases = excluded.aliases,
  category = excluded.category,
  exchange_system_code = excluded.exchange_system_code,
  exchange_catalog_version = excluded.exchange_catalog_version,
  group_code = excluded.group_code,
  portion_amount = excluded.portion_amount,
  portion_unit = excluded.portion_unit,
  portion_description = excluded.portion_description,
  alternate_portions = excluded.alternate_portions,
  attributes = excluded.attributes,
  source = excluded.source,
  source_version = excluded.source_version,
  source_reference = excluded.source_reference,
  is_custom = false,
  active = true;

with recipe_seed(
  stable_code, name, normalized_name, description, meal_types, instructions,
  tags, substitution_notes
) as (
  values
    ('MX_OATS_BANANA', 'Avena con plátano', 'avena con platano', 'Desayuno sencillo de avena y fruta.', array['BREAKFAST','SNACK'], 'Sirve la avena con el plátano rebanado; añade agua y canela al gusto.', array['mexicana','rápida','avena','fruta'], null),
    ('MX_OATS_FRUIT_PEANUT', 'Avena con fruta y crema de cacahuate', 'avena con fruta y crema de cacahuate', 'Avena con fruta y una porción de grasa con proteína.', array['BREAKFAST','SNACK'], 'Sirve la avena con la papaya y termina con la crema de cacahuate.', array['rápida','avena','fruta','cacahuate'], '2 cucharaditas de crema de cacahuate pueden omitirse; ajusta después la grasa faltante en el tiempo de comida.'),
    ('MX_EGGS_BEANS', 'Huevos con frijoles', 'huevos con frijoles', 'Preparación mexicana de huevo con frijoles.', array['BREAKFAST','DINNER'], 'Cocina el huevo al gusto y sirve con los frijoles calientes.', array['mexicana','rápida','huevo','frijoles'], '1 huevo puede cambiarse por 40 g de pollo cocido si la preparación lo permite.'),
    ('MX_EGGS_NOPALES', 'Huevos con nopales', 'huevos con nopales', 'Huevo preparado con nopales cocidos.', array['BREAKFAST','DINNER'], 'Saltea los nopales y agrega el huevo; sazona con cebolla y chile al gusto.', array['mexicana','rápida','huevo','nopales'], null),
    ('MX_MOLLETES_BEANS_PANELA', 'Molletes con frijoles y queso panela', 'molletes con frijoles y queso panela', 'Bolillo con frijoles y queso panela.', array['BREAKFAST','DINNER'], 'Unta los frijoles sobre el bolillo, agrega el queso y calienta hasta dorar ligeramente.', array['mexicana','rápida','frijoles','queso'], null),
    ('MX_TOSTADAS_EGG_BEANS', 'Tostadas con huevo y frijoles', 'tostadas con huevo y frijoles', 'Tostadas horneadas con frijoles y huevo.', array['BREAKFAST','DINNER'], 'Distribuye los frijoles y el huevo cocido sobre las tostadas.', array['mexicana','rápida','huevo','frijoles'], null),
    ('MX_TOAST_EGG_AVOCADO', 'Pan tostado con huevo y aguacate', 'pan tostado con huevo y aguacate', 'Pan integral con huevo y aguacate.', array['BREAKFAST','DINNER'], 'Tuesta el pan y sirve con el huevo y el aguacate.', array['rápida','huevo','aguacate'], null),
    ('MX_CHICKEN_RICE_VEGETABLES', 'Pollo con arroz y verduras', 'pollo con arroz y verduras', 'Plato base reutilizable de pollo, arroz y verduras.', array['MAIN_MEAL','DINNER'], 'Cocina el pollo con las verduras y sirve con el arroz.', array['mexicana','pollo','arroz','verduras'], '80 g de pollo pueden cambiarse por 80 g de res magra cocida; conserva y revisa las cantidades.'),
    ('MX_CHICKEN_RICE_BEANS', 'Pollo con arroz y frijoles', 'pollo con arroz y frijoles', 'Plato de pollo con cereal y leguminosa.', array['MAIN_MEAL','DINNER'], 'Cocina el pollo y sirve con el arroz y los frijoles.', array['mexicana','pollo','arroz','frijoles'], '80 g de pollo pueden cambiarse por 60 g de pescado blanco cocido; revisa los equivalentes resultantes.'),
    ('MX_CHICKEN_PASTA_VEGETABLES', 'Pollo con pasta y verduras', 'pollo con pasta y verduras', 'Pollo con pasta cocida y verduras.', array['MAIN_MEAL','DINNER'], 'Cocina el pollo con las verduras y mezcla con la pasta.', array['pollo','pasta','verduras','rápida'], null),
    ('MX_BEEF_RICE_VEGETABLES', 'Carne con arroz y verduras', 'carne con arroz y verduras', 'Carne magra con arroz y verduras.', array['MAIN_MEAL','DINNER'], 'Cocina la carne con las verduras y sirve con el arroz.', array['mexicana','res','arroz','verduras'], '80 g de res magra pueden cambiarse por 80 g de pollo cocido; conserva y revisa las cantidades.'),
    ('MX_BEEF_POTATO', 'Carne con papa', 'carne con papa', 'Carne magra con papa cocida.', array['MAIN_MEAL','DINNER'], 'Cocina la carne y acompaña con la papa; agrega especias al gusto.', array['mexicana','res','papa','rápida'], null),
    ('MX_BEEF_PASTA_VEGETABLES', 'Carne con pasta y verduras', 'carne con pasta y verduras', 'Carne magra con pasta y verduras.', array['MAIN_MEAL','DINNER'], 'Cocina la carne con las verduras y mezcla con la pasta.', array['res','pasta','verduras'], null),
    ('MX_RICE_CHICKEN_SALAD', 'Ensalada de arroz con pollo', 'ensalada de arroz con pollo', 'Ensalada fresca con arroz y pollo.', array['MAIN_MEAL','DINNER'], 'Mezcla el arroz frío con el pollo, la lechuga, el jitomate y el pepino; añade limón al gusto.', array['rápida','pollo','arroz','ensalada'], null),
    ('MX_RICE_TUNA_SALAD', 'Ensalada de arroz con atún', 'ensalada de arroz con atun', 'Ensalada fresca con arroz y atún.', array['MAIN_MEAL','DINNER'], 'Mezcla el arroz con el atún, la lechuga y el jitomate; añade limón al gusto.', array['rápida','atún','arroz','ensalada'], '60 g de atún escurrido pueden cambiarse por 60 g de pescado blanco cocido.'),
    ('MX_FISH_CEVICHE', 'Ceviche sencillo de pescado', 'ceviche sencillo de pescado', 'Pescado con verduras frescas y limón.', array['MAIN_MEAL','DINNER'], 'Mezcla el pescado previamente cocido con jitomate, cebolla y pepino; agrega limón, chile y cilantro al gusto.', array['mexicana','pescado','rápida','sin cocción compleja'], '60 g de pescado pueden cambiarse por 60 g de atún en agua escurrido.'),
    ('MX_BEEF_TACOS', 'Tacos de carne', 'tacos de carne', 'Tacos de tortilla de maíz con carne magra.', array['MAIN_MEAL','DINNER'], 'Calienta las tortillas, agrega la carne y termina con jitomate, cebolla, limón y chile al gusto.', array['mexicana','tacos','res','rápida'], '80 g de res magra pueden cambiarse por 80 g de pollo cocido.'),
    ('MX_CHICKEN_TACOS', 'Tacos de pollo', 'tacos de pollo', 'Tacos de tortilla de maíz con pollo.', array['MAIN_MEAL','DINNER'], 'Calienta las tortillas, agrega el pollo y termina con jitomate, cebolla, limón y chile al gusto.', array['mexicana','tacos','pollo','rápida'], '80 g de pollo pueden cambiarse por 80 g de res magra cocida.'),
    ('MX_CHICKEN_QUESADILLAS', 'Quesadillas de pollo', 'quesadillas de pollo', 'Quesadillas con pollo y queso panela.', array['MAIN_MEAL','DINNER'], 'Rellena las tortillas con pollo y queso; calienta hasta que el queso se suavice.', array['mexicana','quesadillas','pollo','queso'], null),
    ('MX_BEANS_EGG_QUESADILLAS', 'Quesadillas con frijoles y huevo', 'quesadillas con frijoles y huevo', 'Quesadillas con frijoles y huevo.', array['BREAKFAST','DINNER'], 'Rellena las tortillas con frijoles y huevo cocido; calienta antes de servir.', array['mexicana','quesadillas','frijoles','huevo'], null),
    ('MX_BEEF_NOPAL_QUESADILLAS', 'Quesadillas de bistec y nopales', 'quesadillas de bistec y nopales', 'Quesadillas con carne magra y nopales.', array['MAIN_MEAL','DINNER'], 'Rellena las tortillas con la carne y los nopales; calienta antes de servir.', array['mexicana','quesadillas','res','nopales'], '40 g de res magra pueden cambiarse por 40 g de pollo cocido.'),
    ('MX_TUNA_TOSTADAS', 'Tostadas de atún', 'tostadas de atun', 'Tostadas horneadas con atún y jitomate.', array['MAIN_MEAL','DINNER'], 'Mezcla el atún con el jitomate y sirve sobre las tostadas.', array['mexicana','tostadas','atún','rápida'], null),
    ('MX_TUNA_BEAN_TOSTADAS', 'Tostadas de atún con frijoles', 'tostadas de atun con frijoles', 'Tostadas horneadas con frijoles y atún.', array['MAIN_MEAL','DINNER'], 'Unta los frijoles sobre las tostadas y agrega el atún con jitomate.', array['mexicana','tostadas','atún','frijoles'], null),
    ('MX_CHICKEN_TORTILLAS_AVOCADO', 'Pollo con tortillas y aguacate', 'pollo con tortillas y aguacate', 'Pollo acompañado de tortillas y aguacate.', array['MAIN_MEAL','DINNER'], 'Cocina el pollo y sirve con las tortillas calientes y el aguacate.', array['mexicana','pollo','aguacate','rápida'], '80 g de pollo pueden cambiarse por 60 g de atún en agua; revisa los equivalentes resultantes.')
)
insert into public.recipes (
  id, owner_id, stable_code, name, normalized_name, description, meal_types,
  servings, instructions, image_path, tags, substitution_notes, source,
  source_version, source_reference, is_custom, active
)
select
  md5('nuthrick-recipe:' || stable_code)::uuid, null, stable_code, name,
  normalized_name, description, meal_types, 1, instructions, null, tags,
  substitution_notes, 'NUTHRICK_STARTER_RECIPES', '1.0.0',
  'Biblioteca curada a partir de patrones alimentarios reutilizables; sin datos clínicos ni personales.',
  false, true
from recipe_seed
on conflict (id) do update set
  stable_code = excluded.stable_code,
  name = excluded.name,
  normalized_name = excluded.normalized_name,
  description = excluded.description,
  meal_types = excluded.meal_types,
  servings = excluded.servings,
  instructions = excluded.instructions,
  tags = excluded.tags,
  substitution_notes = excluded.substitution_notes,
  source = excluded.source,
  source_version = excluded.source_version,
  source_reference = excluded.source_reference,
  is_custom = false,
  active = true;

with ingredient_seed(recipe_code, food_code, amount, unit, display_order) as (
  values
    ('MX_OATS_BANANA','MX_ROLLED_OATS',0.333::numeric,'cup',0), ('MX_OATS_BANANA','MX_BANANA',0.5,'piece',1),
    ('MX_OATS_FRUIT_PEANUT','MX_ROLLED_OATS',0.333,'cup',0), ('MX_OATS_FRUIT_PEANUT','MX_PAPAYA',0.667,'cup',1), ('MX_OATS_FRUIT_PEANUT','MX_PEANUT_BUTTER',2,'teaspoon',2),
    ('MX_EGGS_BEANS','MX_WHOLE_EGG',1,'piece',0), ('MX_EGGS_BEANS','MX_COOKED_BEANS',0.5,'cup',1),
    ('MX_EGGS_NOPALES','MX_WHOLE_EGG',1,'piece',0), ('MX_EGGS_NOPALES','MX_COOKED_NOPAL',1,'cup',1),
    ('MX_MOLLETES_BEANS_PANELA','MX_BOLILLO_NO_CRUMB',0.333,'piece',0), ('MX_MOLLETES_BEANS_PANELA','MX_COOKED_BEANS',0.5,'cup',1), ('MX_MOLLETES_BEANS_PANELA','MX_PANELA_CHEESE',30,'g',2),
    ('MX_TOSTADAS_EGG_BEANS','MX_BAKED_TOSTADA',2,'piece',0), ('MX_TOSTADAS_EGG_BEANS','MX_COOKED_BEANS',0.5,'cup',1), ('MX_TOSTADAS_EGG_BEANS','MX_WHOLE_EGG',1,'piece',2),
    ('MX_TOAST_EGG_AVOCADO','MX_WHOLE_WHEAT_BREAD',1,'slice',0), ('MX_TOAST_EGG_AVOCADO','MX_WHOLE_EGG',1,'piece',1), ('MX_TOAST_EGG_AVOCADO','MX_AVOCADO',0.333,'piece',2),
    ('MX_CHICKEN_RICE_VEGETABLES','MX_COOKED_CHICKEN_BREAST',80,'g',0), ('MX_CHICKEN_RICE_VEGETABLES','MX_COOKED_WHITE_RICE',0.5,'cup',1), ('MX_CHICKEN_RICE_VEGETABLES','MX_MIXED_VEGETABLES',1,'cup',2),
    ('MX_CHICKEN_RICE_BEANS','MX_COOKED_CHICKEN_BREAST',80,'g',0), ('MX_CHICKEN_RICE_BEANS','MX_COOKED_WHITE_RICE',0.5,'cup',1), ('MX_CHICKEN_RICE_BEANS','MX_COOKED_BEANS',0.5,'cup',2),
    ('MX_CHICKEN_PASTA_VEGETABLES','MX_COOKED_CHICKEN_BREAST',80,'g',0), ('MX_CHICKEN_PASTA_VEGETABLES','MX_COOKED_PASTA',0.5,'cup',1), ('MX_CHICKEN_PASTA_VEGETABLES','MX_MIXED_VEGETABLES',1,'cup',2),
    ('MX_BEEF_RICE_VEGETABLES','MX_COOKED_LEAN_BEEF',80,'g',0), ('MX_BEEF_RICE_VEGETABLES','MX_COOKED_WHITE_RICE',0.5,'cup',1), ('MX_BEEF_RICE_VEGETABLES','MX_MIXED_VEGETABLES',1,'cup',2),
    ('MX_BEEF_POTATO','MX_COOKED_LEAN_BEEF',80,'g',0), ('MX_BEEF_POTATO','MX_COOKED_POTATO',0.5,'piece',1),
    ('MX_BEEF_PASTA_VEGETABLES','MX_COOKED_LEAN_BEEF',80,'g',0), ('MX_BEEF_PASTA_VEGETABLES','MX_COOKED_PASTA',0.5,'cup',1), ('MX_BEEF_PASTA_VEGETABLES','MX_MIXED_VEGETABLES',1,'cup',2),
    ('MX_RICE_CHICKEN_SALAD','MX_COOKED_WHITE_RICE',0.5,'cup',0), ('MX_RICE_CHICKEN_SALAD','MX_COOKED_CHICKEN_BREAST',80,'g',1), ('MX_RICE_CHICKEN_SALAD','MX_LETTUCE',3,'cup',2), ('MX_RICE_CHICKEN_SALAD','MX_TOMATO',1,'piece',3), ('MX_RICE_CHICKEN_SALAD','MX_RAW_CUCUMBER',1.5,'cup',4),
    ('MX_RICE_TUNA_SALAD','MX_COOKED_WHITE_RICE',0.5,'cup',0), ('MX_RICE_TUNA_SALAD','MX_TUNA_WATER_DRAINED',60,'g',1), ('MX_RICE_TUNA_SALAD','MX_LETTUCE',3,'cup',2), ('MX_RICE_TUNA_SALAD','MX_TOMATO',1,'piece',3),
    ('MX_FISH_CEVICHE','MX_COOKED_WHITE_FISH',60,'g',0), ('MX_FISH_CEVICHE','MX_TOMATO',1,'piece',1), ('MX_FISH_CEVICHE','MX_RAW_ONION',0.5,'cup',2), ('MX_FISH_CEVICHE','MX_RAW_CUCUMBER',1.5,'cup',3),
    ('MX_BEEF_TACOS','MX_CORN_TORTILLA',2,'tortilla',0), ('MX_BEEF_TACOS','MX_COOKED_LEAN_BEEF',80,'g',1), ('MX_BEEF_TACOS','MX_TOMATO',1,'piece',2),
    ('MX_CHICKEN_TACOS','MX_CORN_TORTILLA',2,'tortilla',0), ('MX_CHICKEN_TACOS','MX_COOKED_CHICKEN_BREAST',80,'g',1), ('MX_CHICKEN_TACOS','MX_TOMATO',1,'piece',2),
    ('MX_CHICKEN_QUESADILLAS','MX_CORN_TORTILLA',2,'tortilla',0), ('MX_CHICKEN_QUESADILLAS','MX_COOKED_CHICKEN_BREAST',40,'g',1), ('MX_CHICKEN_QUESADILLAS','MX_PANELA_CHEESE',30,'g',2),
    ('MX_BEANS_EGG_QUESADILLAS','MX_CORN_TORTILLA',2,'tortilla',0), ('MX_BEANS_EGG_QUESADILLAS','MX_COOKED_BEANS',0.5,'cup',1), ('MX_BEANS_EGG_QUESADILLAS','MX_WHOLE_EGG',1,'piece',2),
    ('MX_BEEF_NOPAL_QUESADILLAS','MX_CORN_TORTILLA',2,'tortilla',0), ('MX_BEEF_NOPAL_QUESADILLAS','MX_COOKED_LEAN_BEEF',40,'g',1), ('MX_BEEF_NOPAL_QUESADILLAS','MX_COOKED_NOPAL',1,'cup',2),
    ('MX_TUNA_TOSTADAS','MX_BAKED_TOSTADA',2,'piece',0), ('MX_TUNA_TOSTADAS','MX_TUNA_WATER_DRAINED',60,'g',1), ('MX_TUNA_TOSTADAS','MX_TOMATO',1,'piece',2),
    ('MX_TUNA_BEAN_TOSTADAS','MX_BAKED_TOSTADA',2,'piece',0), ('MX_TUNA_BEAN_TOSTADAS','MX_TUNA_WATER_DRAINED',30,'g',1), ('MX_TUNA_BEAN_TOSTADAS','MX_COOKED_BEANS',0.5,'cup',2), ('MX_TUNA_BEAN_TOSTADAS','MX_TOMATO',1,'piece',3),
    ('MX_CHICKEN_TORTILLAS_AVOCADO','MX_COOKED_CHICKEN_BREAST',80,'g',0), ('MX_CHICKEN_TORTILLAS_AVOCADO','MX_CORN_TORTILLA',2,'tortilla',1), ('MX_CHICKEN_TORTILLAS_AVOCADO','MX_AVOCADO',0.333,'piece',2)
)
insert into public.recipe_items (
  id, owner_id, recipe_id, food_item_id, amount, unit, display_order,
  food_snapshot, exchange_contribution
)
select
  md5('nuthrick-recipe-item:' || i.recipe_code || ':' || i.food_code)::uuid,
  null, r.id, f.id, i.amount, i.unit, i.display_order,
  jsonb_build_object(
    'id', f.id, 'name', f.name, 'group_code', f.group_code,
    'portion_amount', f.portion_amount, 'portion_unit', f.portion_unit,
    'portion_description', f.portion_description,
    'exchange_system_code', f.exchange_system_code,
    'exchange_catalog_version', f.exchange_catalog_version,
    'source', f.source, 'source_version', f.source_version,
    'is_custom', f.is_custom, 'attributes', f.attributes
  ),
  jsonb_build_array(jsonb_build_object(
    'group_code', f.group_code,
    'portions', round(i.amount / f.portion_amount, 6)
  ))
from ingredient_seed i
join public.recipes r on r.stable_code = i.recipe_code and r.owner_id is null
join public.food_items f on f.stable_code = i.food_code and f.owner_id is null
on conflict (id) do update set
  recipe_id = excluded.recipe_id,
  food_item_id = excluded.food_item_id,
  amount = excluded.amount,
  unit = excluded.unit,
  display_order = excluded.display_order,
  food_snapshot = excluded.food_snapshot,
  exchange_contribution = excluded.exchange_contribution;
