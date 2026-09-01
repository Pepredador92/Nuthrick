-- Nuthrick v1: professional profiles, public pages, availability, and media.
-- Every private relation uses auth.uid()-based RLS. Public reads are isolated
-- in public_professional_pages, which never stores the auth user id.

create extension if not exists citext with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create table public.professional_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  storage_key uuid not null unique default gen_random_uuid(),
  full_name text not null default '' check (char_length(full_name) <= 120),
  professional_title text check (professional_title is null or char_length(professional_title) <= 160),
  language text not null default 'es' check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  country text check (country is null or char_length(country) between 2 and 80),
  timezone text not null default 'America/Mexico_City' check (timezone ~ '^[A-Za-z_]+/[A-Za-z0-9_+\-/]+$'),
  public_slug extensions.citext unique,
  avatar_path text,
  biography text check (biography is null or char_length(biography) <= 3000),
  specialties text[] not null default '{}',
  care_modalities text[] not null default '{}' check (care_modalities <@ array['online','in_person','hybrid']::text[]),
  spoken_languages text[] not null default '{}',
  approximate_fee numeric(10,2) check (approximate_fee is null or approximate_fee >= 0),
  currency char(3) not null default 'MXN' check (currency ~ '^[A-Z]{3}$'),
  license_number text check (license_number is null or char_length(license_number) <= 60),
  onboarding_completed boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public_slug is null or public_slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (avatar_path is null or avatar_path ~ '^[0-9a-f-]+/avatar/[A-Za-z0-9._-]+$')
);

create table public.professional_businesses (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null unique default auth.uid() references public.professional_profiles(id) on delete cascade,
  logo_path text,
  establishment_name text check (establishment_name is null or char_length(establishment_name) <= 160),
  address text check (address is null or char_length(address) <= 500),
  establishment_type text check (establishment_type is null or char_length(establishment_type) <= 100),
  institution text check (institution is null or char_length(institution) <= 160),
  legal_name text check (legal_name is null or char_length(legal_name) <= 200),
  inactive_message text check (inactive_message is null or char_length(inactive_message) <= 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (logo_path is null or logo_path ~ '^[0-9a-f-]+/logo/[A-Za-z0-9._-]+$')
);

create table public.professional_education (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  degree text not null check (char_length(degree) between 2 and 160),
  institution text not null check (char_length(institution) between 2 and 200),
  graduation_year smallint not null check (graduation_year between 1940 and 2100),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professional_links (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  link_type text not null default 'custom' check (link_type in ('whatsapp','tiktok','facebook','instagram','youtube','custom')),
  title text not null check (char_length(title) between 1 and 80),
  url text not null check (char_length(url) <= 1000 and url ~* '^https?://'),
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, link_type, title)
);

create table public.professional_service_images (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  storage_path text not null unique,
  alt_text text check (alt_text is null or char_length(alt_text) <= 200),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path ~ '^[0-9a-f-]+/services/[A-Za-z0-9._-]+$')
);

