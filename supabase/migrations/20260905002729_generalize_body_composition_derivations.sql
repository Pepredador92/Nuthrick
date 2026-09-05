-- A derived compartment is an individual method result, not a universal body
-- composition value. The code remains unique per source so all valid methods
-- can coexist in one consultation and survive the result upsert unchanged.

update public.calculation_definitions
set definition = definition || jsonb_build_object(
      'provenance', jsonb_build_object(
        'sourceCalculationCode', 'body_fat_jp7_siri',
        'sourceResultKey', 'body_fat_percentage',
        'preservesMethod', true
      )
    ),
    method_version = '2.1.0-spec',
    updated_at = now()
where code in ('fat_mass_jp7_siri', 'fat_free_mass_jp7_siri');

insert into public.calculation_definitions
  (code, name, category, method_version, status, definition, is_catalog_visible, display_order)
values
  ('fat_mass_jp3_siri', 'Masa grasa', 'compartments', '2.1.0-spec', 'not_implemented',
   $json${
     "catalogVersion":2,"resultKey":"fat_mass","resultName":"Masa grasa","methodName":"Masa grasa · Jackson & Pollock 3 + Siri","method":"Compartimento derivado","variant":"Procedencia JP3 → Siri","summary":"Deriva masa grasa del peso de la consulta y del porcentaje Jackson & Pollock 3 + Siri.","unit":"kg","decimalPlaces":1,
     "inputs":[{"key":"weight","label":"Peso","source":"consultation_measurement","measurementCode":"weight","expectedUnit":"kg"}],"optionalInputs":[],"dependencies":["body_fat_jp3_siri"],"equation":{"expression":"masa_grasa_kg = peso_kg × porcentaje_grasa / 100"},"variants":[],"applicability":{"population":"La misma población para la que resulte aplicable Jackson & Pollock 3 + Siri."},"references":[{"authors":"Siri WE","year":1961,"title":"Body composition from fluid spaces and density: analysis of methods","source":"Techniques for Measuring Body Composition","url":"https://escholarship.org/uc/item/6mh9f4nf","evidence":"original"}],"validationStatus":"validated","validationNote":"Derivada exclusivamente del porcentaje identificado por su dependencia.","methodologicalNotes":["Puede coexistir con masas derivadas de otros porcentajes de grasa."],"provenance":{"sourceCalculationCode":"body_fat_jp3_siri","sourceResultKey":"body_fat_percentage","preservesMethod":true},"limitations":"Hereda los supuestos y límites de Jackson & Pollock 3 + Siri."
   }$json$::jsonb, true, 305),
  ('fat_free_mass_jp3_siri', 'Masa libre de grasa', 'compartments', '2.1.0-spec', 'not_implemented',
   $json${
     "catalogVersion":2,"resultKey":"fat_free_mass","resultName":"Masa libre de grasa","methodName":"Masa libre de grasa · Jackson & Pollock 3 + Siri","method":"Compartimento derivado","variant":"Procedencia JP3 → Siri","summary":"Deriva masa libre de grasa del peso y de la masa grasa proveniente de Jackson & Pollock 3 + Siri.","unit":"kg","decimalPlaces":1,
     "inputs":[{"key":"weight","label":"Peso","source":"consultation_measurement","measurementCode":"weight","expectedUnit":"kg"}],"optionalInputs":[],"dependencies":["fat_mass_jp3_siri"],"equation":{"expression":"masa_libre_grasa_kg = peso_kg − masa_grasa_kg"},"variants":[],"applicability":{"population":"La misma población para la que resulte aplicable Jackson & Pollock 3 + Siri."},"references":[{"authors":"Siri WE","year":1961,"title":"Body composition from fluid spaces and density: analysis of methods","source":"Techniques for Measuring Body Composition","url":"https://escholarship.org/uc/item/6mh9f4nf","evidence":"original"}],"validationStatus":"validated","validationNote":"Derivada de la masa grasa con la misma procedencia metodológica.","methodologicalNotes":["No equivale a masa muscular."],"provenance":{"sourceCalculationCode":"body_fat_jp3_siri","sourceResultKey":"body_fat_percentage","preservesMethod":true},"limitations":"Hereda los supuestos y límites de Jackson & Pollock 3 + Siri."
   }$json$::jsonb, true, 306),
  ('fat_mass_jp7_brozek', 'Masa grasa', 'compartments', '2.1.0-spec', 'not_implemented',
   $json${
     "catalogVersion":2,"resultKey":"fat_mass","resultName":"Masa grasa","methodName":"Masa grasa · Jackson & Pollock 7 + Brozek","method":"Compartimento derivado","variant":"Procedencia JP7 → Brozek","summary":"Deriva masa grasa del peso de la consulta y del porcentaje Jackson & Pollock 7 + Brozek.","unit":"kg","decimalPlaces":1,
     "inputs":[{"key":"weight","label":"Peso","source":"consultation_measurement","measurementCode":"weight","expectedUnit":"kg"}],"optionalInputs":[],"dependencies":["body_fat_jp7_brozek"],"equation":{"expression":"masa_grasa_kg = peso_kg × porcentaje_grasa / 100"},"variants":[],"applicability":{"population":"La misma población para la que resulte aplicable Jackson & Pollock 7 + Brozek."},"references":[{"authors":"Brozek J, Grande F, Anderson JT, Keys A","year":1963,"title":"Densitometric analysis of body composition: revision of some quantitative assumptions","source":"Annals of the New York Academy of Sciences","doi":"10.1111/j.1749-6632.1963.tb17079.x","url":"https://nyaspubs.onlinelibrary.wiley.com/doi/10.1111/j.1749-6632.1963.tb17079.x","evidence":"original"}],"validationStatus":"validated","validationNote":"Derivada exclusivamente del porcentaje identificado por su dependencia.","methodologicalNotes":["No sustituye ni sobrescribe la derivación JP7 + Siri."],"provenance":{"sourceCalculationCode":"body_fat_jp7_brozek","sourceResultKey":"body_fat_percentage","preservesMethod":true},"limitations":"Hereda los supuestos y límites de Jackson & Pollock 7 + Brozek."
   }$json$::jsonb, true, 315),
  ('fat_free_mass_jp7_brozek', 'Masa libre de grasa', 'compartments', '2.1.0-spec', 'not_implemented',
   $json${
     "catalogVersion":2,"resultKey":"fat_free_mass","resultName":"Masa libre de grasa","methodName":"Masa libre de grasa · Jackson & Pollock 7 + Brozek","method":"Compartimento derivado","variant":"Procedencia JP7 → Brozek","summary":"Deriva masa libre de grasa del peso y de la masa grasa proveniente de Jackson & Pollock 7 + Brozek.","unit":"kg","decimalPlaces":1,
     "inputs":[{"key":"weight","label":"Peso","source":"consultation_measurement","measurementCode":"weight","expectedUnit":"kg"}],"optionalInputs":[],"dependencies":["fat_mass_jp7_brozek"],"equation":{"expression":"masa_libre_grasa_kg = peso_kg − masa_grasa_kg"},"variants":[],"applicability":{"population":"La misma población para la que resulte aplicable Jackson & Pollock 7 + Brozek."},"references":[{"authors":"Brozek J, Grande F, Anderson JT, Keys A","year":1963,"title":"Densitometric analysis of body composition: revision of some quantitative assumptions","source":"Annals of the New York Academy of Sciences","doi":"10.1111/j.1749-6632.1963.tb17079.x","url":"https://nyaspubs.onlinelibrary.wiley.com/doi/10.1111/j.1749-6632.1963.tb17079.x","evidence":"original"}],"validationStatus":"validated","validationNote":"Derivada de la masa grasa con la misma procedencia metodológica.","methodologicalNotes":["No equivale a masa muscular."],"provenance":{"sourceCalculationCode":"body_fat_jp7_brozek","sourceResultKey":"body_fat_percentage","preservesMethod":true},"limitations":"Hereda los supuestos y límites de Jackson & Pollock 7 + Brozek."
   }$json$::jsonb, true, 316),
  ('fat_mass_durnin_siri', 'Masa grasa', 'compartments', '2.1.0-spec', 'not_implemented',
   $json${
     "catalogVersion":2,"resultKey":"fat_mass","resultName":"Masa grasa","methodName":"Masa grasa · Durnin & Womersley + Siri","method":"Compartimento derivado","variant":"Procedencia Durnin-Womersley → Siri","summary":"Deriva masa grasa del peso de la consulta y del porcentaje Durnin & Womersley + Siri.","unit":"kg","decimalPlaces":1,
     "inputs":[{"key":"weight","label":"Peso","source":"consultation_measurement","measurementCode":"weight","expectedUnit":"kg"}],"optionalInputs":[],"dependencies":["body_fat_durnin_siri"],"equation":{"expression":"masa_grasa_kg = peso_kg × porcentaje_grasa / 100"},"variants":[],"applicability":{"population":"La misma población para la que resulte aplicable Durnin & Womersley + Siri."},"references":[{"authors":"Siri WE","year":1961,"title":"Body composition from fluid spaces and density: analysis of methods","source":"Techniques for Measuring Body Composition","url":"https://escholarship.org/uc/item/6mh9f4nf","evidence":"original"}],"validationStatus":"validated","validationNote":"Derivada exclusivamente del porcentaje identificado por su dependencia.","methodologicalNotes":["Puede coexistir con masas derivadas de otros porcentajes de grasa."],"provenance":{"sourceCalculationCode":"body_fat_durnin_siri","sourceResultKey":"body_fat_percentage","preservesMethod":true},"limitations":"Hereda los supuestos y límites de Durnin & Womersley + Siri."
   }$json$::jsonb, true, 325),
  ('fat_free_mass_durnin_siri', 'Masa libre de grasa', 'compartments', '2.1.0-spec', 'not_implemented',
   $json${
     "catalogVersion":2,"resultKey":"fat_free_mass","resultName":"Masa libre de grasa","methodName":"Masa libre de grasa · Durnin & Womersley + Siri","method":"Compartimento derivado","variant":"Procedencia Durnin-Womersley → Siri","summary":"Deriva masa libre de grasa del peso y de la masa grasa proveniente de Durnin & Womersley + Siri.","unit":"kg","decimalPlaces":1,
     "inputs":[{"key":"weight","label":"Peso","source":"consultation_measurement","measurementCode":"weight","expectedUnit":"kg"}],"optionalInputs":[],"dependencies":["fat_mass_durnin_siri"],"equation":{"expression":"masa_libre_grasa_kg = peso_kg − masa_grasa_kg"},"variants":[],"applicability":{"population":"La misma población para la que resulte aplicable Durnin & Womersley + Siri."},"references":[{"authors":"Siri WE","year":1961,"title":"Body composition from fluid spaces and density: analysis of methods","source":"Techniques for Measuring Body Composition","url":"https://escholarship.org/uc/item/6mh9f4nf","evidence":"original"}],"validationStatus":"validated","validationNote":"Derivada de la masa grasa con la misma procedencia metodológica.","methodologicalNotes":["No equivale a masa muscular."],"provenance":{"sourceCalculationCode":"body_fat_durnin_siri","sourceResultKey":"body_fat_percentage","preservesMethod":true},"limitations":"Hereda los supuestos y límites de Durnin & Womersley + Siri."
   }$json$::jsonb, true, 326)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  method_version = excluded.method_version,
  status = excluded.status,
  definition = excluded.definition,
  is_catalog_visible = excluded.is_catalog_visible,
  display_order = excluded.display_order,
  updated_at = now();

-- Each validated percentage has exactly one distinct mass pair. The result
-- table's existing uniqueness key includes calculation_code, so pairs from
-- simultaneous body-fat methods cannot overwrite one another.
do $$
declare
  expected_count integer;
  actual_count integer;
begin
  select count(*) * 2 into expected_count
  from public.calculation_definitions
  where is_catalog_visible
    and definition->>'resultKey' = 'body_fat_percentage'
    and definition->>'validationStatus' = 'validated';

  select count(*) into actual_count
  from public.calculation_definitions
  where is_catalog_visible
    and category = 'compartments'
    and definition ? 'provenance'
    and definition->'provenance'->>'sourceResultKey' = 'body_fat_percentage';

  if actual_count <> expected_count then
    raise exception 'Expected % body-composition derivations, found %', expected_count, actual_count;
  end if;
end;
$$;
