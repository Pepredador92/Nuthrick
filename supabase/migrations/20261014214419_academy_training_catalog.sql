begin;

-- Training is shared educational content. Only administrators can write; the
-- private tables are reached through authenticated, explicitly checked RPCs.
create table private.training_catalog_state (
 singleton boolean primary key default true check (singleton),
 revision bigint not null default 1 check (revision > 0)
);
insert into private.training_catalog_state(singleton) values (true);

create table private.training_videos (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(btrim(title)) between 1 and 160),
 description text not null default '' check (length(description) <= 1000),
 youtube_video_id text not null unique check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
 display_order integer not null check (display_order > 0),
 published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint training_videos_order unique (display_order) deferrable initially deferred
);
alter table private.training_catalog_state enable row level security;
alter table private.training_videos enable row level security;
revoke all on private.training_catalog_state, private.training_videos from public, anon, authenticated, service_role;
create policy training_rpc_only on private.training_catalog_state to authenticated using (false);
create policy training_rpc_only on private.training_videos to authenticated using (false);

-- Titles and topics verified from the supplied YouTube playlist on 2026-10-14.
-- The playlist lists the tutorials in reverse order; the learning path starts at 01.
insert into private.training_videos(title, description, youtube_video_id, display_order, published) values
 ('¿Dónde está cada cosa en Nuthrick?', 'Ubica el Dashboard, los expedientes, el Taller de dietas, la agenda, los mensajes y tus créditos de IA.', 'Nw6ZwFHWoqI', 1, true),
 ('Completa tu perfil profesional en Nuthrick', 'Personaliza tu fotografía, biografía, especialidades, modalidades de atención y medios de contacto.', 'ZcKpeXfjSdc', 2, true),
 ('Configura tu negocio y consultorios en Nuthrick', 'Agrega la identidad de tu negocio, tus consultorios, enlaces de ubicación y fotografías de servicios.', 'rnzven3_7zs', 3, true),
 ('Configura tus horarios disponibles en Nuthrick', 'Define la duración de las consultas, zona horaria, anticipación y horarios semanales de atención.', 'VNuT6T7Or_s', 4, true),
 ('¿Cómo agenda una cita un paciente en Nuthrick?', 'Conoce cómo tus pacientes eligen un horario, verifican su correo y solicitan una cita desde tu página pública.', 'PuIO8UgjOrM', 5, true);

create function private.training_catalog_document(p_include_hidden boolean) returns jsonb
language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('revision', s.revision, 'videos', coalesce((
   select jsonb_agg(jsonb_build_object(
     'id', v.id, 'title', v.title, 'description', v.description,
     'youtube_video_id', v.youtube_video_id, 'display_order', v.display_order,
     'published', v.published, 'updated_at', v.updated_at
   ) order by v.display_order) from private.training_videos v
   where p_include_hidden or v.published
 ), '[]'::jsonb)) from private.training_catalog_state s where s.singleton
$$;
revoke all on function private.training_catalog_document(boolean) from public, anon, authenticated, service_role;

create function private.training_catalog() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.professional_profiles where id = auth.uid()) then
   raise exception 'professional_required' using errcode = '42501';
 end if;
 return private.training_catalog_document(false)->'videos';
end $$;
create function public.training_catalog() returns jsonb
language sql stable security invoker set search_path = '' as $$select private.training_catalog()$$;
revoke all on function private.training_catalog(), public.training_catalog() from public, anon, service_role;
grant execute on function private.training_catalog(), public.training_catalog() to authenticated;

