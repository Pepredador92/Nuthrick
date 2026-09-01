-- Production-safe reference catalogs. No Auth users or professional data.
insert into public.conditions (slug, name) values
  ('colitis', 'Colitis'),
  ('colon-irritable', 'Colon irritable'),
  ('delgadez', 'Delgadez'),
  ('desnutricion', 'Desnutrición'),
  ('diabetes', 'Diabetes'),
  ('diabetes-gestacional', 'Diabetes gestacional'),
  ('diabetes-tipo-2', 'Diabetes tipo 2'),
  ('dislipidemia', 'Dislipidemia'),
  ('enfermedades-renales', 'Enfermedades renales'),
  ('estrenimiento', 'Estreñimiento'),
  ('falla-renal-cronica', 'Falla renal crónica'),
  ('gastritis', 'Gastritis'),
  ('gastritis-por-estres', 'Gastritis por estrés'),
  ('gastroenteritis', 'Gastroenteritis'),
  ('gastroenteritis-bacteriana', 'Gastroenteritis bacteriana'),
  ('hipercolesterolemia', 'Hipercolesterolemia'),
  ('hipertension', 'Hipertensión'),
  ('higado-graso', 'Hígado graso'),
  ('insuficiencia-aguda-del-rinon', 'Insuficiencia aguda del riñón'),
  ('intolerancia-a-la-lactosa', 'Intolerancia a la lactosa'),
  ('malabsorcion', 'Malabsorción'),
  ('obesidad', 'Obesidad'),
  ('nutricion-inadecuada', 'Nutrición inadecuada'),
  ('sobrepeso', 'Sobrepeso')
on conflict (slug) do update set name = excluded.name, is_active = true;

insert into public.patient_populations (slug, name) values
  ('mujeres', 'Mujeres'),
  ('hombres', 'Hombres'),
  ('ninos', 'Niños'),
  ('adolescentes', 'Adolescentes'),
  ('adultos-mayores', 'Adultos mayores')
on conflict (slug) do update set name = excluded.name, is_active = true;
