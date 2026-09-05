-- Reconcile the visible glossary without changing stable IDs or codes. Existing
-- consultation records, workspaces and follow-ups continue to reference the
-- same measurement_type_id values.

update public.measurement_types
set name = v.name, display_name = v.display_name, clinical_name = v.clinical_name,
    category = v.category, subcategory = v.subcategory, unit = v.unit,
    synonyms = v.synonyms, display_order = v.display_order, updated_at = now()
from (values
  ('weight','Peso','Peso','Masa corporal','general','generales','kg',array['peso actual','masa corporal']::text[],10),
  ('height','Altura','Altura','Estatura','general','generales','cm',array['estatura','talla']::text[],20),
  ('sitting_height','Talla sentado','Talla sentado','Talla sentado','general','generales','cm',array['altura sentado']::text[],50),
  ('usual_weight','Peso habitual','Peso habitual','Peso habitual','general','generales','kg',array['peso usual']::text[],60),
  ('systolic_blood_pressure','Presión arterial sistólica','Presión arterial sistólica','Presión arterial sistólica','clinical','generales','mmHg',array['presión sistólica','TAS']::text[],100),
  ('diastolic_blood_pressure','Presión arterial diastólica','Presión arterial diastólica','Presión arterial diastólica','clinical','generales','mmHg',array['presión diastólica','TAD']::text[],110),
  ('body_temperature','Temperatura (sitio no especificado)','Temperatura (sitio no especificado)','Temperatura corporal sin sitio registrado','clinical','temperatura', '°C',array['temperatura corporal']::text[],200),
  ('heart_rate','Pulso (sitio no especificado)','Pulso (sitio no especificado)','Frecuencia cardiaca o pulso sin sitio registrado','clinical','pulso','lpm',array['frecuencia cardiaca','FC']::text[],300),
  ('triceps_skinfold','Tríceps / Tricipital','Tríceps / Tricipital','Pliegue tricipital','skinfold','pliegues_cutaneos','mm',array['tríceps','tricipital']::text[],600),
  ('biceps_skinfold','Bíceps / Bicipital','Bíceps / Bicipital','Pliegue bicipital','skinfold','pliegues_cutaneos','mm',array['bíceps','bicipital']::text[],620),
  ('midaxillary_skinfold','Axilar medial / Medio axilar','Axilar medial / Medio axilar','Pliegue axilar medio','skinfold','pliegues_cutaneos','mm',array['axilar medio','axilar medial','medio axilar']::text[],590),
  ('suprailiac_skinfold','Suprailíaco / Ileocrestal','Suprailíaco / Ileocrestal','Pliegue suprailíaco','skinfold','pliegues_cutaneos','mm',array['suprailíaco','ileocrestal']::text[],630),
  ('head_circumference','Cefálico','Cefálico','Circunferencia cefálica','circumference','circunferencias','cm',array['cabeza','perímetro cefálico']::text[],700),
  ('flexed_arm_circumference','Brazo contraído','Brazo contraído','Circunferencia de brazo flexionado y contraído','circumference','circunferencias','cm',array['brazo flexionado y contraído']::text[],720),
  ('forearm_circumference','Antebrazo','Antebrazo','Circunferencia máxima de antebrazo','circumference','circunferencias','cm',array['antebrazo máximo']::text[],730),
  ('abdominal_circumference','Abdomen','Abdomen','Circunferencia abdominal','circumference','circunferencias','cm',array['circunferencia abdominal']::text[],780),
  ('hip_circumference','Cadera','Cadera','Circunferencia máxima de cadera/glúteo','circumference','circunferencias','cm',array['cadera / glúteo','circunferencia glútea']::text[],800),
  ('calf_circumference','Pantorrilla','Pantorrilla','Circunferencia máxima de pantorrilla','circumference','circunferencias','cm',array['pantorrilla máxima','circunferencia de pantorrilla']::text[],830),
  ('humerus_breadth','Húmero','Húmero','Diámetro biepicondilar del húmero','bone_breadth','diametros','cm',array['biepicondilar del húmero']::text[],900),
  ('wrist_breadth','Muñeca','Muñeca','Diámetro biestiloideo','bone_breadth','diametros','cm',array['biestiloideo','ancho de muñeca']::text[],910),
  ('biiliocristal_breadth','Biileocrestídeo','Biileocrestídeo','Diámetro biiliocrestal','bone_breadth','diametros','cm',array['biiliocrestal','biiliocristal']::text[],870),
  ('transverse_chest_breadth','Transverso del tórax','Transverso del tórax','Diámetro transverso de tórax','bone_breadth','diametros','cm',array['tórax transverso']::text[],880),
  ('anteroposterior_chest_depth','Anteroposterior del tórax','Anteroposterior del tórax','Profundidad anteroposterior de tórax','bone_breadth','diametros','cm',array['profundidad AP de tórax']::text[],890),
  ('acromiale_radiale_length','Acromial - Radial','Acromial - Radial','Longitud acromiale-radiale','anthropometric_length','longitudes','cm',array['acromiale-radiale']::text[],1000),
  ('radiale_stylion_length','Radial - Estiloide','Radial - Estiloide','Longitud radiale-stylion','anthropometric_length','longitudes','cm',array['radiale-stylion']::text[],1010),
  ('midstylion_dactylion_length','Medioestiloidea - Dactiloidea','Medioestiloidea - Dactiloidea','Longitud midstylion-dactylion','anthropometric_length','longitudes','cm',array['midstylion-dactylion']::text[],1020),
  ('iliospinale_height','Ilioespinal','Ilioespinal','Altura ilioespinal','anthropometric_length','longitudes','cm',array['altura ilioespinal']::text[],1030),
  ('trochanterion_height','Trocantérea','Trocantérea','Altura trocantérea','anthropometric_length','longitudes','cm',array['altura trocantérea']::text[],1040),
  ('trochanterion_tibiale_laterale_length','Trocantérea - Tibial lateral','Trocantérea - Tibial lateral','Longitud trochanterion-tibiale laterale','anthropometric_length','longitudes','cm',array['trochanterion-tibiale laterale']::text[],1050),
  ('tibiale_laterale_height','Tibial lateral','Tibial lateral','Altura tibiale laterale','anthropometric_length','longitudes','cm',array['altura tibiale laterale']::text[],1060),
  ('tibiale_mediale_sphyrion_tibiale_length','Tibial medial - Maleolar medial','Tibial medial - Maleolar medial','Longitud tibiale mediale-sphyrion tibiale','anthropometric_length','longitudes','cm',array['tibiale mediale-sphyrion tibiale']::text[],1070),
  ('arm_span','Envergadura de brazos','Envergadura de brazos','Envergadura de brazos','anthropometric_length','longitudes','cm',array['envergadura','alcance de brazos']::text[],1080),
  ('body_fat_percentage_device','Grasa (%)','Grasa (%)','Porcentaje de grasa reportado por dispositivo','bioimpedance','composicion_general','%',array['grasa corporal','% grasa']::text[],1200),
  ('fat_mass_device','Grasa','Grasa','Masa grasa reportada por dispositivo','bioimpedance','composicion_general','kg',array['masa grasa']::text[],1210),
  ('fat_free_mass_device','Masa magra','Masa magra','Masa libre de grasa reportada por dispositivo','bioimpedance','composicion_general','kg',array['masa libre de grasa','FFM']::text[],1220),
  ('muscle_mass_device','Masa muscular','Masa muscular','Masa muscular reportada por dispositivo','bioimpedance','composicion_general','kg',array[]::text[],1230),
  ('skeletal_muscle_mass_device','Masa músculo esquelética','Masa músculo esquelética','Masa muscular esquelética reportada por dispositivo','bioimpedance','composicion_general','kg',array['masa muscular esquelética','SMM']::text[],1240),
  ('body_water_percentage_device','Agua (%)','Agua (%)','Porcentaje de agua reportado por dispositivo','bioimpedance','composicion_general','%',array['porcentaje de agua','agua corporal']::text[],1250),
  ('visceral_fat_device','Grasa visceral puntaje','Grasa visceral puntaje','Puntaje de grasa visceral reportado por dispositivo','bioimpedance','composicion_general','puntaje',array['grasa visceral','nivel de grasa visceral']::text[],1260),
  ('metabolic_age_device','Edad metabólica','Edad metabólica','Edad metabólica reportada por dispositivo','bioimpedance','composicion_general','años',array[]::text[],1270),
  ('phase_angle_device','Ángulo de fase','Ángulo de fase','Ángulo de fase reportado por dispositivo','bioimpedance','composicion_general','°',array[]::text[],1280),
  ('total_body_water_device','Agua corporal total','Agua corporal total','Agua corporal total reportada por dispositivo','bioimpedance','otros_dispositivo','L',array['TBW']::text[],1290),
  ('iliac_crest_skinfold','Cresta ilíaca','Cresta ilíaca','Pliegue en cresta ilíaca; se conserva como sitio distinto.','skinfold','pliegues_cutaneos','mm',array['iliac crest']::text[],650)
) as v(code,name,display_name,clinical_name,category,subcategory,unit,synonyms,display_order)
where public.measurement_types.code = v.code and public.measurement_types.created_by is null;

