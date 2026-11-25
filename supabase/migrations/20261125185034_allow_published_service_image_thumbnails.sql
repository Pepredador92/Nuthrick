begin;

-- A thumbnail is readable only through its matching, published gallery image.
-- Keep the existing rules for originals, avatars, and logos.
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
            or (
              object_name ~ '^[a-f0-9-]{36}/services/services-[a-f0-9-]{36}-thumb[.](webp|png)$'
              and image ->> 'path' = regexp_replace(object_name, '-thumb([.](webp|png))$', '-full\1')
            )
        )
      )
  );
$$;

commit;
