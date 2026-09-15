-- Source reconciliation 1.2.0. Existing plan and recipe-item snapshots are immutable here.
alter table public.food_items add column if not exists portion_fraction jsonb;
alter table public.food_items drop constraint if exists food_items_portion_fraction_check;
alter table public.food_items add constraint food_items_portion_fraction_check check (
  portion_fraction is null or (jsonb_typeof(portion_fraction) = 'object'
    and portion_fraction ?& array['numerator','denominator','original']
    and (portion_fraction->>'numerator')::numeric > 0
    and (portion_fraction->>'denominator')::numeric > 0)
);
alter table public.food_items drop constraint if exists food_items_portion_unit_check;
alter table public.food_items add constraint food_items_portion_unit_check check (
  portion_unit in ('g','ml','piece','half','cup','tablespoon','teaspoon','slice','tortilla','glass','serving','unit')
);

update public.food_items set portion_fraction = jsonb_build_object('numerator',1,'denominator',3,'original',portion_description)
where owner_id is null and not is_custom and portion_amount = 0.333
  and (portion_description like '1/3%' or portion_description like '⅓%');
update public.food_items set portion_fraction = jsonb_build_object('numerator',2,'denominator',3,'original',portion_description)
where owner_id is null and not is_custom and portion_amount = 0.667
  and (portion_description like '2/3%' or portion_description like '⅔%');

update public.food_items set portion_unit = 'half', name = 'Nuez de la India sin sal en mitades',
  normalized_name = 'nuez de la india sin sal en mitades',
  source_reference = 'SMAE, 4a edición (2014), página impresa 101 / PDF 103; fila verificada visualmente: 15 mitades.'
where stable_code = 'MX_SMAE_FAT_WITH_PROTEIN_NUEZ_DE_LA_INDIA_SIN_SAL' and owner_id is null and not is_custom;

-- The workbook says teaspoons; the source says tablespoons, with inconsistent gross/net weights.
-- Quarantine pending editorial clarification rather than inventing a household conversion.
update public.food_items set active = false,
  source_reference = 'SMAE 4a edición (2014), PDF 102. Pendiente: discrepancia entre cucharaditas del candidato y cucharadas del original; pesos bruto/neto no permiten resolverla.'
where stable_code = 'MX_SMAE_FAT_WITH_PROTEIN_CHIA' and owner_id is null and not is_custom;

-- An unspecified can is not a documented conversion from the canonical gram portion.
update public.food_items f set alternate_portions = coalesce((
  select jsonb_agg(p) from jsonb_array_elements(f.alternate_portions) p
  where p->>'display' <> '1/3 lata escurrida'
), '[]'::jsonb)
where f.stable_code = 'MX_TUNA_WATER_DRAINED' and f.owner_id is null and not f.is_custom;

with seed(code,name,normalized,amount,unit,description) as (values
  ('MX_SMAE_AOA_HIGH_FAT_QUESO_CHEDDAR','Queso cheddar','queso cheddar',0.75::numeric,'slice','¾ rebanada (21 g en la fuente)'),
  ('MX_SMAE_AOA_HIGH_FAT_QUESO_CHIHUAHUA','Queso chihuahua','queso chihuahua',25::numeric,'g','25 g'),
  ('MX_SMAE_AOA_HIGH_FAT_QUESO_COTIJA','Queso cotija','queso cotija',30::numeric,'g','30 g'),
  ('MX_SMAE_AOA_HIGH_FAT_QUESO_ASADERO','Queso asadero','queso asadero',1::numeric,'slice','1 rebanada (28 g en la fuente)')
)
insert into public.food_items (id,owner_id,stable_code,catalog_code,name,normalized_name,aliases,category,
  exchange_system_code,exchange_catalog_version,group_code,portion_amount,portion_unit,portion_description,
  alternate_portions,attributes,source,source_version,source_reference,is_custom,active)
