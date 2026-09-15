create or replace function private.guard_diet_library() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.content->>'schema_version' is distinct from '1'
    or new.content - array['schema_version','reference_targets','exchange_groups','distribution','menu','estimation'] <> '{}'::jsonb
    or not (new.content ?& array['schema_version','reference_targets','exchange_groups','distribution','menu'])
    or jsonb_typeof(new.content->'distribution') <> 'object' or jsonb_typeof(new.content->'menu') <> 'object'
    or jsonb_typeof(new.content->'exchange_groups') <> 'array'
    or private.library_has_clinical_fields(new.content) then
    raise exception 'La biblioteca solo admite contenido reutilizable sin campos clínicos' using errcode='23514';
  end if;
  if new.content ? 'estimation' then
    if jsonb_typeof(new.content->'estimation') is distinct from 'object'
      or (new.content->'estimation') - array['method','assumptions','sources'] <> '{}'::jsonb
      or jsonb_typeof(new.content#>'{estimation,method}') is distinct from 'string'
      or jsonb_typeof(new.content#>'{estimation,assumptions}') is distinct from 'array'
      or jsonb_typeof(new.content#>'{estimation,sources}') is distinct from 'array' then
      raise exception 'Procedencia de estimación no válida' using errcode='23514';
    end if;
    if exists(select 1 from jsonb_array_elements((new.content#>'{estimation,assumptions}') || (new.content#>'{estimation,sources}')) v where jsonb_typeof(v) <> 'string') then
      raise exception 'Los supuestos y fuentes deben ser texto' using errcode='23514';
    end if;
  end if;
  if tg_op = 'UPDATE' then new.revision := old.revision + 1; end if;
  new.updated_at := now();
  return new;
end $$;