create table public.conditions (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique check (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null unique check (char_length(name) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.professional_conditions (
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  condition_id uuid not null references public.conditions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (professional_id, condition_id)
);

create table public.patient_populations (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique check (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null unique check (char_length(name) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.professional_populations (
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  population_id uuid not null references public.patient_populations(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (professional_id, population_id)
);

create table public.availability_settings (
  professional_id uuid primary key default auth.uid() references public.professional_profiles(id) on delete cascade,
  default_duration_minutes smallint not null default 60 check (default_duration_minutes in (15,20,30,45,60,90,120)),
  timezone text not null default 'America/Mexico_City' check (timezone ~ '^[A-Za-z_]+/[A-Za-z0-9_+\-/]+$'),
  booking_horizon_days smallint not null default 60 check (booking_horizon_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.time_to_minute(value time)
returns integer
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select (extract(hour from value)::integer * 60) + extract(minute from value)::integer;
$$;

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  constraint availability_slots_no_overlap exclude using gist (
    professional_id with =,
    weekday with =,
    int4range(private.time_to_minute(start_time), private.time_to_minute(end_time), '[)') with &&
  )
);

-- A deliberately public projection. profile_key is a random media namespace,
-- never auth.users.id. content contains only fields approved for /p/:slug.
create table public.public_professional_pages (
  slug extensions.citext primary key,
  profile_key uuid not null unique references public.professional_profiles(storage_key) on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_at timestamptz not null default now()
);

create index professional_education_owner_order_idx on public.professional_education (professional_id, display_order);
create index professional_links_owner_order_idx on public.professional_links (professional_id, display_order);
create index professional_service_images_owner_order_idx on public.professional_service_images (professional_id, display_order);
create index professional_conditions_owner_idx on public.professional_conditions (professional_id);
create index professional_populations_owner_idx on public.professional_populations (professional_id);
create index availability_slots_owner_weekday_idx on public.availability_slots (professional_id, weekday, start_time);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.validate_iana_timezone()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid IANA timezone: %', new.timezone using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger professional_profiles_updated_at before update on public.professional_profiles
for each row execute function private.set_updated_at();
create trigger professional_businesses_updated_at before update on public.professional_businesses
for each row execute function private.set_updated_at();
create trigger professional_education_updated_at before update on public.professional_education
for each row execute function private.set_updated_at();
create trigger professional_links_updated_at before update on public.professional_links
for each row execute function private.set_updated_at();
create trigger professional_service_images_updated_at before update on public.professional_service_images
for each row execute function private.set_updated_at();
create trigger availability_settings_updated_at before update on public.availability_settings
for each row execute function private.set_updated_at();
create trigger availability_slots_updated_at before update on public.availability_slots
for each row execute function private.set_updated_at();

create trigger professional_profiles_validate_timezone
before insert or update of timezone on public.professional_profiles
for each row execute function private.validate_iana_timezone();
create trigger availability_settings_validate_timezone
before insert or update of timezone on public.availability_settings
for each row execute function private.validate_iana_timezone();

create or replace function public.normalize_slug(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(unaccented), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]+', '-', 'g'
  ))
  from (select value as unaccented) source;
$$;

create or replace function private.normalize_profile_slug()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.public_slug is not null then
    new.public_slug = public.normalize_slug(new.public_slug::text);
    if char_length(new.public_slug::text) < 3 or char_length(new.public_slug::text) > 80 then
      raise exception 'El slug debe tener entre 3 y 80 caracteres';
    end if;
  end if;
  return new;
end;
$$;

create trigger professional_profiles_normalize_slug
before insert or update of public_slug on public.professional_profiles
for each row execute function private.normalize_profile_slug();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.professional_profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.refresh_public_page(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
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
    ), '[]'::jsonb),
    'populations', coalesce((
      select jsonb_agg(pp.name order by pp.name)
      from public.professional_populations ppop
      join public.patient_populations pp on pp.id = ppop.population_id
      where ppop.professional_id = p.id and pp.is_active
    ), '[]'::jsonb),
    'education', coalesce((
      select jsonb_agg(jsonb_build_object('degree', e.degree, 'institution', e.institution, 'graduationYear', e.graduation_year) order by e.display_order, e.graduation_year desc)
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

create or replace function private.refresh_public_page_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  row_data jsonb;
  professional_id uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  professional_id := (row_data ->> coalesce(tg_argv[0], 'professional_id'))::uuid;
  perform private.refresh_public_page(professional_id);
  return coalesce(new, old);
end;
$$;

create trigger refresh_public_page_profile after insert or update on public.professional_profiles
for each row execute function private.refresh_public_page_trigger('id');
create trigger refresh_public_page_business after insert or update or delete on public.professional_businesses
for each row execute function private.refresh_public_page_trigger('professional_id');
create trigger refresh_public_page_education after insert or update or delete on public.professional_education
for each row execute function private.refresh_public_page_trigger('professional_id');
create trigger refresh_public_page_links after insert or update or delete on public.professional_links
for each row execute function private.refresh_public_page_trigger('professional_id');
create trigger refresh_public_page_images after insert or update or delete on public.professional_service_images
for each row execute function private.refresh_public_page_trigger('professional_id');
create trigger refresh_public_page_conditions after insert or delete on public.professional_conditions
for each row execute function private.refresh_public_page_trigger('professional_id');
create trigger refresh_public_page_populations after insert or delete on public.professional_populations
for each row execute function private.refresh_public_page_trigger('professional_id');
create trigger refresh_public_page_availability_settings after insert or update or delete on public.availability_settings
for each row execute function private.refresh_public_page_trigger('professional_id');
create trigger refresh_public_page_availability_slots after insert or update or delete on public.availability_slots
for each row execute function private.refresh_public_page_trigger('professional_id');

create or replace function public.set_professional_conditions(condition_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.professional_conditions where professional_id = auth.uid();
  insert into public.professional_conditions (professional_id, condition_id)
  select auth.uid(), c.id
  from public.conditions c
  where c.is_active and c.id = any(coalesce(condition_ids, '{}'::uuid[]));
end;
$$;

create or replace function public.set_professional_populations(population_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.professional_populations where professional_id = auth.uid();
  insert into public.professional_populations (professional_id, population_id)
  select auth.uid(), p.id
  from public.patient_populations p
  where p.is_active and p.id = any(coalesce(population_ids, '{}'::uuid[]));
end;
$$;

-- RLS: catalog tables are read-only to signed-in professionals. Every other
-- private table checks the authenticated subject against the owner column.
alter table public.professional_profiles enable row level security;
alter table public.professional_businesses enable row level security;
alter table public.professional_education enable row level security;
alter table public.professional_links enable row level security;
alter table public.professional_service_images enable row level security;
alter table public.conditions enable row level security;
alter table public.professional_conditions enable row level security;
alter table public.patient_populations enable row level security;
alter table public.professional_populations enable row level security;
alter table public.availability_settings enable row level security;
alter table public.availability_slots enable row level security;
alter table public.public_professional_pages enable row level security;

create policy profiles_select_own on public.professional_profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.professional_profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.professional_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.professional_profiles for delete to authenticated using ((select auth.uid()) = id);

create policy businesses_own_all on public.professional_businesses for all to authenticated using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);
create policy education_own_all on public.professional_education for all to authenticated using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);
create policy links_own_all on public.professional_links for all to authenticated using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);
create policy service_images_own_all on public.professional_service_images for all to authenticated using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);
create policy professional_conditions_own_all on public.professional_conditions for all to authenticated using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);
create policy professional_populations_own_all on public.professional_populations for all to authenticated using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);
create policy availability_settings_own_all on public.availability_settings for all to authenticated using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);
create policy availability_slots_own_all on public.availability_slots for all to authenticated using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);

create policy conditions_authenticated_read on public.conditions for select to authenticated using (true);
create policy populations_authenticated_read on public.patient_populations for select to authenticated using (true);
create policy public_pages_read on public.public_professional_pages for select to anon, authenticated using (true);

-- Explicit Data API privileges (new projects no longer auto-expose tables).
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.professional_profiles to authenticated;
grant select, insert, update, delete on public.professional_businesses to authenticated;
grant select, insert, update, delete on public.professional_education to authenticated;
grant select, insert, update, delete on public.professional_links to authenticated;
grant select, insert, update, delete on public.professional_service_images to authenticated;
grant select on public.conditions to authenticated;
grant select, insert, delete on public.professional_conditions to authenticated;
grant select on public.patient_populations to authenticated;
grant select, insert, delete on public.professional_populations to authenticated;
grant select, insert, update, delete on public.availability_settings to authenticated;
grant select, insert, update, delete on public.availability_slots to authenticated;
grant select on public.public_professional_pages to anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.normalize_slug(text) to authenticated;
grant execute on function public.set_professional_conditions(uuid[]) to authenticated;
grant execute on function public.set_professional_populations(uuid[]) to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Storage uses a private bucket. The first path segment is storage_key, not
-- auth.users.id; public media can only be signed when its profile is published.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('professional-media', 'professional-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.is_public_media_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, storage
as $$
  select exists (
    select 1 from public.public_professional_pages page
    where page.profile_key::text = (storage.foldername(object_name))[1]
      and (
        page.content ->> 'avatarPath' = object_name
        or page.content #>> '{business,logoPath}' = object_name
        or exists (
          select 1
          from jsonb_array_elements(coalesce(page.content -> 'gallery', '[]'::jsonb)) image
          where image ->> 'path' = object_name
        )
      )
  );
$$;

grant usage on schema private to anon, authenticated;
grant execute on function private.is_public_media_path(text) to anon, authenticated;

create policy professional_media_owner_select on storage.objects
for select to authenticated
using (
  bucket_id = 'professional-media'
  and storage.allow_any_operation(array['object.list','object.get_authenticated_info','object.get_authenticated'])
  and (storage.foldername(name))[1] = (
    select p.storage_key::text from public.professional_profiles p where p.id = (select auth.uid())
  )
);

create policy professional_media_public_select on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'professional-media'
  and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated'])
  and private.is_public_media_path(name)
);

create policy professional_media_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'professional-media'
  and (storage.foldername(name))[1] = (
    select p.storage_key::text from public.professional_profiles p where p.id = (select auth.uid())
  )
  and (storage.foldername(name))[2] in ('avatar','logo','services')
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);

create policy professional_media_owner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'professional-media'
  and (storage.foldername(name))[1] = (
    select p.storage_key::text from public.professional_profiles p where p.id = (select auth.uid())
  )
)
with check (
  bucket_id = 'professional-media'
  and (storage.foldername(name))[1] = (
    select p.storage_key::text from public.professional_profiles p where p.id = (select auth.uid())
  )
  and (storage.foldername(name))[2] in ('avatar','logo','services')
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);

create policy professional_media_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'professional-media'
  and (storage.foldername(name))[1] = (
    select p.storage_key::text from public.professional_profiles p where p.id = (select auth.uid())
  )
);

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
