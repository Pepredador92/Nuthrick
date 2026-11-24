begin;

create table private.public_profile_visits (
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  visited_day date not null default ((now() at time zone 'America/Mexico_City')::date),
  session_hash text not null check (session_hash ~ '^[a-f0-9]{64}$'),
  primary key (professional_id, visited_day, session_hash)
);

alter table private.public_profile_visits enable row level security;
revoke all on private.public_profile_visits from public, anon, authenticated, service_role;
grant insert on private.public_profile_visits to service_role;

-- One transaction records the existing site-wide category and the scoped
-- visit. The published page resolves to a stable owner ID even after renames.
create function public.site_analytics_record_profile(
  p_session_hash text, p_slug text, p_referrer text, p_visitor uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid;
begin
  if p_slug is null or char_length(p_slug) not between 3 and 80
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_input';
  end if;
  select p.id into owner_id
  from public.public_professional_pages page
  join public.professional_profiles p on p.storage_key = page.profile_key
  where page.slug operator(extensions.=) p_slug::extensions.citext;
  if owner_id is null then
    return jsonb_build_object('recorded', false);
  end if;

  perform public.site_analytics_record(p_session_hash, '/perfil-publico', p_referrer);
  if owner_id is distinct from p_visitor then
    insert into private.public_profile_visits(professional_id, session_hash)
      values (owner_id, p_session_hash)
      on conflict do nothing;
  end if;
  return jsonb_build_object('recorded', true);
end
$$;
revoke all on function public.site_analytics_record_profile(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.site_analytics_record_profile(text,text,text,uuid) to service_role;

create function private.my_public_profile_visits() returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from private.public_profile_visits
  where professional_id = (select auth.uid())
$$;
revoke all on function private.my_public_profile_visits() from public, anon, service_role;
grant execute on function private.my_public_profile_visits() to authenticated;

create function public.my_public_profile_visits() returns bigint
language sql stable security invoker set search_path = '' as $$
  select private.my_public_profile_visits()
$$;
revoke all on function public.my_public_profile_visits() from public, anon, service_role;
grant execute on function public.my_public_profile_visits() to authenticated;

commit;