insert into public.measurement_types (
  id, code, name, category, subcategory, unit, data_type, min_value, max_value,
  decimal_places, description, display_name, clinical_name, synonyms, display_order, source_kind
) values
  ('bmi_measured','bmi_measured','IMC medido','general','generales','kg/m²','number',0.001,200,1,'IMC registrado directamente; no sustituye el IMC calculado por Nuthrick.','IMC medido','Índice de masa corporal registrado directamente',array['índice de masa corporal medido'],30,'direct'),
  ('left_handgrip_strength','left_handgrip_strength','Fuerza de agarre brazo izquierdo','general','generales','kg','number',0,200,1,'Fuerza de agarre registrada en el brazo izquierdo.','Fuerza de agarre brazo izquierdo','Fuerza de agarre brazo izquierdo',array['dinamometría izquierda'],40,'direct'),
  ('right_handgrip_strength','right_handgrip_strength','Fuerza de agarre brazo derecho','general','generales','kg','number',0,200,1,'Fuerza de agarre registrada en el brazo derecho.','Fuerza de agarre brazo derecho','Fuerza de agarre brazo derecho',array['dinamometría derecha'],45,'direct'),
  ('insulin_recorded','insulin_recorded','Insulina','general','generales','µUI/mL','number',0,100000,2,'Insulina registrada manualmente; conserva un origen distinto de un resultado de laboratorio.','Insulina','Insulina registrada manualmente',array['insulina manual'],120,'direct'),
  ('urine_volume_24h','urine_volume_24h','Volumen urinario de 24 h','general','generales','mL/24 h','number',0,20000,0,'Volumen urinario total registrado durante 24 horas.','Volumen urinario de 24 h','Volumen urinario de 24 horas',array['diuresis 24 h'],130,'direct'),
  ('respiratory_rate','respiratory_rate','Respiraciones por minuto','general','generales','rpm','number',0,200,0,'Frecuencia respiratoria registrada directamente.','Respiraciones por minuto','Frecuencia respiratoria',array['frecuencia respiratoria'],140,'direct'),
  ('oral_temperature','oral_temperature','Bucal','clinical','temperatura','°C','number',20,50,1,'Temperatura tomada por vía bucal.','Bucal','Temperatura bucal',array['temperatura oral'],210,'direct'),
  ('axillary_temperature','axillary_temperature','Axilar','clinical','temperatura','°C','number',20,50,1,'Temperatura tomada por vía axilar.','Axilar','Temperatura axilar',array[]::text[],220,'direct'),
  ('inguinal_temperature','inguinal_temperature','Inguinal','clinical','temperatura','°C','number',20,50,1,'Temperatura tomada por vía inguinal.','Inguinal','Temperatura inguinal',array[]::text[],230,'direct'),
  ('rectal_temperature','rectal_temperature','Anal','clinical','temperatura','°C','number',20,50,1,'Temperatura tomada por vía anal.','Anal','Temperatura anal',array['temperatura rectal'],240,'direct'),
  ('carotid_pulse','carotid_pulse','Carotídeo','clinical','pulso','lpm','number',0,300,0,'Pulso registrado en sitio carotídeo.','Carotídeo','Pulso carotídeo',array[]::text[],310,'direct'),
  ('radial_pulse','radial_pulse','Radial','clinical','pulso','lpm','number',0,300,0,'Pulso registrado en sitio radial.','Radial','Pulso radial',array[]::text[],320,'direct'),
  ('axillary_pulse','axillary_pulse','Axilar','clinical','pulso','lpm','number',0,300,0,'Pulso registrado en sitio axilar.','Axilar','Pulso axilar',array[]::text[],330,'direct'),
  ('brachial_pulse','brachial_pulse','Braquial','clinical','pulso','lpm','number',0,300,0,'Pulso registrado en sitio braquial.','Braquial','Pulso braquial',array[]::text[],340,'direct'),
  ('femoral_pulse','femoral_pulse','Femoral','clinical','pulso','lpm','number',0,300,0,'Pulso registrado en sitio femoral.','Femoral','Pulso femoral',array[]::text[],350,'direct'),
  ('popliteal_pulse','popliteal_pulse','Poplíteo','clinical','pulso','lpm','number',0,300,0,'Pulso registrado en sitio poplíteo.','Poplíteo','Pulso poplíteo',array[]::text[],360,'direct'),
  ('dorsalis_pedis_pulse','dorsalis_pedis_pulse','Pedio','clinical','pulso','lpm','number',0,300,0,'Pulso registrado en sitio pedio.','Pedio','Pulso pedio',array['dorsal del pie'],370,'direct'),
  ('posterior_tibial_pulse','posterior_tibial_pulse','Tibial posterior','clinical','pulso','lpm','number',0,300,0,'Pulso registrado en sitio tibial posterior.','Tibial posterior','Pulso tibial posterior',array[]::text[],380,'direct'),
  ('skinfold_sum_recorded','skinfold_sum_recorded','Sumatoria','skinfold','pliegues_cutaneos','mm','number',0,2000,1,'Sumatoria registrada manualmente por el profesional; no sustituye ni calcula los pliegues individuales.','Sumatoria','Sumatoria de pliegues registrada manualmente',array['suma de pliegues'],640,'direct'),
  ('mesosternal_circumference','mesosternal_circumference','Mesoesternal','circumference','circunferencias','cm','number',0.001,300,1,'Circunferencia registrada en el sitio mesoesternal.','Mesoesternal','Circunferencia mesoesternal',array[]::text[],740,'direct'),
  ('umbilical_circumference','umbilical_circumference','Umbilical','circumference','circunferencias','cm','number',0.001,400,1,'Circunferencia registrada a nivel umbilical.','Umbilical','Circunferencia umbilical',array[]::text[],790,'direct'),
  ('foot_breadth','foot_breadth','Pie','bone_breadth','diametros','cm','number',0.001,100,2,'Diámetro de pie registrado directamente.','Pie','Diámetro de pie',array['ancho de pie'],920,'direct'),
  ('transverse_foot_breadth','transverse_foot_breadth','Transverso del pie','bone_breadth','diametros','cm','number',0.001,100,2,'Diámetro transverso del pie.','Transverso del pie','Diámetro transverso del pie',array[]::text[],930,'direct'),
  ('hand_breadth','hand_breadth','Mano','bone_breadth','diametros','cm','number',0.001,100,2,'Diámetro de mano registrado directamente.','Mano','Diámetro de mano',array['ancho de mano'],940,'direct'),
  ('transverse_hand_breadth','transverse_hand_breadth','Transverso de la mano','bone_breadth','diametros','cm','number',0.001,100,2,'Diámetro transverso de la mano.','Transverso de la mano','Diámetro transverso de la mano',array[]::text[],950,'direct')
