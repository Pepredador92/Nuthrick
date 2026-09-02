insert into public.conditions (slug, name, is_active)
values
  ('alimentacion-intuitiva', 'Alimentación intuitiva', true),
  ('alergias-alimentarias', 'Alergias alimentarias', true),
  ('anemia', 'Anemia', true),
  ('enfermedad-celiaca', 'Enfermedad celíaca', true),
  ('enfermedad-de-crohn', 'Enfermedad de Crohn', true),
  ('enfermedad-inflamatoria-intestinal', 'Enfermedad inflamatoria intestinal', true),
  ('gota', 'Gota', true),
  ('hiperuricemia', 'Hiperuricemia', true),
  ('lactancia', 'Lactancia', true),
  ('menopausia', 'Menopausia', true),
  ('nutricion-infantil', 'Nutrición infantil', true),
  ('nutricion-deportiva', 'Nutrición deportiva', true),
  ('osteoporosis', 'Osteoporosis', true),
  ('reflujo-gastroesofagico', 'Reflujo gastroesofágico', true),
  ('sarcopenia', 'Sarcopenia', true),
  ('sindrome-de-ovario-poliquistico', 'Síndrome de ovario poliquístico', true),
  ('trastornos-de-la-conducta-alimentaria', 'Trastornos de la conducta alimentaria', true),
  ('vegetarianismo', 'Vegetarianismo', true),
  ('veganismo', 'Veganismo', true),
  ('embarazo', 'Embarazo', true)
on conflict (slug) do update
set name = excluded.name,
    is_active = excluded.is_active;
