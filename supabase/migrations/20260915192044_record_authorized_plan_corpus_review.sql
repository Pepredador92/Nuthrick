-- The culinary-reference documents were reviewed in an authorized private session.
-- This records only their use as a non-identifying editorial reference. It does
-- not copy patient, contact, clinical, treatment, supplement, or stage data.
update public.recipes
set
  source_reference = 'Corpus culinario autorizado revisado el 15/09/2026. Se extrajo únicamente el patrón de preparación y acompañamientos; no se conservaron datos personales ni indicaciones clínicas.',
  source_version = '1.1.0'
where source = 'NUTHRICK_EDITORIAL_PREPARATIONS'
  and owner_id is null
  and not is_custom;

do $$
begin
  if (
    select count(*)
    from public.recipes
    where source = 'NUTHRICK_EDITORIAL_PREPARATIONS'
      and owner_id is null
      and not is_custom
      and source_reference like 'Corpus culinario autorizado%'
  ) <> 8 then
    raise exception 'Authorized culinary reference provenance was not recorded for all editorial recipes';
  end if;
end $$;
