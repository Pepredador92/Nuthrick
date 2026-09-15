-- Curated SMAE expansion. The supplied candidate workbook is only an editorial
-- input: this migration contains the approved rows and can run autonomously.
-- It never reads, updates, or deletes professional foods, recipes, or plan
-- snapshots. Group-average mathematics remains in the existing exchange catalog.

with food_seed(
  stable_code, name, normalized_name, category, group_code, portion_amount,
  portion_unit, portion_description, attributes, candidate_page
) as (
  values
  ('MX_SMAE_VEG_ACELGA_CRUDA', 'Acelga cruda', 'acelga cruda', 'verduras', 'VEGETABLES', 2.0::numeric, 'cup', '2 tazas', '{}'::jsonb, 'PDF p. 14'),
  ('MX_SMAE_VEG_ACELGA_PICADA_COCIDA', 'Acelga picada cocida', 'acelga picada cocida', 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 14'),
  ('MX_SMAE_VEG_APIO_CRUDO', 'Apio crudo', 'apio crudo', 'verduras', 'VEGETABLES', 1.5::numeric, 'cup', '1 1/2 tazas', '{}'::jsonb, 'PDF p. 14'),
  ('MX_SMAE_VEG_BERENJENA_PICADA_COCIDA', 'Berenjena picada cocida', 'berenjena picada cocida', 'verduras', 'VEGETABLES', 1.0::numeric, 'cup', '1 taza', '{}'::jsonb, 'PDF p. 14'),
  ('MX_SMAE_VEG_BROCOLI_COCIDO', 'Brócoli cocido', 'brocoli cocido', 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 14'),
  ('MX_SMAE_VEG_BROCOLI_CRUDO', 'Brócoli crudo', 'brocoli crudo', 'verduras', 'VEGETABLES', 1.0::numeric, 'cup', '1 taza', '{}'::jsonb, 'PDF p. 14'),
  ('MX_SMAE_VEG_CALABAZA_DE_CASTILLA_COCIDA', 'Calabaza de Castilla cocida', 'calabaza de castilla cocida', 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 14'),
  ('MX_SMAE_VEG_CHAMPINON_COCIDO_REBANADO', 'Champiñón cocido rebanado', 'champinon cocido rebanado', 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 14'),
  ('MX_SMAE_VEG_CHAYOTE_CRUDO', 'Chayote crudo', 'chayote crudo', 'verduras', 'VEGETABLES', 0.5::numeric, 'piece', '1/2 pieza', '{}'::jsonb, 'PDF p. 15'),
  ('MX_SMAE_VEG_COLIFLOR_COCIDA', 'Coliflor cocida', 'coliflor cocida', 'verduras', 'VEGETABLES', 1.0::numeric, 'cup', '1 taza', '{}'::jsonb, 'PDF p. 15'),
  ('MX_SMAE_VEG_EJOTES_COCIDOS_PICADOS', 'Ejotes cocidos picados', 'ejotes cocidos picados', 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 16'),
  ('MX_SMAE_VEG_ESPINACA_COCIDA', 'Espinaca cocida', 'espinaca cocida', 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 16'),
  ('MX_SMAE_VEG_JICAMA_PICADA', 'Jícama picada', 'jicama picada', 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 17'),
  ('MX_SMAE_VEG_PIMIENTO_VERDE_CRUDO_CHICO', 'Pimiento verde crudo chico', 'pimiento verde crudo chico', 'verduras', 'VEGETABLES', 1.0::numeric, 'piece', '1 pieza', '{}'::jsonb, 'PDF p. 18'),
  ('MX_SMAE_VEG_ZANAHORIA_PICADA_CRUDA', 'Zanahoria picada cruda', 'zanahoria picada cruda', 'verduras', 'VEGETABLES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 19'),
  ('MX_SMAE_FRUIT_MANDARINA', 'Mandarina', 'mandarina', 'frutas', 'FRUITS', 2.0::numeric, 'piece', '2 piezas', '{}'::jsonb, 'PDF p. 23'),
  ('MX_SMAE_FRUIT_MANGO_MANILA', 'Mango manila', 'mango manila', 'frutas', 'FRUITS', 1.0::numeric, 'piece', '1 pieza', '{}'::jsonb, 'PDF p. 23'),
  ('MX_SMAE_FRUIT_PINA_PICADA', 'Piña picada', 'pina picada', 'frutas', 'FRUITS', 0.75::numeric, 'cup', '3/4 taza', '{}'::jsonb, 'PDF p. 26'),
  ('MX_SMAE_FRUIT_MELON_PICADO', 'Melón picado', 'melon picado', 'frutas', 'FRUITS', 1.0::numeric, 'cup', '1 taza', '{}'::jsonb, 'PDF p. 24'),
  ('MX_SMAE_FRUIT_SANDIA_PICADA', 'Sandía picada', 'sandia picada', 'frutas', 'FRUITS', 1.0::numeric, 'cup', '1 taza', '{}'::jsonb, 'PDF p. 27'),
  ('MX_SMAE_FRUIT_FRESA_ENTERA', 'Fresa entera', 'fresa entera', 'frutas', 'FRUITS', 17.0::numeric, 'piece', '17 piezas medianas', '{}'::jsonb, 'PDF p. 21'),
  ('MX_SMAE_FRUIT_UVA', 'Uva', 'uva', 'frutas', 'FRUITS', 18.0::numeric, 'piece', '18 piezas', '{}'::jsonb, 'PDF p. 28'),
  ('MX_SMAE_FRUIT_PERA', 'Pera', 'pera', 'frutas', 'FRUITS', 0.5::numeric, 'piece', '1/2 pieza', '{}'::jsonb, 'PDF p. 26'),
  ('MX_SMAE_FRUIT_KIWI', 'Kiwi', 'kiwi', 'frutas', 'FRUITS', 1.5::numeric, 'piece', '1 1/2 piezas', '{}'::jsonb, 'PDF p. 23'),
  ('MX_SMAE_FRUIT_TORONJA', 'Toronja', 'toronja', 'frutas', 'FRUITS', 1.0::numeric, 'piece', '1 pieza', '{}'::jsonb, 'PDF p. 28'),
  ('MX_SMAE_FRUIT_DURAZNO_AMARILLO', 'Durazno amarillo', 'durazno amarillo', 'frutas', 'FRUITS', 2.0::numeric, 'piece', '2 piezas', '{}'::jsonb, 'PDF p. 21'),
  ('MX_SMAE_FRUIT_CIRUELA_CRIOLLA_ROJA_O_AMARILLA', 'Ciruela criolla roja o amarilla', 'ciruela criolla roja o amarilla', 'frutas', 'FRUITS', 3.0::numeric, 'piece', '3 piezas', '{}'::jsonb, 'PDF p. 21'),
  ('MX_SMAE_FRUIT_TUNA', 'Tuna', 'tuna', 'frutas', 'FRUITS', 2.0::numeric, 'piece', '2 piezas', '{}'::jsonb, 'PDF p. 28'),
  ('MX_SMAE_FRUIT_MAMEY', 'Mamey', 'mamey', 'frutas', 'FRUITS', 0.333::numeric, 'piece', '1/3 pieza', '{}'::jsonb, 'PDF p. 23'),
  ('MX_SMAE_FRUIT_ZARZAMORA', 'Zarzamora', 'zarzamora', 'frutas', 'FRUITS', 1.0::numeric, 'cup', '1 taza', '{}'::jsonb, 'PDF p. 29'),
  ('MX_SMAE_CEREAL_NO_FAT_AVENA_COCIDA', 'Avena cocida', 'avena cocida', 'cereales', 'CEREALS_NO_FAT', 0.75::numeric, 'cup', '3/4 taza', '{}'::jsonb, 'PDF p. 30'),
  ('MX_SMAE_CEREAL_NO_FAT_BOLILLO_INTEGRAL', 'Bolillo integral', 'bolillo integral', 'cereales', 'CEREALS_NO_FAT', 0.333::numeric, 'piece', '1/3 pieza', '{"gluten":"contains"}'::jsonb, 'PDF p. 31'),
  ('MX_SMAE_CEREAL_NO_FAT_PAN_BLANCO', 'Pan blanco', 'pan blanco', 'cereales', 'CEREALS_NO_FAT', 1.0::numeric, 'slice', '1 rebanada', '{"gluten":"contains"}'::jsonb, 'PDF p. 41'),
  ('MX_SMAE_CEREAL_NO_FAT_TORTILLA_DE_MAIZ_AZUL_O_NEGRO', 'Tortilla de maíz azul o negro', 'tortilla de maiz azul o negro', 'cereales', 'CEREALS_NO_FAT', 1.0::numeric, 'piece', '1 pieza', '{}'::jsonb, 'PDF p. 44'),
  ('MX_SMAE_CEREAL_NO_FAT_TORTILLA_DE_NOPAL', 'Tortilla de nopal', 'tortilla de nopal', 'cereales', 'CEREALS_NO_FAT', 3.0::numeric, 'piece', '3 piezas', '{}'::jsonb, 'PDF p. 44'),
  ('MX_SMAE_CEREAL_NO_FAT_GALLETAS_DE_MAIZ_HORNEADAS_SIN_GRASA_SALMAS', 'Galletas de maíz horneadas sin grasa', 'galletas de maiz horneadas sin grasa', 'cereales', 'CEREALS_NO_FAT', 3.0::numeric, 'piece', '3 piezas', '{}'::jsonb, 'PDF p. 35'),
  ('MX_SMAE_CEREAL_NO_FAT_CAMOTE_COCIDO', 'Camote cocido', 'camote cocido', 'cereales', 'CEREALS_NO_FAT', 0.333::numeric, 'cup', '1/3 taza', '{}'::jsonb, 'PDF p. 32'),
  ('MX_SMAE_CEREAL_NO_FAT_ELOTE_BLANCO_COCIDO', 'Elote blanco cocido', 'elote blanco cocido', 'cereales', 'CEREALS_NO_FAT', 1.5::numeric, 'piece', '1 1/2 piezas', '{}'::jsonb, 'PDF p. 34'),
  ('MX_SMAE_CEREAL_NO_FAT_QUINOA', 'Quinoa', 'quinoa', 'cereales', 'CEREALS_NO_FAT', 20.0::numeric, 'g', '20 g', '{}'::jsonb, 'PDF p. 43'),
  ('MX_SMAE_CEREAL_NO_FAT_PALOMITAS_NATURALES', 'Palomitas naturales', 'palomitas naturales', 'cereales', 'CEREALS_NO_FAT', 2.5::numeric, 'cup', '2 1/2 tazas', '{}'::jsonb, 'PDF p. 40'),
  ('MX_SMAE_CEREAL_NO_FAT_TELERA', 'Telera', 'telera', 'cereales', 'CEREALS_NO_FAT', 0.333::numeric, 'piece', '1/3 pieza', '{}'::jsonb, 'PDF p. 44'),
  ('MX_SMAE_CEREAL_NO_FAT_MAIZ_POZOLERO', 'Maíz pozolero', 'maiz pozolero', 'cereales', 'CEREALS_NO_FAT', 0.333::numeric, 'cup', '1/3 taza', '{}'::jsonb, 'PDF p. 39'),
  ('MX_SMAE_LEGUME_LENTEJA_COCIDA', 'Lenteja cocida', 'lenteja cocida', 'leguminosas', 'LEGUMES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 56'),
  ('MX_SMAE_LEGUME_GARBANZO_COCIDO', 'Garbanzo cocido', 'garbanzo cocido', 'leguminosas', 'LEGUMES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 55'),
  ('MX_SMAE_LEGUME_ALUBIA_COCIDA', 'Alubia cocida', 'alubia cocida', 'leguminosas', 'LEGUMES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 55'),
  ('MX_SMAE_LEGUME_ALVERJON_O_CHICHARO_SECO_COCIDO', 'Alverjón o chícharo seco cocido', 'alverjon o chicharo seco cocido', 'leguminosas', 'LEGUMES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 55'),
  ('MX_SMAE_LEGUME_HABA_SECA_COCIDA', 'Haba seca cocida', 'haba seca cocida', 'leguminosas', 'LEGUMES', 0.5::numeric, 'cup', '1/2 taza', '{}'::jsonb, 'PDF p. 55'),
  ('MX_SMAE_LEGUME_SOYA_COCIDA', 'Soya cocida', 'soya cocida', 'leguminosas', 'LEGUMES', 0.333::numeric, 'cup', '1/3 taza', '{"soy":"contains"}'::jsonb, 'PDF p. 56'),
  ('MX_SMAE_LEGUME_SOYA_TEXTURIZADA', 'Soya texturizada', 'soya texturizada', 'leguminosas', 'LEGUMES', 30.0::numeric, 'g', '30 g', '{"soy":"contains"}'::jsonb, 'PDF p. 56'),
  ('MX_SMAE_AOA_VERY_LOW_FAT_CAMARON_COCIDO', 'Camarón cocido', 'camaron cocido', 'aoa', 'AOA_VERY_LOW_FAT', 5.0::numeric, 'piece', '5 piezas', '{"crustaceans":"contains"}'::jsonb, 'PDF p. 58'),
  ('MX_SMAE_AOA_VERY_LOW_FAT_PECHUGA_DE_PAVO', 'Pechuga de pavo', 'pechuga de pavo', 'aoa', 'AOA_VERY_LOW_FAT', 1.5::numeric, 'slice', '1 1/2 rebanadas', '{}'::jsonb, 'PDF p. 63'),
  ('MX_SMAE_AOA_VERY_LOW_FAT_MOJARRA_TILAPIA_CRUDA', 'Mojarra tilapia cruda', 'mojarra tilapia cruda', 'aoa', 'AOA_VERY_LOW_FAT', 0.333::numeric, 'piece', '1/3 pieza', '{"fish":"contains"}'::jsonb, 'PDF p. 63'),
  ('MX_SMAE_AOA_VERY_LOW_FAT_ROBALO_FILETEADO', 'Robalo fileteado', 'robalo fileteado', 'aoa', 'AOA_VERY_LOW_FAT', 40.0::numeric, 'g', '40 g', '{"fish":"contains"}'::jsonb, 'PDF p. 66'),
  ('MX_SMAE_AOA_VERY_LOW_FAT_MERLUZA_FILETEADA', 'Merluza fileteada', 'merluza fileteada', 'aoa', 'AOA_VERY_LOW_FAT', 45.0::numeric, 'g', '45 g', '{"fish":"contains"}'::jsonb, 'PDF p. 63'),
  ('MX_SMAE_AOA_VERY_LOW_FAT_PULPO_COCIDO', 'Pulpo cocido', 'pulpo cocido', 'aoa', 'AOA_VERY_LOW_FAT', 25.0::numeric, 'g', '25 g', '{}'::jsonb, 'PDF p. 65'),
  ('MX_SMAE_AOA_LOW_FAT_CARNE_DE_RES_PROMEDIO', 'Carne de res promedio', 'carne de res promedio', 'aoa', 'AOA_LOW_FAT', 30.0::numeric, 'g', '30 g', '{}'::jsonb, 'PDF p. 68'),
  ('MX_SMAE_AOA_LOW_FAT_ARRACHERA_DE_RES_COCIDA', 'Arrachera de res cocida', 'arrachera de res cocida', 'aoa', 'AOA_LOW_FAT', 30.0::numeric, 'g', '30 g', '{}'::jsonb, 'PDF p. 68'),
  ('MX_SMAE_AOA_LOW_FAT_BARBACOA', 'Barbacoa', 'barbacoa', 'aoa', 'AOA_LOW_FAT', 50.0::numeric, 'g', '50 g', '{}'::jsonb, 'PDF p. 68'),
  ('MX_SMAE_AOA_LOW_FAT_JAMON_DE_PAVO', 'Jamón de pavo', 'jamon de pavo', 'aoa', 'AOA_LOW_FAT', 2.0::numeric, 'slice', '2 rebanadas', '{}'::jsonb, 'PDF p. 70'),
  ('MX_SMAE_AOA_LOW_FAT_MUSLO_DE_POLLO_CRUDO_SIN_PIEL', 'Muslo de pollo crudo sin piel', 'muslo de pollo crudo sin piel', 'aoa', 'AOA_LOW_FAT', 0.5::numeric, 'piece', '1/2 pieza', '{}'::jsonb, 'PDF p. 71'),
  ('MX_SMAE_AOA_LOW_FAT_SALMON', 'Salmón', 'salmon', 'aoa', 'AOA_LOW_FAT', 30.0::numeric, 'g', '30 g', '{"fish":"contains"}'::jsonb, 'PDF p. 72'),
  ('MX_SMAE_AOA_LOW_FAT_SIRLOIN', 'Sirloin', 'sirloin', 'aoa', 'AOA_LOW_FAT', 25.0::numeric, 'g', '25 g', '{}'::jsonb, 'PDF p. 73'),
  ('MX_SMAE_AOA_LOW_FAT_TOFU_FIRME', 'Tofu firme', 'tofu firme', 'aoa', 'AOA_LOW_FAT', 40.0::numeric, 'g', '40 g', '{"soy":"contains"}'::jsonb, 'PDF p. 73'),
  ('MX_SMAE_MILK_SKIM_LECHE_EVAPORADA_DESCREMADA', 'Leche evaporada descremada', 'leche evaporada descremada', 'leches', 'MILK_SKIM', 0.5::numeric, 'cup', '1/2 taza', '{"milk":"contains","lactose":"contains"}'::jsonb, 'PDF p. 85'),
  ('MX_SMAE_MILK_SKIM_YOGUR_BAJO_EN_GRASA', 'Yogur bajo en grasa', 'yogur bajo en grasa', 'leches', 'MILK_SKIM', 0.333::numeric, 'cup', '1/3 taza', '{"milk":"contains","lactose":"contains"}'::jsonb, 'PDF p. 86'),
  ('MX_SMAE_MILK_SKIM_YOGUR_LIGHT', 'Yogur light', 'yogur light', 'leches', 'MILK_SKIM', 0.75::numeric, 'cup', '3/4 taza', '{"milk":"contains","lactose":"contains"}'::jsonb, 'PDF p. 86'),
  ('MX_SMAE_MILK_SKIM_BEBIDA_DE_SOYA', 'Bebida de soya', 'bebida de soya', 'leches', 'MILK_SKIM', 1.0::numeric, 'cup', '1 taza', '{"soy":"contains"}'::jsonb, 'PDF p. 85'),
  ('MX_SMAE_MILK_SEMI_SKIM_LECHE_EVAPORADA_SEMIDESCREMADA', 'Leche evaporada semidescremada', 'leche evaporada semidescremada', 'leches', 'MILK_SEMI_SKIM', 0.5::numeric, 'cup', '1/2 taza', '{"milk":"contains","lactose":"contains"}'::jsonb, 'PDF p. 87'),
  ('MX_SMAE_MILK_WHOLE_LECHE_DE_CABRA', 'Leche de cabra', 'leche de cabra', 'leches', 'MILK_WHOLE', 1.0::numeric, 'cup', '1 taza', '{"milk":"contains","lactose":"contains"}'::jsonb, 'PDF p. 88'),
  ('MX_SMAE_MILK_WHOLE_LECHE_ENTERA_EVAPORADA', 'Leche entera evaporada', 'leche entera evaporada', 'leches', 'MILK_WHOLE', 0.5::numeric, 'cup', '1/2 taza', '{"milk":"contains","lactose":"contains"}'::jsonb, 'PDF p. 88'),
  ('MX_SMAE_MILK_WHOLE_YOGUR_NATURAL', 'Yogur natural', 'yogur natural', 'leches', 'MILK_WHOLE', 1.0::numeric, 'cup', '1 taza', '{"milk":"contains","lactose":"contains"}'::jsonb, 'PDF p. 89'),
  ('MX_SMAE_MILK_WHOLE_JOCOQUE', 'Jocoque', 'jocoque', 'leches', 'MILK_WHOLE', 5.0::numeric, 'tablespoon', '5 cucharadas', '{"milk":"contains","lactose":"contains"}'::jsonb, 'PDF p. 88'),
  ('MX_SMAE_FAT_NO_PROTEIN_ACEITE_DE_AGUACATE', 'Aceite de aguacate', 'aceite de aguacate', 'grasas', 'FATS_NO_PROTEIN', 1.0::numeric, 'teaspoon', '1 cucharadita', '{}'::jsonb, 'PDF p. 95'),
  ('MX_SMAE_FAT_NO_PROTEIN_ACEITUNA_VERDE_SIN_HUESO', 'Aceituna verde sin hueso', 'aceituna verde sin hueso', 'grasas', 'FATS_NO_PROTEIN', 8.0::numeric, 'piece', '8 piezas', '{}'::jsonb, 'PDF p. 96'),
  ('MX_SMAE_FAT_NO_PROTEIN_GUACAMOLE', 'Guacamole', 'guacamole', 'grasas', 'FATS_NO_PROTEIN', 2.0::numeric, 'tablespoon', '2 cucharadas', '{}'::jsonb, 'PDF p. 99'),
  ('MX_SMAE_FAT_NO_PROTEIN_MANTEQUILLA', 'Mantequilla', 'mantequilla', 'grasas', 'FATS_NO_PROTEIN', 1.5::numeric, 'teaspoon', '1 1/2 cucharaditas', '{}'::jsonb, 'PDF p. 99'),
  ('MX_SMAE_FAT_NO_PROTEIN_MAYONESA', 'Mayonesa', 'mayonesa', 'grasas', 'FATS_NO_PROTEIN', 1.0::numeric, 'teaspoon', '1 cucharadita', '{}'::jsonb, 'PDF p. 99'),
  ('MX_SMAE_FAT_NO_PROTEIN_VINAGRETA', 'Vinagreta', 'vinagreta', 'grasas', 'FATS_NO_PROTEIN', 0.5::numeric, 'tablespoon', '1/2 cucharada', '{}'::jsonb, 'PDF p. 100'),
  ('MX_SMAE_FAT_WITH_PROTEIN_AJONJOLI', 'Ajonjolí', 'ajonjoli', 'grasas', 'FATS_WITH_PROTEIN', 4.0::numeric, 'teaspoon', '4 cucharaditas', '{}'::jsonb, 'PDF p. 101'),
  ('MX_SMAE_FAT_WITH_PROTEIN_ALMENDRA', 'Almendra', 'almendra', 'grasas', 'FATS_WITH_PROTEIN', 10.0::numeric, 'piece', '10 piezas', '{"tree_nuts":"contains"}'::jsonb, 'PDF p. 101'),
  ('MX_SMAE_FAT_WITH_PROTEIN_AVELLANA', 'Avellana', 'avellana', 'grasas', 'FATS_WITH_PROTEIN', 9.0::numeric, 'piece', '9 piezas', '{"tree_nuts":"contains"}'::jsonb, 'PDF p. 101'),
  ('MX_SMAE_FAT_WITH_PROTEIN_CACAHUATE', 'Cacahuate', 'cacahuate', 'grasas', 'FATS_WITH_PROTEIN', 14.0::numeric, 'piece', '14 piezas', '{"peanut":"contains"}'::jsonb, 'PDF p. 101'),
  ('MX_SMAE_FAT_WITH_PROTEIN_CHIA', 'Chía', 'chia', 'grasas', 'FATS_WITH_PROTEIN', 7.0::numeric, 'teaspoon', '7 cucharaditas', '{}'::jsonb, 'PDF p. 102'),
  ('MX_SMAE_FAT_WITH_PROTEIN_NUEZ', 'Nuez', 'nuez', 'grasas', 'FATS_WITH_PROTEIN', 3.0::numeric, 'piece', '3 piezas', '{"tree_nuts":"contains"}'::jsonb, 'PDF p. 103'),
  ('MX_SMAE_FAT_WITH_PROTEIN_NUECES_MIXTAS', 'Nueces mixtas', 'nueces mixtas', 'grasas', 'FATS_WITH_PROTEIN', 1.0::numeric, 'tablespoon', '1 cucharada', '{"tree_nuts":"contains"}'::jsonb, 'PDF p. 103'),
  ('MX_SMAE_FAT_WITH_PROTEIN_NUEZ_DE_LA_INDIA_SIN_SAL', 'Nuez de la India sin sal', 'nuez de la india sin sal', 'grasas', 'FATS_WITH_PROTEIN', 15.0::numeric, 'piece', '15 mitades', '{"tree_nuts":"contains"}'::jsonb, 'PDF p. 103')
)
insert into public.food_items (
    id, owner_id, stable_code, catalog_code, name, normalized_name, aliases,
    brand, category, exchange_system_code, exchange_catalog_version, group_code,
    portion_amount, portion_unit, portion_description, alternate_portions,
    edible_grams, energy_kcal, carbohydrate_g, protein_g, fat_g, fiber_g, sodium_mg,
    attributes, source, source_version, source_reference, is_custom, use_count, active
  )
  select
    md5('nuthrick-food:' || stable_code)::uuid, null, stable_code,
    'NUTHRICK_MX_SMAE_4E_2014', name, normalized_name, '{}'::text[], null,
    category, 'SMAE_NOM037_2012', '1.0.0', group_code, portion_amount,
    portion_unit, portion_description, '[]'::jsonb,
    null, null, null, null, null, null, null, attributes,
    'SMAE_4E_2014', '4a ed. 2014',
    'Sistema Mexicano de Alimentos Equivalentes, 4a edición (2014) · ' || candidate_page,
    false, 0, true
  from food_seed
  on conflict (id) do update set
    stable_code = excluded.stable_code,
    catalog_code = excluded.catalog_code,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    category = excluded.category,
    exchange_system_code = excluded.exchange_system_code,
    exchange_catalog_version = excluded.exchange_catalog_version,
    group_code = excluded.group_code,
    portion_amount = excluded.portion_amount,
    portion_unit = excluded.portion_unit,
    portion_description = excluded.portion_description,
    attributes = excluded.attributes,
    source = excluded.source,
    source_version = excluded.source_version,
    source_reference = excluded.source_reference,
    is_custom = false,
    active = true
  where public.food_items.owner_id is null and not public.food_items.is_custom
;

-- Only same-identity, same-group search aliases are added. Canonical portions
-- and source metadata of existing rows stay intact.
with aliases_to_add(stable_code, aliases) as (
  values
    ('MX_ZUCCHINI', array['calabacita alargada cruda']::text[]),
    ('MX_RAW_ONION', array['cebolla blanca rebanada']::text[]),
    ('MX_TOMATO', array['jitomate bola']::text[]),
    ('MX_COOKED_NOPAL', array['nopal cocido']::text[]),
    ('MX_BANANA', array['platano']::text[]),
    ('MX_BOLILLO_NO_CRUMB', array['bolillo sin migajon']::text[]),
    ('MX_COOKED_BEANS', array['frijol promedio cocido']::text[]),
    ('MX_COOKED_CHICKEN_BREAST', array['pechuga de pollo sin piel cocida']::text[]),
    ('MX_COOKED_WHITE_FISH', array['pescado fileteado']::text[]),
    ('MX_COOKED_LEAN_BEEF', array['bistec de res', 'filete de res']::text[]),
    ('MX_COOKED_LEAN_PORK', array['carne de cerdo']::text[]),
    ('MX_SEMI_SKIM_MILK', array['leche semidescremada 1%', 'leche semidescremada 2%']::text[]),
    ('MX_VEGETABLE_OIL', array['aceite de canola', 'aceite de maiz']::text[]),
    ('MX_AVOCADO', array['aguacate hass']::text[]),
    ('MX_WHOLE_EGG', array['huevo entero cocido', 'huevo entero fresco']::text[])
)
update public.food_items food
set aliases = array(
  select distinct alias
  from unnest(food.aliases || aliases_to_add.aliases) as alias
  order by alias
)
from aliases_to_add
where food.stable_code = aliases_to_add.stable_code
  and food.owner_id is null
  and not food.is_custom;

-- A presentation is retained only when it is the same food and exchange group.
-- `serving` is the existing internal unit for a container presentation.
with alternate_presentations(stable_code, portions) as (
  values
    ('MX_ORANGE_SEGMENTS', '[{"amount":2,"unit":"piece","display":"2 piezas (naranja)"}]'::jsonb),
    ('MX_COOKED_CHICKEN_BREAST', '[{"amount":0.25,"unit":"cup","display":"1/4 taza (pollo deshebrado)"}]'::jsonb),
    ('MX_TUNA_WATER_DRAINED', '[{"amount":0.333,"unit":"serving","display":"1/3 lata escurrida"}]'::jsonb)
)
update public.food_items food
set alternate_portions = coalesce((
  select jsonb_agg(portion order by portion::text)
  from (
    select distinct portion
    from jsonb_array_elements(food.alternate_portions || alternate_presentations.portions) as portion
  ) all_portions
), '[]'::jsonb)
from alternate_presentations
where food.stable_code = alternate_presentations.stable_code
  and food.owner_id is null
  and not food.is_custom;

do $$
begin
  if (select count(*) from public.food_items where owner_id is null and not is_custom and catalog_code = 'NUTHRICK_MX_SMAE_4E_2014') <> 86 then
    raise exception 'Curated SMAE catalog is incomplete';
  end if;

  if exists (
    select 1 from public.food_items
    where owner_id is null and not is_custom and catalog_code = 'NUTHRICK_MX_SMAE_4E_2014'
      and (source <> 'SMAE_4E_2014' or source_version <> '4a ed. 2014' or source_reference is null)
  ) then
    raise exception 'Curated SMAE rows require auditable source metadata';
  end if;
end
$$;
