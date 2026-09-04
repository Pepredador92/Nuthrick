-- Additional device-reported segmental measurements remain raw values. They
-- are never relabelled as calculations performed by Nuthrick.
insert into public.measurement_types
  (id,code,name,category,unit,data_type,min_value,max_value,decimal_places,description,is_active)
values
  ('right_arm_fat_percentage_device','right_arm_fat_percentage_device','Grasa segmental · brazo derecho','bioimpedance','%','number',0,100,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
  ('left_arm_fat_percentage_device','left_arm_fat_percentage_device','Grasa segmental · brazo izquierdo','bioimpedance','%','number',0,100,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
  ('trunk_fat_percentage_device','trunk_fat_percentage_device','Grasa segmental · tronco','bioimpedance','%','number',0,100,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
  ('right_leg_fat_percentage_device','right_leg_fat_percentage_device','Grasa segmental · pierna derecha','bioimpedance','%','number',0,100,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
  ('left_leg_fat_percentage_device','left_leg_fat_percentage_device','Grasa segmental · pierna izquierda','bioimpedance','%','number',0,100,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
  ('right_arm_lean_mass_device','right_arm_lean_mass_device','Masa magra segmental · brazo derecho','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
  ('left_arm_lean_mass_device','left_arm_lean_mass_device','Masa magra segmental · brazo izquierdo','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
  ('trunk_lean_mass_device','trunk_lean_mass_device','Masa magra segmental · tronco','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
  ('right_leg_lean_mass_device','right_leg_lean_mass_device','Masa magra segmental · pierna derecha','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
  ('left_leg_lean_mass_device','left_leg_lean_mass_device','Masa magra segmental · pierna izquierda','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true)
on conflict (id) do update set
  name=excluded.name, category=excluded.category, unit=excluded.unit,
  min_value=excluded.min_value, max_value=excluded.max_value,
  decimal_places=excluded.decimal_places, description=excluded.description,
  is_active=excluded.is_active, updated_at=now();

insert into public.calculation_definitions
  (code,name,category,method_version,status,definition)
values
  ('lean_1996','Grasa corporal · Lean','body_fat','2.0.0','implemented',
   '{"code":"lean_1996","name":"Grasa corporal · Lean","category":"body_fat","requiredInputs":["waist_circumference","triceps_skinfold"],"dependencies":[],"calculation":"Hombres: 0.353×cintura + 0.756×tríceps + 0.235×edad − 26.4. Mujeres: 0.232×cintura + 0.657×tríceps + 0.215×edad − 5.5.","unit":"%","decimalPlaces":1,"description":"Estima porcentaje de grasa a partir de cintura, pliegue tricipital y edad.","referenceUrls":["https://pubmed.ncbi.nlm.nih.gov/8604668/"],"limitations":"Derivada en adultos de 18 a 65 años. Requiere la variable de sexo de la ecuación; depende de la población y de la técnica de medición.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":["male","female"],"applicableAgeRange":[18,65]}'::jsonb),
  ('heath_carter_endomorphy','Endomorfia · Heath-Carter','somatotype','2.0.0','implemented',
   '{"code":"heath_carter_endomorphy","name":"Endomorfia · Heath-Carter","category":"somatotype","requiredInputs":["triceps_skinfold","subscapular_skinfold","supraespinale_skinfold","height"],"dependencies":[],"calculation":"X=(tríceps+subescapular+supraespinal)×170.18/talla; −0.7182+0.1451X−0.00068X²+0.0000014X³","unit":"unidad","decimalPlaces":1,"description":"Componente de adiposidad relativa del somatotipo antropométrico.","referenceUrls":["https://pubmed.ncbi.nlm.nih.gov/6049820/"],"limitations":"Depende de mediciones antropométricas estandarizadas. No es una clasificación clínica.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
  ('heath_carter_mesomorphy','Mesomorfia · Heath-Carter','somatotype','2.0.0','implemented',
   '{"code":"heath_carter_mesomorphy","name":"Mesomorfia · Heath-Carter","category":"somatotype","requiredInputs":["humerus_breadth","femur_breadth","flexed_arm_circumference","triceps_skinfold","calf_circumference","calf_skinfold","height"],"dependencies":[],"calculation":"0.858×húmero+0.601×fémur+0.188×brazo corregido+0.161×pantorrilla corregida−0.131×talla+4.5","unit":"unidad","decimalPlaces":1,"description":"Componente de robustez músculo-esquelética relativa del somatotipo.","referenceUrls":["https://pubmed.ncbi.nlm.nih.gov/6049820/"],"limitations":"Las circunferencias se corrigen con los pliegues correspondientes. No equivale a masa muscular.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
  ('heath_carter_ectomorphy','Ectomorfia · Heath-Carter','somatotype','2.0.0','implemented',
   '{"code":"heath_carter_ectomorphy","name":"Ectomorfia · Heath-Carter","category":"somatotype","requiredInputs":["height","weight"],"dependencies":[],"calculation":"Según índice ponderal HWR=talla/∛peso: 0.732HWR−28.58; 0.463HWR−17.63; o 0.1.","unit":"unidad","decimalPlaces":1,"description":"Componente de linealidad relativa del somatotipo.","referenceUrls":["https://pubmed.ncbi.nlm.nih.gov/6049820/"],"limitations":"No es una clasificación clínica y debe interpretarse junto con los otros dos componentes.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
  ('somatochart_x','Somatocarta · X','somatotype','2.0.0','implemented',
   '{"code":"somatochart_x","name":"Somatocarta · X","category":"somatotype","requiredInputs":[],"dependencies":["heath_carter_ectomorphy","heath_carter_endomorphy"],"calculation":"ectomorfia − endomorfia","unit":"unidad","decimalPlaces":1,"description":"Coordenada horizontal para representar el somatotipo.","referenceUrls":["https://pubmed.ncbi.nlm.nih.gov/6049820/"],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
  ('somatochart_y','Somatocarta · Y','somatotype','2.0.0','implemented',
   '{"code":"somatochart_y","name":"Somatocarta · Y","category":"somatotype","requiredInputs":[],"dependencies":["heath_carter_mesomorphy","heath_carter_endomorphy","heath_carter_ectomorphy"],"calculation":"2×mesomorfia − (endomorfia + ectomorfia)","unit":"unidad","decimalPlaces":1,"description":"Coordenada vertical para representar el somatotipo.","referenceUrls":["https://pubmed.ncbi.nlm.nih.gov/6049820/"],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
  ('ledesma','Grasa corporal · Ledesma','body_composition','2.0.0','not_implemented',
   '{"code":"ledesma","name":"Grasa corporal · Ledesma","category":"body_composition","requiredInputs":[],"dependencies":[],"calculation":"","unit":"unidad","decimalPlaces":2,"description":"Preparado para incorporar una fórmula y aplicabilidad validadas.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"not_implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb)
on conflict (code) do update set
  name=excluded.name, category=excluded.category,
  method_version=excluded.method_version, status=excluded.status,
  definition=excluded.definition, updated_at=now();

delete from public.calculation_definitions where code='heath_carter' and status='not_implemented';