on conflict (id) do update set
  name = excluded.name, category = excluded.category, subcategory = excluded.subcategory,
  unit = excluded.unit, data_type = excluded.data_type, min_value = excluded.min_value,
  max_value = excluded.max_value, decimal_places = excluded.decimal_places,
  description = excluded.description, display_name = excluded.display_name,
  clinical_name = excluded.clinical_name, synonyms = excluded.synonyms,
  display_order = excluded.display_order, source_kind = excluded.source_kind, updated_at = now()
where public.measurement_types.created_by is null;

-- Restore the already validated calculation-contract keys. Measurement codes are
-- unchanged; this only reconciles the contract keys with the pure math layer.
update public.calculation_definitions as c
set definition = jsonb_set(c.definition, '{inputs}', normalized.inputs), updated_at = now()
from (
  select code, jsonb_agg(
    case element->>'key'
      when 'supraspinale' then jsonb_set(element, '{key}', '"supraespinale"'::jsonb)
      when 'humerus' then jsonb_set(element, '{key}', '"humerus_breadth"'::jsonb)
      when 'femur' then jsonb_set(element, '{key}', '"femur_breadth"'::jsonb)
      when 'calf_girth' then jsonb_set(element, '{key}', '"calf"'::jsonb)
      else element
    end order by ordinal
  ) as inputs
  from public.calculation_definitions,
    jsonb_array_elements(definition->'inputs') with ordinality as entries(element, ordinal)
  where code in ('somatotype_endomorphy', 'somatotype_mesomorphy')
  group by code
) as normalized
where c.code = normalized.code;