select md5('nuthrick-food:'||code)::uuid,null,code,'NUTHRICK_MX_SMAE_4E_2014',name,normalized,'{}'::text[],'aoa',
  'SMAE_NOM037_2012','1.0.0','AOA_HIGH_FAT',amount,unit,description,'[]'::jsonb,'{"milk":"contains","lactose":"unknown"}'::jsonb,
  'SMAE_4E_2014','4a ed. 2014','SMAE 4a edición (2014), página impresa 79 / PDF 81. Identidad, grupo y medida verificados visualmente.',false,true from seed
on conflict(id) do update set name=excluded.name,normalized_name=excluded.normalized_name,
  portion_description=excluded.portion_description,source_reference=excluded.source_reference
where food_items.owner_id is null and not food_items.is_custom;

-- Remove universal substitution claims; interchange is recalculated against the current catalog.
update public.recipes set substitution_notes = 'Los intercambios requieren recalcular cantidades y revisar los grupos de la opción. No se asume igualdad de gramaje.',
  source_version='1.1.0'
where owner_id is null and not is_custom and source='NUTHRICK_STARTER_RECIPES' and substitution_notes is not null;

with corrections(code,instructions) as (values
  ('MX_OATS_BANANA','Cocer la avena en agua potable hasta obtener la textura deseada. Servir con el plátano indicado; no añadir azúcar ni otros ingredientes con aporte.'),
  ('MX_EGGS_BEANS','Cocer el huevo completamente en agua, pelar y servir con los frijoles calientes. No añadir aceite.'),
  ('MX_EGGS_NOPALES','Calentar los nopales cocidos en sartén antiadherente con un poco de agua. Incorporar el huevo y cocinar completamente, sin añadir aceite.'),
  ('MX_RICE_CHICKEN_SALAD','Mezclar las cantidades indicadas de arroz y pollo ya cocidos con lechuga, jitomate y pepino lavados. Servir sin aderezos añadidos.'),
  ('MX_RICE_TUNA_SALAD','Mezclar el arroz cocido con el atún escurrido, la lechuga y el jitomate lavados. Servir sin aderezos añadidos.'),
  ('MX_FISH_CEVICHE','Usar pescado completamente cocido y la cantidad indicada en ese estado. Mezclar con jitomate, cebolla y pepino lavados. Servir sin ingredientes adicionales; no usar pescado crudo.'),
  ('MX_BEEF_TACOS','Calentar las tortillas sin aceite, rellenar con la carne ya cocida y el jitomate indicado. Servir sin añadir otros ingredientes.'),
  ('MX_CHICKEN_TACOS','Calentar las tortillas sin aceite, rellenar con el pollo ya cocido y el jitomate indicado. Servir sin añadir otros ingredientes.'),
  ('MX_BEEF_POTATO','Deshebrar la carne ya cocida y mezclar con la papa cocida. Calentar con un poco de agua potable, sin añadir aceite.')
)
update public.recipes r set instructions=c.instructions, source_version='1.1.0'
from corrections c where r.stable_code=c.code and r.owner_id is null and not r.is_custom;
update public.recipes set name='Ensalada de pescado cocido',normalized_name='ensalada de pescado cocido',
  description='Pescado completamente cocido con verduras. Cantidades base editoriales revisables.',
  tags=array['mexicana','pescado cocido','ensalada']
where stable_code='MX_FISH_CEVICHE' and owner_id is null and not is_custom;

