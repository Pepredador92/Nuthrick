alter table public.professional_contacts
  drop constraint professional_contacts_country_code_check,
  drop constraint professional_contacts_check;

alter table public.professional_contacts
  add constraint professional_contacts_country_code_check
    check (country_code is null or country_code ~ '^\+[1-9][0-9]{0,3}$'),
  add constraint professional_contacts_check
    check (
      (contact_type = 'phone' and country_code is not null and contact_value ~ '^[0-9]{7,15}$')
      or (contact_type = 'email' and country_code is null and contact_value ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    );