do $$
begin
  if exists (
    select 1 from public.calculation_definitions
    where code in ('somatotype_endomorphy', 'somatotype_mesomorphy')
      and definition::text ~ '"(supraspinale|humerus|femur|calf_girth)"'
  ) then
    raise exception 'Somatotype contract keys were not reconciled';
  end if;
end;
$$;

-- Device-reported values remain inputs, not Nuthrick calculation results. New
-- concepts are explicit so absolute values and percentages never share an ID.
update public.measurement_types
set name = v.name, display_name = v.name, clinical_name = v.clinical_name,
    subcategory = 'segmental', synonyms = v.synonyms, display_order = v.display_order,
    updated_at = now()
from (values
  ('left_arm_fat_mass_device','Grasa en brazo izquierdo','Masa grasa segmental de brazo izquierdo',array['grasa brazo izquierdo']::text[],1400),
  ('right_arm_fat_mass_device','Grasa en brazo derecho','Masa grasa segmental de brazo derecho',array['grasa brazo derecho']::text[],1410),
  ('left_leg_fat_mass_device','Grasa en pierna izquierda','Masa grasa segmental de pierna izquierda',array['grasa pierna izquierda']::text[],1420),
  ('right_leg_fat_mass_device','Grasa en pierna derecha','Masa grasa segmental de pierna derecha',array['grasa pierna derecha']::text[],1430),
  ('trunk_fat_mass_device','Grasa en tronco','Masa grasa segmental de tronco total',array['grasa tronco']::text[],1440),
  ('left_arm_fat_percentage_device','Grasa en brazo izquierdo (%)','Porcentaje de grasa segmental de brazo izquierdo',array[]::text[],1450),
  ('right_arm_fat_percentage_device','Grasa en brazo derecho (%)','Porcentaje de grasa segmental de brazo derecho',array[]::text[],1460),
  ('left_leg_fat_percentage_device','Grasa en pierna izquierda (%)','Porcentaje de grasa segmental de pierna izquierda',array[]::text[],1470),
  ('right_leg_fat_percentage_device','Grasa en pierna derecha (%)','Porcentaje de grasa segmental de pierna derecha',array[]::text[],1480),
  ('trunk_fat_percentage_device','Grasa en tronco (%)','Porcentaje de grasa segmental de tronco total',array[]::text[],1490),
  ('left_arm_muscle_mass_device','Masa muscular en brazo izquierdo','Masa muscular segmental de brazo izquierdo',array[]::text[],1500),
  ('right_arm_muscle_mass_device','Masa muscular en brazo derecho','Masa muscular segmental de brazo derecho',array[]::text[],1510),
  ('left_leg_muscle_mass_device','Masa muscular en pierna izquierda','Masa muscular segmental de pierna izquierda',array[]::text[],1520),
  ('right_leg_muscle_mass_device','Masa muscular en pierna derecha','Masa muscular segmental de pierna derecha',array[]::text[],1530),
  ('trunk_muscle_mass_device','Masa muscular en tronco','Masa muscular segmental de tronco total',array[]::text[],1540)
) as v(code,name,clinical_name,synonyms,display_order)
where public.measurement_types.code = v.code and public.measurement_types.created_by is null;