create function private.training_admin_api(p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := private.require_platform_admin();
 catalog_revision bigint;
 video_id uuid;
 video_title text;
 video_description text;
 youtube_id text;
 is_published boolean;
 before_value jsonb;
 after_value jsonb;
 ordered_ids uuid[];
begin
 if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input'; end if;
 if p_action = 'list' then return private.training_catalog_document(true); end if;
 if p_action is null or p_action not in ('save', 'delete', 'reorder') then raise exception 'invalid_action'; end if;
 if jsonb_typeof(p_data->'expected_revision') is distinct from 'number'
   or (p_data->>'expected_revision') !~ '^[0-9]+$' then raise exception 'invalid_input'; end if;

 -- One catalog lock makes edits, removals and reorders atomic and prevents a
 -- stale administrator from overwriting an order saved in another session.
 select revision into catalog_revision from private.training_catalog_state where singleton for update;
 if (p_data->>'expected_revision')::bigint <> catalog_revision then raise exception 'stale_revision'; end if;

 if p_action = 'save' then
   if jsonb_typeof(p_data->'title') is distinct from 'string'
     or jsonb_typeof(p_data->'description') is distinct from 'string'
     or jsonb_typeof(p_data->'youtube_video_id') is distinct from 'string'
     or jsonb_typeof(p_data->'published') is distinct from 'boolean' then raise exception 'invalid_input'; end if;
   video_title := btrim(p_data->>'title');
   video_description := btrim(p_data->>'description');
   youtube_id := p_data->>'youtube_video_id';
   is_published := (p_data->>'published')::boolean;
   if length(video_title) not between 1 and 160 or length(video_description) > 1000
     or youtube_id !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'invalid_input'; end if;
   video_id := (p_data->>'id')::uuid;
   if video_id is null then
     insert into private.training_videos(title, description, youtube_video_id, display_order, published)
       values(video_title, video_description, youtube_id,
         (select coalesce(max(display_order), 0) + 1 from private.training_videos), is_published)
       returning id into video_id;
   else
     select to_jsonb(v) into before_value from private.training_videos v where v.id = video_id;
     if not found then raise exception 'video_not_found'; end if;
     update private.training_videos set title = video_title, description = video_description,
       youtube_video_id = youtube_id, published = is_published, updated_at = now() where id = video_id;
   end if;
   select to_jsonb(v) into after_value from private.training_videos v where v.id = video_id;
 elsif p_action = 'delete' then
   video_id := (p_data->>'id')::uuid;
   select to_jsonb(v) into before_value from private.training_videos v where v.id = video_id;
   if not found then raise exception 'video_not_found'; end if;
   delete from private.training_videos where id = video_id;
   with positions as (select id, row_number() over(order by display_order)::integer position from private.training_videos)
   update private.training_videos v set display_order = p.position from positions p where v.id = p.id;
 else
   if jsonb_typeof(p_data->'ids') is distinct from 'array'
     or exists(select 1 from jsonb_array_elements(p_data->'ids') item where jsonb_typeof(item) <> 'string') then
     raise exception 'invalid_order';
   end if;
   select coalesce(array_agg(item::uuid order by position), '{}'::uuid[]) into ordered_ids
     from jsonb_array_elements_text(p_data->'ids') with ordinality a(item, position);
   if cardinality(ordered_ids) <> (select count(*) from private.training_videos)
     or cardinality(ordered_ids) <> (select count(distinct id) from unnest(ordered_ids) id)
     or exists(select 1 from unnest(ordered_ids) requested(id) where not exists(select 1 from private.training_videos v where v.id = requested.id)) then
     raise exception 'invalid_order';
   end if;
   select jsonb_agg(id order by display_order) into before_value from private.training_videos;
   update private.training_videos v set display_order = p.position::integer
     from unnest(ordered_ids) with ordinality p(id, position) where v.id = p.id;
   after_value := to_jsonb(ordered_ids);
 end if;

 update private.training_catalog_state set revision = revision + 1 where singleton;
 insert into private.admin_audit(actor_admin, action, entity, entity_id, metadata)
   values(actor, 'training_' || p_action, 'training_videos', video_id::text,
     jsonb_build_object('before', before_value, 'after', after_value, 'catalog_revision', catalog_revision + 1));
 return private.training_catalog_document(true);
exception
 when unique_violation then raise exception 'video_already_exists';
 when invalid_text_representation or numeric_value_out_of_range then raise exception 'invalid_input';
end $$;
create function public.training_admin_api(p_action text, p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$select private.training_admin_api(p_action, p_data)$$;
revoke all on function private.training_admin_api(text, jsonb), public.training_admin_api(text, jsonb) from public, anon, service_role;
grant execute on function private.training_admin_api(text, jsonb), public.training_admin_api(text, jsonb) to authenticated;

commit;
