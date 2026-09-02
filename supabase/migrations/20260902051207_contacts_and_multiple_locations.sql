create table public.professional_contacts (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  contact_type text not null check (contact_type in ('phone', 'email')),
  label text check (label is null or char_length(label) between 1 and 80),
  country_code text check (country_code is null or country_code ~ '^\\+[1-9][0-9]{0,3}$'),
  contact_value text not null check (char_length(contact_value) between 3 and 160),
  is_whatsapp boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (contact_type = 'phone' and country_code is not null and contact_value ~ '^[0-9]{7,15}$')
    or (contact_type = 'email' and country_code is null and contact_value ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')
  )
);

create table public.professional_locations (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  name text not null default 'Consultorio' check (char_length(name) between 2 and 120),
  address text not null check (char_length(address) between 3 and 500),
  map_url text check (map_url is null or (char_length(map_url) <= 1000 and map_url ~* '^https?://')),
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index professional_contacts_owner_order_idx on public.professional_contacts (professional_id, display_order);
create index professional_locations_owner_order_idx on public.professional_locations (professional_id, display_order);

create trigger professional_contacts_updated_at before update on public.professional_contacts
for each row execute function private.set_updated_at();
create trigger professional_locations_updated_at before update on public.professional_locations
for each row execute function private.set_updated_at();

create or replace function private.refresh_public_page(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  p public.professional_profiles%rowtype;
  page_content jsonb;
begin
  select * into p from public.professional_profiles where id = p_professional_id;
  if not found then
    return;
  end if;

  delete from public.public_professional_pages
  where profile_key = p.storage_key
    and (p.public_slug is null or slug <> p.public_slug);

  if not p.is_public or not p.onboarding_completed or p.public_slug is null then
    delete from public.public_professional_pages where profile_key = p.storage_key;
    return;
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'slug', p.public_slug::text,
    'name', p.full_name,
    'professionalTitle', p.professional_title,
    'avatarPath', p.avatar_path,
    'biography', p.biography,
    'specialties', to_jsonb(p.specialties),
    'careModalities', to_jsonb(p.care_modalities),
    'spokenLanguages', to_jsonb(p.spoken_languages),
    'approximateFee', p.approximate_fee,
    'currency', p.currency,
    'licenseNumber', p.license_number,
    'country', p.country,
    'conditions', coalesce((
      select jsonb_agg(c.name order by c.name)
      from public.professional_conditions pc
      join public.conditions c on c.id = pc.condition_id
      where pc.professional_id = p.id and c.is_active
    ), '[]'::jsonb) || to_jsonb(p.custom_conditions),
    'populations', coalesce((
      select jsonb_agg(pp.name order by pp.name)
      from public.professional_populations ppop
      join public.patient_populations pp on pp.id = ppop.population_id
      where ppop.professional_id = p.id and pp.is_active
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'type', c.contact_type,
        'label', c.label,
        'countryCode', c.country_code,
        'value', c.contact_value,
        'isWhatsapp', c.is_whatsapp
      )) order by c.display_order, c.created_at)
      from public.professional_contacts c
      where c.professional_id = p.id
    ), '[]'::jsonb),
    'education', coalesce((
      select jsonb_agg(jsonb_build_object('degree', e.degree, 'institution', e.institution, 'graduationYear', e.graduation_year, 'educationType', e.education_type) order by e.display_order, e.graduation_year desc)
      from public.professional_education e where e.professional_id = p.id
    ), '[]'::jsonb),
    'business', (
      select jsonb_strip_nulls(jsonb_build_object(
        'logoPath', b.logo_path,
        'name', b.establishment_name,
        'address', b.address,
        'type', b.establishment_type,
        'institution', b.institution,
        'inactiveMessage', b.inactive_message
      )) from public.professional_businesses b where b.professional_id = p.id
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', l.name,
        'address', l.address,
        'mapUrl', l.map_url
      )) order by l.display_order, l.created_at)
      from public.professional_locations l
      where l.professional_id = p.id and l.is_active
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('type', l.link_type, 'title', l.title, 'url', l.url) order by l.display_order, l.created_at)
      from public.professional_links l where l.professional_id = p.id and l.is_active
    ), '[]'::jsonb),
    'gallery', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('path', i.storage_path, 'alt', i.alt_text)) order by i.display_order, i.created_at)
      from public.professional_service_images i where i.professional_id = p.id
    ), '[]'::jsonb),
    'availability', jsonb_build_object(
      'settings', (select jsonb_build_object('durationMinutes', s.default_duration_minutes, 'timezone', s.timezone, 'bookingHorizonDays', s.booking_horizon_days) from public.availability_settings s where s.professional_id = p.id),
      'weeklySlots', coalesce((select jsonb_agg(jsonb_build_object('weekday', a.weekday, 'startTime', a.start_time, 'endTime', a.end_time) order by a.weekday, a.start_time) from public.availability_slots a where a.professional_id = p.id), '[]'::jsonb)
    )
  )) into page_content;

  insert into public.public_professional_pages (slug, profile_key, content, updated_at)
  values (p.public_slug, p.storage_key, page_content, now())
  on conflict (slug) do update
    set profile_key = excluded.profile_key, content = excluded.content, updated_at = now();
end;
$$;

create trigger refresh_public_page_contacts after insert or update or delete on public.professional_contacts
for each row execute function private.refresh_public_page_trigger('professional_id');
create trigger refresh_public_page_locations after insert or update or delete on public.professional_locations
for each row execute function private.refresh_public_page_trigger('professional_id');

alter table public.professional_contacts enable row level security;
alter table public.professional_locations enable row level security;

create policy contacts_own_all on public.professional_contacts for all to authenticated
using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);
create policy locations_own_all on public.professional_locations for all to authenticated
using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);

grant select, insert, update, delete on public.professional_contacts to authenticated;
grant select, insert, update, delete on public.professional_locations to authenticated;

insert into public.professional_locations (professional_id, name, address, display_order)
select b.professional_id, coalesce(nullif(b.establishment_name, ''), 'Consultorio'), b.address, 0
from public.professional_businesses b
where b.address is not null
  and not exists (
    select 1 from public.professional_locations l where l.professional_id = b.professional_id
  );
