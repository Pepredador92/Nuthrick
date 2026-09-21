-- Manual single-use access codes do not require an email address.
-- Email challenges still require recipient_email in patient_portal.
create or replace function private.validate_patient_fields()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  new.full_name := btrim(new.full_name);
  if new.birth_date is not null and new.birth_date > current_date then
    raise exception 'La fecha de nacimiento no puede estar en el futuro' using errcode = '23514';
  end if;
  if new.phone is not null and new.country_code is null then
    raise exception 'El teléfono requiere lada de país' using errcode = '23514';
  end if;
  return new;
end;
$$;