insert into public.measurement_types (
  id, code, name, category, subcategory, unit, data_type, min_value, max_value,
  decimal_places, description, display_name, clinical_name, synonyms, display_order, source_kind
) values
  ('subcutaneous_fat_device','subcutaneous_fat_device','Grasa subcutánea','bioimpedance','composicion_general',null,'number',0,1000,2,'Grasa subcutánea reportada por dispositivo; la unidad depende del equipo.','Grasa subcutánea','Grasa subcutánea reportada por dispositivo',array[]::text[],1300,'device_reported'),
  ('subcutaneous_fat_percentage_device','subcutaneous_fat_percentage_device','Grasa subcutánea (%)','bioimpedance','composicion_general','%','percentage',0,100,1,'Porcentaje de grasa subcutánea reportado por dispositivo.','Grasa subcutánea (%)','Porcentaje de grasa subcutánea reportado por dispositivo',array[]::text[],1310,'device_reported'),
  ('visceral_fat_mass_device','visceral_fat_mass_device','Grasa visceral','bioimpedance','composicion_general',null,'number',0,1000,2,'Grasa visceral absoluta reportada por dispositivo; la unidad depende del equipo.','Grasa visceral','Grasa visceral absoluta reportada por dispositivo',array[]::text[],1320,'device_reported'),
  ('visceral_fat_percentage_device','visceral_fat_percentage_device','Grasa visceral (%)','bioimpedance','composicion_general','%','percentage',0,100,1,'Porcentaje de grasa visceral reportado por dispositivo.','Grasa visceral (%)','Porcentaje de grasa visceral reportado por dispositivo',array[]::text[],1330,'device_reported'),
  ('device_score','device_score','Puntaje','bioimpedance','composicion_general','puntaje','number',0,100000,1,'Puntaje reportado por un dispositivo, sin interpretación automática.','Puntaje','Puntaje reportado por dispositivo',array['score'],1340,'device_reported'),
  ('lean_mass_percentage_device','lean_mass_percentage_device','Masa magra (%)','bioimpedance','composicion_general','%','percentage',0,100,1,'Porcentaje de masa magra reportado por dispositivo.','Masa magra (%)','Porcentaje de masa magra reportado por dispositivo',array[]::text[],1350,'device_reported'),
  ('muscle_mass_percentage_device','muscle_mass_percentage_device','Masa muscular (%)','bioimpedance','composicion_general','%','percentage',0,100,1,'Porcentaje de masa muscular reportado por dispositivo.','Masa muscular (%)','Porcentaje de masa muscular reportado por dispositivo',array[]::text[],1360,'device_reported'),
  ('skeletal_muscle_percentage_device','skeletal_muscle_percentage_device','Masa músculo esquelética (%)','bioimpedance','composicion_general','%','percentage',0,100,1,'Porcentaje de masa músculo esquelética reportado por dispositivo.','Masa músculo esquelética (%)','Porcentaje de masa músculo esquelética reportado por dispositivo',array[]::text[],1370,'device_reported'),
  ('left_arm_muscle_percentage_device','left_arm_muscle_percentage_device','Masa muscular en brazo izquierdo (%)','bioimpedance','segmental','%','percentage',0,100,1,'Porcentaje de masa muscular de brazo izquierdo reportado por dispositivo.','Masa muscular en brazo izquierdo (%)','Porcentaje de masa muscular segmental de brazo izquierdo',array[]::text[],1550,'device_reported'),
  ('right_arm_muscle_percentage_device','right_arm_muscle_percentage_device','Masa muscular en brazo derecho (%)','bioimpedance','segmental','%','percentage',0,100,1,'Porcentaje de masa muscular de brazo derecho reportado por dispositivo.','Masa muscular en brazo derecho (%)','Porcentaje de masa muscular segmental de brazo derecho',array[]::text[],1560,'device_reported'),
  ('left_leg_muscle_percentage_device','left_leg_muscle_percentage_device','Masa muscular en pierna izquierda (%)','bioimpedance','segmental','%','percentage',0,100,1,'Porcentaje de masa muscular de pierna izquierda reportado por dispositivo.','Masa muscular en pierna izquierda (%)','Porcentaje de masa muscular segmental de pierna izquierda',array[]::text[],1570,'device_reported'),
  ('right_leg_muscle_percentage_device','right_leg_muscle_percentage_device','Masa muscular en pierna derecha (%)','bioimpedance','segmental','%','percentage',0,100,1,'Porcentaje de masa muscular de pierna derecha reportado por dispositivo.','Masa muscular en pierna derecha (%)','Porcentaje de masa muscular segmental de pierna derecha',array[]::text[],1580,'device_reported'),
  ('trunk_muscle_percentage_device','trunk_muscle_percentage_device','Masa muscular en tronco (%)','bioimpedance','segmental','%','percentage',0,100,1,'Porcentaje de masa muscular de tronco total reportado por dispositivo.','Masa muscular en tronco (%)','Porcentaje de masa muscular segmental de tronco total',array[]::text[],1590,'device_reported'),
  ('upper_trunk_fat_mass_device','upper_trunk_fat_mass_device','Grasa en tronco superior','bioimpedance','segmental','kg','number',0,1000,2,'Masa grasa de tronco superior reportada por dispositivo.','Grasa en tronco superior','Masa grasa segmental de tronco superior',array[]::text[],1600,'device_reported'),
  ('upper_trunk_fat_percentage_device','upper_trunk_fat_percentage_device','Grasa en tronco superior (%)','bioimpedance','segmental','%','percentage',0,100,1,'Porcentaje de grasa de tronco superior reportado por dispositivo.','Grasa en tronco superior (%)','Porcentaje de grasa segmental de tronco superior',array[]::text[],1610,'device_reported'),
  ('upper_trunk_muscle_mass_device','upper_trunk_muscle_mass_device','Masa muscular en tronco superior','bioimpedance','segmental','kg','number',0,1000,2,'Masa muscular de tronco superior reportada por dispositivo.','Masa muscular en tronco superior','Masa muscular segmental de tronco superior',array[]::text[],1620,'device_reported'),
  ('upper_trunk_muscle_percentage_device','upper_trunk_muscle_percentage_device','Masa muscular en tronco superior (%)','bioimpedance','segmental','%','percentage',0,100,1,'Porcentaje de masa muscular de tronco superior reportado por dispositivo.','Masa muscular en tronco superior (%)','Porcentaje de masa muscular segmental de tronco superior',array[]::text[],1630,'device_reported'),
  ('lower_trunk_fat_mass_device','lower_trunk_fat_mass_device','Grasa en tronco inferior','bioimpedance','segmental','kg','number',0,1000,2,'Masa grasa de tronco inferior reportada por dispositivo.','Grasa en tronco inferior','Masa grasa segmental de tronco inferior',array[]::text[],1640,'device_reported'),
  ('lower_trunk_fat_percentage_device','lower_trunk_fat_percentage_device','Grasa en tronco inferior (%)','bioimpedance','segmental','%','percentage',0,100,1,'Porcentaje de grasa de tronco inferior reportado por dispositivo.','Grasa en tronco inferior (%)','Porcentaje de grasa segmental de tronco inferior',array[]::text[],1650,'device_reported'),
  ('lower_trunk_muscle_mass_device','lower_trunk_muscle_mass_device','Masa muscular en tronco inferior','bioimpedance','segmental','kg','number',0,1000,2,'Masa muscular de tronco inferior reportada por dispositivo.','Masa muscular en tronco inferior','Masa muscular segmental de tronco inferior',array[]::text[],1660,'device_reported'),
  ('lower_trunk_muscle_percentage_device','lower_trunk_muscle_percentage_device','Masa muscular en tronco inferior (%)','bioimpedance','segmental','%','percentage',0,100,1,'Porcentaje de masa muscular de tronco inferior reportado por dispositivo.','Masa muscular en tronco inferior (%)','Porcentaje de masa muscular segmental de tronco inferior',array[]::text[],1670,'device_reported')
on conflict (id) do update set
  name = excluded.name, category = excluded.category, subcategory = excluded.subcategory,
  unit = excluded.unit, data_type = excluded.data_type, min_value = excluded.min_value,
  max_value = excluded.max_value, decimal_places = excluded.decimal_places,
  description = excluded.description, display_name = excluded.display_name,
  clinical_name = excluded.clinical_name, synonyms = excluded.synonyms,
  display_order = excluded.display_order, source_kind = excluded.source_kind, updated_at = now()
where public.measurement_types.created_by is null;
