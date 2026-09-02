alter table public.professional_profiles
  add column if not exists custom_conditions text[] not null default '{}'
  check (cardinality(custom_conditions) <= 30);

alter table public.professional_education
  add column if not exists education_type text not null default 'degree'
  check (education_type in ('degree', 'course', 'training', 'diploma', 'masters', 'doctorate', 'specialty'));

create index if not exists professional_profiles_custom_conditions_gin_idx
  on public.professional_profiles using gin (custom_conditions);

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

grant execute on function private.time_to_minute(time) to authenticated;

drop policy if exists professional_media_owner_select on storage.objects;
create policy professional_media_owner_select on storage.objects
for select to authenticated
using (
  bucket_id = 'professional-media'
  and storage.allow_any_operation(array['object.list','object.get_authenticated_info','object.get_authenticated','storage.object.sign','storage.object.sign_many'])
  and (storage.foldername(name))[1] = (
    select p.storage_key::text from public.professional_profiles p where p.id = (select auth.uid())
  )
);

drop policy if exists professional_media_public_select on storage.objects;
create policy professional_media_public_select on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'professional-media'
  and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated','storage.object.sign','storage.object.sign_many'])
  and private.is_public_media_path(name)
);