with seed(code,name,normalized,meals,instructions,tags) as (values
  ('MX_EDITORIAL_EGGS_MUSHROOMS','Huevos con champiñones','huevos con champinones',array['BREAKFAST','DINNER'],'Calentar los champiñones cocidos con el aceite medido. Agregar el huevo y cocinar completamente. Servir la preparación completa.',array['huevo','champiñones']),
  ('MX_EDITORIAL_OATS_BANANA_PEANUT_MILK','Avena con plátano y crema de cacahuate','avena con platano y crema de cacahuate',array['BREAKFAST','SNACK'],'Cocer la avena con toda la leche medida; añadir agua potable si se necesita. Incorporar el plátano y la crema de cacahuate. La leche forma parte de esta receta: no contarla otra vez como bebida.',array['avena','plátano','cacahuate']),
  ('MX_EDITORIAL_EGG_CHEESE_TACOS','Tacos de huevo con queso','tacos de huevo con queso',array['BREAKFAST','DINNER'],'Cocinar completamente el huevo en sartén antiadherente con un poco de agua, sin aceite. Rellenar las tortillas calientes y agregar el queso indicado.',array['tacos','huevo','queso']),
  ('MX_EDITORIAL_CHICKEN_VEGETABLES','Pollo con verduras','pollo con verduras',array['MAIN_MEAL','DINNER'],'Medir el pollo y las verduras ya cocidos. Calentar juntos con el aceite indicado. Arroz, frijoles y tortillas se agregan por separado a la opción si se necesitan.',array['pollo','verduras','principal']),
  ('MX_EDITORIAL_BEEF_VEGETABLES','Carne con verduras','carne con verduras',array['MAIN_MEAL','DINNER'],'Medir la carne y las verduras ya cocidas. Calentar juntos con el aceite indicado. Los acompañamientos se ajustan por separado.',array['res','verduras','principal']),
  ('MX_EDITORIAL_FISH_PASTA','Pasta con pescado cocido','pasta con pescado cocido',array['MAIN_MEAL','DINNER'],'Usar el pescado completamente cocido. Mezclar con pasta y verduras cocidas; calentar con el aceite medido. No añadir aderezo ni usar pescado crudo.',array['pescado cocido','pasta','verduras']),
  ('MX_EDITORIAL_BEAN_CHEESE_QUESADILLAS','Quesadillas con frijoles y queso','quesadillas con frijoles y queso',array['BREAKFAST','DINNER'],'Machacar los frijoles cocidos sin añadir grasa. Rellenar las tortillas con frijoles y queso. Calentar en comal sin aceite.',array['frijoles','quesadillas','queso']),
  ('MX_EDITORIAL_BANANA_MILK_DRINK','Licuado de plátano con leche','licuado de platano con leche',array['BREAKFAST','SNACK'],'Licuar la leche medida con el plátano. Servir sin azúcar ni otros ingredientes. Sus aportes ya incluyen la leche y la fruta.',array['nuthrick:drink','plátano','leche'])
)
insert into public.recipes (id,owner_id,stable_code,name,normalized_name,description,meal_types,servings,instructions,tags,source,source_version,source_reference,is_custom,active)
select md5('nuthrick-recipe:'||code)::uuid,null,code,name,normalized,
  'Plantilla culinaria editorial editable, rendimiento de una ración. Cantidades elegidas para esta biblioteca; no transcritas de planes clínicos.',
  meals,1,instructions,tags,'NUTHRICK_EDITORIAL_PREPARATIONS','1.0.0',
  'Requisitos culinarios autorizados del Objetivo 7. PDF de planes originales no disponibles en esta sesión. Ingredientes vinculados al catálogo vigente.',false,true from seed
on conflict(id) do update set instructions=excluded.instructions,description=excluded.description,source_reference=excluded.source_reference
where recipes.owner_id is null and not recipes.is_custom;

