-- Objective 1: a stable, system-owned catalog of directly recordable measurements.
-- It extends (rather than replaces) measurement_types so historical revisions keep
-- their referenced IDs and no patient data needs to be rewritten.

alter table public.measurement_types
  drop constraint measurement_types_category_check,
  drop constraint measurement_types_data_type_check;

alter table public.measurement_types
  add column if not exists subcategory text not null default '',
  add column if not exists display_name text,
  add column if not exists clinical_name text,
  add column if not exists synonyms text[] not null default '{}',
  add column if not exists display_order integer not null default 1000,
  add column if not exists source_kind text not null default 'direct',
  add column if not exists is_isak boolean not null default false,
  add column if not exists isak_profiles text[] not null default '{}',
  add column if not exists choice_options jsonb not null default '[]'::jsonb;

alter table public.measurement_types alter column unit drop not null;

-- Normalize the pre-existing catalog without changing IDs referenced in snapshots.
update public.measurement_types
set category = case category
  when 'diameter' then 'bone_breadth'
  when 'other' then 'clinical'
  else category
end,
subcategory = case
  when category = 'laboratory' then 'other'
  when category = 'bioimpedance' then 'bioimpedance'
  when category = 'skinfold' then 'skinfolds'
  when category = 'circumference' then 'circumferences'
  when category in ('diameter','bone_breadth') then 'bone_breadths'
  when category = 'general' then 'general'
  else 'clinical_measurements'
end,
display_name = coalesce(display_name, name),
clinical_name = coalesce(clinical_name, name),
updated_at = now();

alter table public.measurement_types
  add constraint measurement_types_category_check check(category in (
    'general','circumference','skinfold','bone_breadth','anthropometric_length',
    'bioimpedance','clinical','laboratory'
  )),
  add constraint measurement_types_data_type_check check(data_type in (
    'number','text','choice','boolean','percentage','ratio'
  )),
  add constraint measurement_types_source_kind_check check(source_kind in (
    'direct','device_reported','laboratory_reported'
  )),
  add constraint measurement_types_isak_profiles_check check(
    isak_profiles <@ array['restricted','complete']::text[]
    and (not is_isak or 'complete'=any(isak_profiles))
  ),
  add constraint measurement_types_choice_options_check check(jsonb_typeof(choice_options)='array');

create index if not exists measurement_types_catalog_order_idx
  on public.measurement_types(category, subcategory, display_order, name)
  where created_by is null and is_active;
create index if not exists measurement_types_catalog_isak_idx
  on public.measurement_types(is_isak, isak_profiles)
  where created_by is null and is_active;

-- All rows below are system concepts. `code` is the immutable integration key;
-- clinical/display names and synonyms are deliberately separate from it.
insert into public.measurement_types (
  id, code, name, category, subcategory, unit, data_type, min_value, max_value,
  decimal_places, description, is_active, display_name, clinical_name, synonyms,
  display_order, source_kind, is_isak, isak_profiles, choice_options, created_by
) values
-- ISAK: 4 general measurements (all restricted).
('weight','weight','Masa corporal','general','general','kg','number',0.001,1000,2,'Masa corporal medida directamente.',true,'Peso corporal','Masa corporal',array['peso','peso actual'],10,'direct',true,array['restricted','complete'],'[]',null),
('height','height','Estatura','general','general','cm','number',0.001,300,1,'Estatura de pie medida directamente.',true,'Estatura','Estatura',array['talla','altura'],20,'direct',true,array['restricted','complete'],'[]',null),
('sitting_height','sitting_height','Talla sentado','general','general','cm','number',0.001,200,1,'Altura en posición sentada.',true,'Talla sentado','Talla sentado',array['altura sentado'],30,'direct',true,array['restricted','complete'],'[]',null),
('arm_span','arm_span','Envergadura','general','general','cm','number',0.001,350,1,'Distancia entre las puntas de los dedos medios con los brazos extendidos.',true,'Envergadura','Envergadura',array['alcance de brazos'],40,'direct',true,array['restricted','complete'],'[]',null),
('usual_weight','usual_weight','Peso habitual','general','clinical_additional','kg','number',0.001,1000,2,'Peso habitual reportado por el paciente.',true,'Peso habitual','Peso corporal habitual',array['peso usual'],50,'direct',false,'{}','[]',null),
('dry_weight','dry_weight','Peso seco','general','clinical_additional','kg','number',0.001,1000,2,'Peso seco documentado clínicamente.',true,'Peso seco','Peso seco',array[]::text[],60,'direct',false,'{}','[]',null),
('target_weight','target_weight','Peso objetivo','general','clinical_additional','kg','number',0.001,1000,2,'Peso objetivo acordado clínicamente; no es un resultado calculado.',true,'Peso objetivo','Peso objetivo',array['peso meta'],70,'direct',false,'{}','[]',null),

-- ISAK: 8 skinfolds (all restricted).
('triceps_skinfold','triceps_skinfold','Pliegue tricipital','skinfold','skinfolds','mm','number',0,150,1,'Pliegue cutáneo tricipital.',true,'Tríceps','Pliegue tricipital',array['tríceps'],110,'direct',true,array['restricted','complete'],'[]',null),
('subscapular_skinfold','subscapular_skinfold','Pliegue subescapular','skinfold','skinfolds','mm','number',0,150,1,'Pliegue cutáneo subescapular.',true,'Subescapular','Pliegue subescapular',array['subescapular'],120,'direct',true,array['restricted','complete'],'[]',null),
('biceps_skinfold','biceps_skinfold','Pliegue bicipital','skinfold','skinfolds','mm','number',0,150,1,'Pliegue cutáneo bicipital.',true,'Bíceps','Pliegue bicipital',array['bíceps'],130,'direct',true,array['restricted','complete'],'[]',null),
('iliac_crest_skinfold','iliac_crest_skinfold','Pliegue de cresta ilíaca','skinfold','skinfolds','mm','number',0,150,1,'Pliegue cutáneo en cresta ilíaca.',true,'Cresta ilíaca','Pliegue de cresta ilíaca',array['iliac crest'],140,'direct',true,array['restricted','complete'],'[]',null),
('supraespinale_skinfold','supraespinale_skinfold','Pliegue supraespinal','skinfold','skinfolds','mm','number',0,150,1,'Pliegue cutáneo supraespinal.',true,'Supraespinal','Pliegue supraespinal',array['supraespinale'],150,'direct',true,array['restricted','complete'],'[]',null),
('abdominal_skinfold','abdominal_skinfold','Pliegue abdominal','skinfold','skinfolds','mm','number',0,150,1,'Pliegue cutáneo abdominal.',true,'Abdominal','Pliegue abdominal',array['abdomen'],160,'direct',true,array['restricted','complete'],'[]',null),
('thigh_skinfold','thigh_skinfold','Pliegue de muslo anterior','skinfold','skinfolds','mm','number',0,150,1,'Pliegue cutáneo de muslo anterior.',true,'Muslo anterior','Pliegue de muslo anterior',array['muslo'],170,'direct',true,array['restricted','complete'],'[]',null),
('calf_skinfold','calf_skinfold','Pliegue de pantorrilla medial','skinfold','skinfolds','mm','number',0,150,1,'Pliegue cutáneo de pantorrilla medial.',true,'Pantorrilla medial','Pliegue de pantorrilla medial',array['pantorrilla'],180,'direct',true,array['restricted','complete'],'[]',null),

