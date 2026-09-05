-- Normalize every system row into the three visible glossary groups; legacy
-- concepts remain available under an explicit preservation subcategory.
update public.measurement_types
set subcategory = case
  when category = 'skinfold' then 'pliegues_cutaneos'
  when category = 'circumference' then 'circunferencias'
  when category in ('bone_breadth', 'anthropometric_length') then case
    when category = 'bone_breadth' then 'diametros'
    else 'longitudes'
  end
  when category = 'general' and subcategory <> 'generales' then 'otros_registrados'
  when category = 'clinical' and subcategory not in ('generales', 'temperatura', 'pulso') then 'otros_registrados'
  when category = 'bioimpedance' and subcategory not in ('composicion_general', 'segmental') then 'otros_dispositivo'
  else subcategory
end,
updated_at = now()
where created_by is null and is_active and category <> 'laboratory';

do $$
begin
  if exists (
    select 1 from public.measurement_types
    where created_by is null and is_active
      and category in ('skinfold','circumference','bone_breadth','anthropometric_length')
      and subcategory not in ('pliegues_cutaneos','circunferencias','diametros','longitudes')
  ) then
    raise exception 'An anthropometry measurement was left outside its visible glossary subcategory';
  end if;
end;
$$;