with ingredients(recipe_code,food_code,amount,position) as (values
  ('MX_EDITORIAL_EGGS_MUSHROOMS','MX_WHOLE_EGG',1::numeric,0),('MX_EDITORIAL_EGGS_MUSHROOMS','MX_SMAE_VEG_CHAMPINON_COCIDO_REBANADO',0.5,1),('MX_EDITORIAL_EGGS_MUSHROOMS','MX_OLIVE_OIL',1,2),
  ('MX_EDITORIAL_OATS_BANANA_PEANUT_MILK','MX_ROLLED_OATS',0.333,0),('MX_EDITORIAL_OATS_BANANA_PEANUT_MILK','MX_SKIM_MILK',1,1),('MX_EDITORIAL_OATS_BANANA_PEANUT_MILK','MX_BANANA',0.5,2),('MX_EDITORIAL_OATS_BANANA_PEANUT_MILK','MX_PEANUT_BUTTER',2,3),
  ('MX_EDITORIAL_EGG_CHEESE_TACOS','MX_CORN_TORTILLA',2,0),('MX_EDITORIAL_EGG_CHEESE_TACOS','MX_WHOLE_EGG',1,1),('MX_EDITORIAL_EGG_CHEESE_TACOS','MX_PANELA_CHEESE',30,2),
  ('MX_EDITORIAL_CHICKEN_VEGETABLES','MX_COOKED_CHICKEN_BREAST',80,0),('MX_EDITORIAL_CHICKEN_VEGETABLES','MX_MIXED_VEGETABLES',1,1),('MX_EDITORIAL_CHICKEN_VEGETABLES','MX_OLIVE_OIL',1,2),
  ('MX_EDITORIAL_BEEF_VEGETABLES','MX_COOKED_LEAN_BEEF',80,0),('MX_EDITORIAL_BEEF_VEGETABLES','MX_MIXED_VEGETABLES',1,1),('MX_EDITORIAL_BEEF_VEGETABLES','MX_OLIVE_OIL',1,2),
  ('MX_EDITORIAL_FISH_PASTA','MX_COOKED_WHITE_FISH',80,0),('MX_EDITORIAL_FISH_PASTA','MX_COOKED_PASTA',0.5,1),('MX_EDITORIAL_FISH_PASTA','MX_MIXED_VEGETABLES',1,2),('MX_EDITORIAL_FISH_PASTA','MX_OLIVE_OIL',1,3),
  ('MX_EDITORIAL_BEAN_CHEESE_QUESADILLAS','MX_CORN_TORTILLA',2,0),('MX_EDITORIAL_BEAN_CHEESE_QUESADILLAS','MX_COOKED_BEANS',0.5,1),('MX_EDITORIAL_BEAN_CHEESE_QUESADILLAS','MX_PANELA_CHEESE',30,2),
  ('MX_EDITORIAL_BANANA_MILK_DRINK','MX_SKIM_MILK',1,0),('MX_EDITORIAL_BANANA_MILK_DRINK','MX_BANANA',0.5,1)
)
insert into public.recipe_items (id,owner_id,recipe_id,food_item_id,amount,unit,display_order,food_snapshot,exchange_contribution)
select md5('nuthrick-recipe-item:'||i.recipe_code||':'||i.food_code)::uuid,null,r.id,f.id,i.amount,f.portion_unit,i.position,
  jsonb_build_object('id',f.id,'name',f.name,'group_code',f.group_code,'portion_amount',f.portion_amount,'portion_unit',f.portion_unit,
    'portion_description',f.portion_description,'exchange_system_code',f.exchange_system_code,'exchange_catalog_version',f.exchange_catalog_version,
    'source',f.source,'source_version',f.source_version,'is_custom',f.is_custom,'attributes',f.attributes),
  jsonb_build_array(jsonb_build_object('group_code',f.group_code,'portions',round(i.amount/f.portion_amount,6)))
from ingredients i join public.recipes r on r.stable_code=i.recipe_code and r.owner_id is null
join public.food_items f on f.stable_code=i.food_code and f.owner_id is null and f.active
on conflict(id) do nothing;

do $$ begin
  if (select count(*) from public.recipes where source='NUTHRICK_EDITORIAL_PREPARATIONS' and owner_id is null) <> 8
    or (select count(*) from public.recipe_items i join public.recipes r on r.id=i.recipe_id where r.source='NUTHRICK_EDITORIAL_PREPARATIONS' and r.owner_id is null) <> 25
  then raise exception 'Editorial recipe catalog incomplete'; end if;
end $$;