-- ISAK: 13 circumferences; six are part of the restricted profile.
('head_circumference','head_circumference','Circunferencia de cabeza','circumference','circumferences','cm','number',0.001,150,1,'Circunferencia máxima de la cabeza.',true,'Cabeza','Circunferencia de cabeza',array['perímetro cefálico'],210,'direct',true,array['complete'],'[]',null),
('neck_circumference','neck_circumference','Circunferencia de cuello','circumference','circumferences','cm','number',0.001,150,1,'Circunferencia de cuello.',true,'Cuello','Circunferencia de cuello',array[]::text[],220,'direct',true,array['complete'],'[]',null),
('relaxed_arm_circumference','relaxed_arm_circumference','Circunferencia de brazo relajado','circumference','circumferences','cm','number',0.001,150,1,'Circunferencia de brazo con el miembro relajado.',true,'Brazo relajado','Circunferencia de brazo relajado',array['circunferencia de brazo'],230,'direct',true,array['restricted','complete'],'[]',null),
('flexed_arm_circumference','flexed_arm_circumference','Circunferencia de brazo flexionado y contraído','circumference','circumferences','cm','number',0.001,150,1,'Circunferencia máxima de brazo flexionado y contraído.',true,'Brazo flexionado y contraído','Circunferencia de brazo flexionado y contraído',array['brazo contraído'],240,'direct',true,array['restricted','complete'],'[]',null),
('forearm_circumference','forearm_circumference','Circunferencia máxima de antebrazo','circumference','circumferences','cm','number',0.001,150,1,'Circunferencia máxima de antebrazo.',true,'Antebrazo máximo','Circunferencia máxima de antebrazo',array[]::text[],250,'direct',true,array['complete'],'[]',null),
('wrist_circumference','wrist_circumference','Circunferencia de muñeca','circumference','circumferences','cm','number',0.001,100,1,'Circunferencia de muñeca.',true,'Muñeca','Circunferencia de muñeca',array[]::text[],260,'direct',true,array['complete'],'[]',null),
('chest_circumference','chest_circumference','Circunferencia de tórax','circumference','circumferences','cm','number',0.001,200,1,'Circunferencia torácica.',true,'Tórax','Circunferencia de tórax',array['pecho'],270,'direct',true,array['complete'],'[]',null),
('waist_circumference','waist_circumference','Circunferencia de cintura','circumference','circumferences','cm','number',0.001,400,1,'Circunferencia de cintura; no equivale a circunferencia abdominal.',true,'Cintura','Circunferencia de cintura',array['perímetro de cintura'],280,'direct',true,array['restricted','complete'],'[]',null),
('hip_circumference','hip_circumference','Circunferencia de cadera/glúteo','circumference','circumferences','cm','number',0.001,400,1,'Circunferencia máxima de cadera/glúteo.',true,'Cadera / glúteo','Circunferencia de cadera/glúteo',array['circunferencia glútea','cadera'],290,'direct',true,array['restricted','complete'],'[]',null),
('proximal_thigh_circumference','proximal_thigh_circumference','Circunferencia de muslo proximal','circumference','circumferences','cm','number',0.001,200,1,'Aproximadamente 1 cm debajo del pliegue glúteo.',true,'Muslo proximal','Circunferencia de muslo proximal',array[]::text[],300,'direct',true,array['complete'],'[]',null),
('mid_thigh_circumference','mid_thigh_circumference','Circunferencia de muslo medio','circumference','circumferences','cm','number',0.001,200,1,'Circunferencia en muslo medio.',true,'Muslo medio','Circunferencia de muslo medio',array['circunferencia de muslo'],310,'direct',true,array['restricted','complete'],'[]',null),
('calf_circumference','calf_circumference','Circunferencia máxima de pantorrilla','circumference','circumferences','cm','number',0.001,200,1,'Circunferencia máxima de pantorrilla.',true,'Pantorrilla máxima','Circunferencia máxima de pantorrilla',array['circunferencia de pantorrilla'],320,'direct',true,array['restricted','complete'],'[]',null),
('ankle_circumference','ankle_circumference','Circunferencia de tobillo','circumference','circumferences','cm','number',0.001,100,1,'Circunferencia de tobillo.',true,'Tobillo','Circunferencia de tobillo',array[]::text[],330,'direct',true,array['complete'],'[]',null),
('abdominal_circumference','abdominal_circumference','Circunferencia abdominal','circumference','clinical_additional','cm','number',0.001,400,1,'Circunferencia abdominal clínica; no equivale automáticamente a cintura.',true,'Circunferencia abdominal','Circunferencia abdominal',array['abdomen'],340,'direct',false,'{}','[]',null),

-- ISAK: 9 lengths/heights, all complete-profile measurements.
('acromiale_radiale_length','acromiale_radiale_length','Longitud acromiale-radiale','anthropometric_length','lengths_heights','cm','number',0.001,200,1,'Longitud antropométrica acromiale-radiale.',true,'Acromiale-radiale','Longitud acromiale-radiale',array[]::text[],410,'direct',true,array['complete'],'[]',null),
('radiale_stylion_length','radiale_stylion_length','Longitud radiale-stylion','anthropometric_length','lengths_heights','cm','number',0.001,200,1,'Longitud antropométrica radiale-stylion.',true,'Radiale-stylion','Longitud radiale-stylion',array[]::text[],420,'direct',true,array['complete'],'[]',null),
('midstylion_dactylion_length','midstylion_dactylion_length','Longitud midstylion-dactylion','anthropometric_length','lengths_heights','cm','number',0.001,200,1,'Longitud antropométrica midstylion-dactylion.',true,'Midstylion-dactylion','Longitud midstylion-dactylion',array[]::text[],430,'direct',true,array['complete'],'[]',null),
('iliospinale_height','iliospinale_height','Altura ilioespinal','anthropometric_length','lengths_heights','cm','number',0.001,250,1,'Altura ilioespinal.',true,'Altura ilioespinal','Altura ilioespinal',array[]::text[],440,'direct',true,array['complete'],'[]',null),
('trochanterion_height','trochanterion_height','Altura trocantérea','anthropometric_length','lengths_heights','cm','number',0.001,250,1,'Altura trocantérea.',true,'Altura trocantérea','Altura trocantérea',array[]::text[],450,'direct',true,array['complete'],'[]',null),
('trochanterion_tibiale_laterale_length','trochanterion_tibiale_laterale_length','Longitud trochanterion-tibiale laterale','anthropometric_length','lengths_heights','cm','number',0.001,200,1,'Longitud antropométrica trochanterion-tibiale laterale.',true,'Trochanterion-tibiale laterale','Longitud trochanterion-tibiale laterale',array[]::text[],460,'direct',true,array['complete'],'[]',null),
('tibiale_laterale_height','tibiale_laterale_height','Altura tibiale laterale','anthropometric_length','lengths_heights','cm','number',0.001,150,1,'Altura tibiale laterale.',true,'Altura tibiale laterale','Altura tibiale laterale',array[]::text[],470,'direct',true,array['complete'],'[]',null),
('foot_length','foot_length','Longitud del pie','anthropometric_length','lengths_heights','cm','number',0.001,100,1,'Longitud del pie.',true,'Longitud del pie','Longitud del pie',array[]::text[],480,'direct',true,array['complete'],'[]',null),
('tibiale_mediale_sphyrion_tibiale_length','tibiale_mediale_sphyrion_tibiale_length','Longitud tibiale mediale-sphyrion tibiale','anthropometric_length','lengths_heights','cm','number',0.001,100,1,'Longitud antropométrica tibiale mediale-sphyrion tibiale.',true,'Tibiale mediale-sphyrion tibiale','Longitud tibiale mediale-sphyrion tibiale',array[]::text[],490,'direct',true,array['complete'],'[]',null),

-- ISAK: 9 bone breadths/depths; three are restricted.
('biacromial_breadth','biacromial_breadth','Diámetro biacromial','bone_breadth','bone_breadths','cm','number',0.001,100,2,'Diámetro biacromial.',true,'Biacromial','Diámetro biacromial',array[]::text[],510,'direct',true,array['complete'],'[]',null),
('biiliocristal_breadth','biiliocristal_breadth','Diámetro biiliocrestal','bone_breadth','bone_breadths','cm','number',0.001,100,2,'Diámetro biiliocrestal.',true,'Biiliocrestal','Diámetro biiliocrestal',array['biiliocristal'],520,'direct',true,array['complete'],'[]',null),
('transverse_chest_breadth','transverse_chest_breadth','Diámetro transverso de tórax','bone_breadth','bone_breadths','cm','number',0.001,100,2,'Diámetro transverso de tórax.',true,'Tórax transverso','Diámetro transverso de tórax',array[]::text[],530,'direct',true,array['complete'],'[]',null),
('anteroposterior_chest_depth','anteroposterior_chest_depth','Profundidad anteroposterior de tórax','bone_breadth','bone_breadths','cm','number',0.001,100,2,'Profundidad anteroposterior de tórax.',true,'Profundidad AP de tórax','Profundidad anteroposterior de tórax',array[]::text[],540,'direct',true,array['complete'],'[]',null),
('anteroposterior_abdominal_depth','anteroposterior_abdominal_depth','Profundidad anteroposterior abdominal','bone_breadth','bone_breadths','cm','number',0.001,100,2,'Profundidad anteroposterior abdominal.',true,'Profundidad AP abdominal','Profundidad anteroposterior abdominal',array[]::text[],550,'direct',true,array['complete'],'[]',null),
('humerus_breadth','humerus_breadth','Diámetro biepicondilar del húmero','bone_breadth','bone_breadths','cm','number',0.001,100,2,'Diámetro biepicondilar del húmero.',true,'Biepicondilar del húmero','Diámetro biepicondilar del húmero',array[]::text[],560,'direct',true,array['restricted','complete'],'[]',null),
('wrist_breadth','wrist_breadth','Diámetro biestiloideo','bone_breadth','bone_breadths','cm','number',0.001,100,2,'Diámetro biestiloideo.',true,'Biestiloideo','Diámetro biestiloideo',array['ancho de muñeca'],570,'direct',true,array['restricted','complete'],'[]',null),
('femur_breadth','femur_breadth','Diámetro biepicondilar del fémur','bone_breadth','bone_breadths','cm','number',0.001,100,2,'Diámetro biepicondilar del fémur.',true,'Biepicondilar del fémur','Diámetro biepicondilar del fémur',array[]::text[],580,'direct',true,array['restricted','complete'],'[]',null),
('bimalleolar_breadth','bimalleolar_breadth','Diámetro bimaleolar','bone_breadth','bone_breadths','cm','number',0.001,100,2,'Diámetro bimaleolar.',true,'Bimaleolar','Diámetro bimaleolar',array[]::text[],590,'direct',true,array['complete'],'[]',null),

-- Device-reported body composition. These are never calculation results.
('body_fat_percentage_device','body_fat_percentage_device','Porcentaje de grasa corporal reportado','bioimpedance','bioimpedance','%','percentage',0,100,1,'Valor reportado directamente por un dispositivo; no calculado por Nuthrick.',true,'Grasa corporal','Porcentaje de grasa corporal reportado por dispositivo',array['% grasa','grasa corporal'],610,'device_reported',false,'{}','[]',null),
('fat_mass_device','fat_mass_device','Masa grasa reportada','bioimpedance','bioimpedance','kg','number',0,1000,2,'Valor reportado directamente por un dispositivo.',true,'Masa grasa','Masa grasa reportada por dispositivo',array[]::text[],620,'device_reported',false,'{}','[]',null),
('fat_free_mass_device','fat_free_mass_device','Masa libre de grasa reportada','bioimpedance','bioimpedance','kg','number',0,1000,2,'Valor reportado directamente por un dispositivo.',true,'Masa libre de grasa','Masa libre de grasa reportada por dispositivo',array['FFM'],630,'device_reported',false,'{}','[]',null),
('muscle_mass_device','muscle_mass_device','Masa muscular reportada','bioimpedance','bioimpedance','kg','number',0,1000,2,'Valor reportado directamente por un dispositivo.',true,'Masa muscular','Masa muscular reportada por dispositivo',array[]::text[],640,'device_reported',false,'{}','[]',null),
('skeletal_muscle_mass_device','skeletal_muscle_mass_device','Masa muscular esquelética reportada','bioimpedance','bioimpedance','kg','number',0,1000,2,'Valor reportado directamente por un dispositivo.',true,'Masa muscular esquelética','Masa muscular esquelética reportada por dispositivo',array['SMM'],650,'device_reported',false,'{}','[]',null),
('total_body_water_device','total_body_water_device','Agua corporal total reportada','bioimpedance','bioimpedance','L','number',0,1000,2,'Valor reportado directamente por un dispositivo.',true,'Agua corporal total','Agua corporal total reportada por dispositivo',array['TBW'],660,'device_reported',false,'{}','[]',null),
('body_water_percentage_device','body_water_percentage_device','Porcentaje de agua corporal reportado','bioimpedance','bioimpedance','%','percentage',0,100,1,'Valor reportado directamente por un dispositivo.',true,'Porcentaje de agua corporal','Porcentaje de agua corporal reportado por dispositivo',array[]::text[],670,'device_reported',false,'{}','[]',null),
('intracellular_water_device','intracellular_water_device','Agua intracelular reportada','bioimpedance','bioimpedance','L','number',0,1000,2,'Valor reportado directamente por un dispositivo.',true,'Agua intracelular','Agua intracelular reportada por dispositivo',array['ICW'],680,'device_reported',false,'{}','[]',null),
('extracellular_water_device','extracellular_water_device','Agua extracelular reportada','bioimpedance','bioimpedance','L','number',0,1000,2,'Valor reportado directamente por un dispositivo.',true,'Agua extracelular','Agua extracelular reportada por dispositivo',array['ECW'],690,'device_reported',false,'{}','[]',null),
('ecw_tbw_ratio_device','ecw_tbw_ratio_device','Relación ECW/TBW reportada','bioimpedance','bioimpedance','ratio','ratio',0,10,3,'Relación reportada directamente por un dispositivo.',true,'Relación ECW/TBW','Relación ECW/TBW reportada por dispositivo',array[]::text[],700,'device_reported',false,'{}','[]',null),
('bone_mass_device','bone_mass_device','Masa ósea reportada','bioimpedance','bioimpedance','kg','number',0,1000,2,'Valor reportado directamente por un dispositivo.',true,'Masa ósea','Masa ósea reportada por dispositivo',array[]::text[],710,'device_reported',false,'{}','[]',null),
('visceral_fat_device','visceral_fat_device','Grasa visceral reportada','bioimpedance','bioimpedance','nivel','number',0,1000,1,'Escala o valor reportado directamente por un dispositivo.',true,'Grasa visceral','Grasa visceral reportada por dispositivo',array[]::text[],720,'device_reported',false,'{}','[]',null),
('visceral_fat_area_device','visceral_fat_area_device','Área de grasa visceral reportada','bioimpedance','bioimpedance','cm²','number',0,10000,1,'Valor reportado directamente por un dispositivo.',true,'Área de grasa visceral','Área de grasa visceral reportada por dispositivo',array['VFA'],730,'device_reported',false,'{}','[]',null),
('basal_metabolism_device','basal_metabolism_device','Metabolismo basal reportado','bioimpedance','bioimpedance','kcal/día','number',0,10000,0,'Valor reportado directamente por un dispositivo.',true,'Metabolismo basal','Metabolismo basal reportado por dispositivo',array['BMR'],740,'device_reported',false,'{}','[]',null),
('metabolic_age_device','metabolic_age_device','Edad metabólica reportada','bioimpedance','bioimpedance','años','number',0,150,0,'Valor reportado directamente por un dispositivo.',true,'Edad metabólica','Edad metabólica reportada por dispositivo',array[]::text[],750,'device_reported',false,'{}','[]',null),
('phase_angle_device','phase_angle_device','Ángulo de fase reportado','bioimpedance','bioimpedance','°','number',0,30,2,'Valor reportado directamente por un dispositivo.',true,'Ángulo de fase','Ángulo de fase reportado por dispositivo',array[]::text[],760,'device_reported',false,'{}','[]',null),
('impedance_device','impedance_device','Impedancia reportada','bioimpedance','bioimpedance','Ω','number',0,10000,1,'Valor reportado directamente por un dispositivo.',true,'Impedancia','Impedancia reportada por dispositivo',array[]::text[],770,'device_reported',false,'{}','[]',null),
('right_arm_muscle_mass_device','right_arm_muscle_mass_device','Masa muscular de brazo derecho reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Masa muscular brazo derecho','Masa muscular de brazo derecho reportada por dispositivo',array[]::text[],780,'device_reported',false,'{}','[]',null),
('left_arm_muscle_mass_device','left_arm_muscle_mass_device','Masa muscular de brazo izquierdo reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Masa muscular brazo izquierdo','Masa muscular de brazo izquierdo reportada por dispositivo',array[]::text[],790,'device_reported',false,'{}','[]',null),
('right_leg_muscle_mass_device','right_leg_muscle_mass_device','Masa muscular de pierna derecha reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Masa muscular pierna derecha','Masa muscular de pierna derecha reportada por dispositivo',array[]::text[],800,'device_reported',false,'{}','[]',null),
('left_leg_muscle_mass_device','left_leg_muscle_mass_device','Masa muscular de pierna izquierda reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Masa muscular pierna izquierda','Masa muscular de pierna izquierda reportada por dispositivo',array[]::text[],810,'device_reported',false,'{}','[]',null),
('trunk_muscle_mass_device','trunk_muscle_mass_device','Masa muscular de tronco reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Masa muscular tronco','Masa muscular de tronco reportada por dispositivo',array[]::text[],820,'device_reported',false,'{}','[]',null),
('right_arm_fat_mass_device','right_arm_fat_mass_device','Grasa segmental de brazo derecho reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Grasa brazo derecho','Grasa segmental de brazo derecho reportada por dispositivo',array[]::text[],830,'device_reported',false,'{}','[]',null),
('left_arm_fat_mass_device','left_arm_fat_mass_device','Grasa segmental de brazo izquierdo reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Grasa brazo izquierdo','Grasa segmental de brazo izquierdo reportada por dispositivo',array[]::text[],840,'device_reported',false,'{}','[]',null),
('right_leg_fat_mass_device','right_leg_fat_mass_device','Grasa segmental de pierna derecha reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Grasa pierna derecha','Grasa segmental de pierna derecha reportada por dispositivo',array[]::text[],850,'device_reported',false,'{}','[]',null),
('left_leg_fat_mass_device','left_leg_fat_mass_device','Grasa segmental de pierna izquierda reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Grasa pierna izquierda','Grasa segmental de pierna izquierda reportada por dispositivo',array[]::text[],860,'device_reported',false,'{}','[]',null),
('trunk_fat_mass_device','trunk_fat_mass_device','Grasa segmental de tronco reportada','bioimpedance','segmental','kg','number',0,1000,2,'Parámetro segmental reportado directamente por un dispositivo.',true,'Grasa tronco','Grasa segmental de tronco reportada por dispositivo',array[]::text[],870,'device_reported',false,'{}','[]',null),

-- Clinical measurements taken during the consultation (not laboratory results).
('systolic_blood_pressure','systolic_blood_pressure','Presión arterial sistólica','clinical','vital_signs','mmHg','number',0,400,0,'Medición clínica realizada en consulta.',true,'Presión sistólica','Presión arterial sistólica',array['TAS'],910,'direct',false,'{}','[]',null),
('diastolic_blood_pressure','diastolic_blood_pressure','Presión arterial diastólica','clinical','vital_signs','mmHg','number',0,300,0,'Medición clínica realizada en consulta.',true,'Presión diastólica','Presión arterial diastólica',array['TAD'],920,'direct',false,'{}','[]',null),
('heart_rate','heart_rate','Frecuencia cardiaca','clinical','vital_signs','lpm','number',0,400,0,'Medición clínica realizada en consulta.',true,'Frecuencia cardiaca','Frecuencia cardiaca',array['FC','pulso'],930,'direct',false,'{}','[]',null),
('oxygen_saturation','oxygen_saturation','Saturación de oxígeno','clinical','vital_signs','%','percentage',0,100,0,'Medición clínica realizada en consulta.',true,'Saturación de oxígeno','Saturación periférica de oxígeno',array['SpO₂','SpO2'],940,'direct',false,'{}','[]',null),
('capillary_glucose','capillary_glucose','Glucosa capilar','clinical','point_of_care','mg/dL','number',0,2000,1,'Glucosa capilar tomada en consulta; no equivale a glucosa sérica.',true,'Glucosa capilar','Glucosa capilar',array['glucemia capilar'],950,'direct',false,'{}','[]',null),
('body_temperature','body_temperature','Temperatura corporal','clinical','vital_signs','°C','number',20,50,1,'Medición clínica realizada en consulta.',true,'Temperatura corporal','Temperatura corporal',array['temperatura'],960,'direct',false,'{}','[]',null),

-- Laboratory catalog: individual analytes, not commercial panels.
('serum_glucose','serum_glucose','Glucosa sérica','laboratory','glycemic_control','mg/dL','number',0,2000,1,'Analito reportado por laboratorio.',true,'Glucosa sérica','Glucosa sérica',array['glucosa'],1010,'laboratory_reported',false,'{}','[]',null),
('fasting_glucose','fasting_glucose','Glucosa en ayuno','laboratory','glycemic_control','mg/dL','number',0,2000,1,'Analito reportado por laboratorio en ayuno.',true,'Glucosa en ayuno','Glucosa en ayuno',array['glucosa basal'],1020,'laboratory_reported',false,'{}','[]',null),
('postprandial_glucose','postprandial_glucose','Glucosa posprandial','laboratory','glycemic_control','mg/dL','number',0,2000,1,'Analito reportado por laboratorio después de ingesta.',true,'Glucosa posprandial','Glucosa posprandial',array[]::text[],1030,'laboratory_reported',false,'{}','[]',null),
('hba1c','hba1c','Hemoglobina glucosilada','laboratory','glycemic_control','%','percentage',0,100,2,'Analito reportado por laboratorio.',true,'HbA1c','Hemoglobina glucosilada HbA1c',array['HbA1c','hemoglobina glicosilada'],1040,'laboratory_reported',false,'{}','[]',null),
('serum_insulin','serum_insulin','Insulina','laboratory','glycemic_control','µUI/mL','number',0,10000,2,'Analito reportado por laboratorio.',true,'Insulina','Insulina sérica',array[]::text[],1050,'laboratory_reported',false,'{}','[]',null),
('fasting_insulin','fasting_insulin','Insulina en ayuno','laboratory','glycemic_control','µUI/mL','number',0,10000,2,'Analito reportado por laboratorio en ayuno.',true,'Insulina en ayuno','Insulina sérica en ayuno',array['insulina basal'],1060,'laboratory_reported',false,'{}','[]',null),
('urea','urea','Urea','laboratory','renal_nitrogen','mg/dL','number',0,2000,1,'Analito reportado por laboratorio.',true,'Urea','Urea',array[]::text[],1110,'laboratory_reported',false,'{}','[]',null),
('blood_urea_nitrogen','blood_urea_nitrogen','Nitrógeno ureico','laboratory','renal_nitrogen','mg/dL','number',0,1000,1,'Analito reportado por laboratorio.',true,'BUN','Nitrógeno ureico sanguíneo',array['BUN','nitrógeno ureico'],1120,'laboratory_reported',false,'{}','[]',null),
('serum_creatinine','serum_creatinine','Creatinina','laboratory','renal_nitrogen','mg/dL','number',0,100,3,'Analito reportado por laboratorio.',true,'Creatinina','Creatinina sérica',array[]::text[],1130,'laboratory_reported',false,'{}','[]',null),
('uric_acid','uric_acid','Ácido úrico','laboratory','renal_nitrogen','mg/dL','number',0,100,2,'Analito reportado por laboratorio.',true,'Ácido úrico','Ácido úrico',array[]::text[],1140,'laboratory_reported',false,'{}','[]',null),
('reported_egfr','reported_egfr','TFGe reportada por laboratorio','laboratory','renal_nitrogen','mL/min/1.73 m²','number',0,500,1,'Tasa de filtración glomerular estimada reportada por el laboratorio; no calculada por Nuthrick.',true,'TFGe reportada','Tasa de filtración glomerular estimada reportada por laboratorio',array['eGFR','TFG'],1150,'laboratory_reported',false,'{}','[]',null),
('microalbuminuria','microalbuminuria','Microalbuminuria','laboratory','renal_nitrogen','mg/L','number',0,100000,2,'Analito reportado por laboratorio.',true,'Microalbuminuria','Microalbuminuria',array[]::text[],1160,'laboratory_reported',false,'{}','[]',null),
('urine_creatinine','urine_creatinine','Creatinina urinaria','laboratory','renal_nitrogen','mg/dL','number',0,10000,2,'Analito reportado por laboratorio.',true,'Creatinina urinaria','Creatinina urinaria',array[]::text[],1170,'laboratory_reported',false,'{}','[]',null),
('urine_albumin','urine_albumin','Albúmina urinaria','laboratory','renal_nitrogen','mg/L','number',0,100000,2,'Analito reportado por laboratorio.',true,'Albúmina urinaria','Albúmina urinaria',array[]::text[],1180,'laboratory_reported',false,'{}','[]',null),
('total_cholesterol','total_cholesterol','Colesterol total','laboratory','lipid_profile','mg/dL','number',0,3000,1,'Analito reportado por laboratorio.',true,'Colesterol total','Colesterol total',array[]::text[],1210,'laboratory_reported',false,'{}','[]',null),
('triglycerides','triglycerides','Triglicéridos','laboratory','lipid_profile','mg/dL','number',0,3000,1,'Analito reportado por laboratorio.',true,'Triglicéridos','Triglicéridos',array[]::text[],1220,'laboratory_reported',false,'{}','[]',null),
('hdl_cholesterol','hdl_cholesterol','Colesterol HDL','laboratory','lipid_profile','mg/dL','number',0,1000,1,'Analito reportado por laboratorio.',true,'HDL','Colesterol de lipoproteínas de alta densidad',array['HDL-C'],1230,'laboratory_reported',false,'{}','[]',null),
('ldl_cholesterol','ldl_cholesterol','Colesterol LDL','laboratory','lipid_profile','mg/dL','number',0,3000,1,'Analito reportado por laboratorio.',true,'LDL','Colesterol de lipoproteínas de baja densidad',array['LDL-C'],1240,'laboratory_reported',false,'{}','[]',null),
('vldl_cholesterol','vldl_cholesterol','Colesterol VLDL','laboratory','lipid_profile','mg/dL','number',0,3000,1,'Analito reportado por laboratorio.',true,'VLDL','Colesterol de lipoproteínas de muy baja densidad',array['VLDL-C'],1250,'laboratory_reported',false,'{}','[]',null),
('reported_non_hdl_cholesterol','reported_non_hdl_cholesterol','Colesterol no-HDL reportado','laboratory','lipid_profile','mg/dL','number',0,3000,1,'Valor reportado por laboratorio; no derivado por Nuthrick.',true,'Colesterol no-HDL','Colesterol no-HDL reportado',array['no-HDL'],1260,'laboratory_reported',false,'{}','[]',null),
('total_lipids','total_lipids','Lípidos totales','laboratory','lipid_profile','mg/dL','number',0,10000,1,'Analito reportado por laboratorio.',true,'Lípidos totales','Lípidos totales',array[]::text[],1270,'laboratory_reported',false,'{}','[]',null),
('ast','ast','AST','laboratory','liver_proteins','U/L','number',0,10000,1,'Analito reportado por laboratorio.',true,'AST / TGO','Aspartato aminotransferasa',array['TGO','aspartato aminotransferasa'],1310,'laboratory_reported',false,'{}','[]',null),
('alt','alt','ALT','laboratory','liver_proteins','U/L','number',0,10000,1,'Analito reportado por laboratorio.',true,'ALT / TGP','Alanina aminotransferasa',array['TGP','alanina aminotransferasa'],1320,'laboratory_reported',false,'{}','[]',null),
('ggt','ggt','GGT','laboratory','liver_proteins','U/L','number',0,10000,1,'Analito reportado por laboratorio.',true,'GGT','Gamma-glutamil transferasa',array['gamma glutamil transferasa'],1330,'laboratory_reported',false,'{}','[]',null),
('alkaline_phosphatase','alkaline_phosphatase','Fosfatasa alcalina','laboratory','liver_proteins','U/L','number',0,10000,1,'Analito reportado por laboratorio.',true,'Fosfatasa alcalina','Fosfatasa alcalina',array['FA'],1340,'laboratory_reported',false,'{}','[]',null),
('ldh','ldh','DHL','laboratory','liver_proteins','U/L','number',0,10000,1,'Analito reportado por laboratorio.',true,'DHL / LDH','Lactato deshidrogenasa',array['LDH','lactato deshidrogenasa'],1350,'laboratory_reported',false,'{}','[]',null),
('total_bilirubin','total_bilirubin','Bilirrubina total','laboratory','liver_proteins','mg/dL','number',0,100,3,'Analito reportado por laboratorio.',true,'Bilirrubina total','Bilirrubina total',array[]::text[],1360,'laboratory_reported',false,'{}','[]',null),
('direct_bilirubin','direct_bilirubin','Bilirrubina directa','laboratory','liver_proteins','mg/dL','number',0,100,3,'Analito reportado por laboratorio.',true,'Bilirrubina directa','Bilirrubina directa',array[]::text[],1370,'laboratory_reported',false,'{}','[]',null),
('indirect_bilirubin','indirect_bilirubin','Bilirrubina indirecta','laboratory','liver_proteins','mg/dL','number',0,100,3,'Analito reportado por laboratorio.',true,'Bilirrubina indirecta','Bilirrubina indirecta',array[]::text[],1380,'laboratory_reported',false,'{}','[]',null),
('total_proteins','total_proteins','Proteínas totales','laboratory','liver_proteins','g/dL','number',0,100,2,'Analito reportado por laboratorio.',true,'Proteínas totales','Proteínas totales',array[]::text[],1390,'laboratory_reported',false,'{}','[]',null),
('serum_albumin','serum_albumin','Albúmina','laboratory','liver_proteins','g/dL','number',0,100,2,'Analito reportado por laboratorio.',true,'Albúmina','Albúmina sérica',array[]::text[],1400,'laboratory_reported',false,'{}','[]',null),
('globulin','globulin','Globulina','laboratory','liver_proteins','g/dL','number',0,100,2,'Analito reportado por laboratorio.',true,'Globulina','Globulina',array[]::text[],1410,'laboratory_reported',false,'{}','[]',null),
('reported_albumin_globulin_ratio','reported_albumin_globulin_ratio','Relación albúmina/globulina reportada','laboratory','liver_proteins','ratio','ratio',0,100,2,'Valor reportado por laboratorio; no derivado por Nuthrick.',true,'Relación A/G','Relación albúmina/globulina reportada',array['A/G'],1420,'laboratory_reported',false,'{}','[]',null),
('sodium','sodium','Sodio','laboratory','electrolytes_minerals','mmol/L','number',0,1000,1,'Analito reportado por laboratorio.',true,'Sodio','Sodio',array['Na'],1510,'laboratory_reported',false,'{}','[]',null),
('potassium','potassium','Potasio','laboratory','electrolytes_minerals','mmol/L','number',0,1000,2,'Analito reportado por laboratorio.',true,'Potasio','Potasio',array['K'],1520,'laboratory_reported',false,'{}','[]',null),
('chloride','chloride','Cloro','laboratory','electrolytes_minerals','mmol/L','number',0,1000,1,'Analito reportado por laboratorio.',true,'Cloro','Cloro',array['Cl'],1530,'laboratory_reported',false,'{}','[]',null),
('calcium','calcium','Calcio','laboratory','electrolytes_minerals','mg/dL','number',0,100,2,'Analito reportado por laboratorio.',true,'Calcio','Calcio',array[]::text[],1540,'laboratory_reported',false,'{}','[]',null),
('phosphorus','phosphorus','Fósforo','laboratory','electrolytes_minerals','mg/dL','number',0,100,2,'Analito reportado por laboratorio.',true,'Fósforo','Fósforo',array[]::text[],1550,'laboratory_reported',false,'{}','[]',null),
('magnesium','magnesium','Magnesio','laboratory','electrolytes_minerals','mg/dL','number',0,100,2,'Analito reportado por laboratorio.',true,'Magnesio','Magnesio',array[]::text[],1560,'laboratory_reported',false,'{}','[]',null),
('serum_iron','serum_iron','Hierro sérico','laboratory','electrolytes_minerals','µg/dL','number',0,10000,1,'Analito reportado por laboratorio.',true,'Hierro sérico','Hierro sérico',array['Fe'],1570,'laboratory_reported',false,'{}','[]',null),
('erythrocytes','erythrocytes','Eritrocitos','laboratory','complete_blood_count_red','millones/µL','number',0,100,3,'Analito reportado por laboratorio.',true,'Eritrocitos','Eritrocitos',array['RBC'],1610,'laboratory_reported',false,'{}','[]',null),
('hemoglobin','hemoglobin','Hemoglobina','laboratory','complete_blood_count_red','g/dL','number',0,100,2,'Analito reportado por laboratorio.',true,'Hemoglobina','Hemoglobina',array['Hb'],1620,'laboratory_reported',false,'{}','[]',null),
('hematocrit','hematocrit','Hematocrito','laboratory','complete_blood_count_red','%','percentage',0,100,1,'Analito reportado por laboratorio.',true,'Hematocrito','Hematocrito',array['Hto','Hct'],1630,'laboratory_reported',false,'{}','[]',null),
('mcv','mcv','VCM','laboratory','complete_blood_count_red','fL','number',0,1000,1,'Analito reportado por laboratorio.',true,'VCM','Volumen corpuscular medio',array['MCV'],1640,'laboratory_reported',false,'{}','[]',null),
('mch','mch','HCM','laboratory','complete_blood_count_red','pg','number',0,1000,1,'Analito reportado por laboratorio.',true,'HCM','Hemoglobina corpuscular media',array['MCH'],1650,'laboratory_reported',false,'{}','[]',null),
('mchc','mchc','CHCM','laboratory','complete_blood_count_red','g/dL','number',0,100,2,'Analito reportado por laboratorio.',true,'CHCM','Concentración de hemoglobina corpuscular media',array['MCHC'],1660,'laboratory_reported',false,'{}','[]',null),
('rdw','rdw','RDW','laboratory','complete_blood_count_red','%','percentage',0,100,2,'Analito reportado por laboratorio.',true,'RDW','Amplitud de distribución eritrocitaria',array[]::text[],1670,'laboratory_reported',false,'{}','[]',null),
('leukocytes','leukocytes','Leucocitos','laboratory','complete_blood_count_white','miles/µL','number',0,1000,2,'Analito reportado por laboratorio.',true,'Leucocitos','Leucocitos',array['WBC'],1710,'laboratory_reported',false,'{}','[]',null),
('neutrophils_percent','neutrophils_percent','Neutrófilos porcentuales','laboratory','complete_blood_count_white','%','percentage',0,100,2,'Analito reportado por laboratorio.',true,'Neutrófilos %','Neutrófilos porcentuales',array[]::text[],1720,'laboratory_reported',false,'{}','[]',null),
('neutrophils_absolute','neutrophils_absolute','Neutrófilos absolutos','laboratory','complete_blood_count_white','/µL','number',0,1000000,0,'Analito reportado por laboratorio.',true,'Neutrófilos absolutos','Neutrófilos absolutos',array[]::text[],1730,'laboratory_reported',false,'{}','[]',null),
('lymphocytes_percent','lymphocytes_percent','Linfocitos porcentuales','laboratory','complete_blood_count_white','%','percentage',0,100,2,'Analito reportado por laboratorio.',true,'Linfocitos %','Linfocitos porcentuales',array[]::text[],1740,'laboratory_reported',false,'{}','[]',null),
('lymphocytes_absolute','lymphocytes_absolute','Linfocitos absolutos','laboratory','complete_blood_count_white','/µL','number',0,1000000,0,'Analito reportado por laboratorio.',true,'Linfocitos absolutos','Linfocitos absolutos',array[]::text[],1750,'laboratory_reported',false,'{}','[]',null),
('monocytes_percent','monocytes_percent','Monocitos porcentuales','laboratory','complete_blood_count_white','%','percentage',0,100,2,'Analito reportado por laboratorio.',true,'Monocitos %','Monocitos porcentuales',array[]::text[],1760,'laboratory_reported',false,'{}','[]',null),
('monocytes_absolute','monocytes_absolute','Monocitos absolutos','laboratory','complete_blood_count_white','/µL','number',0,1000000,0,'Analito reportado por laboratorio.',true,'Monocitos absolutos','Monocitos absolutos',array[]::text[],1770,'laboratory_reported',false,'{}','[]',null),
('eosinophils_percent','eosinophils_percent','Eosinófilos porcentuales','laboratory','complete_blood_count_white','%','percentage',0,100,2,'Analito reportado por laboratorio.',true,'Eosinófilos %','Eosinófilos porcentuales',array[]::text[],1780,'laboratory_reported',false,'{}','[]',null),
('eosinophils_absolute','eosinophils_absolute','Eosinófilos absolutos','laboratory','complete_blood_count_white','/µL','number',0,1000000,0,'Analito reportado por laboratorio.',true,'Eosinófilos absolutos','Eosinófilos absolutos',array[]::text[],1790,'laboratory_reported',false,'{}','[]',null),
('basophils_percent','basophils_percent','Basófilos porcentuales','laboratory','complete_blood_count_white','%','percentage',0,100,2,'Analito reportado por laboratorio.',true,'Basófilos %','Basófilos porcentuales',array[]::text[],1800,'laboratory_reported',false,'{}','[]',null),
('basophils_absolute','basophils_absolute','Basófilos absolutos','laboratory','complete_blood_count_white','/µL','number',0,1000000,0,'Analito reportado por laboratorio.',true,'Basófilos absolutos','Basófilos absolutos',array[]::text[],1810,'laboratory_reported',false,'{}','[]',null),
('platelets','platelets','Plaquetas','laboratory','complete_blood_count_platelets','miles/µL','number',0,10000,1,'Analito reportado por laboratorio.',true,'Plaquetas','Plaquetas',array['PLT'],1820,'laboratory_reported',false,'{}','[]',null),
('mean_platelet_volume','mean_platelet_volume','Volumen plaquetario medio','laboratory','complete_blood_count_platelets','fL','number',0,1000,1,'Analito reportado por laboratorio.',true,'VPM','Volumen plaquetario medio',array['MPV'],1830,'laboratory_reported',false,'{}','[]',null),
('tsh','tsh','TSH','laboratory','thyroid_profile','µUI/mL','number',0,10000,3,'Analito reportado por laboratorio.',true,'TSH','Hormona estimulante de tiroides',array[]::text[],1910,'laboratory_reported',false,'{}','[]',null),
('total_t4','total_t4','T4 total','laboratory','thyroid_profile','µg/dL','number',0,1000,3,'Analito reportado por laboratorio.',true,'T4 total','Tiroxina total',array[]::text[],1920,'laboratory_reported',false,'{}','[]',null),
('free_t4','free_t4','T4 libre','laboratory','thyroid_profile','ng/dL','number',0,1000,3,'Analito reportado por laboratorio.',true,'T4 libre','Tiroxina libre',array[]::text[],1930,'laboratory_reported',false,'{}','[]',null),
('total_t3','total_t3','T3 total','laboratory','thyroid_profile','ng/dL','number',0,1000,3,'Analito reportado por laboratorio.',true,'T3 total','Triyodotironina total',array[]::text[],1940,'laboratory_reported',false,'{}','[]',null),
('free_t3','free_t3','T3 libre','laboratory','thyroid_profile','pg/mL','number',0,1000,3,'Analito reportado por laboratorio.',true,'T3 libre','Triyodotironina libre',array[]::text[],1950,'laboratory_reported',false,'{}','[]',null),
('ferritin','ferritin','Ferritina','laboratory','vitamins_nutritional_status','ng/mL','number',0,100000,2,'Analito reportado por laboratorio.',true,'Ferritina','Ferritina',array[]::text[],2010,'laboratory_reported',false,'{}','[]',null),
('transferrin','transferrin','Transferrina','laboratory','vitamins_nutritional_status','mg/dL','number',0,10000,1,'Analito reportado por laboratorio.',true,'Transferrina','Transferrina',array[]::text[],2020,'laboratory_reported',false,'{}','[]',null),
('tibc','tibc','Capacidad total de fijación de hierro','laboratory','vitamins_nutritional_status','µg/dL','number',0,10000,1,'Analito reportado por laboratorio.',true,'TIBC','Capacidad total de fijación del hierro',array['TIBC','CTFH'],2030,'laboratory_reported',false,'{}','[]',null),
('transferrin_saturation','transferrin_saturation','Saturación de transferrina','laboratory','vitamins_nutritional_status','%','percentage',0,100,2,'Analito reportado por laboratorio.',true,'Saturación de transferrina','Saturación de transferrina',array[]::text[],2040,'laboratory_reported',false,'{}','[]',null),
('vitamin_b12','vitamin_b12','Vitamina B12','laboratory','vitamins_nutritional_status','pg/mL','number',0,100000,1,'Analito reportado por laboratorio.',true,'Vitamina B12','Vitamina B12',array['cobalamina'],2050,'laboratory_reported',false,'{}','[]',null),
('folate','folate','Folato','laboratory','vitamins_nutritional_status','ng/mL','number',0,100000,2,'Analito reportado por laboratorio.',true,'Folato','Folato',array['ácido fólico'],2060,'laboratory_reported',false,'{}','[]',null),
('vitamin_d_25oh','vitamin_d_25oh','Vitamina D 25-OH','laboratory','vitamins_nutritional_status','ng/mL','number',0,100000,2,'Analito reportado por laboratorio.',true,'Vitamina D 25-OH','25-hidroxivitamina D',array['25(OH)D'],2070,'laboratory_reported',false,'{}','[]',null),
('zinc','zinc','Zinc','laboratory','vitamins_nutritional_status','µg/dL','number',0,100000,1,'Analito reportado por laboratorio.',true,'Zinc','Zinc sérico',array[]::text[],2080,'laboratory_reported',false,'{}','[]',null),
('urine_color','urine_color','Color de orina','laboratory','urinalysis',null,'choice',0,1,0,'Resultado cualitativo de examen general de orina.',true,'Color','Color de orina',array[]::text[],2110,'laboratory_reported',false,'{}','["amarillo","ámbar","incoloro","otro"]'::jsonb,null),
('urine_appearance','urine_appearance','Aspecto de orina','laboratory','urinalysis',null,'choice',0,1,0,'Resultado cualitativo de examen general de orina.',true,'Aspecto','Aspecto de orina',array['apariencia'],2120,'laboratory_reported',false,'{}','["claro","ligeramente turbio","turbio","otro"]'::jsonb,null),
('urine_specific_gravity','urine_specific_gravity','Densidad urinaria','laboratory','urinalysis','ratio','ratio',0,10,3,'Resultado reportado por laboratorio.',true,'Densidad','Densidad urinaria',array['gravedad específica'],2130,'laboratory_reported',false,'{}','[]',null),
('urine_ph','urine_ph','pH urinario','laboratory','urinalysis','pH','number',0,14,1,'Resultado reportado por laboratorio.',true,'pH','pH urinario',array[]::text[],2140,'laboratory_reported',false,'{}','[]',null),
('urine_proteins','urine_proteins','Proteínas en orina','laboratory','urinalysis',null,'choice',0,1,0,'Resultado cualitativo de examen general de orina.',true,'Proteínas','Proteínas en orina',array[]::text[],2150,'laboratory_reported',false,'{}','["negativo","trazas","positivo","otro"]'::jsonb,null),
('urine_glucose','urine_glucose','Glucosa en orina','laboratory','urinalysis',null,'choice',0,1,0,'Resultado cualitativo de examen general de orina.',true,'Glucosa','Glucosa en orina',array[]::text[],2160,'laboratory_reported',false,'{}','["negativo","trazas","positivo","otro"]'::jsonb,null),
('urine_ketones','urine_ketones','Cetonas en orina','laboratory','urinalysis',null,'choice',0,1,0,'Resultado cualitativo de examen general de orina.',true,'Cetonas','Cetonas en orina',array[]::text[],2170,'laboratory_reported',false,'{}','["negativo","trazas","positivo","otro"]'::jsonb,null),
('urine_blood','urine_blood','Sangre/hemoglobina en orina','laboratory','urinalysis',null,'choice',0,1,0,'Resultado cualitativo de examen general de orina.',true,'Sangre / hemoglobina','Sangre/hemoglobina en orina',array['sangre'],2180,'laboratory_reported',false,'{}','["negativo","trazas","positivo","otro"]'::jsonb,null),
('urine_nitrites','urine_nitrites','Nitritos en orina','laboratory','urinalysis',null,'boolean',0,1,0,'Resultado cualitativo de examen general de orina.',true,'Nitritos','Nitritos en orina',array[]::text[],2190,'laboratory_reported',false,'{}','[]',null),
('urine_leukocyte_esterase','urine_leukocyte_esterase','Esterasa leucocitaria','laboratory','urinalysis',null,'choice',0,1,0,'Resultado cualitativo de examen general de orina.',true,'Esterasa leucocitaria','Esterasa leucocitaria',array[]::text[],2200,'laboratory_reported',false,'{}','["negativo","trazas","positivo","otro"]'::jsonb,null),
('urine_leukocytes','urine_leukocytes','Leucocitos en orina','laboratory','urinalysis','/campo','number',0,100000,0,'Resultado reportado por laboratorio.',true,'Leucocitos','Leucocitos en orina',array[]::text[],2210,'laboratory_reported',false,'{}','[]',null),
('urine_erythrocytes','urine_erythrocytes','Eritrocitos en orina','laboratory','urinalysis','/campo','number',0,100000,0,'Resultado reportado por laboratorio.',true,'Eritrocitos','Eritrocitos en orina',array[]::text[],2220,'laboratory_reported',false,'{}','[]',null),
('urine_bacteria','urine_bacteria','Bacterias en orina','laboratory','urinalysis',null,'choice',0,1,0,'Resultado cualitativo de examen general de orina.',true,'Bacterias','Bacterias en orina',array[]::text[],2230,'laboratory_reported',false,'{}','["ausentes","escasas","moderadas","abundantes","otro"]'::jsonb,null)
on conflict (id) do update set
  code = excluded.code, name = excluded.name, category = excluded.category,
  subcategory = excluded.subcategory, unit = excluded.unit, data_type = excluded.data_type,
  min_value = excluded.min_value, max_value = excluded.max_value,
  decimal_places = excluded.decimal_places, description = excluded.description,
  is_active = excluded.is_active, display_name = excluded.display_name,
  clinical_name = excluded.clinical_name, synonyms = excluded.synonyms,
  display_order = excluded.display_order, source_kind = excluded.source_kind,
  is_isak = excluded.is_isak, isak_profiles = excluded.isak_profiles,
  choice_options = excluded.choice_options, updated_at = now()
where public.measurement_types.created_by is null;

-- Historic formula-only inputs remain available for historical snapshots, but are
-- explicitly catalogued as direct values rather than derived results.
update public.measurement_types
set display_name = coalesce(display_name, name), clinical_name = coalesce(clinical_name, name),
    display_order = case code when 'chest_skinfold' then 190 when 'midaxillary_skinfold' then 200 else display_order end,
    source_kind = 'direct', updated_at = now()
where created_by is null and code in ('chest_skinfold','midaxillary_skinfold','body_density_measured');
